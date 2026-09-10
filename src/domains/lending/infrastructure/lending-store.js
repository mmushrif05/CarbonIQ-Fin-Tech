// @ts-check
/**
 * The lending domain's records, on the storage seam.
 *
 * Lending projects, their annual monitoring entries and the supervisor's
 * pipeline runs were written straight to Firebase through
 * `platform/bridge/firebase`, past the seam every other record in this
 * repository goes through. Each of those writers opened with
 * `const db = getDatabase(); if (!db) return;` — so a deployment without
 * Firebase, which is every deployment since the operator's PostgreSQL became
 * the store, answered `POST /v1/projects` with **201 Created** and kept
 * nothing. The caller was told a record existed that did not.
 *
 * On the seam the same call is refused with a 503 that names DATABASE_URL,
 * because "we cannot save this" is a true answer and 201 was not.
 *
 * Two things changed shape on the way, and both were defects:
 *
 * - A monitoring entry is now scoped by organisation. It used to live at
 *   `fintech/monitoring/<projectId>/<year>` with no organisation anywhere in
 *   the path, so two banks financing the same project wrote over each other.
 * - A project id is unique **within** an organisation rather than globally,
 *   which is what the primary key `(org_id, id)` says everywhere else here.
 */

'use strict';

const store = require('../../../platform/database/store');

const PROJECTS = 'fintech_projects';
const MONITORING = 'fintech_monitoring';
const PIPELINE_RUNS = 'pipeline_runs';

const newestFirst = rows => [...rows].sort((a, b) =>
  String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

/* ── Lending projects ───────────────────────────────────────────────────── */

async function saveProject(orgId, projectId, projectData) {
  const record = { ...projectData, projectId, orgId, updatedAt: new Date().toISOString() };
  await store.put(PROJECTS, orgId, String(projectId), record);
  return record;
}

async function getProject(orgId, projectId) {
  return store.get(PROJECTS, orgId, String(projectId));
}

async function listProjects(orgId) {
  return store.list(PROJECTS, orgId);
}

/* ── Annual monitoring ──────────────────────────────────────────────────── */

/* One row per project-year: the id says so, so a corrected entry for a year
   replaces that year rather than accumulating a second answer beside it. */
const monitoringId = (projectId, year) => `${projectId}:${year}`;

async function saveMonitoringEntry(orgId, projectId, year, entry) {
  const record = { ...entry, projectId: String(projectId), year: Number(year), savedAt: new Date().toISOString() };
  await store.put(MONITORING, orgId, monitoringId(projectId, year), record);
  return record;
}

async function listMonitoringEntries(orgId, projectId) {
  const rows = await store.query(MONITORING, orgId, { where: { projectId: String(projectId) } });
  return rows.sort((a, b) => Number(a.year) - Number(b.year));
}

/* ── Supervisor pipeline runs ───────────────────────────────────────────── */

async function savePipelineRun(orgId, pipeline) {
  return store.put(PIPELINE_RUNS, orgId, String(pipeline.pipelineId), pipeline);
}

async function updatePipelineRun(orgId, pipelineId, updates) {
  return store.patch(PIPELINE_RUNS, orgId, String(pipelineId), updates);
}

async function getPipelineRun(orgId, pipelineId) {
  return store.get(PIPELINE_RUNS, orgId, String(pipelineId));
}

async function listPipelineRuns(orgId, limit = 20) {
  return newestFirst(await store.list(PIPELINE_RUNS, orgId)).slice(0, limit);
}

module.exports = {
  PROJECTS, MONITORING, PIPELINE_RUNS,
  saveProject, getProject, listProjects,
  saveMonitoringEntry, listMonitoringEntries,
  savePipelineRun, updatePipelineRun, getPipelineRun, listPipelineRuns,
};
