// @ts-check
/**
 * Signing in, signing out, and administering the people who can.
 *
 * `POST /v1/auth/login` is the one route on the whole surface that carries no
 * credential, because it is the request that establishes one. Everything else
 * here is authenticated like every other route, and the user-administration
 * routes require the `admin` scope — the first routes to require it, which is
 * why it stopped being reserved.
 *
 * Two rules the refusals follow. A failed sign-in never says whether the
 * address exists: "no account" and "wrong password" are the same answer and
 * take the same work (`users.authenticate`). And a rate limit on sign-in is
 * per address as well as per caller, so guessing one account's password is
 * slow even from many places.
 *
 * Two refusals are named rather than generic, and only ever after the password
 * has verified: a disabled account, and one whose access window has closed.
 * Telling a customer on the morning after their trial ended that their
 * password is wrong sends them to reset a password that was never the problem.
 *
 * `POST /v1/auth/bootstrap` is the second route on the surface that carries no
 * session or key, and it exists because the first administrator could not
 * otherwise be created on a serverless deployment: `npm run user:create` needs
 * a shell beside the database, and Netlify has none. It is bounded three ways
 * — it works only while the deployment holds no accounts at all, only when the
 * operator has set a bootstrap token, and only once. See `bootstrapState()`.
 */

'use strict';

const { Router } = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

const users = require('../auth/users');
const sessions = require('../auth/sessions');
const authenticate = require('../auth/authenticate');
const password = require('../auth/password');
const store = require('../database/store');
const validate = require('./validate');
const { doc, body, str, bool } = require('./openapi-hints');
const handle = require('./async-handler');
const { ROLES } = require('../../shared/policies');
const config = require('../config');
const crypto = require('crypto');
const { emptyBody } = require('./validate').schemas;

/** @typedef {import('../../shared/types').AppError} AppError */

const router = Router();

const fail = (statusCode, code, message, remedy) => {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
};

/**
 * Sign-in is rate limited on the address being tried, not only on the caller,
 * so a spread of source addresses does not buy an attacker more attempts at
 * one account. Ten a minute is generous for a person and useless for a
 * dictionary.
 */
const signInLimiter = /** @type {any} */ (rateLimit)({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `${users.normaliseEmail(req.body && req.body.email)}|${req.ip}`,
  /* A test harness signs one account in dozens of times against one loopback
     address inside a minute — the whole browser suite shares this counter,
     because every journey signs in as the same user from 127.0.0.1. That is
     not the dictionary attack this limiter exists to stop, and throttling it
     turns a passing suite red on nothing but its own volume. Off under test;
     the limiter's own behaviour has no test that this skips. */
  skip: () => config.runtime.isTest,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many sign-in attempts. Wait a minute and try again.',
  },
});

const emailField = Joi.string().email().max(254).required()
  .description('The address the account was created with. Case is not significant.');
const passwordField = Joi.string().min(password.MIN_LENGTH).max(512).required()
  .description(`At least ${password.MIN_LENGTH} characters.`);
const roleField = Joi.string().valid(...Object.keys(ROLES))
  .description('Which role the account carries. The role decides the scopes every request of theirs holds.');

const loginSchema = Joi.object({ email: emailField, password: Joi.string().max(512).required() });
const changeOwnSchema = Joi.object({
  currentPassword: Joi.string().max(512).required(),
  newPassword: passwordField,
});
const accessEndsAtField = Joi.string().max(40).allow(null, '')
  .description('The instant after which this account may no longer sign in — an ISO date (2026-03-31, '
    + 'meaning through the end of that day) or instant. This is what a trial is. Null is an ordinary '
    + 'account with no end. It is not a role and not the active flag: a role says what someone may do, '
    + 'a window says for how long, and disabling is a decision somebody took rather than a date that passed.');
const createUserSchema = Joi.object({
  email: emailField,
  name: Joi.string().max(160).allow('', null),
  role: roleField.required(),
  password: passwordField,
  orgId: Joi.string().max(120).description('Defaults to the organisation of the account creating this one.'),
  accessEndsAt: accessEndsAtField,
  mustChangePassword: Joi.boolean().default(true)
    .description('Whether the account must replace this password before it can reach anything else. '
      + 'Defaults to true, because a password an administrator typed is the administrator\'s.'),
});
const patchUserSchema = Joi.object({
  role: roleField,
  active: Joi.boolean().description('Setting this false ends every session that account holds.'),
  accessEndsAt: accessEndsAtField
    .description('Extend a trial, end one now with an instant in the past, or send null to remove the '
      + 'window entirely — which is how a trial becomes an ordinary account without changing its id, '
      + 'its history or anything it recorded.'),
}).min(1);
const resetSchema = Joi.object({
  newPassword: passwordField,
  mustChangePassword: Joi.boolean().default(true)
    .description('Defaults to true: an administrator resetting a password is issuing a temporary one.'),
});
const bootstrapSchema = Joi.object({
  token: Joi.string().max(512).required()
    .description('The value of ADMIN_BOOTSTRAP_TOKEN on this deployment.'),
  email: emailField,
  name: Joi.string().max(160).allow('', null),
  password: passwordField,
  orgId: Joi.string().max(120).required()
    .description('The organisation this administrator, and everything they create, belongs to.'),
});

/** What a sign-in and `/me` both answer with. */
const userShape = {
  type: 'object',
  properties: {
    id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' },
    orgId: { type: 'string' }, role: { type: 'string' }, roleLabel: { type: 'string' },
    roleLevel: { type: 'integer' }, active: { type: 'boolean' },
    accessEndsAt: { type: ['string', 'null'], format: 'date-time' },
    mustChangePassword: { type: 'boolean' },
    access: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'ending', 'ended', 'disabled'] },
        endsAt: { type: ['string', 'null'], format: 'date-time' },
        daysRemaining: { type: ['integer', 'null'] },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    lastLoginAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

/** A deployment with nobody in it says so, and names the command that fixes it. */
async function assertSomeoneExists() {
  if (await users.countUsers() > 0) return;
  throw fail(503, 'NO_ACCOUNTS',
    'This deployment has no accounts yet, so nobody can sign in.',
    'Create the first administrator: npm run user:create -- --email you@bank.lk --org <org-id> --role admin');
}

/**
 * Whether the first administrator can still be created over HTTP, and why not
 * where the answer is no.
 *
 * Three conditions, all of which must hold. The deployment must be able to
 * persist. It must hold **no accounts at all** — not "no administrators", not
 * "none in this organisation": one account anywhere closes the window for
 * good, so the route cannot be used to add a second administrator to a live
 * deployment. And the operator must have set a token, because a bootstrap
 * route that works without one is an open door on every deployment that has
 * not been set up yet, which is exactly the state this route exists to serve.
 *
 * The token itself never reaches the wire, here or on `/health`.
 */
async function bootstrapState() {
  const cap = store.capability();
  if (!cap.writable) {
    /* The seam's own reason, not a guess. See the note on the sign-in refusal
       below: "set DATABASE_URL" is the wrong instruction for four of the five
       ways this can be false, and it is the one an operator acts on first. */
    return { available: false, reason: `This deployment cannot persist anything. ${cap.reason}`,
      remedy: cap.remedy || 'Set DATABASE_URL. GET /v1/partc/storage reports what this deployment can hold.' };
  }
  if (await users.countUsers() > 0) {
    return { available: false, reason: 'This deployment already has accounts, so the first-run window has closed.',
      remedy: 'An administrator creates further accounts: POST /v1/auth/users.' };
  }
  if (!config.runtime.adminBootstrapToken) {
    return { available: false, reason: 'No bootstrap token is set on this deployment.',
      remedy: 'Set ADMIN_BOOTSTRAP_TOKEN to a long random value, redeploy, and call this route with it.' };
  }
  return { available: true, reason: null, remedy: null };
}

/** Compared in constant time, so the answer's timing says nothing about the token. */
function tokenMatches(supplied) {
  const expected = Buffer.from(String(config.runtime.adminBootstrapToken));
  const got = Buffer.from(String(supplied == null ? '' : supplied));
  if (expected.length === 0 || expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
}

router.get('/bootstrap',
  doc({ summary: 'Whether the first administrator can still be created here',
    description: 'Answers before anyone tries, so an operator setting a deployment up is told which '
      + 'of the three conditions is not met rather than guessing from a refusal. Never carries the token.',
    response: body({ available: bool, reason: str, remedy: str }, ['available']) }),
  handle(async (req, res) => {
    res.json(await bootstrapState());
  }));

router.post('/bootstrap',
  signInLimiter,
  validate({ body: bootstrapSchema }),
  doc({ summary: 'Create the first administrator',
    description: 'The one route that creates an account without one. It works only while the '
      + 'deployment holds no accounts at all, only when ADMIN_BOOTSTRAP_TOKEN is set, and therefore '
      + 'only once — the account it creates closes the window. Afterwards it answers 410.',
    status: 201,
    response: { type: 'object', properties: { user: userShape } } }),
  handle(async (req, res) => {
    const state = await bootstrapState();
    if (!state.available) {
      /* 410 rather than 403: the window is not shut against this caller, it is
         gone. A 403 invites someone to go looking for a credential that would
         open it, and there is not one. */
      throw fail(410, 'BOOTSTRAP_CLOSED', state.reason, state.remedy);
    }
    if (!tokenMatches(req.body.token)) {
      throw fail(401, 'BOOTSTRAP_TOKEN_INVALID', 'That is not this deployment\'s bootstrap token.',
        'The value is ADMIN_BOOTSTRAP_TOKEN in the deployment environment.');
    }
    const user = await users.createUser({
      orgId: req.body.orgId,
      email: req.body.email,
      name: req.body.name,
      role: 'admin',
      password: req.body.password,
      createdBy: 'bootstrap',
      /* The person typing it chose it, so it is already theirs. */
      mustChangePassword: false,
    });
    res.status(201).json({ user });
  }));

/* Preview access — its own file, because it is its own concern and this
   one was over the length the structure test allows. */
router.use(require('./auth-preview-routes'));

router.post('/login',
  signInLimiter,
  validate({ body: loginSchema }),
  doc({
    summary: 'Sign in',
    description: 'Exchanges an email address and a password for a session token. '
      + 'Send the token on every later request as `Authorization: Bearer <token>`. '
      + 'This is the only route that needs no credential.',
    status: 200,
    response: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        idleExpiresAt: { type: 'string', format: 'date-time' },
        user: userShape,
      },
    },
  }),
  handle(async (req, res) => {
    const cap = store.capability();
    if (!cap.writable) {
      /*
       * The store already knows *why* it cannot write, and this used to throw
       * that away and say "Set DATABASE_URL" whatever the cause. On a
       * deployment with STORAGE_BACKEND=blobs forced and Netlify Blobs
       * unreachable, that instruction is wrong in a way that costs hours:
       * setting DATABASE_URL changes nothing while a forced backend stands,
       * and the screen keeps saying the same thing. `capability()` returns a
       * reason and, where one applies, the remedy that actually fixes it —
       * "a forced store that is unreachable refuses writes" is a state this
       * codebase already models, and the refusal should say so.
       */
      throw fail(503, 'STORAGE_UNAVAILABLE',
        `Sessions cannot be issued because this deployment cannot persist anything. ${cap.reason}`,
        cap.remedy || 'Set DATABASE_URL. GET /v1/partc/storage reports what this deployment can hold.');
    }
    await assertSomeoneExists();
    const { user, reason } = await users.authenticate(req.body.email, req.body.password);
    if (!user) {
      /* One answer for a wrong address and a wrong password. The two named
         refusals below are only reachable once the password has verified, so
         neither tells an attacker which addresses exist. */
      if (reason === 'disabled') {
        throw fail(403, 'ACCOUNT_DISABLED', 'This account has been disabled.',
          'Contact your administrator.');
      }
      if (reason === 'access_ended') {
        throw fail(403, 'ACCESS_ENDED', 'Access for this account has reached its end date.',
          'Contact your administrator to extend it.');
      }
      throw fail(401, 'SIGN_IN_FAILED', 'That email address and password do not match an active account.');
    }
    const issued = await sessions.issue(user, {
      userAgent: req.headers['user-agent'], ip: req.ip,
    });
    res.json({ ...issued, user });
  }));

router.post('/logout',
  authenticate, validate({ body: emptyBody }),
  doc({ summary: 'Sign out',
    description: 'Ends the session the request carried. Idempotent. A session is a row, not a '
      + 'signed token, so signing out is a delete and takes effect at once.',
    status: 200, response: body({ signedOut: bool }, ['signedOut']) }),
  handle(async (req, res) => {
    const header = String(req.headers.authorization || '');
    await sessions.revoke(header.replace(/^bearer\s+/i, '').trim());
    res.json({ signedOut: true });
  }));

router.get('/me',
  authenticate,
  doc({
    summary: 'The account this request is acting as',
    description: 'Answers for a session token. An API key has no account and is told so.',
    response: { type: 'object', properties: { user: userShape, session: { type: 'object' } } },
  }),
  handle(async (req, res) => {
    if (!req.user) {
      throw fail(400, 'NOT_A_SESSION',
        'This request was authenticated with an integration key, which has no account behind it.',
        'Sign in to act as a person.');
    }
    const user = await users.getUser(req.user.uid);
    res.json({ user, session: req.session || null });
  }));

router.post('/password',
  doc({ summary: "Change the caller's own password",
    description: 'Every other session that account holds ends, and a fresh one is issued here.',
    response: body({ changed: bool, token: str, expiresAt: str }, ['changed']) }),
  authenticate,
  validate({ body: changeOwnSchema }),
  doc({
    summary: 'Change your own password',
    description: 'Requires the current password. Every other session that account holds is ended, '
      + 'because a password change is what someone does when they think a session is not theirs.',
    status: 200,
  }),
  handle(async (req, res) => {
    if (!req.user) throw fail(400, 'NOT_A_SESSION', 'Only a signed-in account can change its own password.');
    const { user: confirmed } = await users.authenticate(req.user.email, req.body.currentPassword);
    if (!confirmed) throw fail(401, 'SIGN_IN_FAILED', 'The current password is not correct.');
    /* This is the moment the password becomes the account holder's, so it is
       the moment `mustChangePassword` is cleared — not a moment sooner. */
    const updated = await users.setPassword(req.user.uid, req.body.newPassword, { mustChangePassword: false });
    await sessions.revokeAllForUser(req.user.uid);
    const issued = await sessions.issue(updated, { userAgent: req.headers['user-agent'], ip: req.ip });
    res.json({ changed: true, ...issued });
  }));

/* ── Administration. These are the first routes to require `admin`. ───────── */

router.get('/users',
  authenticate,
  doc({
    summary: 'The accounts in this organisation',
    response: { type: 'object', properties: { users: { type: 'array', items: userShape } } },
  }),
  handle(async (req, res) => {
    res.json({ users: await users.listUsers({ orgId: req.orgId }) });
  }));

router.post('/users',
  authenticate,
  validate({ body: createUserSchema }),
  doc({ summary: 'Create an account',
    description: 'Requires the admin scope. Give `accessEndsAt` to issue a trial — an account that '
      + 'signs in normally until a date agreed in advance and then cannot, which is a different fact '
      + 'from an account somebody disabled and is told to the customer differently. The password is '
      + 'the administrator\'s until the account replaces it; until then it can reach its own password '
      + 'and nothing else.',
    status: 201, response: { type: 'object', properties: { user: userShape } } }),
  handle(async (req, res) => {
    const user = await users.createUser({
      ...req.body,
      orgId: req.body.orgId || req.orgId,
      createdBy: (req.actor && req.actor.id) || null,
    });
    res.status(201).json({ user });
  }));

router.patch('/users/:userId',
  authenticate,
  validate({ body: patchUserSchema }),
  doc({ summary: 'Change an account’s role, or disable it', response: { type: 'object', properties: { user: userShape } } }),
  handle(async (req, res) => {
    const target = await users.getUser(req.params.userId);
    if (!target || target.orgId !== req.orgId) throw fail(404, 'USER_NOT_FOUND', 'No such account in this organisation.');

    let user = target;
    if (req.body.role !== undefined) user = await users.setRole(target.id, req.body.role);
    if (req.body.active !== undefined) {
      user = await users.setActive(target.id, req.body.active);
      /* Disabling an account that is signed in somewhere has to reach the
         sessions, or "they are disabled" is only true at their next sign-in. */
      if (req.body.active === false) await sessions.revokeAllForUser(target.id);
    }
    if (req.body.accessEndsAt !== undefined) {
      user = await users.setAccessEndsAt(target.id, req.body.accessEndsAt || null);
      /* No revoke here, and that is the point rather than an omission. The
         window is read from the account on every request, so a session held
         under a window that has just closed stops working on its next call and
         `sessions.resolve()` removes the row then — with `ACCESS_ENDED` as the
         reason. Deleting the rows here would also stop it, one request sooner,
         and the customer would be told their session "is not recognised",
         which sends them to sign in again to discover the real answer. */
    }
    res.json({ user });
  }));

router.post('/users/:userId/password',
  doc({ summary: "Reset another account's password — requires the admin scope",
    description: 'Ends every session that account holds.',
    response: body({ changed: bool, temporaryPassword: str }, ['changed']) }),
  authenticate,
  validate({ body: resetSchema }),
  doc({ summary: 'Reset an account’s password and end its sessions', status: 200 }),
  handle(async (req, res) => {
    const target = await users.getUser(req.params.userId);
    if (!target || target.orgId !== req.orgId) throw fail(404, 'USER_NOT_FOUND', 'No such account in this organisation.');
    const user = await users.setPassword(target.id, req.body.newPassword,
      { mustChangePassword: req.body.mustChangePassword !== false });
    const ended = await sessions.revokeAllForUser(target.id);
    res.json({ reset: true, sessionsEnded: ended, user });
  }));

module.exports = router;
/* `/health` reports whether the first-run window is still open, because an
   operator who cannot sign in needs to know which of "nobody exists yet" and
   "the token is not set" they are looking at. A boolean, never the token. */
module.exports.bootstrapState = bootstrapState;
