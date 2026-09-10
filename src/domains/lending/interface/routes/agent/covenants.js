// @ts-check
/**
 * Covenant drafting, and the human review of a draft.
 */

'use strict';

const { Router } = require('express');

const authenticate    = require('../../../../../platform/auth/authenticate');
const validate      = require('../../../../../platform/http/validate');
const { authorize } = require('../../../../../platform/auth/authorization');
const { PERMISSIONS } = require('../../../../../shared/policies');
const { agentLimiter } = require('../../../../../platform/http/rate-limit');
const { runAgent } = require('../../../../../platform/ai/agent');
const { getRun: getAgentRun, updateRun: updateAgentRun, submitHumanReview } = require('../../../../../platform/ai/run-store');
const { AGENT_STATUS } = require('../../../../../shared/models/agent-run');
const {
  covenantsRequestSchema,
  covenantReviewSchema
} = require('../../schemas/agent');
const covenantsAgent     = require('../../../agents/covenants');

const router = Router();

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
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_COVENANTS),
  validate({ body: covenantsRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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
  authenticate,
  authorize(PERMISSIONS.AGENT_REVIEW),
  validate({ body: covenantReviewSchema }),
  async (req, res, next) => {
    try {
      const orgId  = req.orgId;
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

module.exports = router;
