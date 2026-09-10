// @ts-check
/**
 * PostgreSQL — the only store that answers a query, pages by key and holds a
 * transaction. Everything here is a delegation to `document-store.js`, which
 * is where the SQL lives; the adapter exists so the seam has one shape to
 * talk to rather than a branch per verb.
 */

'use strict';

const db = require('..');

module.exports = {
  mode: 'postgres',

  put: (collection, orgId, id, record) => db.documents.put(collection, orgId, id, record),
  /* A plain INSERT, so the primary key raises 23505 rather than the row being
     updated. This is the only store where the refusal is the database's; the
     other three read and then write. */
  insert: (collection, orgId, id, record) => db.documents.insert(collection, orgId, id, record),
  get: (collection, orgId, id, opts = {}) => db.documents.get(collection, orgId, id, opts),
  list: (collection, orgId, opts = {}) => db.documents.list(collection, orgId, opts),
  patch: (collection, orgId, id, updates) => db.documents.patch(collection, orgId, id, updates),
  remove: async (collection, orgId, id) => { await db.documents.remove(collection, orgId, id); },
  query: (collection, orgId, opts = {}) => db.documents.query(collection, orgId, opts),
  page: (collection, orgId, opts = {}) => db.documents.page(collection, orgId, opts),
  count: (collection, orgId, where = {}) => db.documents.count(collection, orgId, where),
  transaction: fn => db.documents.transaction(fn),
  reset: () => db.documents.truncateAll(),
};
