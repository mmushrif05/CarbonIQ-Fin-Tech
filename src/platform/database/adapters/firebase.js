// @ts-check
/**
 * Firebase — the store a deployment keeps when it has no PostgreSQL.
 *
 * It reads and writes Firebase and nothing else. It used to be entangled with
 * the in-process Map: every write went to both, and every read tried Firebase
 * and fell back to memory. That fallback is what made a Firebase failure look
 * like an empty collection instead of an error, so it is gone — a store that
 * cannot answer says so, and the seam's fallback register counts it.
 */

'use strict';

const fb = require('../../bridge/firebase');
const { queryOver, pageOver } = require('./emulated');

/** The ceiling of a store the seam cannot ask to page. */
const MAX_RECORDS = 5000;

const adapter = {
  mode: 'firebase',

  async put(collection, orgId, id, record) {
    await fb.savePartCRecord(collection, orgId, id, record);
    return record;
  },

  async get(collection, orgId, id) {
    return (await fb.getPartCRecord(collection, orgId, id)) || null;
  },

  async list(collection, orgId, { limit = null } = {}) {
    const cap = limit === null || limit === undefined ? MAX_RECORDS : limit;
    return (await fb.listPartCRecords(collection, orgId, cap)) || [];
  },

  async patch(collection, orgId, id, updates) {
    const current = await adapter.get(collection, orgId, id);
    if (!current) return null;
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    await fb.savePartCRecord(collection, orgId, id, merged);
    return merged;
  },

  async remove(collection, orgId, id) {
    await fb.deletePartCRecord(collection, orgId, id);
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

  async transaction(fn) { return fn(); },

  reset() { /* Firebase is somebody's real database; the seam never empties it. */ },
};

module.exports = adapter;
module.exports.MAX_RECORDS = MAX_RECORDS;
