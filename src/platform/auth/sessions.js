// @ts-check
/**
 * Sessions — a row, not a signed token.
 *
 * A signed token cannot be withdrawn. "Sign that person out now", "they left
 * this morning", "revoke every session on that laptop" are controls a bank
 * asks for, and a stateless token answers none of them without a denylist,
 * which is a session table wearing a different name. So a session is a row,
 * and signing out is a delete.
 *
 * What the client holds is a random 256-bit token. What is stored is its
 * SHA-256, so a reader of the database cannot present anyone's session —
 * the same rule the API keys already follow. There is no salt because the
 * token has full entropy: a dictionary of guesses is not the threat.
 *
 * Two clocks, because they answer different questions. The **idle** clock
 * ends a session someone walked away from; the **absolute** clock ends one
 * that has been alive too long however busy it looks, which is what bounds
 * the damage from a token taken and used quietly.
 *
 * The role is not kept in the session. It is read from the account on every
 * request, so disabling someone or lowering their role takes effect on their
 * next call rather than at their next sign-in. That is one extra read of a
 * primary key, and it is the difference between a control that works and one
 * that works eventually.
 */

'use strict';

const crypto = require('crypto');
const store = require('../database/store');
const users = require('./users');
const { ROLES, DEFAULT_ROLE } = require('../../shared/policies');
const logger = require('../observability/logger');

const COLLECTION = 'sessions';
const PARTITION = '_';

/** Walked away from. */
const IDLE_MS = 60 * 60 * 1000;
/** Alive too long, however busy. */
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** Below this, a touch on every request is a write on every request. */
const TOUCH_AFTER_MS = 60 * 1000;

const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');

/** A token the client keeps. The prefix makes one recognisable in a log or a bug report. */
function mint() {
  return `cqs_${crypto.randomBytes(32).toString('base64url')}`;
}

/**
 * Open a session for an account.
 * @param {any} user a public user record
 * @param {{userAgent?: string|null, ip?: string|null}} [context]
 */
async function issue(user, { userAgent = null, ip = null } = {}) {
  const token = mint();
  const now = Date.now();
  const record = {
    id: digest(token),
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    idleExpiresAt: new Date(now + IDLE_MS).toISOString(),
    expiresAt: new Date(now + ABSOLUTE_MS).toISOString(),
    /* Recorded so a person can recognise their own sessions; never matched
       against, because a changing user agent is not evidence of anything. */
    userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
    ip: ip ? String(ip).slice(0, 60) : null,
  };
  await store.put(COLLECTION, PARTITION, record.id, record);
  return { token, expiresAt: record.expiresAt, idleExpiresAt: record.idleExpiresAt };
}

const expiredAt = (record, now) =>
  new Date(record.expiresAt).getTime() <= now ? 'absolute'
    : new Date(record.idleExpiresAt).getTime() <= now ? 'idle'
      : null;

/**
 * The account behind a token, or a reason there is none.
 * @param {string|null|undefined} token
 * @returns {Promise<{user: any|null, session?: any, reason?: string}>}
 */
async function resolve(token) {
  if (!token) return { user: null, reason: 'missing' };
  const id = digest(token);
  const session = await store.get(COLLECTION, PARTITION, id);
  if (!session) return { user: null, reason: 'unknown' };

  const now = Date.now();
  const gone = expiredAt(session, now);
  if (gone) {
    await store.remove(COLLECTION, PARTITION, id).catch(logger.fallback('sessions.remove.expired', undefined));
    return { user: null, reason: gone === 'idle' ? 'idle' : 'expired' };
  }

  /* Read the account, not the session, for anything that governs access. */
  const user = await users.getUser(session.userId);
  if (!user || user.active === false) {
    await store.remove(COLLECTION, PARTITION, id).catch(logger.fallback('sessions.remove.disabled', undefined));
    return { user: null, reason: 'disabled' };
  }

  if (now - new Date(session.lastSeenAt).getTime() > TOUCH_AFTER_MS) {
    await store.patch(COLLECTION, PARTITION, id, {
      lastSeenAt: new Date(now).toISOString(),
      idleExpiresAt: new Date(now + IDLE_MS).toISOString(),
    }).catch(logger.fallback('sessions.touch', undefined));
  }

  const role = ROLES[user.role] || ROLES[DEFAULT_ROLE];
  return {
    user: {
      uid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleLevel: role.level,
      roleLabel: role.label,
      organizationId: user.orgId,
    },
    session: { id, expiresAt: session.expiresAt },
  };
}

async function revoke(token) {
  if (!token) return false;
  await store.remove(COLLECTION, PARTITION, digest(token)).catch(logger.fallback('sessions.revoke', undefined));
  return true;
}

/** Every session for one person — what "sign them out everywhere" means. */
async function revokeAllForUser(userId) {
  const rows = await store.query(COLLECTION, PARTITION, { where: { userId: String(userId) } });
  for (const row of rows) await store.remove(COLLECTION, PARTITION, row.id).catch(logger.fallback('sessions.revokeAll', undefined));
  return rows.length;
}

/** Rows whose clocks have run out. Safe to call from anywhere, any time. */
async function sweep() {
  const rows = await store.query(COLLECTION, PARTITION, {});
  const now = Date.now();
  let removed = 0;
  for (const row of rows) {
    if (expiredAt(row, now)) {
      await store.remove(COLLECTION, PARTITION, row.id).catch(logger.fallback('sessions.sweep', undefined));
      removed += 1;
    }
  }
  return removed;
}

module.exports = {
  COLLECTION, PARTITION, IDLE_MS, ABSOLUTE_MS,
  issue, resolve, revoke, revokeAllForUser, sweep, digest,
};
