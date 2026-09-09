/**
 * CarbonIQ FinTech — PCAF Part C Run Store
 *
 * A Part C assessment pauses: the agent ingests documents and builds the
 * client form, then waits for the client to complete it, then resumes and
 * computes. That pause can span sessions, so the run has to outlive the
 * request that created it.
 *
 * PostgreSQL holds runs where it is the store (collection `partc_runs`,
 * through the seam); Firebase where it is not. When neither is — local
 * development, CI — an in-process fallback keeps the pause/resume flow
 * working rather than failing closed. The fallback is bounded and
 * explicitly non-durable: it does not survive a restart, and `durable` on
 * every result says which store answered.
 */

'use strict';

const fb = require('../../../platform/bridge/firebase');
const store = require('../../../platform/database/store');

const COLLECTION = 'partc_runs';
const _pg = () => store.capability().mode === 'postgres';

const MAX_MEMORY_RUNS = 200;

/** orgId -> Map(runId -> run). Insertion-ordered, oldest evicted first. */
const _memory = new Map();

function _org(orgId) {
  if (!_memory.has(orgId)) _memory.set(orgId, new Map());
  return _memory.get(orgId);
}

function _remember(orgId, run) {
  const runs = _org(orgId);
  runs.delete(run.runId);
  runs.set(run.runId, run);
  while (runs.size > MAX_MEMORY_RUNS) runs.delete(runs.keys().next().value);
}

/** True when Firebase is actually available to persist to. */
function isDurable() {
  if (_pg()) return true;
  try { return !!fb.getDatabase(); } catch (_) { return false; }
}

async function saveRun(orgId, run) {
  if (_pg()) { await store.put(COLLECTION, orgId, run.runId, run); return { durable: true }; }
  _remember(orgId, run);
  await fb.savePartCRun(orgId, run).catch(() => {});
  return { durable: isDurable() };
}

async function getRun(orgId, runId) {
  if (_pg()) return store.get(COLLECTION, orgId, runId);
  const stored = await fb.getPartCRun(orgId, runId).catch(() => null);
  if (stored) return stored;
  return _org(orgId).get(runId) || null;
}

async function updateRun(orgId, runId, updates) {
  if (_pg()) { await store.patch(COLLECTION, orgId, runId, updates); return; }
  const current = _org(orgId).get(runId);
  if (current) _remember(orgId, { ...current, ...updates });
  await fb.updatePartCRun(orgId, runId, updates).catch(() => {});
}

async function listRuns(orgId, limit = 20) {
  if (_pg()) return store.query(COLLECTION, orgId, { orderBy: '-created_at', limit });
  const stored = await fb.listPartCRuns(orgId, limit).catch(() => []);
  if (stored && stored.length) return stored;
  return [..._org(orgId).values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** Test helper — drop the in-process fallback. */
function _resetMemory() { _memory.clear(); }

module.exports = { saveRun, getRun, updateRun, listRuns, isDurable, _resetMemory, MAX_MEMORY_RUNS };
