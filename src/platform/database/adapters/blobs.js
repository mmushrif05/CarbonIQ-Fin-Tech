// @ts-check
/**
 * Netlify Blobs — never chosen automatically, selected only by
 * STORAGE_BACKEND=blobs for a trial, because the database belongs to the
 * operator and a site quietly keeping records inside its own host would be
 * holding a book nobody provisioned.
 *
 * A failure here is not softened. Firebase once had a memory fallback behind
 * it; Blobs never did, on the grounds that a deployment whose capability()
 * has just promised durability must hear about a failed write rather than be
 * told it succeeded. That rule now applies to every adapter.
 */

'use strict';

const blobs = require('../blob-store');
const { queryOver, pageOver } = require('./emulated');

const MAX_RECORDS = 5000;

const adapter = {
  mode: 'blobs',

  async put(collection, orgId, id, record) {
    await blobs.put(collection, orgId, id, record);
    return record;
  },

  async get(collection, orgId, id) {
    return (await blobs.get(collection, orgId, id)) || null;
  },

  async list(collection, orgId, { limit = null } = {}) {
    const cap = limit === null || limit === undefined ? MAX_RECORDS : limit;
    return (await blobs.list(collection, orgId, { limit: cap })) || [];
  },

  async patch(collection, orgId, id, updates) {
    const current = await adapter.get(collection, orgId, id);
    if (!current) return null;
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    await blobs.put(collection, orgId, id, merged);
    return merged;
  },

  async remove(collection, orgId, id) {
    await blobs.remove(collection, orgId, id);
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

  reset() { if (typeof blobs._reset === 'function') blobs._reset(); },
};

module.exports = adapter;
module.exports.MAX_RECORDS = MAX_RECORDS;
