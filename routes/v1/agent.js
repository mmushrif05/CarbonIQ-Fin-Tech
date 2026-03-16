/**
 * CarbonIQ FinTech — Agent API Routes
 *
 * POST /v1/agent/screen       → Green Loan Screening Agent (Stage 1)
 * POST /v1/agent/underwrite   → Green Loan Underwriting Agent (Stage 2)
 * POST /v1/agent/covenants    → Covenant Design Agent (Stage 3)
 * GET  /v1/agent/runs         → List agent runs for this organisation
 * GET  /v1/agent/runs/:runId  → Get a specific agent run (full step log)
 *
 * Each agent run:
 *   1. Validates the request
 *   2. Builds a natural-language task message
 *   3. Calls runAgent() — the agentic loop
 *   4. Returns the completed run record (steps, result, tokensUsed)
 *
 * All runs are persisted in Firebase under /fintech/agentRuns/{orgId}/{runId}
 * for audit trail compliance.
 */

'use strict';

const { Router }    = require('express');
const apiKeyAuth    = require('../../middleware/api-key');
const validate      = require('../../middleware/validate');
const { agentLimiter } = require('../../middleware/rate-limit');
const { runAgent }  = require('../../bridge/agent');
const { getAgentRun, listAgentRuns } = require('../../bridge/firebase');

const { underwritingRequestSchema, screeningRequestSchema, covenantsRequestSchema } = require('../../schemas/agent');
const underwritingAgent = require('../../services/agents/underwriting');
const screeningAgent    = require('../../services/agents/screening');
const covenantsAgent    = require('../../services/agents/covenants');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/agent/underwrite
//
// Run the Green Loan Underwriting Agent against a BOQ and project details.
// Returns a full underwriting memo plus the complete tool-call audit trail.
// ---------------------------------------------------------------------------

router.post('/underwrite',
  apiKeyAuth,
  agentLimiter,
  validate({ body: underwritingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;

      // Build the initial task message Claude receives
      const userMessage = underwritingAgent.buildUserMessage(req.body);

      // Run the agent — this is the multi-step agentic loop
      const run = await runAgent({
        agentType:       'underwriting',
        systemPrompt:    underwritingAgent.SYSTEM_PROMPT,
        toolDefinitions: underwritingAgent.TOOL_DEFINITIONS,
        toolFunctions:   underwritingAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          projectName:    req.body.projectName   || null,
          buildingType:   req.body.buildingType  || null,
          buildingArea_m2: req.body.buildingArea_m2 || null,
          region:         req.body.region        || 'Singapore',
          loanAmount:     req.body.loanAmount    || null,
          projectValue:   req.body.projectValue  || null,
          hasBOQ:         !!req.body.boqContent
        }
      });

      // Return appropriate HTTP status
      const httpStatus = run.status === 'completed' ? 200 : 500;

      return res.status(httpStatus).json({
        success:    run.status === 'completed',
        runId:      run.runId,
        agentType:  run.agentType,
        status:     run.status,
        result:     run.result,
        steps:      run.steps,
        tokensUsed: run.tokensUsed,
        metadata:   run.metadata,
        createdAt:  run.createdAt,
        completedAt: run.completedAt,
        ...(run.error && { error: run.error })
      });

    } catch (err) {
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'Agentic AI is not configured. Contact your administrator.'
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/agent/screen
//
// Run the Green Loan Screening Agent. No BOQ needed — works from project
// brief and building parameters. Returns an Eligibility Memo with
// Go/Conditional/No-Go verdict based on benchmark carbon estimates.
// ---------------------------------------------------------------------------

router.post('/screen',
  apiKeyAuth,
  agentLimiter,
  validate({ body: screeningRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = screeningAgent.buildUserMessage(req.body);

      const run = await runAgent({
        agentType:       'screening',
        systemPrompt:    screeningAgent.SYSTEM_PROMPT,
        toolDefinitions: screeningAgent.TOOL_DEFINITIONS,
        toolFunctions:   screeningAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          projectName:    req.body.projectName        || null,
          buildingType:   req.body.buildingType,
          buildingArea_m2: req.body.buildingArea_m2,
          region:         req.body.region             || 'Singapore',
          targetCertification: req.body.targetCertification || null
        }
      });

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:    run.status === 'completed',
        runId:      run.runId,
        agentType:  run.agentType,
        status:     run.status,
        result:     run.result,
        steps:      run.steps,
        tokensUsed: run.tokensUsed,
        metadata:   run.metadata,
        createdAt:  run.createdAt,
        completedAt: run.completedAt,
        ...(run.error && { error: run.error })
      });
    } catch (err) {
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: 'Agentic AI is not configured.' });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/agent/covenants
//
// Run the Covenant Design Agent. Takes underwritten carbon metrics and
// designs a scientifically calibrated green loan covenant package with
// 3 scenarios and a recommended pricing ratchet.
// ---------------------------------------------------------------------------

router.post('/covenants',
  apiKeyAuth,
  agentLimiter,
  validate({ body: covenantsRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = covenantsAgent.buildUserMessage(req.body);

      const run = await runAgent({
        agentType:       'covenants',
        systemPrompt:    covenantsAgent.SYSTEM_PROMPT,
        toolDefinitions: covenantsAgent.TOOL_DEFINITIONS,
        toolFunctions:   covenantsAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          projectName:    req.body.projectName        || null,
          buildingType:   req.body.buildingType,
          buildingArea_m2: req.body.buildingArea_m2,
          region:         req.body.region             || 'Singapore',
          currentTCO2e:   req.body.currentTCO2e       || null,
          loanTermYears:  req.body.loanTermYears       || null
        }
      });

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:    run.status === 'completed',
        runId:      run.runId,
        agentType:  run.agentType,
        status:     run.status,
        result:     run.result,
        steps:      run.steps,
        tokensUsed: run.tokensUsed,
        metadata:   run.metadata,
        createdAt:  run.createdAt,
        completedAt: run.completedAt,
        ...(run.error && { error: run.error })
      });
    } catch (err) {
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: 'Agentic AI is not configured.' });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/agent/runs
//
// List recent agent runs for this organisation.
// ---------------------------------------------------------------------------

router.get('/runs',
  apiKeyAuth,
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

      const runs = await listAgentRuns(orgId, limit);

      return res.status(200).json({
        success: true,
        orgId,
        count: runs.length,
        runs: runs.map(r => ({
          runId:       r.runId,
          agentType:   r.agentType,
          status:      r.status,
          stepCount:   (r.steps || []).length,
          tokensUsed:  r.tokensUsed,
          metadata:    r.metadata,
          createdAt:   r.createdAt,
          completedAt: r.completedAt
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/agent/runs/:runId
//
// Get the full detail of a specific agent run, including every step.
// ---------------------------------------------------------------------------

router.get('/runs/:runId',
  apiKeyAuth,
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const { runId } = req.params;

      const run = await getAgentRun(orgId, runId);

      if (!run) {
        return res.status(404).json({
          error:   'RUN_NOT_FOUND',
          message: `Agent run ${runId} not found for this organisation.`
        });
      }

      return res.status(200).json({
        success: true,
        run
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
