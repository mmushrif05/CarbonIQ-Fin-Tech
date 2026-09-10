// @ts-check
/**
 * Underwriting, origination and screening.
 */

'use strict';

const { Router } = require('express');

const authenticate    = require('../../../../../platform/auth/authenticate');
const validate      = require('../../../../../platform/http/validate');
const { authorize } = require('../../../../../platform/auth/authorization');
const { PERMISSIONS } = require('../../../../../shared/policies');
const { agentLimiter } = require('../../../../../platform/http/rate-limit');
const { runAgent, runAgentSingleCall } = require('../../../../../platform/ai/agent');
const {
  underwritingRequestSchema,
  screeningRequestSchema,
  originationRequestSchema
} = require('../../schemas/agent');
const underwritingAgent  = require('../../../agents/underwriting');
const screeningAgent     = require('../../../agents/screening');
const originationAgent   = require('../../../agents/origination');
const { asError } = require('../../../../../shared/types');
const { doc, body, str, bool, obj, orNull, arr } = require('../../../../../platform/http/openapi-hints');

const router = Router();

router.post('/underwrite',
  doc({ summary: 'Underwriting agent — live carbon tax rates and green bond pricing',
    description: 'The steps carry every tool call with its full input and output, which is '
      + "what makes the trail an audit trail: an agent's conclusion is only checkable if what "
      + 'it was told is recoverable.',
    response: body({
      success: bool, runId: str, agentType: str, status: str, result: orNull(obj),
      steps: arr(), tokensUsed: obj, metadata: obj, createdAt: str,
      completedAt: orNull(str), error: str,
    }, ['success', 'runId', 'status']) }),
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_UNDERWRITE),
  validate({ body: underwritingRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;

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

    } catch (thrown) {
      const err = asError(thrown);
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
  doc({ summary: 'Origination agent', response: body({
      success: bool, runId: str, agentType: str, status: str, result: orNull(obj),
      steps: arr(), tokensUsed: obj, metadata: obj, createdAt: str,
      completedAt: orNull(str), error: str,
    }, ['success', 'runId', 'status']) }),
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_ORIGINATE),
  validate({ body: originationRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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

    } catch (thrown) {
      const err = asError(thrown);
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
  doc({ summary: 'Screening agent — a single call, sized for speed over depth',
    response: body({
      success: bool, runId: str, agentType: str, status: str, result: orNull(obj),
      steps: arr(), tokensUsed: obj, metadata: obj, createdAt: str,
      completedAt: orNull(str), error: str,
    }, ['success', 'runId', 'status']) }),
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_SCREEN),
  validate({ body: screeningRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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
    } catch (thrown) {
      const err = asError(thrown);
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: 'Agentic AI is not configured.' });
      }
      next(err);
    }
  }
);

module.exports = router;
