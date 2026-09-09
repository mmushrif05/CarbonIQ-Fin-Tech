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
 * vendor, no credential and no connection handshake. It is now the durable
 * store wherever it is reachable, which is what makes this deployment able to
 * hold data at all.
 *
 * Firebase still wins where it is configured. That is deliberate: an existing
 * deployment's records must not move because a new option appeared. Precedence
 * is firebase, then blobs, then memory, then refusal — and `capability().mode`
 * says which of the four is live rather than leaving a caller to guess.
 *
 * ── Choosing, rather than inheriting ───────────────────────────────────────
 *
 * That default has a sharp edge: a site with Firebase variables still set gets
 * Firebase even when the operator has decided on Blobs, and nothing about the
 * screen says why. `STORAGE_BACKEND` makes the choice explicit —
 *
 *   auto      (default) firebase, then blobs, then memory
 *   blobs     Blobs, and refuse rather than fall back to Firebase
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
 *   auto      postgres when DATABASE_URL is set, then firebase, then blobs, then memory
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

const fb = require('../bridge/firebase');
const blobs = require('./blob-store');
const db = require('.');
const config = require('../config');

const MAX_MEMORY_RECORDS = 500;

/** collection -> orgId -> Map(id -> record). Insertion-ordered. */
const _memory = new Map();

function _bucket(collection, orgId) {
  const key = `${collection}::${orgId}`;
  if (!_memory.has(key)) _memory.set(key, new Map());
  return _memory.get(key);
}

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
      reason: 'Firebase is configured, and STORAGE_BACKEND is unset, so it takes precedence. Set STORAGE_BACKEND=blobs to use Netlify Blobs instead.'
    };
  }
  if (blobs.isAvailable()) {
    return {
      mode: 'blobs', durable: true, writable: true, transactional: false, chosen: false,
      reason: 'Netlify Blobs is reachable and no Firebase configuration was found. Records persist across requests, cold starts and deploys.'
    };
  }
  if (isEphemeralRuntime()) {
    return {
      mode: 'none', durable: false, writable: false, transactional: false, chosen: false,
      reason: 'Running in a serverless runtime with no durable store reachable — neither Netlify Blobs nor Firebase. Each request may run in a fresh container, so anything written in memory is lost immediately.',
      remedy: 'Netlify Blobs needs no configuration and is the expected store here; if it is unreachable the deployment is misconfigured. Firebase remains an alternative via FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL. Read-only endpoints and the calculation engine work without either.'
    };
  }
  return {
    mode: 'memory', durable: false, writable: true, transactional: false, chosen: false,
    reason: 'No durable store reachable. Records are held in this process only and are lost when it stops.',
    remedy: 'Fine for local development. Netlify Blobs is used automatically on a deployed site; set FIREBASE_SERVICE_ACCOUNT if you would rather use Firebase.'
  };
}

/** Throws when a write cannot be honoured. Routes turn this into a 503. */
function assertWritable() {
  const cap = capability();
  if (cap.writable) return cap;
  const err = new Error(cap.reason);
  err.statusCode = 503;
  err.code = 'STORAGE_UNAVAILABLE';
  err.remedy = cap.remedy;
  throw err;
}

function _remember(collection, orgId, id, record) {
  const bucket = _bucket(collection, orgId);
  bucket.delete(id);
  bucket.set(id, record);
  while (bucket.size > MAX_MEMORY_RECORDS) bucket.delete(bucket.keys().next().value);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/* Blobs is the live store only when Firebase is not — never both. Writing to
   two durable stores would leave them to diverge, and nothing here would say
   which one a figure came from. */
const _blobsLive = () => capability().mode === 'blobs';
const _pgLive = () => capability().mode === 'postgres';

async function put(collection, orgId, id, record) {
  assertWritable();
  if (_pgLive()) return db.documents.put(collection, orgId, id, record);
  _remember(collection, orgId, id, record);
  if (_blobsLive()) {
    /* Not swallowed. A Firebase failure can fall back to memory because
       Firebase is the optional path here; a Blobs failure on a deployment
       whose capability() just promised durability is a broken promise, and
       the caller must hear about it rather than be told the write succeeded. */
    await blobs.put(collection, orgId, id, record);
    return record;
  }
  await fb.savePartCRecord(collection, orgId, id, record).catch(() => {});
  return record;
}

async function get(collection, orgId, id, { forUpdate = false } = {}) {
  if (_pgLive()) return db.documents.get(collection, orgId, id, { forUpdate });
  if (_blobsLive()) {
    const fromBlobs = await blobs.get(collection, orgId, id).catch(() => null);
    if (fromBlobs) return fromBlobs;
    return _bucket(collection, orgId).get(id) || null;
  }
  const stored = await fb.getPartCRecord(collection, orgId, id).catch(() => null);
  if (stored) return stored;
  return _bucket(collection, orgId).get(id) || null;
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
async function list(collection, orgId, { limit = null } = {}) {
  if (_pgLive()) return db.documents.list(collection, orgId, { limit });
  const cap = limit === null || limit === undefined ? MAX_LIST_WITHOUT_QUERY : limit;
  if (_blobsLive()) {
    const fromBlobs = await blobs.list(collection, orgId, { limit: cap }).catch(() => []);
    if (fromBlobs && fromBlobs.length) return fromBlobs;
    return [..._bucket(collection, orgId).values()].slice(0, cap);
  }
  const stored = await fb.listPartCRecords(collection, orgId, cap).catch(() => []);
  if (stored && stored.length) return stored;
  return [..._bucket(collection, orgId).values()].slice(0, cap);
}

async function patch(collection, orgId, id, updates) {
  assertWritable();
  if (_pgLive()) return db.documents.patch(collection, orgId, id, updates);
  const current = await get(collection, orgId, id);
  if (!current) return null;
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  _remember(collection, orgId, id, merged);
  if (_blobsLive()) {
    await blobs.put(collection, orgId, id, merged);
    return merged;
  }
  await fb.savePartCRecord(collection, orgId, id, merged).catch(() => {});
  return merged;
}

async function remove(collection, orgId, id) {
  assertWritable();
  if (_pgLive()) { await db.documents.remove(collection, orgId, id); return; }
  _bucket(collection, orgId).delete(id);
  if (_blobsLive()) {
    await blobs.remove(collection, orgId, id);
    return;
  }
  await fb.deletePartCRecord(collection, orgId, id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Query, pagination, transactions — native on PostgreSQL, emulated elsewhere
// ---------------------------------------------------------------------------

const _matches = (rec, where) => Object.entries(where).every(([k, v]) => {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(x => String(rec[k]) === String(x));
  if (v === null) return rec[k] === null || rec[k] === undefined;
  return String(rec[k]) === String(v);
});

const _sortBy = (rows, orderBy = 'created_at') => {
  if (orderBy === null) return [...rows];
  const desc = orderBy.startsWith('-');
  const f = orderBy.replace(/^-/, '');
  const key = f === 'created_at' ? 'createdAt' : f === 'updated_at' ? 'updatedAt' : f;
  const out = [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
  return desc ? out.reverse() : out;
};

/**
 * Records matching `where` (equality on top-level fields; an array means any
 * of). On PostgreSQL a registered key uses its index; everywhere else this is
 * a list followed by a filter, which is what every caller did by hand before.
 */
/** The same subset a PostgreSQL projection returns, taken from a whole record. */
function _pick(record, fields) {
  const out = {};
  for (const f of fields) _assign(out, record, f.split('.'));
  return out;
}

/* Copies the value at `parts` from src into dst, creating parents as needed.
   A segment ending in `[]` maps over an array. Returns whether anything was
   found, so an empty parent is not left behind for an absent child. */
function _assign(dst, src, parts) {
  const [head, ...rest] = parts;
  const isArray = head.endsWith('[]');
  const key = isArray ? head.slice(0, -2) : head;
  if (src === null || typeof src !== 'object' || !(key in src)) return false;
  const val = src[key];
  if (!rest.length) { dst[key] = val; return true; }
  if (isArray) {
    if (!Array.isArray(val)) return false;
    const target = Array.isArray(dst[key]) ? dst[key] : val.map(() => ({}));
    val.forEach((item, i) => { if (item && typeof item === 'object') _assign(target[i], item, rest); });
    dst[key] = target;
    return true;
  }
  const child = (dst[key] && typeof dst[key] === 'object' && !Array.isArray(dst[key])) ? dst[key] : {};
  const found = _assign(child, val, rest);
  if (found || key in dst) dst[key] = child;
  return found;
}

/**
 * `fields` names the keys (or dotted paths) to return — a projection, so a
 * roll-up over thousands of records reads what it uses and nothing else.
 */
async function query(collection, orgId, { where = {}, limit = null, orderBy = 'created_at', forUpdate = false, fields = null } = {}) {
  if (_pgLive()) return db.documents.query(collection, orgId, { where, limit, orderBy, forUpdate, fields });
  const all = await list(collection, orgId);
  let rows = _sortBy(all.filter(r => _matches(r, where)), orderBy);
  if (limit) rows = rows.slice(0, limit);
  return fields ? rows.map(r => _pick(r, fields)) : rows;
}

/** One page and the cursor for the next. The cursor is opaque and store-specific. */
async function page(collection, orgId, { limit = 50, cursor, where = {} } = {}) {
  if (_pgLive()) return db.documents.page(collection, orgId, { limit, cursor, where });
  const size = Math.min(500, Math.max(1, Number(limit) || 50));
  let offset = 0;
  if (cursor) {
    offset = Number(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Number.isInteger(offset) || offset < 0) {
      const err = new Error('The cursor is not one this store issued.');
      err.statusCode = 400; err.code = 'BAD_CURSOR';
      throw err;
    }
  }
  const all = _sortBy((await list(collection, orgId)).filter(r => _matches(r, where)));
  const items = all.slice(offset, offset + size);
  const more = all.length > offset + size;
  return { items, nextCursor: more ? Buffer.from(String(offset + size)).toString('base64url') : null, limit: size };
}

/**
 * Run `fn` atomically. On PostgreSQL every store call made inside it — in any
 * module — lands on one connection and commits or rolls back together. On the
 * other stores it is a plain call, and `capability().transactional` is false
 * so a caller that needs the guarantee can say so.
 */
async function transaction(fn) {
  if (_pgLive()) return db.documents.transaction(fn);
  return fn();
}

async function count(collection, orgId, where = {}) {
  if (_pgLive()) return db.documents.count(collection, orgId, where);
  return (await query(collection, orgId, { where })).length;
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
  } catch (err) {
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
  _memory.clear();
  if (_pgLive() && config.runtime.isTest) return db.documents.truncateAll();
  return undefined;
}

module.exports = {
  put, get, list, patch, remove,
  query, page, transaction, count, probe,
  capability, isDurable, isPostgresConfigured, isEphemeralRuntime, assertWritable, requestedBackend, BACKENDS,
  _resetMemory, MAX_MEMORY_RECORDS, MAX_LIST_WITHOUT_QUERY
};
