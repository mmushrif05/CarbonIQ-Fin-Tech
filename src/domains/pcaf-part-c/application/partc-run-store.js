// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part C Run Store
 *
 * A Part C assessment pauses: the agent ingests documents and builds the
 * client form, then waits for the client to complete it, then resumes and
 * computes. That pause can span sessions, so the run has to outlive the
 * request that created it.
 *
 * This file used to be a second storage seam. It asked whether PostgreSQL was
 * the store; if not it wrote to Firebase directly through the bridge; if not
 * that, to a private `Map` of its own that evicted its oldest run past 200
 * without a word. So a run could vanish mid-pause and the resume would say the
 * run did not exist. Three stores, three code paths, and one of them silently
 * lossy — inside a module whose whole job is to make a pause survivable.
 *
 * It is now one line per verb against `src/platform/database/store.js`, which
 * makes the same choice once for the whole application. `durable` on a save
 * comes from `capability()` rather than from this module's own opinion.
 */

'use strict';

const store = require('../../../platform/database/store');

const COLLECTION = 'partc_runs';

/** Whether the store holding these runs survives the process. */
function isDurable() {
  return store.capability().durable;
}

async function saveRun(orgId, run) {
  await store.put(COLLECTION, orgId, String(run.runId), run);
  return { durable: isDurable() };
}

async function getRun(orgId, runId) {
  return store.get(COLLECTION, orgId, String(runId));
}

async function updateRun(orgId, runId, updates) {
  await store.patch(COLLECTION, orgId, String(runId), updates);
}

async function listRuns(orgId, limit = 20) {
  const rows = await store.list(COLLECTION, orgId);
  return [...rows]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}

module.exports = { COLLECTION, saveRun, getRun, updateRun, listRuns, isDurable };
