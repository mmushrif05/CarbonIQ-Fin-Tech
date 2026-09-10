// @ts-check
/**
 * The in-process store: local development, and every test that does not name
 * a database.
 *
 * It used to be more than that. Every verb on the seam wrote here *and then*
 * asked whether Firebase was configured, so a deployment with Firebase set
 * and `STORAGE_BACKEND=memory` wrote to both — which the seam's own header
 * forbids in terms, for Blobs. One adapter, chosen once, is what stops that
 * being possible rather than merely discouraged.
 *
 * **It refuses rather than forgets.** The bucket used to evict its oldest
 * record past 500: write 600 and read back 500, with the first one gone,
 * `count()` reporting 500 and nothing anywhere saying so. That is the defect
 * this codebase already shipped once as "a book of 201 projects rolled up as
 * 200 without a word". The ceiling is now the same one every store without a
 * query engine has, and crossing it is an error naming the database.
 */

'use strict';

const { queryOver, pageOver } = require('./emulated');

/** @typedef {import('../../../shared/types').AppError} AppError */

/**
 * The honest ceiling of a store that holds everything in one process. It is
 * the same figure the seam uses for any store it cannot page, so the two
 * cannot drift.
 */
const MAX_RECORDS = 5000;

/** collection -> orgId -> Map(id -> record). Insertion-ordered. */
const buckets = new Map();

function bucketFor(collection, orgId) {
  const key = `${collection}::${orgId}`;
  if (!buckets.has(key)) buckets.set(key, new Map());
  return buckets.get(key);
}

function refuse(collection, orgId) {
  const err = /** @type {AppError} */ (new Error(
    `The in-process store holds at most ${MAX_RECORDS} records per collection, `
    + `and "${collection}" for ${orgId} is full.`));
  err.statusCode = 507;
  err.code = 'STORE_FULL';
  err.remedy = 'Set DATABASE_URL. This store exists for local development and tests, and it refuses a write rather than discarding an older record.';
  return err;
}

const adapter = {
  mode: 'memory',

  async put(collection, orgId, id, record) {
    const bucket = bucketFor(collection, orgId);
    if (!bucket.has(id) && bucket.size >= MAX_RECORDS) throw refuse(collection, orgId);
    bucket.delete(id);
    bucket.set(id, record);
    return record;
  },

  async get(collection, orgId, id) {
    return bucketFor(collection, orgId).get(id) || null;
  },

  async list(collection, orgId, { limit = null } = {}) {
    const rows = [...bucketFor(collection, orgId).values()];
    return limit ? rows.slice(0, limit) : rows;
  },

  async patch(collection, orgId, id, updates) {
    const current = await adapter.get(collection, orgId, id);
    if (!current) return null;
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    await adapter.put(collection, orgId, id, merged);
    return merged;
  },

  async remove(collection, orgId, id) {
    bucketFor(collection, orgId).delete(id);
  },

  async query(collection, orgId, opts = {}) {
    return queryOver(await adapter.list(collection, orgId), opts);
  },

  async page(collection, orgId, opts = {}) {
    return pageOver(await adapter.list(collection, orgId), opts);
  },

  async count(collection, orgId, where = {}) {
    return (await adapter.query(collection, orgId, { where })).length;
  },

  /* No transaction. The seam decides what to do about that; see store.js. */
  async transaction(fn) { return fn(); },

  reset() { buckets.clear(); },
};

module.exports = adapter;
module.exports.MAX_RECORDS = MAX_RECORDS;
