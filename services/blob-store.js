/**
 * CarbonIQ FinTech — durable storage on Netlify Blobs
 *
 * The application already had one honest answer about persistence and one
 * unusable one. Firebase was the real store; without it, a serverless runtime
 * refused every write with a 503 rather than accepting something it would lose.
 * That refusal is correct and it stays — but it left the deployment this
 * product is actually demonstrated on unable to store anything at all.
 *
 * Netlify Blobs closes that hole without adding a vendor, a credential to
 * paste, or a connection handshake to wait on: it is part of the platform the
 * function already runs in, and it works locally with no configuration.
 *
 * ── What this module is not ────────────────────────────────────────────────
 *
 * It is not a database. There is no query, no index, no transaction. Listing a
 * collection reads its keys and then each record, which is fine for the tens
 * to low hundreds of records a bank's climate pipeline holds and would be
 * wrong for a general ledger. When the model needs real queries across
 * thousands of loans, that is a Postgres conversation, not a bigger version of
 * this file.
 *
 * ── Key shape ──────────────────────────────────────────────────────────────
 *
 * `collection/orgId/id`, so one store holds every collection and a listing is
 * a prefix scan. Segments are encoded, because an organisation id containing a
 * slash would otherwise silently write into a different collection's namespace
 * — the kind of fault that looks like data loss and is actually a key
 * collision.
 *
 * ── Consistency ────────────────────────────────────────────────────────────
 *
 * Reads are strongly consistent. The default is eventual, which is cheaper and
 * wrong here: a user who records a project and is immediately shown a list
 * without it will record it again. Paying the latency once beats a duplicate
 * that has to be found and removed later.
 */

'use strict';

let _blobs = null;
try { _blobs = require('@netlify/blobs'); } catch (_) { _blobs = null; }

const STORE_NAME = 'carboniq';

/* Cached because getStore does credential resolution, and this is called on
   every request. Cleared by _reset() so tests can change the environment. */
let _store;
let _probed = false;
let _available = false;

/**
 * True when Blobs can actually be reached.
 *
 * Netlify injects the site and token into the function environment; locally
 * the SDK falls back to a filesystem-backed store. Either is fine. What is not
 * fine is assuming availability and discovering otherwise on the first write,
 * so this resolves a store once and remembers the answer.
 */
function isAvailable() {
  if (_probed) return _available;
  _probed = true;
  _available = false;
  if (!_blobs || typeof _blobs.getStore !== 'function') return false;
  try {
    _store = _blobs.getStore({ name: STORE_NAME, consistency: 'strong' });
    _available = !!_store && typeof _store.get === 'function';
  } catch (_) {
    _store = null;
    _available = false;
  }
  return _available;
}

function _requireStore() {
  if (!isAvailable()) {
    const err = new Error('Netlify Blobs is not available in this runtime.');
    err.statusCode = 503;
    err.code = 'BLOB_STORE_UNAVAILABLE';
    throw err;
  }
  return _store;
}

/* A key segment may not introduce a separator. Encoding rather than rejecting,
   because an organisation id is not ours to constrain. */
const _seg = (v) => encodeURIComponent(String(v ?? ''));
const _key = (collection, orgId, id) => `${_seg(collection)}/${_seg(orgId)}/${_seg(id)}`;
const _prefix = (collection, orgId) => `${_seg(collection)}/${_seg(orgId)}/`;

async function put(collection, orgId, id, record) {
  const store = _requireStore();
  await store.setJSON(_key(collection, orgId, id), record);
  return record;
}

async function get(collection, orgId, id) {
  const store = _requireStore();
  try {
    return await store.get(_key(collection, orgId, id), { type: 'json' });
  } catch (_) {
    /* A missing key resolves null; a malformed body throws. Either way the
       caller gets "not here" rather than an exception — a corrupt record
       should not take down a listing that has nine good ones. */
    return null;
  }
}

/**
 * Every record under one collection and organisation.
 *
 * Two round trips per page: the key listing, then each record. Netlify's list
 * paginates, so this walks pages until it has `limit` or runs out — a caller
 * asking for 200 must not silently receive the first 100 because that is what
 * one page happened to hold.
 */
async function list(collection, orgId, { limit = 200 } = {}) {
  const store = _requireStore();
  const prefix = _prefix(collection, orgId);
  const keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix, cursor });
    for (const blob of (page.blobs || [])) {
      keys.push(blob.key);
      if (keys.length >= limit) break;
    }
    cursor = keys.length >= limit ? undefined : page.cursor;
  } while (cursor);

  const records = await Promise.all(keys.map(async (key) => {
    try { return await store.get(key, { type: 'json' }); } catch (_) { return null; }
  }));
  return records.filter(Boolean);
}

async function patch(collection, orgId, id, updates) {
  const current = await get(collection, orgId, id);
  if (!current) return null;
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  await put(collection, orgId, id, merged);
  return merged;
}

async function remove(collection, orgId, id) {
  const store = _requireStore();
  await store.delete(_key(collection, orgId, id));
}

/** Test helper — forget the probe so the environment can change. */
function _reset() { _store = null; _probed = false; _available = false; }

module.exports = {
  isAvailable, put, get, list, patch, remove,
  STORE_NAME, _key, _prefix, _reset,
};
