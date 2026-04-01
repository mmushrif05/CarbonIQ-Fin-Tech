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

const { Router }    = require('express');
const apiKeyAuth    = require('../../middleware/api-key');
const validate      = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorization');
const { PERMISSIONS } = require('../../config/policies');
const { agentLimiter } = require('../../middleware/rate-limit');
const { runAgent, runAgentSingleCall } = require('../../bridge/agent');
const { getAgentRun, listAgentRuns, updateAgentRun, submitHumanReview } = require('../../bridge/firebase');
const { AGENT_STATUS } = require('../../models/agent-run');

const {
  underwritingRequestSchema,
  screeningRequestSchema,
  originationRequestSchema,
  covenantsRequestSchema,
  covenantReviewSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema,
  borrowerCoachingRequestSchema,
  decisionTriageRequestSchema,
} = require('../../schemas/agent');
const underwritingAgent  = require('../../services/agents/underwriting');
const screeningAgent     = require('../../services/agents/screening');
const originationAgent   = require('../../services/agents/origination');
const covenantsAgent     = require('../../services/agents/covenants');
const monitoringAgent    = require('../../services/agents/monitoring');
const portfolioAgent     = require('../../services/agents/portfolio');
const borrowerCoaching   = require('../../services/agents/borrower-coaching');
const decisionReview     = require('../../services/agents/decision-review');
const { classifyApplication } = require('../../services/decision-engine');

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
  authorize(PERMISSIONS.AGENT_UNDERWRITE),
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
// POST /v1/agent/originate
//
// Stage 2 — Construction-Specific Green Loan Origination.
//
// The primary bank integration point at the moment a construction loan
// application arrives. Unlike general ESG platforms (Persefoni, Watershed,
// Sweep, Plan A) that rely on sector-average proxies, CarbonIQ processes the
// Bill of Quantities the bank already holds — upgrading PCAF Data Quality
// Score from 4-5 to 2-3 at the point of origination.
//
// Returns a complete Green Loan Origination Decision Package: carbon risk
// assessment, taxonomy alignment, PCAF financed emissions, Carbon Finance
// Score, preliminary covenant framework, and PROCEED / PROCEED WITH
// CONDITIONS / DECLINE verdict ready for credit committee.
// ---------------------------------------------------------------------------

router.post('/originate',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_ORIGINATE),
  validate({ body: originationRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = originationAgent.buildUserMessage(req.body);

      const run = await runAgent({
        agentType:       'origination',
        systemPrompt:    originationAgent.SYSTEM_PROMPT,
        toolDefinitions: originationAgent.TOOL_DEFINITIONS,
        toolFunctions:   originationAgent.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          applicationReference: req.body.applicationReference || null,
          applicantName:        req.body.applicantName        || null,
          projectName:          req.body.projectName          || null,
          buildingType:         req.body.buildingType,
          buildingArea_m2:      req.body.buildingArea_m2,
          region:               req.body.region               || 'Singapore',
          loanAmount:           req.body.loanAmount           || null,
          projectValue:         req.body.projectValue         || null,
          hasBOQ:               !!req.body.boqContent,
          greenLoanTarget:      req.body.greenLoanTarget !== false
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
        return res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: 'Agentic AI is not configured. Contact your administrator.' });
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
  authorize(PERMISSIONS.AGENT_SCREEN),
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
// Stage 3 — Covenant Design Agent.
//
// Takes underwritten carbon metrics and designs a scientifically calibrated
// green loan covenant package with 3 scenarios and a recommended pricing
// ratchet.
//
// EU AI Act Article 22 compliance:
//   Covenant Design is classified as a High-Risk AI system under EU AI Act
//   Annex III, point 5(b) (creditworthiness/credit scoring for financial
//   services). Enforcement begins August 2026. This endpoint therefore sets
//   run status to 'pending_human_review' after the AI recommendation — the
//   covenant terms must NOT be inserted into a facility agreement until a bank
//   officer posts an approval decision to POST /v1/agent/covenants/:runId/review.
//
//   The AI recommendation and the human decision are both immutably persisted
//   in Firebase for regulatory audit trail purposes.
// ---------------------------------------------------------------------------

router.post('/covenants',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_COVENANTS),
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

      // EU AI Act Art. 22: override 'completed' → 'pending_human_review' so
      // that covenant terms cannot be used until a bank officer reviews them.
      if (run.status === 'completed') {
        await updateAgentRun(orgId, run.runId, {
          status: AGENT_STATUS.PENDING_HUMAN_REVIEW
        });
        run.status = AGENT_STATUS.PENDING_HUMAN_REVIEW;
      }

      // 202 Accepted: AI recommendation is ready but awaiting human review.
      const httpStatus = run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW ? 202
        : run.status === 'failed' ? 500
        : 200;

      return res.status(httpStatus).json({
        success:    run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW,
        runId:      run.runId,
        agentType:  run.agentType,
        status:     run.status,
        result:     run.result,
        steps:      run.steps,
        tokensUsed: run.tokensUsed,
        metadata:   run.metadata,
        createdAt:  run.createdAt,
        completedAt: run.completedAt,
        // Inform the caller of the required next step
        nextStep: run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW
          ? `EU AI Act Art. 22: a bank officer must review and approve/modify/reject this covenant recommendation via POST /v1/agent/covenants/${run.runId}/review before the terms may be used in a facility agreement.`
          : undefined,
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
// POST /v1/agent/covenants/:runId/review
//
// EU AI Act Article 22 — Human-in-the-Loop review for Covenant Design.
//
// A bank officer submits their review decision for an AI-generated covenant
// recommendation. The decision (approved / modified / rejected) and the
// reviewer's identity are immutably recorded alongside the AI recommendation
// in the agent run audit trail.
//
// Required fields:
//   decision    — 'approved' | 'modified' | 'rejected'
//   reviewerId  — Bank officer identifier (email or system user ID)
//   reason      — Required for 'modified' and 'rejected' decisions
//   modifications — Required for 'modified': array of covenant overrides
//                   with documented justification per EU AI Act Art. 13(3)(f)
//
// After this call the run status transitions to:
//   'human_approved'  — Covenant terms may be used in the facility agreement
//   'human_modified'  — Modified terms (see modifications[]) may be used
//   'human_rejected'  — Run must be re-submitted via POST /v1/agent/covenants
// ---------------------------------------------------------------------------

router.post('/covenants/:runId/review',
  apiKeyAuth,
  authorize(PERMISSIONS.AGENT_REVIEW),
  validate({ body: covenantReviewSchema }),
  async (req, res, next) => {
    try {
      const orgId  = req.apiKey.orgId;
      const { runId } = req.params;

      // Fetch the run and confirm it belongs to this org and is awaiting review
      const run = await getAgentRun(orgId, runId);

      if (!run) {
        return res.status(404).json({
          error:   'RUN_NOT_FOUND',
          message: `Agent run ${runId} not found for this organisation.`
        });
      }

      if (run.agentType !== 'covenants') {
        return res.status(400).json({
          error:   'INVALID_RUN_TYPE',
          message: `Run ${runId} is of type '${run.agentType}'. Human review is only applicable to covenant design runs.`
        });
      }

      if (run.status !== AGENT_STATUS.PENDING_HUMAN_REVIEW) {
        return res.status(409).json({
          error:   'REVIEW_NOT_APPLICABLE',
          message: `Run ${runId} has status '${run.status}'. Review is only permitted when status is 'pending_human_review'.`,
          currentStatus: run.status
        });
      }

      await submitHumanReview(orgId, runId, {
        decision:      req.body.decision,
        reviewerId:    req.body.reviewerId,
        reason:        req.body.reason        || null,
        modifications: req.body.modifications || null
      });

      const finalStatusMap = {
        approved: AGENT_STATUS.HUMAN_APPROVED,
        modified: AGENT_STATUS.HUMAN_MODIFIED,
        rejected: AGENT_STATUS.HUMAN_REJECTED
      };

      return res.status(200).json({
        success:   true,
        runId,
        status:    finalStatusMap[req.body.decision],
        decision:  req.body.decision,
        reviewerId: req.body.reviewerId,
        reviewedAt: new Date().toISOString(),
        message:   req.body.decision === 'approved'
          ? 'Covenant terms approved. They may now be used in the facility agreement.'
          : req.body.decision === 'modified'
          ? 'Covenant terms approved with modifications. The revised thresholds in modifications[] may be used in the facility agreement.'
          : 'Covenant terms rejected. Re-submit via POST /v1/agent/covenants with updated parameters.',
        auditNote: 'This review decision has been immutably recorded per EU AI Act Art. 22 and PCAF v3 audit trail requirements.'
      });

    } catch (err) {
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
  authorize(PERMISSIONS.AGENT_MONITOR),
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
  authorize(PERMISSIONS.AGENT_PORTFOLIO),
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
// AI Borrower Coaching — assess application completeness, pre-compute carbon
// estimates, and produce a personalised coaching report with a prioritised
// action plan. Uses runAgentSingleCall for sub-second response.
// ---------------------------------------------------------------------------

router.post('/coach',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_COACH),
  validate({ body: borrowerCoachingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const userMessage = borrowerCoaching.buildUserMessageWithResults(req.body);

      const run = await runAgentSingleCall({
        agentType:    'borrower_coaching',
        systemPrompt: borrowerCoaching.SYSTEM_PROMPT,
        userMessage,
        orgId,
        metadata: {
          projectName:    req.body.projectName     || null,
          buildingType:   req.body.buildingType,
          buildingArea_m2: req.body.buildingArea_m2,
          region:         req.body.region          || 'Singapore',
          loanAmount:     req.body.loanAmount      || null,
          completenessScore: borrowerCoaching.assessCompleteness(req.body).score,
        },
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
        ...(run.error && { error: run.error }),
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
// Tiered Decision Framework — classify the application into one of three
// decision tracks using the deterministic engine, then optionally invoke
// the AI Decision Review Agent for Tier 2 borderline cases.
//
// Tier 1 Auto-Decision:  returns immediately (no AI call)
// Tier 2 AI-Assisted:    runs decision-review agent, returns full memo
// Tier 3 Manual Review:  returns classification + escalation instructions
// ---------------------------------------------------------------------------

router.post('/triage',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_TRIAGE),
  validate({ body: decisionTriageRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;

      // Step 1: deterministic tier classification (no AI call)
      const tierResult = classifyApplication({
        cfsScore:          req.body.cfsScore,
        loanAmount:        req.body.loanAmount,
        projectValue:      req.body.projectValue,
        buildingArea_m2:   req.body.buildingArea_m2,
        epdCoveragePct:    req.body.epdCoveragePct || 0,
        verificationStatus: req.body.verificationStatus || 'none',
        region:            req.body.region,
        buildingType:      req.body.buildingType,
        hasBOQ:            req.body.hasBOQ || false,
        reductionPct:      req.body.reductionPct || 0,
      });

      // Tier 1 and Tier 3 — no AI call required, return immediately
      if (tierResult.tier !== 2) {
        return res.status(200).json({
          success:    true,
          tier:       tierResult.tier,
          tierLabel:  tierResult.tierLabel,
          track:      tierResult.track,
          trackLabel: tierResult.trackLabel,
          reason:     tierResult.reason,
          rationale:  tierResult.rationale,
          flags:      tierResult.flags,
          classifiedAt: tierResult.classifiedAt,
          aiReview:   null,
          ...(tierResult.tier === 3 && {
            escalation: {
              message:     'This application requires manual review by a credit officer and ESG specialist.',
              nextSteps:   [
                'Assign to Senior Credit Officer',
                'Request ESG specialist review',
                'Schedule borrower consultation',
                'Consider Borrower Coaching (/v1/agent/coach) to improve application quality',
              ],
            },
          }),
        });
      }

      // Tier 2 — run AI Decision Review Agent
      const userMessage = decisionReview.buildUserMessage(req.body, tierResult);

      const run = await runAgent({
        agentType:       'decision_review',
        systemPrompt:    decisionReview.SYSTEM_PROMPT,
        toolDefinitions: decisionReview.TOOL_DEFINITIONS,
        toolFunctions:   decisionReview.TOOL_FUNCTIONS,
        userMessage,
        orgId,
        metadata: {
          projectName:    req.body.projectName    || null,
          buildingType:   req.body.buildingType   || null,
          buildingArea_m2: req.body.buildingArea_m2 || null,
          region:         req.body.region         || 'Singapore',
          loanAmount:     req.body.loanAmount     || null,
          cfsScore:       req.body.cfsScore       || null,
          triageReason:   tierResult.reason,
        },
      });

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:    run.status === 'completed',
        tier:       tierResult.tier,
        tierLabel:  tierResult.tierLabel,
        track:      tierResult.track,
        trackLabel: tierResult.trackLabel,
        reason:     tierResult.reason,
        rationale:  tierResult.rationale,
        flags:      tierResult.flags,
        classifiedAt: tierResult.classifiedAt,
        aiReview: {
          runId:       run.runId,
          agentType:   run.agentType,
          status:      run.status,
          result:      run.result,
          steps:       run.steps,
          tokensUsed:  run.tokensUsed,
          createdAt:   run.createdAt,
          completedAt: run.completedAt,
          ...(run.error && { error: run.error }),
        },
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
  authorize(PERMISSIONS.RUNS_READ),
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
  authorize(PERMISSIONS.RUNS_READ),
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
