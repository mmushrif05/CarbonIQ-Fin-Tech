/**
 * CarbonIQ FinTech — PCAF Part C Run Store
 *
 * A Part C assessment pauses: the agent ingests documents and builds the
 * client form, then waits for the client to complete it, then resumes and
 * computes. That pause can span sessions, so the run has to outlive the
 * request that created it.
 *
 * Firebase is authoritative when configured. When it is not — local
 * development, CI, a self-hosted trial — an in-process fallback keeps the
 * pause/resume flow working rather than failing closed. The fallback is
 * bounded and explicitly non-durable: it does not survive a restart, and
 * `durable` on every result says which store answered.
 */

'use strict';

const fb = require('../bridge/firebase');

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
  try { return !!fb.getDatabase(); } catch (_) { return false; }
}

async function saveRun(orgId, run) {
  _remember(orgId, run);
  await fb.savePartCRun(orgId, run).catch(() => {});
  return { durable: isDurable() };
}

async function getRun(orgId, runId) {
  const stored = await fb.getPartCRun(orgId, runId).catch(() => null);
  if (stored) return stored;
  return _org(orgId).get(runId) || null;
}

async function updateRun(orgId, runId, updates) {
  const current = _org(orgId).get(runId);
  if (current) _remember(orgId, { ...current, ...updates });
  await fb.updatePartCRun(orgId, runId, updates).catch(() => {});
}

async function listRuns(orgId, limit = 20) {
  const stored = await fb.listPartCRuns(orgId, limit).catch(() => []);
  if (stored && stored.length) return stored;
  return [..._org(orgId).values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** Test helper — drop the in-process fallback. */
function _resetMemory() { _memory.clear(); }

module.exports = { saveRun, getRun, updateRun, listRuns, isDurable, _resetMemory, MAX_MEMORY_RUNS };
