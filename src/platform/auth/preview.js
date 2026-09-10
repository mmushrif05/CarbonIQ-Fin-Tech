// @ts-check
/**
 * CarbonIQ FinTech — preview access: the sample book, opened by an address
 *
 * A visitor types an email address into a public form and is shown the product
 * working over a sample book. Nothing they see is anyone's data, nothing they
 * do changes anything, and the address is recorded so that the people who
 * asked can be told when the thing they asked about exists.
 *
 * ── One shared account, one register row per address ────────────────────────
 *
 * The obvious design is an account per visitor. It is the wrong one, twice.
 *
 * A public form that creates a row in `users` for anyone who types into it is
 * an unbounded write on the table that holds every real person, and `users`
 * keys on the address — so the first time somebody at a bank that already has
 * an account typed their own address into the preview form, the route would
 * have to either refuse (announcing to an anonymous caller that the address is
 * registered, which is precisely the oracle `POST /v1/auth/login` goes to
 * lengths to avoid) or touch their real account. Neither is acceptable.
 *
 * So every preview visitor is admitted on **one shared account** — role
 * `viewer`, organisation `preview`, an unroutable address nobody can receive
 * mail at — and each gets their own session row, which is what actually ends,
 * revokes and expires. Who asked lives in `preview_signups`, which is the
 * register a product team reads. The two facts are kept apart deliberately:
 * removing an account must not erase the fact that a question was asked.
 *
 * What that costs is real and worth stating: an audit line for a preview read
 * names the preview account, not the visitor. That is accurate rather than
 * lossy — the preview account is the authority the request carried — and it
 * cannot mislead anyone about a book, because a preview session holds `read`
 * and the only book it can reach is the sample one.
 *
 * ── Why the isolation holds ────────────────────────────────────────────────
 *
 * Every read at the storage seam takes the organisation as its second
 * argument and is partitioned on it, so an organisation whose only records are
 * the sample book can only ever return the sample book. The preview
 * visitor is not trusted not to look; there is nothing there to find. And
 * `scopesForRoleLevel(20)` resolves to `['read']`, so the session cannot
 * write, cannot lock, and cannot run an agent — the last of which also means a
 * public form cannot spend the deployment's AI budget.
 */

'use strict';

const crypto = require('crypto');

const store = require('../database/store');
const { intOr } = require('../../shared/numbers');
const users = require('./users');
const sessions = require('./sessions');
const config = require('../config');
const logger = require('../observability/logger');

const log = logger.for('platform/auth/preview');

/** @typedef {import('../../shared/types').AppError} AppError */

/**
 * The organisation every preview visitor is admitted into. Its records are the
 * sample book and nothing else, which is what makes "read-only" safe rather
 * than merely enforced.
 */
const PREVIEW_ORG = 'preview';

/**
 * The shared account's address. `.invalid` is reserved by RFC 2606 and is
 * guaranteed never to resolve, so no one can receive mail at it and no one can
 * claim it by proving they own it.
 */
const PREVIEW_EMAIL = 'preview@carboniq.invalid';

const COLLECTION = 'preview_signups';
const PARTITION = '_';

/** @param {number} status @param {string} code @param {string} message @param {string} [remedy] */
function fail(status, code, message, remedy) {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = status;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

// ---------------------------------------------------------------------------
// The sample book, injected rather than imported
// ---------------------------------------------------------------------------

/**
 * The platform never imports a domain, and the sample book is Part C's.
 * A composition root (`src/server.js`) hands the installer in; this file only
 * knows that there is one and when to run it.
 *
 * @type {null | ((orgId: string) => Promise<unknown>)}
 */
let _installer = null;

/** @param {(orgId: string) => Promise<unknown>} fn */
function registerSampleBook(fn) { _installer = fn; }

/** Test seam — forget the registration and the install cache. */
function _reset() { _installer = null; _installed = null; }

/**
 * Whether this process has already installed the book, so a warm container
 * does not re-check the store on every admission.
 * @type {Promise<void>|null}
 */
let _installed = null;

/**
 * Put the sample book in place, once.
 *
 * Sequentially idempotent: it looks for a client before writing anything and
 * does nothing when one is there. Two visitors pressing the button in the same
 * instant on a deployment that has never been previewed could still both pass
 * that check and seed twice — the store seam publishes no lock to close it —
 * and the outcome is a duplicated sample book rather than anything unsafe or
 * anyone's data. It is recorded here rather than left to be discovered.
 */
async function installSampleBook() {
  if (!_installer) return;
  if (_installed) return _installed;
  _installed = (async () => {
    const existing = await store.list('clients', PREVIEW_ORG, { limit: 1 })
      .catch(logger.fallback('preview.sampleBook.check', []));
    if (existing && existing.length > 0) return;
    log.info({ orgId: PREVIEW_ORG }, 'installing the sample book for preview access');
    await store.transaction(async () => {
      /* Re-read inside the transaction: on PostgreSQL this is the one that
         counts, because the check above ran on a different connection. */
      const now = await store.list('clients', PREVIEW_ORG, { limit: 1 });
      if (now && now.length > 0) return;
      await /** @type {(orgId: string) => Promise<unknown>} */ (_installer)(PREVIEW_ORG);
    }, { name: 'preview.install-sample-book' });
  })().catch(err => {
    /* A failed install must not be remembered as done, or the deployment
       shows an empty preview for the life of the container. */
    _installed = null;
    throw err;
  });
  return _installed;
}

// ---------------------------------------------------------------------------
// Whether the door is open
// ---------------------------------------------------------------------------

/**
 * Preview access is available when this deployment can persist a session and
 * an operator has not switched it off.
 *
 * The shape matches `bootstrapState()`: available, and where it is not, which
 * condition failed and what to do about it. A screen that can only say "no"
 * sends the operator looking in the wrong place.
 *
 * @returns {Promise<{available: boolean, reason: string|null, remedy: string|null}>}
 */
async function state() {
  if (!isEnabled()) {
    return {
      available: false,
      reason: 'Preview access is switched off on this deployment.',
      remedy: 'Unset PREVIEW_ACCESS, or set it to "on".',
    };
  }
  const cap = store.capability();
  if (!cap.writable) {
    return {
      available: false,
      reason: `This deployment cannot persist anything, so a preview session cannot be issued. ${cap.reason}`,
      remedy: cap.remedy || 'Set DATABASE_URL. GET /v1/partc/storage reports what this deployment can hold.',
    };
  }
  return { available: true, reason: null, remedy: null };
}

/**
 * On unless an operator says otherwise.
 *
 * The default is deliberate and it is the less cautious of the two. What the
 * route can do is bounded by construction — it issues a read-only session into
 * an organisation whose only records are a sample book — so the usual reason
 * to default a public door shut does not apply, and defaulting it shut would
 * mean every deployment has to be told to allow the thing it was built to do.
 */
function isEnabled() {
  return String(config.runtime.previewAccess || 'on').trim().toLowerCase() !== 'off';
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

/** A stable id per address, so the same person is one row however often they return. */
function idFor(email) {
  return `pv_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

/**
 * Record that this address asked, or that it asked again.
 *
 * Returning visits are counted rather than ignored: "asked once in March" and
 * "has come back four times this week" are different facts about the same
 * address, and the second is the one worth acting on.
 *
 * @param {string} email  already normalised
 * @param {{userAgent?: string|null, referrer?: string|null}} [meta]
 */
async function recordSignup(email, meta = {}) {
  const id = idFor(email);
  const now = new Date().toISOString();
  const existing = await store.get(COLLECTION, PARTITION, id)
    .catch(logger.fallback('preview.signup.read', null));

  const record = existing
    ? { ...existing, lastSeenAt: now, visits: intOr(existing.visits, 0) + 1, updatedAt: now }
    : {
      id,
      email,
      firstSeenAt: now,
      lastSeenAt: now,
      visits: 1,
      /* What the browser said about itself, which is the only context a form
         with one field can carry. Never an IP: it is the visitor's location
         and this register exists to hold an address they chose to give. */
      userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
      referrer: meta.referrer ? String(meta.referrer).slice(0, 300) : null,
      createdAt: now,
      updatedAt: now,
    };

  await store.put(COLLECTION, PARTITION, id, record);
  return record;
}

/**
 * The register, newest first — who asked, when they first asked, and how often
 * they have come back.
 *
 * @param {{limit?: number}} [options]
 */
async function signups({ limit = 200 } = {}) {
  const rows = await store.list(COLLECTION, PARTITION, { limit: null })
    .catch(logger.fallback('preview.signups.list', []));
  const sorted = [...rows].sort((a, b) =>
    String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  return {
    total: sorted.length,
    signups: sorted.slice(0, Math.max(1, intOr(limit, 200))),
  };
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

/**
 * The shared preview account, created on first use.
 *
 * Its password is 64 random bytes that are generated here, used once and never
 * held by anybody — the account exists to be a subject for a session, not to
 * be signed into. Nothing returns it and nothing stores it in the clear.
 */
async function account() {
  const found = await users.findByEmail(PREVIEW_EMAIL);
  if (found) return found;
  return users.createUser({
    orgId: PREVIEW_ORG,
    email: PREVIEW_EMAIL,
    name: 'Preview',
    role: 'viewer',
    password: crypto.randomBytes(64).toString('hex'),
    createdBy: 'preview',
    mustChangePassword: false,
  });
}

/**
 * Admit a visitor: record the address, put the sample book in place if it is
 * not already, and issue a session on the shared preview account.
 *
 * @param {string} rawEmail
 * @param {{userAgent?: string|null, referrer?: string|null, ip?: string|null}} [meta]
 */
async function admit(rawEmail, meta = {}) {
  const open = await state();
  if (!open.available) {
    throw fail(503, 'PREVIEW_UNAVAILABLE', open.reason || 'Preview access is not available.',
      open.remedy || undefined);
  }

  const email = users.normaliseEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw fail(400, 'INVALID_EMAIL', 'A valid email address is required.');
  }

  const signup = await recordSignup(email, meta);
  await installSampleBook();

  const user = await account();
  /* `publicUser` is what the account routes return; `getUser` gives the stored
     record `sessions.issue()` needs to read the access window from. */
  const stored = await users.getUser(user.id);
  const issued = await sessions.issue(stored || user, { userAgent: meta.userAgent, ip: meta.ip });

  log.info({ visits: signup.visits, orgId: PREVIEW_ORG }, 'preview session issued');
  /* The same shape `POST /v1/auth/login` answers with, plus what is true only
     here: that this is a preview, and how often this address has been back.
     A browser that had to tell the two apart by which keys were missing would
     be reading a difference nobody declared. */
  return {
    ...issued,
    user: stored ? users.publicUser(stored) : user,
    preview: true,
    signupAt: signup.firstSeenAt,
    visits: signup.visits,
  };
}

module.exports = {
  PREVIEW_ORG, PREVIEW_EMAIL, COLLECTION, PARTITION,
  state, isEnabled, admit, recordSignup, signups, account,
  registerSampleBook, installSampleBook, idFor, _reset,
};
