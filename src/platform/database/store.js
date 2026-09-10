// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part C: Storage Layer
 *
 * One place that decides where Part C data lives and, more importantly, says
 * honestly whether it will still be there on the next request.
 *
 * Firebase is the real store. Without it there is an in-process fallback so
 * the product is usable on a laptop with no credentials — but that fallback
 * is only sound where the process outlives the request.
 *
 * On Netlify every invocation may land in a fresh container, so an in-memory
 * write is lost the moment the response is sent. A registry that appears to
 * accept a client and silently forgets it is worse than one that refuses, so
 * in a serverless runtime with no durable store, writes are REFUSED rather
 * than pretended. `capability()` reports which mode is active and why.
 *
 * ── Netlify Blobs ──────────────────────────────────────────────────────────
 *
 * Blobs is part of the platform the function already runs in, so it needs no
 * vendor, no credential and no connection handshake. It was the durable store
 * wherever it was reachable, until the database became the operator's.
 *
 * Blobs is now **opt-in**. The database belongs to the operator, provisioned
 * apart from the hosting platform, so a deployment that has not been given
 * one refuses to write rather than quietly keeping records inside Netlify.
 * `STORAGE_BACKEND=blobs` still selects it, explicitly, for a trial that
 * wants it.
 *
 * ── Choosing, rather than inheriting ───────────────────────────────────────
 *
 * That default has a sharp edge: a site with Firebase variables still set gets
 * Firebase even when the operator has decided on Blobs, and nothing about the
 * screen says why. `STORAGE_BACKEND` makes the choice explicit —
 *
 *   auto      (default) postgres, then firebase, then memory; never blobs
 *   blobs     Blobs, explicitly, and refuse rather than fall back to Firebase
 *   firebase  Firebase, and refuse rather than fall back to Blobs
 *   memory    in-process only; local development
 *
 * A forced backend that is unreachable **refuses** rather than quietly using
 * the other one. Silently honouring a preference by writing somewhere else is
 * how a bank ends up with half its records in a store nobody is reading.
 * `capability()` reports both the mode and whether it was chosen or inherited.
 *
 * ── PostgreSQL ─────────────────────────────────────────────────────────────
 *
 * The relational store, and the first one that is a database rather than a
 * place to keep JSON: indexed queries, foreign keys, transactions, versioned
 * migrations and a backup path. `src/platform/database/` owns it; this file only
 * decides when it is live.
 *
 *   auto      postgres when DATABASE_URL is set, then firebase, then memory
 *   postgres  PostgreSQL, and refuse rather than fall back
 *
 * Setting DATABASE_URL is a deliberate act — nobody has it set by accident —
 * so under `auto` it takes precedence over a Firebase configuration that may
 * simply have been left in place. Records already in Firebase or Blobs are
 * brought across by `scripts/migrate-to-postgres.js`, which counts both sides
 * and refuses to report success on a mismatch.
 *
 * Three operations exist only in this mode and degrade honestly elsewhere:
 * `query` (filter on indexed fields; a list-and-filter on the others),
 * `page` (keyset cursor; an offset cursor on the others) and `transaction`
 * (atomic; a plain call on the others, and `capability().transactional`
 * says which a caller got).
 */

'use strict';

/**
 * @typedef {import('../../shared/types').AppError} AppError
 *
 * @typedef {Record<string, any>} StoredRecord
 *   A record as the store holds it: JSON, with the fields the registry lifts
 *   into generated columns present at the top level. The store does not know
 *   a client from an investment — the collection does, and the service that
 *   owns the collection declares the shape. What the seam guarantees is that
 *   what went in is what comes back.
 *
 * @typedef {string|number|boolean|null|undefined|Array<string|number>} WhereValue
 *   A filter value. An array means any-of; `null` matches absent; `undefined`
 *   is **no filter on that field at all**, so a caller can spread an optional
 *   query parameter in without deciding whether to include the key.
 *
 * @typedef {Object} QueryOptions
 * @property {Record<string, WhereValue>} [where] equality on a field or a dotted path
 * @property {number|null} [limit]
 * @property {string|null} [orderBy] a field, `-field` for descending, or null to leave the order to the caller
 * @property {readonly string[]|null} [fields] a projection: the keys, or dotted paths, to return
 *
 * @typedef {Object} PageOptions
 * @property {number} [limit]
 * @property {string} [cursor] opaque, and store-specific — one store will not decode another's
 * @property {Record<string, WhereValue>} [where]
 *
 * @typedef {{items: StoredRecord[], nextCursor: string|null, limit: number}} Page
 */

const fb = require('../bridge/firebase');
const blobs = require('./blob-store');
const db = require('.');
const { adapterFor } = require('./adapters');
const memoryAdapter = require('./adapters/memory');
const config = require('../config');
const { timed } = require('../observability/metrics');
const logger = require('../observability/logger');
const { asError } = require('../../shared/types');
const log = logger.for('platform/database/store');

/** True when Firebase is configured and reachable. */
function isDurable() {
  try { return !!fb.getDatabase(); } catch (_) { return false; }
}

/**
 * True when this process will not survive between requests.
 * Netlify sets NETLIFY; Lambda sets AWS_LAMBDA_FUNCTION_NAME.
 */
function isEphemeralRuntime() {
  return config.runtime.isServerless;
}

/**
 * What this deployment can actually promise about persistence.
 * @returns {{mode:string, durable:boolean, writable:boolean, reason:string, remedy?:string}}
 */
const BACKENDS = ['auto', 'postgres', 'blobs', 'firebase', 'memory'];

/** What the operator asked for. Anything unrecognised is treated as auto. */
function requestedBackend() {
  const raw = String(config.runtime.storageBackend || 'auto').trim().toLowerCase();
  return BACKENDS.includes(raw) ? raw : 'auto';
}

/** True when PostgreSQL is configured for this process. Reachability is a separate, async question — see `probe()`. */
function isPostgresConfigured() {
  try { return db.client.isConfigured(); } catch (_) { return false; }
}

function capability() {
  const want = requestedBackend();

  if (want === 'postgres') {
    if (isPostgresConfigured()) {
      return {
        mode: 'postgres', durable: true, writable: true, transactional: true, chosen: true,
        reason: 'STORAGE_BACKEND=postgres. PostgreSQL is configured and is the only store in use.'
      };
    }
    return {
      mode: 'none', durable: false, writable: false, transactional: false, chosen: true,
      reason: 'STORAGE_BACKEND=postgres, but DATABASE_URL is not set in this runtime.',
      remedy: 'Set DATABASE_URL (and DATABASE_SSL where the host requires it), run `npm run db:migrate`, or unset STORAGE_BACKEND.'
    };
  }

  if (want === 'blobs') {
    if (blobs.isAvailable()) {
      return {
        mode: 'blobs', durable: true, writable: true, transactional: false, chosen: true,
        reason: 'STORAGE_BACKEND=blobs. Netlify Blobs is reachable and is the only store in use.'
      };
    }
    return {
      mode: 'none', durable: false, writable: false, transactional: false, chosen: true,
      reason: 'STORAGE_BACKEND=blobs, but Netlify Blobs is not reachable from this runtime.',
      remedy: 'Blobs needs no configuration on a deployed Netlify site. If this appears in production the deployment is misconfigured. Unset STORAGE_BACKEND to fall back to automatic selection.'
    };
  }

  if (want === 'firebase') {
    if (isDurable()) {
      return {
        mode: 'firebase', durable: true, writable: true, transactional: false, chosen: true,
        reason: 'STORAGE_BACKEND=firebase. Firebase is configured and is the only store in use.'
      };
    }
    return {
      mode: 'none', durable: false, writable: false, transactional: false, chosen: true,
      reason: 'STORAGE_BACKEND=firebase, but Firebase is not configured or not reachable.',
      remedy: 'Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL, or unset STORAGE_BACKEND.'
    };
  }

  if (want === 'memory') {
    return {
      mode: 'memory', durable: false, writable: true, transactional: false, chosen: true,
      reason: 'STORAGE_BACKEND=memory. Records are held in this process only and are lost when it stops.',
      remedy: 'Intended for local development and tests. Never set this on a deployed site.'
    };
  }

  if (isPostgresConfigured()) {
    return {
      mode: 'postgres', durable: true, writable: true, transactional: true, chosen: false,
      reason: 'DATABASE_URL is set and STORAGE_BACKEND is unset, so PostgreSQL takes precedence over any Firebase or Blobs configuration also present. Records held in those stores are not read until migrated: see scripts/migrate-to-postgres.js.'
    };
  }
  if (isDurable()) {
    return {
      mode: 'firebase', durable: true, writable: true, transactional: false, chosen: false,
      reason: 'Firebase is configured, DATABASE_URL is not, and STORAGE_BACKEND is unset, so Firebase is the store. Set DATABASE_URL to move to PostgreSQL.'
    };
  }
  if (isEphemeralRuntime()) {
    return {
      mode: 'none', durable: false, writable: false, transactional: false, chosen: false,
      reason: 'Running in a serverless runtime with no database configured. Each request may run in a fresh container, so anything written in memory is lost immediately, and records are not kept inside the hosting platform by default.',
      remedy: 'Set DATABASE_URL to the PostgreSQL database provisioned for this deployment (docs/DATA-LAYER.md, "Provisioning"). Firebase remains an alternative via FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL, and STORAGE_BACKEND=blobs selects Netlify Blobs explicitly for a trial. Read-only endpoints and the calculation engine work without any of them.'
    };
  }
  return {
    mode: 'memory', durable: false, writable: true, transactional: false, chosen: false,
    reason: 'No database configured. Records are held in this process only and are lost when it stops.',
    remedy: 'Fine for local development. Set DATABASE_URL for a database, or FIREBASE_SERVICE_ACCOUNT for Firebase.'
  };
}

/** Throws when a write cannot be honoured. Routes turn this into a 503. */
function assertWritable() {
  const cap = capability();
  if (cap.writable) return cap;
  const err = /** @type {AppError} */ (new Error(cap.reason));
  err.statusCode = 503;
  err.code = 'STORAGE_UNAVAILABLE';
  err.remedy = cap.remedy;
  throw err;
}

/* ---------------------------------------------------------------------------
   The verbs
   ---------------------------------------------------------------------------
   Each one asks which store was chosen and hands the call to that adapter,
   once. There is no per-verb branching left, which is what stops a write
   reaching two stores. */

/** The adapter for the store this deployment resolved to, or null. */
function current() {
  return adapterFor(capability().mode);
}

/** A read on a deployment with no store is empty, not an error. */
const EMPTY = { list: [], query: [], count: 0, page: { items: [], nextCursor: null, limit: 0 } };

/**
 * Write a record, replacing any record already at that id.
 * Refused with a 503 where this deployment cannot persist.
 *
 * @param {string} collection a name registered in `collections.js`
 * @param {string} orgId the partition; `'_'` for the records looked up before an organisation is known
 * @param {string} id
 * @param {StoredRecord} record
 * @returns {Promise<StoredRecord>}
 */
async function put(collection, orgId, id, record) {
  assertWritable();
  return current().put(collection, orgId, id, record);
}

/**
 * Write a record that must not already be there — an insert, not an upsert.
 *
 * `put` overwrites, which is right for a caller that owns the id it generated
 * and wrong for one that derives an id from something else. `desk.adopt`
 * derives `inv_<recordId>`, so two adoptions of one pipeline record aimed at
 * the same primary key: the second updated the first, the unique index on the
 * origin never saw a second row to reject, and both callers were told they had
 * adopted it — silently rewriting the frozen screening verdict and the pledge
 * that are meant to be written once and never again.
 *
 * Only PostgreSQL closes the race outright, in the primary key. The other
 * three read and then write, which narrows the window without shutting it;
 * `tests/store-conformance.test.js` states that difference rather than
 * letting it be found later.
 *
 * @throws {AppError} 409 DUPLICATE where the record is already there
 */
async function insert(collection, orgId, id, record) {
  assertWritable();
  return current().insert(collection, orgId, id, record);
}

/**
 * One record, or null. A record that was never written reads as null rather
 * than raising — absence is an answer.
 *
 * @param {string} collection
 * @param {string} orgId
 * @param {string} id
 * @param {{forUpdate?: boolean}} [opts] `forUpdate` locks the row for the
 *   rest of the transaction. Only PostgreSQL can honour it; elsewhere it is
 *   accepted and does nothing, which is why the operations that need it ask
 *   for a transaction with `required: true`.
 * @returns {Promise<StoredRecord|null>}
 */
async function get(collection, orgId, id, { forUpdate = false } = {}) {
  const a = current();
  return a ? a.get(collection, orgId, id, { forUpdate }) : null;
}

/* A ceiling for the stores that cannot page: past it a book needs PostgreSQL. */
const MAX_LIST_WITHOUT_QUERY = 5000;

/**
 * Every record in a collection, or the first `limit` of them when a cap is
 * given. On PostgreSQL "every" means every; on the other stores it means up
 * to MAX_LIST_WITHOUT_QUERY, which is the honest ceiling of a store with no
 * query. A default cap of 200 used to apply everywhere, and a book of 201
 * projects would have rolled up as 200 without a word.
 */
/**
 * @param {string} collection
 * @param {string} orgId
 * @param {{limit?: number|null}} [opts]
 * @returns {Promise<StoredRecord[]>}
 */
async function list(collection, orgId, { limit = null } = {}) {
  const a = current();
  return a ? a.list(collection, orgId, { limit }) : EMPTY.list;
}

/**
 * Merge `updates` into the record at `id`, or null where there is none.
 * It does not create: a patch to a record that does not exist is an answer,
 * not a write.
 *
 * @param {string} collection
 * @param {string} orgId
 * @param {string} id
 * @param {Partial<StoredRecord>} updates
 * @returns {Promise<StoredRecord|null>}
 */
async function patch(collection, orgId, id, updates) {
  assertWritable();
  return current().patch(collection, orgId, id, updates);
}

/**
 * Delete a record. On PostgreSQL a record something else references is
 * refused (`ON DELETE RESTRICT`) and the refusal names what is attached.
 *
 * @param {string} collection
 * @param {string} orgId
 * @param {string} id
 * @returns {Promise<void>}
 */
async function remove(collection, orgId, id) {
  assertWritable();
  await current().remove(collection, orgId, id);
}

/**
 * `fields` names the keys (or dotted paths) to return — a projection, so a
 * roll-up over thousands of records reads what it uses and nothing else.
 */
/**
 * @param {string} collection
 * @param {string} orgId
 * @param {QueryOptions} [opts]
 * @returns {Promise<StoredRecord[]>}
 */
async function query(collection, orgId, opts = {}) {
  const a = current();
  return a ? a.query(collection, orgId, opts) : EMPTY.query;
}

/** One page and the cursor for the next. The cursor is opaque and store-specific. */
/**
 * @param {string} collection
 * @param {string} orgId
 * @param {PageOptions} [opts]
 * @returns {Promise<Page>}
 */
async function page(collection, orgId, opts = {}) {
  const a = current();
  return a ? a.page(collection, orgId, opts) : { ...EMPTY.page };
}

/**
 * @param {string} collection
 * @param {string} orgId
 * @param {Record<string, WhereValue>} [where]
 * @returns {Promise<number>}
 */
async function count(collection, orgId, where = {}) {
  const a = current();
  return a ? a.count(collection, orgId, where) : EMPTY.count;
}

/** Operations that have already asked for atomicity and been told there is none. */
const _warnedTransactions = new Set();

/**
 * Run `fn` atomically.
 *
 * On PostgreSQL every store call made inside it — in any module — lands on one
 * connection and commits or rolls back together. No other store can do that,
 * and what used to happen is that `transaction()` quietly became a plain call:
 * the comment said a caller needing the guarantee could read
 * `capability().transactional`, and not one of the three call sites that exist
 * *because* they need it ever did.
 *
 * So the caller declares the need instead, and the seam answers honestly:
 *
 *   - PostgreSQL — a real transaction.
 *   - A durable store without one (Firebase, Blobs) — **refused**. A
 *     lock-and-supersede that applies half of itself on a real book is a
 *     position nobody can reconcile, and it is better not to start.
 *   - The in-process store — allowed, and logged once per operation, because
 *     development and the test suite are exactly where a non-atomic run is
 *     acceptable and silence is not.
 *
 * @param {Function} fn
 * @param {{name?: string, required?: boolean}} [opts]
 */
async function transaction(fn, { name = 'transaction', required = false } = {}) {
  const cap = capability();
  if (cap.transactional) return current().transaction(fn);

  if (required && cap.durable) {
    const err = /** @type {AppError} */ (new Error(
      `"${name}" has to apply as one unit, and the ${cap.mode} store cannot do that.`));
    err.statusCode = 503;
    err.code = 'NOT_TRANSACTIONAL';
    err.remedy = 'Set DATABASE_URL. PostgreSQL is the only store here that can commit or roll back a group of writes together.';
    throw err;
  }
  if (required && !_warnedTransactions.has(name)) {
    _warnedTransactions.add(name);
    log.warn({ operation: name, mode: cap.mode },
      `${name} needs to apply as one unit and the ${cap.mode} store cannot; running it unprotected`);
  }
  return fn();
}

/**
 * The async half of `capability()`: can the configured store actually be
 * reached, and is its schema current? Only meaningful for PostgreSQL; the
 * others answer from configuration alone.
 */
async function probe({ timeoutMs = 1500 } = {}) {
  const cap = capability();
  if (cap.mode !== 'postgres') return { ...cap, reachable: cap.mode !== 'none' };
  const ping = await db.client.ping({ timeoutMs });
  if (!ping.reachable) {
    return { ...cap, reachable: false, remedy: `PostgreSQL did not answer (${ping.error}). Check DATABASE_URL and network access from this runtime.` };
  }
  let schema = null;
  try {
    const s = await db.migrate.status();
    schema = { applied: s.applied.length, pending: s.pending.length, drifted: s.drifted.length };
  } catch (thrown) {
    const err = asError(thrown);
    schema = { applied: 0, pending: null, drifted: null, error: err.code || 'status_failed' };
  }
  const out = { ...cap, reachable: true, schema };
  if (schema.pending) out.remedy = `${schema.pending} migration(s) pending — run \`npm run db:migrate\` against this DATABASE_URL.`;
  if (schema.drifted) out.remedy = `${schema.drifted} applied migration(s) no longer match their files. Do not edit an applied migration; write a new one.`;
  return out;
}

/**
 * Test helper — drop the in-process fallback. On PostgreSQL under NODE_ENV=test
 * it also empties every table in this schema, and returns the promise so a
 * `beforeEach(() => store._resetMemory())` waits for it.
 */
function _resetMemory() {
  /* Every adapter can be emptied; only PostgreSQL's does real work, and only
     under NODE_ENV=test. Memory is always cleared as well, so a suite that
     switches backends mid-run does not read what an earlier mode wrote. */
  memoryAdapter.reset();
  const a = current();
  if (a && a.mode === 'postgres' && config.runtime.isTest) return a.reset();
  return undefined;
}

/* Every verb on the seam is timed into the in-process metrics, so store
   latency is a series beside request latency and a slow database shows as
   one rather than as slow routes. The raw functions call one another
   internally; only the seam's edge is observed. */
module.exports = {
  put: timed('put', put), insert: timed('insert', insert), get: timed('get', get), list: timed('list', list), patch: timed('patch', patch), remove: timed('remove', remove),
  query: timed('query', query), page: timed('page', page), transaction: timed('transaction', transaction), count: timed('count', count), probe,
  capability, isDurable, isPostgresConfigured, isEphemeralRuntime, assertWritable, requestedBackend, BACKENDS,
  _resetMemory, MAX_MEMORY_RECORDS: memoryAdapter.MAX_RECORDS, MAX_LIST_WITHOUT_QUERY, adapterFor, current
};
