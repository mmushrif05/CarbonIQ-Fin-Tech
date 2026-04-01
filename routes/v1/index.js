/**
 * CarbonIQ FinTech — API v1 Router
 *
 * Aggregates all v1 endpoints under /v1 prefix.
 * Each route file handles its own auth middleware.
 *
 * Endpoints:
 *   GET  /v1                                        → API info
 *   POST /v1/assess                                 → BOQ assessment
 *   POST /v1/projects                               → Create or update a fintech project
 *   GET  /v1/projects                               → List all projects for this org
 *   GET  /v1/projects/:projectId                    → Project carbon data
 *   GET  /v1/projects/:projectId/score              → Carbon Finance Score
 *   GET  /v1/projects/:projectId/taxonomy           → Taxonomy alignment
 *   GET  /v1/projects/:projectId/pcaf               → PCAF-compliant output
 *   POST /v1/projects/:projectId/covenant           → Covenant check
 *   POST /v1/projects/:projectId/monitoring         → Submit annual monitoring entry
 *   GET  /v1/projects/:projectId/monitoring         → List monitoring history
 *   GET  /v1/portfolio                              → Portfolio aggregation
 *   POST /v1/webhooks                               → Webhook registration
 */

const { Router } = require('express');
const config = require('../../config');

const assessRouter = require('./assess');
const projectsRouter = require('./projects');
const scoreRouter = require('./score');
const taxonomyRouter = require('./taxonomy');
const pcafRouter = require('./pcaf');
const covenantRouter = require('./covenant');
const portfolioRouter = require('./portfolio');
const webhookRouter = require('./webhook');
const extractRouter       = require('./extract');
const extractUploadRouter = require('./extract-upload');
const agentRouter         = require('./agent');
const supervisorRouter    = require('./supervisor');
const reportsRouter       = require('./reports');
const carbonPricingRouter = require('./carbon-pricing');

const router = Router();

// API info — no auth required
router.get('/', (_req, res) => {
  res.json({
    api: 'CarbonIQ FinTech',
    version: `v1 (${config.version})`,
    status: config.apiEnabled ? 'active' : 'disabled',
    endpoints: {
      extract:       'POST /v1/extract — text/CSV/JSON or PDF (pdfBase64 / fileId)',
      extractUpload: 'POST /v1/extract/upload — pre-upload a PDF to Files API, returns fileId',
      assess: 'POST /v1/assess',
      projectCreate: 'POST /v1/projects',
      projectList:   'GET /v1/projects',
      project: 'GET /v1/projects/:projectId',
      score: 'GET /v1/projects/:projectId/score',
      taxonomy: 'GET /v1/projects/:projectId/taxonomy',
      pcaf: 'GET /v1/projects/:projectId/pcaf',
      covenant: 'POST /v1/projects/:projectId/covenant',
      monitoring: {
        submit: 'POST /v1/projects/:id/monitoring',
        list:   'GET /v1/projects/:id/monitoring',
      },
      portfolio: 'GET /v1/portfolio',
      webhooks: 'POST /v1/webhooks',
      reports: {
        generate: 'POST /v1/reports/generate',
        types:    'GET /v1/reports/types',
      },
      carbonPricing: {
        calculate: 'POST /v1/carbon-pricing/calculate',
        rates:     'GET /v1/carbon-pricing/rates',
      },
      agent: {
        coach:     'POST /v1/agent/coach',
        triage:    'POST /v1/agent/triage',
        screen:    'POST /v1/agent/screen',
        underwrite:'POST /v1/agent/underwrite',
        covenants: 'POST /v1/agent/covenants',
        monitor:   'POST /v1/agent/monitor',
        portfolio: 'POST /v1/agent/portfolio',
        runs:      'GET /v1/agent/runs',
        run:       'GET /v1/agent/runs/:runId',
      },
      supervisor: {
        pipeline:     'POST /v1/supervisor/pipeline',
        pipelineGet:  'GET /v1/supervisor/pipeline/:pipelineId',
        pipelines:    'GET /v1/supervisor/pipelines',
        resume:       'POST /v1/supervisor/pipeline/:pipelineId/resume',
        templates:    'GET /v1/supervisor/templates',
      }
    },
    documentation: 'https://carboniq.online/docs/api'
  });
});

// Mount route modules
router.use('/extract', extractUploadRouter);
router.use('/extract', extractRouter);
router.use('/assess', assessRouter);
router.use('/projects', projectsRouter);
router.use('/projects', scoreRouter);
router.use('/projects', taxonomyRouter);
router.use('/projects', pcafRouter);
router.use('/projects', covenantRouter);
router.use('/portfolio', portfolioRouter);
router.use('/webhooks', webhookRouter);
router.use('/agent', agentRouter);
router.use('/supervisor', supervisorRouter);
router.use('/reports', reportsRouter);
router.use('/carbon-pricing', carbonPricingRouter);

module.exports = router;
