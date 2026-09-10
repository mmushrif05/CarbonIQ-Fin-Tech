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
const { doc } = require('./openapi-hints');
const handle = require('./async-handler');
const { ROLES } = require('../../shared/policies');
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
const createUserSchema = Joi.object({
  email: emailField,
  name: Joi.string().max(160).allow('', null),
  role: roleField.required(),
  password: passwordField,
  orgId: Joi.string().max(120).description('Defaults to the organisation of the account creating this one.'),
});
const patchUserSchema = Joi.object({
  role: roleField,
  active: Joi.boolean().description('Setting this false ends every session that account holds.'),
}).min(1);
const resetSchema = Joi.object({ newPassword: passwordField });

/** What a sign-in and `/me` both answer with. */
const userShape = {
  type: 'object',
  properties: {
    id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' },
    orgId: { type: 'string' }, role: { type: 'string' }, roleLabel: { type: 'string' },
    roleLevel: { type: 'integer' }, active: { type: 'boolean' },
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
    if (!store.capability().writable) {
      throw fail(503, 'STORAGE_UNAVAILABLE',
        'Sessions cannot be issued because this deployment cannot persist anything.',
        'Set DATABASE_URL. GET /v1/partc/storage reports what this deployment can hold.');
    }
    await assertSomeoneExists();
    const user = await users.authenticate(req.body.email, req.body.password);
    if (!user) {
      /* One answer for a wrong address and a wrong password. */
      throw fail(401, 'SIGN_IN_FAILED', 'That email address and password do not match an active account.');
    }
    const issued = await sessions.issue(user, {
      userAgent: req.headers['user-agent'], ip: req.ip,
    });
    res.json({ ...issued, user });
  }));

router.post('/logout',
  authenticate, validate({ body: emptyBody }),
  doc({ summary: 'Sign out', description: 'Ends the session the request carried. Idempotent.', status: 200 }),
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
    const confirmed = await users.authenticate(req.user.email, req.body.currentPassword);
    if (!confirmed) throw fail(401, 'SIGN_IN_FAILED', 'The current password is not correct.');
    await users.setPassword(req.user.uid, req.body.newPassword);
    await sessions.revokeAllForUser(req.user.uid);
    const issued = await sessions.issue(confirmed, { userAgent: req.headers['user-agent'], ip: req.ip });
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
  doc({ summary: 'Create an account', status: 201, response: { type: 'object', properties: { user: userShape } } }),
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
    res.json({ user });
  }));

router.post('/users/:userId/password',
  authenticate,
  validate({ body: resetSchema }),
  doc({ summary: 'Reset an account’s password and end its sessions', status: 200 }),
  handle(async (req, res) => {
    const target = await users.getUser(req.params.userId);
    if (!target || target.orgId !== req.orgId) throw fail(404, 'USER_NOT_FOUND', 'No such account in this organisation.');
    await users.setPassword(target.id, req.body.newPassword);
    const ended = await sessions.revokeAllForUser(target.id);
    res.json({ reset: true, sessionsEnded: ended });
  }));

module.exports = router;
