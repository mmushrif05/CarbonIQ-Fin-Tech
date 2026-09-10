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

/** The record as anyone outside this module may see it. */
function publicUser(record) {
  if (!record) return null;
  const { passwordHash: _passwordHash, ...rest } = record;
  return { ...rest, roleLabel: (ROLES[rest.role] || ROLES[DEFAULT_ROLE]).label,
    roleLevel: (ROLES[rest.role] || ROLES[DEFAULT_ROLE]).level };
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
 *          password: string, createdBy?: string|null}} spec
 */
async function createUser({ orgId, email, name, role, password: secret, createdBy = null }) {
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
  };
  await store.put(COLLECTION, PARTITION, record.id, record);
  return publicUser(record);
}

/**
 * The account for these credentials, or null.
 *
 * A wrong address and a wrong password answer the same way and take the same
 * work: without the decoy hash, a missing account returns in microseconds and
 * a real one in the time scrypt takes, which tells an attacker which
 * addresses are worth attacking. A disabled account is refused after the
 * check, for the same reason.
 */
const DECOY = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$'
  + Buffer.alloc(64).toString('base64');

async function authenticate(email, secret) {
  const record = await _byEmail(email);
  const ok = await password.verify(secret, record ? record.passwordHash : DECOY);
  if (!record || !ok || record.active === false) return null;

  /* A successful sign-in is the one moment the plaintext is in hand, so it is
     the only moment a hash written under weaker parameters can be upgraded. */
  if (password.needsRehash(record.passwordHash)) {
    await store.patch(COLLECTION, PARTITION, record.id,
      { passwordHash: await password.hash(secret), updatedAt: new Date().toISOString() });
  }
  await store.patch(COLLECTION, PARTITION, record.id, { lastLoginAt: new Date().toISOString() });
  return publicUser(record);
}

async function setPassword(id, secret) {
  const record = await store.get(COLLECTION, PARTITION, String(id));
  if (!record) throw fail(404, 'USER_NOT_FOUND', `No account with id ${id}.`);
  await store.patch(COLLECTION, PARTITION, record.id, {
    passwordHash: await password.hash(secret),
    updatedAt: new Date().toISOString(),
  });
  return publicUser({ ...record, updatedAt: new Date().toISOString() });
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
  authenticate, setPassword, setRole, setActive,
  publicUser, normaliseEmail,
};
