// @ts-check
/**
 * Annual monitoring, and the portfolio report.
 */

'use strict';

const { Router } = require('express');

const authenticate    = require('../../../../../platform/auth/authenticate');
const validate      = require('../../../../../platform/http/validate');
const { authorize } = require('../../../../../platform/auth/authorization');
const { PERMISSIONS } = require('../../../../../shared/policies');
const { agentLimiter } = require('../../../../../platform/http/rate-limit');
const { runAgent } = require('../../../../../platform/ai/agent');
const {
  monitoringRequestSchema,
  portfolioReportRequestSchema
} = require('../../schemas/agent');
const monitoringAgent    = require('../../../agents/monitoring');
const portfolioAgent     = require('../../../agents/portfolio');
const { asError } = require('../../../../../shared/types');
const { doc, body, str, bool, obj, orNull, arr } = require('../../../../../platform/http/openapi-hints');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/agent/monitor
//
// Run the Covenant Monitoring Agent. Takes the agreed covenant package and
// current construction-stage metrics. Tests each KPI, projects trajectory
// to practical completion, and makes a Drawdown Recommendation.
// ---------------------------------------------------------------------------

router.post('/monitor',
  doc({ summary: 'Monitoring agent', response: body({
      success: bool, runId: str, agentType: str, status: str, result: orNull(obj),
      steps: arr(), tokensUsed: obj, metadata: obj, createdAt: str,
      completedAt: orNull(str), error: str,
    }, ['success', 'runId', 'status']) }),
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_MONITOR),
  validate({ body: monitoringRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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
    } catch (thrown) {
      const err = asError(thrown);
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
  doc({ summary: 'Portfolio agent', response: body({
      success: bool, runId: str, agentType: str, status: str, result: orNull(obj),
      steps: arr(), tokensUsed: obj, metadata: obj, createdAt: str,
      completedAt: orNull(str), error: str,
    }, ['success', 'runId', 'status']) }),
  authenticate,
  agentLimiter,
  authorize(PERMISSIONS.AGENT_PORTFOLIO),
  validate({ body: portfolioReportRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
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
