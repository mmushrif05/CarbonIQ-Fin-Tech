// @ts-check
/**
 * CarbonIQ FinTech — Agent API Routes
 *
 * POST /v1/agent/screen       → Green Loan Screening Agent (Stage 1)
 * POST /v1/agent/underwrite   → Green Loan Underwriting Agent (Stage 2)
 * POST /v1/agent/covenants    → Covenant Design Agent (Stage 3)
 * POST /v1/agent/monitor      → Covenant Monitoring Agent (Stage 4)
 * POST /v1/agent/portfolio    → Portfolio Reporting Agent (Stage 5)
 * GET  /v1/agent/runs         → List agent runs for this organisation
 * POST /v1/agent/originate               → Green Loan Origination Agent (Stage 2)
 * POST /v1/agent/covenants/:runId/review → Human Review for Covenant Design (EU AI Act Art. 22)
 * GET  /v1/agent/runs/:runId             → Get a specific agent run (full step log)
 *
 * Each agent run:
 *   1. Validates the request
 *   2. Builds a natural-language task message
 *   3. Calls runAgent() — the agentic loop
 *   4. Returns the completed run record (steps, result, tokensUsed)
 *
 * All runs are persisted in Firebase under /fintech/agentRuns/{orgId}/{runId}
 * for audit trail compliance.
 *
 * EU AI Act compliance (Stage 3 — Covenant Design):
 *   High-Risk AI per Annex III, point 5(b) — creditworthiness/credit scoring in
 *   financial services. Enforcement: August 2026. The covenants endpoint sets
 *   status 'pending_human_review' after AI recommendation. A bank officer must
 *   post a review decision to /covenants/:runId/review before covenant terms
 *   take legal effect in the facility agreement.
 */

'use strict';

const { Router } = require('express');


const router = Router();

router.use(require('./agent/runs'));
router.use(require('./agent/lending'));
router.use(require('./agent/covenants'));
router.use(require('./agent/monitoring'));
router.use(require('./agent/coaching'));

module.exports = router;
