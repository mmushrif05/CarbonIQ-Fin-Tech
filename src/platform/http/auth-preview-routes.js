// @ts-check
/**
 * CarbonIQ FinTech — preview access routes
 *
 * The sample book, opened by an address. Split out of `auth-routes.js` along
 * its own seam: preview access has a service of its own, a register of its
 * own and a rate limiter with different rules from sign-in's, and the file it
 * came from was over the length `tests/structure.test.js` allows.
 *
 * Mounted by `auth-routes.js` under `/v1/auth`, which is registered before the
 * door — so the two public routes here carry no credential by construction and
 * the guarded one carries `authenticate` itself.
 *
 * Why a credential-free write is safe here, stated once: there is nothing to
 * authenticate. The address a visitor types is recorded, not believed. What
 * comes back is bounded rather than trusted — a session holding `read`, in an
 * organisation whose only records are a sample book — so this grants strictly
 * less than a sign-in grants somebody who already has an account.
 */

'use strict';

const { Router } = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

const preview = require('../auth/preview');
const authenticate = require('../auth/authenticate');
const validate = require('./validate');
const { doc, body, str, bool, num, obj, arr, orNull } = require('./openapi-hints');
const handle = require('./async-handler');
const { intOr } = require('../../shared/numbers');

const router = Router();

const emailField = Joi.string().email().max(254).required()
  .description('The address the visitor typed. Recorded, never verified.');

/*
 * One field, and it is the whole form.
 *
 * Asking a visitor for a name, a company and a role before showing them
 * anything is how a preview becomes a form nobody fills in. The address is
 * what the register needs; everything else can be asked of someone who has
 * already seen the product and come back.
 */
const previewSchema = Joi.object({
  email: emailField,
});

/*
 * Tighter than the sign-in limiter and keyed only on the caller.
 *
 * The sign-in limiter keys on address *and* address-holder so that one
 * person's failures cannot lock another out. Here the address is supplied
 * rather than proven, so keying on it would let anyone lift their own limit by
 * changing a character. The caller is the only thing that is theirs.
 */
const previewLimiter = /** @type {any} */ (rateLimit)({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.ip),
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many preview requests from here. Try again later.',
  },
});

/* ── Preview access. The third and last route that carries no credential. ──
 *
 * `POST /v1/auth/preview` issues a session in exchange for an address and
 * nothing else, which sounds like an open door and is not one: the session it
 * issues holds `read`, in an organisation whose only records are a sample
 * book. There is no credential here because there is nothing to authenticate —
 * the address is recorded, not believed.
 */

router.get('/preview',
  doc({ summary: 'Whether the sample book can be opened here',
    description: 'Answers before the form is shown, so a deployment that cannot issue a preview '
      + 'session says why rather than offering a button that fails. The sign-in screen offers the '
      + 'panel only where this says available.',
    response: body({ available: bool, reason: orNull(str), remedy: orNull(str) }, ['available']) }),
  handle(async (req, res) => {
    res.json(await preview.state());
  }));

router.post('/preview',
  previewLimiter,
  validate({ body: previewSchema }),
  doc({ summary: 'Open the sample book',
    description: 'Records the address in the preview register and issues a read-only session over '
      + 'the sample book. Every visitor shares one account and gets their own session; the address '
      + 'is what is kept, and it is kept apart from the account so that removing one does not erase '
      + 'the other. Nothing here can reach a real book: the session holds `read` and its '
      + 'organisation holds nothing but the sample.',
    status: 201,
    response: body({ token: str, expiresAt: str, preview: bool, user: obj }, ['token', 'preview']) }),
  handle(async (req, res) => {
    const issued = await preview.admit(req.body.email, {
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer,
      ip: req.ip,
    });
    res.status(201).json(issued);
  }));

router.get('/preview/signups',
  authenticate,
  doc({ summary: 'Who has asked to see the product — requires the `admin` scope',
    description: 'The preview register, newest first: the address, when it first asked, when it '
      + 'last did and how many times. A returning visitor is one row with a count, not four rows, '
      + 'because "asked once in March" and "has come back four times this week" are different facts '
      + 'about the same address and only the second is worth acting on.',
    response: body({ total: num, signups: arr(obj) }, ['total', 'signups']) }),
  handle(async (req, res) => {
    res.json(await preview.signups({ limit: intOr(req.query.limit, 200) }));
  }));


module.exports = router;
