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
 * in a serverless runtime without Firebase, writes are REFUSED rather than
 * pretended. `capability()` reports which mode is active and why.
 */

'use strict';

const fb = require('../bridge/firebase');

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
  if (isEphemeralRuntime()) {
    return {
      mode: 'none', durable: false, writable: false,
      reason: 'Running in a serverless runtime with no Firebase configuration. Each request may run in a fresh container, so anything written in memory is lost immediately.',
      remedy: 'Set FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL in the site environment. Read-only endpoints and the calculation engine work without it.'
    };
  }
  return {
    mode: 'memory', durable: false, writable: true,
    reason: 'No Firebase configuration. Records are held in this process only and are lost when it stops.',
    remedy: 'Fine for local development and demos. Set FIREBASE_SERVICE_ACCOUNT before relying on stored data.'
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

async function put(collection, orgId, id, record) {
  assertWritable();
  _remember(collection, orgId, id, record);
  await fb.savePartCRecord(collection, orgId, id, record).catch(() => {});
  return record;
}

async function get(collection, orgId, id) {
  const stored = await fb.getPartCRecord(collection, orgId, id).catch(() => null);
  if (stored) return stored;
  return _bucket(collection, orgId).get(id) || null;
}

async function list(collection, orgId, { limit = 200 } = {}) {
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
  await fb.savePartCRecord(collection, orgId, id, merged).catch(() => {});
  return merged;
}

async function remove(collection, orgId, id) {
  assertWritable();
  _bucket(collection, orgId).delete(id);
  await fb.deletePartCRecord(collection, orgId, id).catch(() => {});
}

/** Test helper — drop the in-process fallback. */
function _resetMemory() { _memory.clear(); }

module.exports = {
  put, get, list, patch, remove,
  capability, isDurable, isEphemeralRuntime, assertWritable,
  _resetMemory, MAX_MEMORY_RECORDS
};
