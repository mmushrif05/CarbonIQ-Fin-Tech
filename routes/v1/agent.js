/**
 * CarbonIQ FinTech — Agent API Routes
 *
 * POST /v1/agent/screen       → Green Loan Screening Agent (Stage 1)
 * POST /v1/agent/underwrite   → Green Loan Underwriting Agent (Stage 2)
 * POST /v1/agent/covenants    → Covenant Design Agent (Stage 3)
 * POST /v1/agent/monitor      → Covenant Monitoring Agent (Stage 4)
 * POST /v1/agent/portfolio    → Portfolio Reporting Agent (Stage 5)
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
const { runAgent, runAgentSingleCall } = require('../../bridge/agent');
const { getAgentRun, listAgentRuns } = require('../../bridge/firebase');

const {
  underwritingRequestSchema,
  screeningRequestSchema,
  covenantsRequestSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema,
  borrowerCoachingRequestSchema,
  decisionTriageRequestSchema
} = require('../../schemas/agent');
const underwritingAgent  = require('../../services/agents/underwriting');
const screeningAgent     = require('../../services/agents/screening');
const covenantsAgent     = require('../../services/agents/covenants');
const monitoringAgent    = require('../../services/agents/monitoring');
const portfolioAgent     = require('../../services/agents/portfolio');
const borrowerCoaching   = require('../../services/agents/borrower-coaching');
const decisionReview     = require('../../services/agents/decision-review');
const { classifyDecisionTier, DECISION_TIERS } = require('../../services/decision-engine');

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
      // Pre-execute the 3 local tools and embed results into the prompt so that
      // Claude needs only ONE API call to write the memo. This keeps the Netlify
      // function well under the 10-second execution limit.
      const userMessage = screeningAgent.buildUserMessageWithResults(req.body);

      const run = await runAgentSingleCall({
        agentType:    'screening',
        systemPrompt: screeningAgent.SYSTEM_PROMPT,
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
// POST /v1/agent/monitor
//
// Run the Covenant Monitoring Agent. Takes the agreed covenant package and
// current construction-stage metrics. Tests each KPI, projects trajectory
// to practical completion, and makes a Drawdown Recommendation.
// ---------------------------------------------------------------------------

router.post('/monitor',
  apiKeyAuth,
  agentLimiter,
  validate({ body: monitoringRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = monitoringAgent.buildUserMessage(req.body);

      const run = await runAgent({
        agentType:       'monitoring',
        systemPrompt:    monitoringAgent.SYSTEM_PROMPT,
        toolDefinitions: monitoringAgent.TOOL_DEFINITIONS,
        toolFunctions:   monitoringAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          projectName:         req.body.projectName            || null,
          buildingType:        req.body.buildingType,
          buildingArea_m2:     req.body.buildingArea_m2,
          region:              req.body.region                 || 'Singapore',
          projectComplete_pct: req.body.projectComplete_pct,
          drawdownRequested:   req.body.drawdownRequested      || false,
          covenantCount:       (req.body.covenants || []).length
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
// POST /v1/agent/portfolio
//
// Run the Portfolio Reporting Agent. Takes an array of loan assets with
// their carbon metrics and produces a PCAF/TCFD/GLP-aligned ESG portfolio
// report with taxonomy distribution, financed emissions, and priority actions.
// ---------------------------------------------------------------------------

router.post('/portfolio',
  apiKeyAuth,
  agentLimiter,
  validate({ body: portfolioReportRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = portfolioAgent.buildUserMessage(req.body);

      const run = await runAgent({
        agentType:       'portfolio',
        systemPrompt:    portfolioAgent.SYSTEM_PROMPT,
        toolDefinitions: portfolioAgent.TOOL_DEFINITIONS,
        toolFunctions:   portfolioAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          portfolioName:   req.body.portfolioName   || null,
          reportingPeriod: req.body.reportingPeriod || null,
          reportingEntity: req.body.reportingEntity || null,
          assetCount:      (req.body.assets || []).length
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
// POST /v1/agent/coach
//
// AI Borrower Coaching — Stage 2 of the borrower journey.
//
// Guides borrowers through completing their green loan application with
// personalised, AI-generated coaching. Assesses application completeness
// (0–100%), computes preliminary carbon metrics from available data, and
// produces a coaching report with a prioritised action plan.
//
// Validated impact: AI-guided applications raise completion rates by 32%.
// Uses runAgentSingleCall — tools pre-computed locally for sub-second response.
// ---------------------------------------------------------------------------

router.post('/coach',
  apiKeyAuth,
  agentLimiter,
  validate({ body: borrowerCoachingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;

      // Pre-compute all tool results and embed them in the user message
      // so Claude needs only one API call to write the coaching report.
      const userMessage = borrowerCoaching.buildUserMessageWithResults(req.body);

      const run = await runAgentSingleCall({
        agentType:    'borrower_coaching',
        systemPrompt: borrowerCoaching.SYSTEM_PROMPT,
        userMessage,
        orgId,
        metadata: {
          projectName:         req.body.projectName        || null,
          buildingType:        req.body.buildingType        || null,
          buildingArea_m2:     req.body.buildingArea_m2     || null,
          region:              req.body.region              || 'Singapore',
          hasBOQ:              !!req.body.boqContent,
          targetCertification: req.body.targetCertification || null,
          loanAmount:          req.body.loanAmount          || null
        }
      });

      // Include the pre-computed completeness score in the response so
      // callers can display a progress bar without parsing the memo text.
      const completeness = borrowerCoaching.assessApplicationCompleteness(req.body);

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:      run.status === 'completed',
        runId:        run.runId,
        agentType:    run.agentType,
        status:       run.status,
        result:       run.result,
        completeness: {
          pct:         completeness.completionPct,
          statusLabel: completeness.statusLabel,
          missing:     completeness.missingFields.map(f => f.label),
          readyForScreening:    completeness.readyForScreening,
          readyForUnderwriting: completeness.readyForUnderwriting,
          readyForDecision:     completeness.readyForDecision
        },
        steps:       run.steps,
        tokensUsed:  run.tokensUsed,
        metadata:    run.metadata,
        createdAt:   run.createdAt,
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
// POST /v1/agent/triage
//
// Tiered Decision Framework — bank review workflow for green loan decisions.
//
// Routes each application to one of three decision tiers:
//   Tier 1 — Auto-Decision   (70–85%): immediate approve or decline
//   Tier 2 — AI-Assisted     (10–20%): AI review memo + loan officer sign-off
//   Tier 3 — Manual Review   (5–10%):  escalate to credit officer
//
// For Tier 2 cases, this endpoint runs the decision-review agent and
// returns a full AI Decision Review Memo alongside the tier classification.
// Tier 1 and Tier 3 decisions return immediately without an AI call.
// ---------------------------------------------------------------------------

router.post('/triage',
  apiKeyAuth,
  agentLimiter,
  validate({ body: decisionTriageRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const body  = req.body;

      // Step 1 — deterministic tier classification (no AI, always fast)
      const tierResult = classifyDecisionTier({
        cfsScore:             body.cfsScore,
        cfsClassification:    body.cfsClassification,
        taxonomyAlignments:   body.taxonomyAlignments,
        pcafDataQualityScore: body.pcafDataQualityScore,
        loanAmount:           body.loanAmount,
        forceManualReview:    body.forceManualReview
      });

      // Tier 1 (auto-decision) and Tier 3 (manual) return immediately —
      // no AI call needed. Only Tier 2 triggers the AI review agent.
      if (tierResult.tier !== DECISION_TIERS.AI) {
        return res.status(200).json({
          success:     true,
          agentType:   'decision_triage',
          tier:        tierResult.tier,
          tierLabel:   tierResult.tierLabel,
          verdict:     tierResult.verdict,
          confidence:  tierResult.confidence,
          autoDecision: tierResult.autoDecision,
          reasons:     tierResult.reasons,
          conditions:  tierResult.conditions,
          escalationNote: tierResult.escalationNote,
          thresholds:  tierResult.thresholds,
          aiReview:    null   // No AI memo for auto or manual tiers
        });
      }

      // Step 2 — Tier 2: run the AI Decision Review agent
      const userMessage = decisionReview.buildUserMessage({
        projectName:                 body.projectName,
        buildingType:                body.buildingType,
        buildingArea_m2:             body.buildingArea_m2,
        region:                      body.region,
        loanAmount:                  body.loanAmount,
        projectValue:                body.projectValue,
        cfsScore:                    body.cfsScore,
        cfsClassification:           body.cfsClassification,
        cfsComponents:               body.cfsComponents,
        taxonomyAlignments:          body.taxonomyAlignments,
        pcafDataQualityScore:        body.pcafDataQualityScore,
        pcafFinancedEmissions_tCO2e: body.pcafFinancedEmissions_tCO2e,
        carbonIntensity_kgCO2e_m2:   body.carbonIntensity_kgCO2e_m2,
        totalTCO2e:                  body.totalTCO2e,
        certificationLevel:          body.certificationLevel,
        verificationStatus:          body.verificationStatus,
        reductionPct:                body.reductionPct,
        tierResult,
        underwritingRunId:           body.underwritingRunId
      });

      const run = await runAgentSingleCall({
        agentType:    'decision_review',
        systemPrompt: decisionReview.SYSTEM_PROMPT,
        userMessage,
        orgId,
        metadata: {
          projectName:          body.projectName          || null,
          cfsScore:             body.cfsScore,
          cfsClassification:    body.cfsClassification    || null,
          tier:                 tierResult.tier,
          verdict:              tierResult.verdict,
          loanAmount:           body.loanAmount            || null,
          underwritingRunId:    body.underwritingRunId     || null
        }
      });

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:      run.status === 'completed',
        runId:        run.runId,
        agentType:    run.agentType,
        status:       run.status,
        tier:         tierResult.tier,
        tierLabel:    tierResult.tierLabel,
        verdict:      tierResult.verdict,
        confidence:   tierResult.confidence,
        autoDecision: tierResult.autoDecision,
        reasons:      tierResult.reasons,
        conditions:   tierResult.conditions,
        escalationNote: tierResult.escalationNote,
        thresholds:   tierResult.thresholds,
        aiReview:     run.result,   // Full AI Decision Review Memo
        steps:        run.steps,
        tokensUsed:   run.tokensUsed,
        metadata:     run.metadata,
        createdAt:    run.createdAt,
        completedAt:  run.completedAt,
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
