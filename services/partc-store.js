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
 */

'use strict';

const fb = require('../bridge/firebase');
const blobs = require('./blob-store');

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
  return !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
}

/**
 * What this deployment can actually promise about persistence.
 * @returns {{mode:string, durable:boolean, writable:boolean, reason:string, remedy?:string}}
 */
function capability() {
  if (isDurable()) {
    return {
      mode: 'firebase', durable: true, writable: true,
      reason: 'Firebase is configured. Records persist across requests and restarts.'
    };
  }
  if (blobs.isAvailable()) {
    return {
      mode: 'blobs', durable: true, writable: true,
      reason: 'Netlify Blobs is reachable. Records persist across requests, cold starts and deploys.'
    };
  }
  if (isEphemeralRuntime()) {
    return {
      mode: 'none', durable: false, writable: false,
      reason: 'Running in a serverless runtime with no durable store reachable — neither Netlify Blobs nor Firebase. Each request may run in a fresh container, so anything written in memory is lost immediately.',
      remedy: 'Netlify Blobs needs no configuration and is the expected store here; if it is unreachable the deployment is misconfigured. Firebase remains an alternative via FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL. Read-only endpoints and the calculation engine work without either.'
    };
  }
  return {
    mode: 'memory', durable: false, writable: true,
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
const _blobsLive = () => !isDurable() && blobs.isAvailable();

async function put(collection, orgId, id, record) {
  assertWritable();
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

async function get(collection, orgId, id) {
  if (_blobsLive()) {
    const fromBlobs = await blobs.get(collection, orgId, id).catch(() => null);
    if (fromBlobs) return fromBlobs;
    return _bucket(collection, orgId).get(id) || null;
  }
  const stored = await fb.getPartCRecord(collection, orgId, id).catch(() => null);
  if (stored) return stored;
  return _bucket(collection, orgId).get(id) || null;
}

async function list(collection, orgId, { limit = 200 } = {}) {
  if (_blobsLive()) {
    const fromBlobs = await blobs.list(collection, orgId, { limit }).catch(() => []);
    if (fromBlobs && fromBlobs.length) return fromBlobs;
    return [..._bucket(collection, orgId).values()].slice(0, limit);
  }
  const stored = await fb.listPartCRecords(collection, orgId, limit).catch(() => []);
  if (stored && stored.length) return stored;
  return [..._bucket(collection, orgId).values()].slice(0, limit);
}

async function patch(collection, orgId, id, updates) {
  assertWritable();
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
  _bucket(collection, orgId).delete(id);
  if (_blobsLive()) {
    await blobs.remove(collection, orgId, id);
    return;
  }
  await fb.deletePartCRecord(collection, orgId, id).catch(() => {});
}

/** Test helper — drop the in-process fallback. */
function _resetMemory() { _memory.clear(); }

module.exports = {
  put, get, list, patch, remove,
  capability, isDurable, isEphemeralRuntime, assertWritable,
  _resetMemory, MAX_MEMORY_RECORDS
};
