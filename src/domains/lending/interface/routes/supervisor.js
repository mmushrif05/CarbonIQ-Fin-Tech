// @ts-check
/**
 * CarbonIQ FinTech — Supervisor / Pipeline API Routes
 *
 * POST /v1/supervisor/pipeline                        → Create and run a multi-agent pipeline
 * POST /v1/supervisor/pipeline/:pipelineId/resume     → Resume a paused pipeline (human review)
 * GET  /v1/supervisor/pipeline/:pipelineId            → Get pipeline run detail
 * GET  /v1/supervisor/pipelines                       → List pipeline runs for this org
 * GET  /v1/supervisor/templates                       → List available pipeline templates
 *
 * The supervisor orchestrates multiple agents in dependency order, running
 * parallel stages where possible. Follows the AWS Bedrock / Confluent
 * multi-agent supervisor pattern.
 */

'use strict';

const { Router }      = require('express');
const authenticate      = require('../../../../platform/auth/authenticate');
const { listView, paged } = require('../../../../platform/http/pagination');
const { doc } = require('../../../../platform/http/openapi-hints');
const auth            = require('../../../../platform/auth/auth');
const validate        = require('../../../../platform/http/validate');
const { authorize }   = require('../../../../platform/auth/authorization');
const { agentLimiter } = require('../../../../platform/http/rate-limit');
const { PERMISSIONS }  = require('../../../../shared/policies');
const { PIPELINE_TEMPLATES, PIPELINE_STATUS } = require('../../../../shared/models/pipeline');
const { createAndRunPipeline, resumePipeline } = require('../../application/supervisor');
const { getPipelineRun, listPipelineRuns }     = require('../../infrastructure/lending-store');
const { buildSubject } = require('../../../../platform/auth/authorization');
const { createPipelineSchema, resumePipelineSchema } = require('../schemas/supervisor');
const { asError } = require('../../../../shared/types');

const router = Router();

// ---------------------------------------------------------------------------
// Dual-auth middleware — accept either JWT or API key
// ---------------------------------------------------------------------------

function dualAuth(req, res, next) {
  // Try API key first (X-API-Key header), then JWT (Authorization: Bearer)
  if (req.headers['x-api-key']) {
    return authenticate(req, res, next);
  }
  if (req.headers.authorization) {
    return auth(req, res, next);
  }
  return res.status(401).json({
    error: 'UNAUTHORIZED',
    message: 'Provide either X-API-Key or Authorization: Bearer <token> header.',
  });
}

// ---------------------------------------------------------------------------
// GET /v1/supervisor/templates — List available pipeline templates
// ---------------------------------------------------------------------------

router.get('/templates',
  dualAuth,
  (_req, res) => {
    const templates = Object.entries(PIPELINE_TEMPLATES).map(([id, t]) => ({
      templateId:  id,
      label:       t.label,
      description: t.description,
      stages:      t.stages.map(s => ({
        stageId:   s.stageId,
        agentType: s.agentType,
        requires:  s.requires,
        optional:  s.optional,
      })),
    }));

    return res.status(200).json({ success: true, templates });
  }
);

// ---------------------------------------------------------------------------
// POST /v1/supervisor/pipeline — Create and run a multi-agent pipeline
// ---------------------------------------------------------------------------

router.post('/pipeline',
  dualAuth,
  agentLimiter,
  authorize(PERMISSIONS.PIPELINE_CREATE),
  validate({ body: createPipelineSchema }),
  async (req, res, next) => {
    try {
      const subject = buildSubject(req);
      const orgId   = subject.orgId || 'unknown';

      const pipeline = await createAndRunPipeline({
        templateId: req.body.templateId,
        input:      req.body,
        subject,
        orgId,
        metadata: {
          projectName:  req.body.projectName  || null,
          buildingType: req.body.buildingType || null,
          region:       req.body.region       || 'Singapore',
        },
      });

      // Determine HTTP status based on pipeline outcome
      let httpStatus;
      switch (pipeline.status) {
        case PIPELINE_STATUS.COMPLETED: httpStatus = 200; break;
        case PIPELINE_STATUS.PAUSED:    httpStatus = 202; break; // Accepted, awaiting human review
        case PIPELINE_STATUS.FAILED:    httpStatus = 500; break;
        default:                        httpStatus = 200;
      }

      return res.status(httpStatus).json({
        success:     pipeline.status === PIPELINE_STATUS.COMPLETED || pipeline.status === PIPELINE_STATUS.PAUSED,
        pipelineId:  pipeline.pipelineId,
        templateId:  pipeline.templateId,
        status:      pipeline.status,
        stages:      pipeline.stages.map(s => ({
          stageId:     s.stageId,
          agentType:   s.agentType,
          status:      s.status,
          runId:       s.runId,
          error:       s.error,
          startedAt:   s.startedAt,
          completedAt: s.completedAt,
        })),
        tokensUsed:  pipeline.tokensUsed,
        createdAt:   pipeline.createdAt,
        completedAt: pipeline.completedAt,
        ...(pipeline.error && { error: pipeline.error }),
        ...(pipeline.status === PIPELINE_STATUS.PAUSED && {
          nextStep: 'Pipeline paused for human review. Resume via POST /v1/supervisor/pipeline/{pipelineId}/resume',
          pausedStage: pipeline.stages.find(s => s.status === 'paused')?.stageId,
        }),
      });

    } catch (thrown) {
      const err = asError(thrown);
      if (err.statusCode === 403) {
        return res.status(403).json({
          error:   'PIPELINE_AUTH_FAILED',
          message: err.message,
          denied:  /** @type {any} */ (err).denied,
        });
      }
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'Agentic AI is not configured. Contact your administrator.',
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/supervisor/pipeline/:pipelineId/resume — Resume a paused pipeline
// ---------------------------------------------------------------------------

router.post('/pipeline/:pipelineId/resume',
  dualAuth,
  authorize(PERMISSIONS.AGENT_REVIEW),
  validate({ body: resumePipelineSchema }),
  async (req, res, next) => {
    try {
      const subject    = buildSubject(req);
      const orgId      = subject.orgId || 'unknown';
      const pipelineId = req.params.pipelineId;

      const pipeline = await getPipelineRun(orgId, pipelineId);
      if (!pipeline) {
        return res.status(404).json({
          error:   'PIPELINE_NOT_FOUND',
          message: `Pipeline ${pipelineId} not found for this organisation.`,
        });
      }

      if (pipeline.status !== PIPELINE_STATUS.PAUSED) {
        return res.status(409).json({
          error:   'PIPELINE_NOT_PAUSED',
          message: `Pipeline ${pipelineId} has status '${pipeline.status}'. Resume is only valid when paused.`,
        });
      }

      const updated = await resumePipeline(
        pipeline,
        req.body.stageId,
        req.body.decision,
        orgId
      );

      return res.status(200).json({
        success:     true,
        pipelineId:  updated.pipelineId,
        status:      updated.status,
        stages:      updated.stages.map(s => ({
          stageId:     s.stageId,
          agentType:   s.agentType,
          status:      s.status,
          runId:       s.runId,
          error:       s.error,
          startedAt:   s.startedAt,
          completedAt: s.completedAt,
        })),
        tokensUsed:  updated.tokensUsed,
        completedAt: updated.completedAt,
        ...(updated.error && { error: updated.error }),
      });

    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/supervisor/pipeline/:pipelineId — Get pipeline run detail
// ---------------------------------------------------------------------------

router.get('/pipeline/:pipelineId',
  dualAuth,
  authorize(PERMISSIONS.PIPELINE_READ),
  async (req, res, next) => {
    try {
      const subject    = buildSubject(req);
      const orgId      = subject.orgId || 'unknown';
      const pipelineId = req.params.pipelineId;

      const pipeline = await getPipelineRun(orgId, pipelineId);
      if (!pipeline) {
        return res.status(404).json({
          error:   'PIPELINE_NOT_FOUND',
          message: `Pipeline ${pipelineId} not found for this organisation.`,
        });
      }

      return res.status(200).json({ success: true, pipeline });

    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/supervisor/pipelines — List pipeline runs for this org
// ---------------------------------------------------------------------------

router.get('/pipelines',
  dualAuth,
  authorize(PERMISSIONS.PIPELINE_READ),
  paged(),
  doc({ summary: 'Recent agent pipelines, newest first; twenty without a page' }),
  async (req, res, next) => {
    try {
      const subject = buildSubject(req);
      const orgId   = subject.orgId || 'unknown';
      const paging  = req.query.limit !== undefined || req.query.cursor !== undefined;
      const pipelines = await listPipelineRuns(orgId, paging ? 500 : 20);
      const view = listView(req, res, pipelines);

      return res.status(200).json({
        success: true,
        orgId,
        count:   view.items.length,
        ...(view.page ? { page: view.page } : {}),
        pipelines: view.items.map(p => ({
          pipelineId:  p.pipelineId,
          templateId:  p.templateId,
          status:      p.status,
          stageCount:  (p.stages || []).length,
          tokensUsed:  p.tokensUsed,
          metadata:    p.metadata,
          createdAt:   p.createdAt,
          completedAt: p.completedAt,
        })),
      });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
