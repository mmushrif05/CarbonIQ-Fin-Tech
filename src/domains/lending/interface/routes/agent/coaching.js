// @ts-check
/**
 * Borrower coaching, and decision triage.
 */

'use strict';

const { Router } = require('express');

const authenticate    = require('../../../../../platform/auth/authenticate');
const validate      = require('../../../../../platform/http/validate');
const { authorize } = require('../../../../../platform/auth/authorization');
const { PERMISSIONS } = require('../../../../../shared/policies');
const { agentLimiter } = require('../../../../../platform/http/rate-limit');
const { runAgentSingleCall } = require('../../../../../platform/ai/agent');
const {
  borrowerCoachingRequestSchema,
  decisionTriageRequestSchema
} = require('../../schemas/agent');
const borrowerCoaching   = require('../../../agents/borrower-coaching');
const decisionReview     = require('../../../agents/decision-review');
const { classifyDecisionTier, DECISION_TIERS } = require('../../../domain/decision-engine');

const router = Router();

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
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_COACH),
  validate({ body: borrowerCoachingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;

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
          breakdown:   completeness.breakdown,
          missing:     completeness.missingFields.map(f => f.label),
          // Optional strengtheners. They do not count against completeness,
          // but the borrower should still be told they are available.
          enhancements: completeness.enhancements.map(f => ({ label: f.label, impact: f.impact })),
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
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_TRIAGE),
  validate({ body: decisionTriageRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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
          // Spread the classification rather than re-listing its fields: a
          // hand-written copy silently dropped track, reason and flags the
          // moment the engine gained them.
          ...tierResult,
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

module.exports = router;
