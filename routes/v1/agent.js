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
  decisionTriageRequestSchema
} = require('../../schemas/agent');
const underwritingAgent  = require('../../services/agents/underwriting');
const screeningAgent     = require('../../services/agents/screening');
const originationAgent   = require('../../services/agents/origination');
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
// AI Borrower Coaching — Stage 2 of the borrower journey.
// Guides borrowers through completing their green loan application with
// personalised AI coaching. Assesses application completeness (0–100%),
// computes preliminary carbon metrics from available data, and produces
// a coaching report with a prioritised action plan.
// Validated impact: AI-guided applications raise completion rates by 32%.
// Uses runAgentSingleCall — tools pre-computed locally for sub-second response.
// ---------------------------------------------------------------------------

router.post('/coach',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_COACH),
  validate({ body: borrowerCoachingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;

      // Pre-compute all tool results and embed in the user message
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
          hasBOQ:              !!(req.body.boqContent || req.body.hasBOQ),
          targetCertification: req.body.targetCertification || null,
          loanAmount:          req.body.loanAmount          || null,
          completenessScore:   borrowerCoaching.assessCompleteness(req.body).score
        }
      });

      // Include the pre-computed completeness score so callers can
      // display a progress bar without parsing the memo text.
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
// Tiered Decision Framework — routes each application to one of three tracks:
//   Tier 1 Auto-Decision  (70–85%): returns immediately, no AI call needed
//   Tier 2 AI-Assisted    (10–20%): runs decision-review agent, returns memo
//   Tier 3 Manual Review   (5–10%): returns classification + escalation info
// ---------------------------------------------------------------------------

router.post('/triage',
  apiKeyAuth,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_TRIAGE),
  validate({ body: decisionTriageRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const body = req.body;

      // Step 1 — deterministic tier classification (no AI call, always fast)
      const tierResult = classifyDecisionTier({
        cfsScore:             body.cfsScore,
        cfsClassification:    body.cfsClassification,
        taxonomyAlignments:   body.taxonomyAlignments,
        pcafDataQualityScore: body.pcafDataQualityScore,
        loanAmount:           body.loanAmount,
        buildingArea_m2:      body.buildingArea_m2,
        epdCoveragePct:       body.epdCoveragePct,
        forceManualReview:    body.forceManualReview
      });

      // Tier 1 (auto) and Tier 3 (manual) return immediately — no AI call needed
      if (tierResult.tier !== DECISION_TIERS.AI) {
        return res.status(200).json({
          success:       true,
          agentType:     'decision_triage',
          tier:          tierResult.tier,
          tierLabel:     tierResult.tierLabel,
          verdict:       tierResult.verdict,
          confidence:    tierResult.confidence,
          autoDecision:  tierResult.autoDecision,
          reasons:       tierResult.reasons,
          conditions:    tierResult.conditions,
          escalationNote: tierResult.escalationNote,
          thresholds:    tierResult.thresholds,
          aiReview:      null,
          ...(tierResult.tier === DECISION_TIERS.MANUAL && {
            escalation: {
              message:   'This application requires manual review by a credit officer and ESG specialist.',
              nextSteps: [
                'Assign to Senior Credit Officer',
                'Request ESG specialist review',
                'Schedule borrower consultation',
                'Consider POST /v1/agent/coach to guide the borrower through data improvement'
              ]
            }
          })
        });
      }

      // Step 2 — Tier 2: run the AI Decision Review agent (single call)
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
        epdCoveragePct:              body.epdCoveragePct,
        projectDescription:          body.projectDescription,
        tierResult,
        underwritingRunId:           body.underwritingRunId
      });

      const run = await runAgentSingleCall({
        agentType:    'decision_review',
        systemPrompt: decisionReview.SYSTEM_PROMPT,
        userMessage,
        orgId,
        metadata: {
          projectName:       body.projectName       || null,
          cfsScore:          body.cfsScore,
          cfsClassification: body.cfsClassification || null,
          tier:              tierResult.tier,
          verdict:           tierResult.verdict,
          loanAmount:        body.loanAmount         || null,
          underwritingRunId: body.underwritingRunId  || null
        }
      });

      return res.status(run.status === 'completed' ? 200 : 500).json({
        success:       run.status === 'completed',
        runId:         run.runId,
        agentType:     run.agentType,
        status:        run.status,
        tier:          tierResult.tier,
        tierLabel:     tierResult.tierLabel,
        verdict:       tierResult.verdict,
        confidence:    tierResult.confidence,
        autoDecision:  tierResult.autoDecision,
        reasons:       tierResult.reasons,
        conditions:    tierResult.conditions,
        escalationNote: tierResult.escalationNote,
        thresholds:    tierResult.thresholds,
        aiReview:      run.result,
        steps:         run.steps,
        tokensUsed:    run.tokensUsed,
        metadata:      run.metadata,
        createdAt:     run.createdAt,
        completedAt:   run.completedAt,
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
