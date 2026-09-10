// @ts-check
/**
 * Where baselines live: the one storage seam, like every other record.
 *
 * Two partitions, and the difference matters. A **global or country** baseline
 * is the market's, not one bank's — it is released once and every organisation
 * on the deployment resolves against it, so it lives in the shared partition
 * `'_'`, the same place accounts and API keys do. An **organisation** baseline
 * and its pledge belong to that organisation and live under its own id.
 *
 * That is what lets one deployment serve a country-wide figure and a
 * bank-specific one without either being able to overwrite the other.
 */

'use strict';

const store = require('../../../platform/database/store');
const { STATUS } = require('../domain/baseline');

const COLLECTION = 'baselines';
const SHARED = '_';

/** Which partition a record of this scope belongs in. */
const partitionFor = record => (record.scope === 'organisation' ? String(record.orgId) : SHARED);

async function save(record) {
  return store.put(COLLECTION, partitionFor(record), record.baselineId, record);
}

async function get(baselineId, orgId) {
  return (await store.get(COLLECTION, SHARED, String(baselineId)))
    || (orgId ? store.get(COLLECTION, String(orgId), String(baselineId)) : null);
}

/**
 * Every baseline this caller can see: the market's, plus its own.
 * @param {string|null} orgId
 */
async function visible(orgId) {
  const shared = await store.list(COLLECTION, SHARED);
  const mine = orgId ? await store.list(COLLECTION, String(orgId)) : [];
  return [...shared, ...mine];
}

/** The released ones only — what a resolution is allowed to consider. */
async function released(orgId) {
  return (await visible(orgId)).filter(b => b.status === STATUS.RELEASED);
}

/** The released record for a key, if there is one. */
async function releasedFor(key, orgId) {
  return (await released(orgId)).find(b => b.key === key) || null;
}

module.exports = { COLLECTION, SHARED, partitionFor, save, get, visible, released, releasedFor };
