// @ts-check
/**
 * The people who can sign in.
 *
 * One home, reached through the storage seam like every other record, so a
 * deployment on PostgreSQL keeps its accounts in the one database the
 * operator provisioned and a deployment without one is refused a write
 * rather than told a user was created. There is no second seam here: the
 * three private ones already in this tree are a finding against it.
 *
 * Users live in the shared partition ('_') because a sign-in names an email
 * address and nothing else — the organisation is what the account *tells*
 * us, so it cannot also be what we look the account up by. The owning
 * organisation is inside the record and lifted into a column by the
 * migration, exactly as an API key's is.
 *
 * A password hash never leaves this module. Everything a caller receives has
 * been through `publicUser()`.
 */

'use strict';

const crypto = require('crypto');
const store = require('../database/store');
const password = require('./password');
const { ROLES, DEFAULT_ROLE } = require('../../shared/policies');

/** @typedef {import('../../shared/types').AppError} AppError */

const COLLECTION = 'users';
const PARTITION = '_';

const fail = (statusCode, code, message, remedy) => {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
};

/** Addresses are compared and stored in one case; `Ana@Bank.LK` is one account. */
const normaliseEmail = value => String(value == null ? '' : value).trim().toLowerCase();

/**
 * An access window, which is what a trial is.
 *
 * `accessEndsAt` is an instant after which the account may no longer sign in.
 * It is deliberately **not** a role and not the `active` flag:
 *
 *   - A role says what someone may do. A trial says for how long. Folding the
 *     two together would mean a trial customer could not hold the same role as
 *     a paying one, and the day they convert their permissions would change
 *     for no reason anybody recorded.
 *   - `active` is an administrator's decision, taken at a moment. An access
 *     window is a date agreed in advance that passes on its own. A customer
 *     told "your account has been disabled" when their trial simply ran out
 *     calls the wrong person and hears the wrong answer.
 *
 * Null means no end, which is what every account created before this had and
 * what an ordinary account still has.
 */
function accessState(record, now = Date.now()) {
  if (!record) return { state: 'ended', endsAt: null, daysRemaining: null };
  if (record.active === false) return { state: 'disabled', endsAt: record.accessEndsAt || null, daysRemaining: null };
  const endsAt = record.accessEndsAt || null;
  if (!endsAt) return { state: 'open', endsAt: null, daysRemaining: null };
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms)) return { state: 'open', endsAt: null, daysRemaining: null };
  if (ms <= 0) return { state: 'ended', endsAt, daysRemaining: 0 };
  return { state: 'ending', endsAt, daysRemaining: Math.ceil(ms / 86400000) };
}

/** True when the window has closed. A closed window refuses a sign-in. */
const accessHasEnded = (record, now = Date.now()) => accessState(record, now).state === 'ended';

/** The record as anyone outside this module may see it. */
function publicUser(record) {
  if (!record) return null;
  const { passwordHash: _passwordHash, ...rest } = record;
  return {
    ...rest,
    roleLabel: (ROLES[rest.role] || ROLES[DEFAULT_ROLE]).label,
    roleLevel: (ROLES[rest.role] || ROLES[DEFAULT_ROLE]).level,
    accessEndsAt: rest.accessEndsAt || null,
    mustChangePassword: rest.mustChangePassword === true,
    access: accessState(rest),
  };
}

function assertRole(role) {
  const name = String(role || DEFAULT_ROLE);
  if (!ROLES[name]) {
    throw fail(400, 'UNKNOWN_ROLE',
      `Unknown role "${name}".`,
      `Known roles: ${Object.keys(ROLES).join(', ')}.`);
  }
  return name;
}

/** @returns {Promise<any|null>} the stored record, hash included — internal use. */
async function _byEmail(email) {
  const rows = await store.query(COLLECTION, PARTITION, { where: { email: normaliseEmail(email) }, limit: 2 });
  return rows && rows.length ? rows[0] : null;
}

async function findByEmail(email) {
  return publicUser(await _byEmail(email));
}

async function getUser(id) {
  return publicUser(await store.get(COLLECTION, PARTITION, String(id)));
}

async function listUsers({ orgId = null } = {}) {
  const where = orgId ? { orgId: String(orgId) } : {};
  const rows = await store.query(COLLECTION, PARTITION, { where });
  return rows.map(publicUser);
}

async function countUsers() {
  return (await store.query(COLLECTION, PARTITION, {})).length;
}

/**
 * Create an account. The email is unique across the deployment; on
 * PostgreSQL a unique index enforces that, because a check in code cannot
 * stop two sign-ups racing.
 *
 * @param {{orgId: string, email: string, name?: string, role?: string,
 *          password: string, createdBy?: string|null, accessEndsAt?: string|null,
 *          mustChangePassword?: boolean}} spec
 */
async function createUser({ orgId, email, name, role, password: secret, createdBy = null,
  accessEndsAt = null, mustChangePassword = false }) {
  const address = normaliseEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw fail(400, 'INVALID_EMAIL', 'A valid email address is required.');
  }
  if (!orgId) throw fail(400, 'ORG_REQUIRED', 'An organisation is required.');
  const roleName = assertRole(role);
  if (await _byEmail(address)) {
    throw fail(409, 'EMAIL_IN_USE', `An account already exists for ${address}.`,
      'Reset that account rather than creating a second one: npm run user:passwd -- <email>');
  }

  const now = new Date().toISOString();
  const record = {
    id: `usr_${crypto.randomUUID()}`,
    orgId: String(orgId),
    email: address,
    name: String(name || address).trim(),
    role: roleName,
    active: true,
    passwordHash: await password.hash(secret),
    createdAt: now,
    updatedAt: now,
    createdBy,
    lastLoginAt: null,
    /* A trial is an access window, not a role and not a disabled flag. Null is
       an ordinary account, which is what every account had before this. */
    accessEndsAt: accessEndsAt ? assertInstant(accessEndsAt) : null,
    /* A password an administrator chose is the administrator's, not the
       account holder's. Until it is changed the account can reach its own
       password and nothing else. */
    mustChangePassword: Boolean(mustChangePassword),
  };
  await store.put(COLLECTION, PARTITION, record.id, record);
  return publicUser(record);
}

/** An ISO instant, or a refusal naming what was sent. A date alone means its end. */
function assertInstant(value) {
  const raw = String(value).trim();
  /* A bare date is the end of that day, not its first second: "the trial runs
     to the 30th" means through the 30th, and taking it as midnight would cut
     a customer off a day early. */
  const text = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw;
  const ms = new Date(text).getTime();
  if (!Number.isFinite(ms)) {
    throw fail(400, 'INVALID_INSTANT', `"${value}" is not a date this system can read.`,
      'Send an ISO 8601 date (2026-03-31) or instant (2026-03-31T17:00:00Z).');
  }
  return new Date(ms).toISOString();
}

/**
 * The account for these credentials, or null.
 *
 * A wrong address and a wrong password answer the same way and take the same
 * work: without the decoy hash, a missing account returns in microseconds and
 * a real one in the time scrypt takes, which tells an attacker which
 * addresses are worth attacking. A disabled account is refused after the
 * check, for the same reason.
 *
 * Two refusals are named rather than generic, and both only after the password
 * has verified: an account whose access window has closed, and one that has
 * been disabled. Naming them to somebody who has just proved they hold the
 * password is not an address oracle, and the alternative — telling a customer
 * on the morning after their trial ended that their password is wrong — sends
 * them to reset a password that was never the problem.
 *
 * @returns {Promise<{user: any|null, reason: 'credentials'|'disabled'|'access_ended'|null}>}
 */
const DECOY = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$'
  + Buffer.alloc(64).toString('base64');

async function authenticate(email, secret) {
  const record = await _byEmail(email);
  const ok = await password.verify(secret, record ? record.passwordHash : DECOY);
  if (!record || !ok) return { user: null, reason: 'credentials' };
  if (record.active === false) return { user: null, reason: 'disabled' };
  if (accessHasEnded(record)) return { user: null, reason: 'access_ended' };

  /* A successful sign-in is the one moment the plaintext is in hand, so it is
     the only moment a hash written under weaker parameters can be upgraded. */
  if (password.needsRehash(record.passwordHash)) {
    await store.patch(COLLECTION, PARTITION, record.id,
      { passwordHash: await password.hash(secret), updatedAt: new Date().toISOString() });
  }
  await store.patch(COLLECTION, PARTITION, record.id, { lastLoginAt: new Date().toISOString() });
  return { user: publicUser(record), reason: null };
}

/**
 * Set a password.
 *
 * `mustChangePassword` says whose password it now is. An administrator issuing
 * or resetting one passes true, and the account can reach its own password and
 * nothing else until it is changed; the account holder changing their own
 * passes false, which is what clears it.
 */
async function setPassword(id, secret, { mustChangePassword = false } = {}) {
  const record = await store.get(COLLECTION, PARTITION, String(id));
  if (!record) throw fail(404, 'USER_NOT_FOUND', `No account with id ${id}.`);
  const updatedAt = new Date().toISOString();
  const patch = {
    passwordHash: await password.hash(secret),
    mustChangePassword: Boolean(mustChangePassword),
    updatedAt,
  };
  await store.patch(COLLECTION, PARTITION, record.id, patch);
  return publicUser({ ...record, mustChangePassword: patch.mustChangePassword, updatedAt });
}

/**
 * Open, extend or close an access window.
 *
 * `null` removes the window entirely, which is how a trial becomes an ordinary
 * account on the day the customer converts — the same account, the same
 * history, the same id. An instant in the past closes it now, which is how a
 * trial is ended early; the caller ends the sessions, because a window that
 * has closed while somebody is signed in has not closed.
 */
async function setAccessEndsAt(id, when) {
  const record = await store.get(COLLECTION, PARTITION, String(id));
  if (!record) throw fail(404, 'USER_NOT_FOUND', `No account with id ${id}.`);
  const endsAt = when === null || when === undefined || when === '' ? null : assertInstant(when);
  const updatedAt = new Date().toISOString();
  await store.patch(COLLECTION, PARTITION, record.id, { accessEndsAt: endsAt, updatedAt });
  return publicUser({ ...record, accessEndsAt: endsAt, updatedAt });
}

async function setRole(id, role) {
  const roleName = assertRole(role);
  const record = await store.get(COLLECTION, PARTITION, String(id));
  if (!record) throw fail(404, 'USER_NOT_FOUND', `No account with id ${id}.`);
  const updatedAt = new Date().toISOString();
  await store.patch(COLLECTION, PARTITION, record.id, { role: roleName, updatedAt });
  return publicUser({ ...record, role: roleName, updatedAt });
}

async function setActive(id, active) {
  const record = await store.get(COLLECTION, PARTITION, String(id));
  if (!record) throw fail(404, 'USER_NOT_FOUND', `No account with id ${id}.`);
  const updatedAt = new Date().toISOString();
  await store.patch(COLLECTION, PARTITION, record.id, { active: Boolean(active), updatedAt });
  return publicUser({ ...record, active: Boolean(active), updatedAt });
}

module.exports = {
  COLLECTION, PARTITION,
  createUser, findByEmail, getUser, listUsers, countUsers,
  authenticate, setPassword, setRole, setActive, setAccessEndsAt,
  publicUser, normaliseEmail, accessState, accessHasEnded, assertInstant,
};
