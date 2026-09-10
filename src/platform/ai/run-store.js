// @ts-check
/**
 * Agent runs, on the storage seam.
 *
 * They used to be written straight to Firebase by `platform/bridge/firebase`,
 * past the seam, behind `const db = getDatabase(); if (!db) return;`. On a
 * deployment with no Firebase — which is every deployment since the operator's
 * PostgreSQL became the store — that returned without writing and without
 * saying so, so `GET /v1/agent/runs` answered an empty list for work that had
 * actually run and been paid for.
 *
 * It matters more than a log line would: an agent run carries the EU AI Act
 * Article 22 human review decision for covenant design, which is a compliance
 * record. A record that can be dropped in silence is not one.
 *
 * This lives in `platform/ai` rather than in the lending domain because the
 * agent loop itself writes it, and the platform never imports a domain.
 */

'use strict';

const store = require('../database/store');

const COLLECTION = 'agent_runs';

/** Newest first, which is the order every caller reads them in. */
const newestFirst = rows => [...rows].sort((a, b) =>
  String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

async function saveRun(orgId, run) {
  return store.put(COLLECTION, orgId, String(run.runId), run);
}

async function updateRun(orgId, runId, updates) {
  return store.patch(COLLECTION, orgId, String(runId), updates);
}

async function getRun(orgId, runId) {
  return store.get(COLLECTION, orgId, String(runId));
}

async function listRuns(orgId, limit = 20) {
  return newestFirst(await store.list(COLLECTION, orgId)).slice(0, limit);
}

/**
 * EU AI Act Article 22 — the human decision on an AI-recommended covenant set,
 * recorded before those terms can take effect in a facility agreement.
 *
 * The status map is the whole point of the function: a review is not free text,
 * it moves the run to one of three terminal states and anything else is
 * refused rather than written.
 */
async function submitHumanReview(orgId, runId, review) {
  const { AGENT_STATUS } = require('../../shared/models/agent-run');
  const statusMap = {
    approved: AGENT_STATUS.HUMAN_APPROVED,
    modified: AGENT_STATUS.HUMAN_MODIFIED,
    rejected: AGENT_STATUS.HUMAN_REJECTED,
  };
  const finalStatus = statusMap[review.decision];
  if (!finalStatus) {
    throw Object.assign(
      new Error(`Invalid review decision: ${review.decision}. Must be approved, modified, or rejected.`),
      { statusCode: 400, code: 'INVALID_REVIEW_DECISION' });
  }

  return updateRun(orgId, runId, {
    status: finalStatus,
    humanReview: {
      decision: review.decision,
      reviewerId: review.reviewerId,
      reason: review.reason || null,
      modifications: review.modifications || null,
      reviewedAt: new Date().toISOString(),
    },
    completedAt: new Date().toISOString(),
  });
}

module.exports = { COLLECTION, saveRun, updateRun, getRun, listRuns, submitHumanReview };
