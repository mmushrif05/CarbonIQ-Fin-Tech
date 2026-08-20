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
const pcafPartCRouter     = require('./pcaf-partc');
const partcRegistryRouter = require('./partc-registry');

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
      pcafPartC: {
        note:    'Insurance-associated emissions. Separate scope from /v1/projects/:id/pcaf, which serves A1-A3 financed emissions for lending.',
        assess:  'POST /v1/pcaf/part-c/assess — insurance-associated emissions (A4/A5 + B1/B4/B7)',
        form:    'POST /v1/pcaf/part-c/form',
        report:  'POST /v1/pcaf/part-c/report — pdf | docx | json',
        factors:     'GET /v1/pcaf/part-c/factors',
        conformance: 'GET /v1/pcaf/part-c/conformance — rule, implementation and proving test',
        options: 'GET /v1/pcaf/part-c/options',
        runs:    'GET /v1/pcaf/part-c/runs',
        start:   'POST /v1/pcaf/part-c/runs/start — begin a run, pause for client input',
        resume:  'POST /v1/pcaf/part-c/runs/:runId/resume — supply answers, compute',
        agentIntake: 'POST /v1/pcaf/part-c/agent/intake',
        agentMap:      'POST /v1/pcaf/part-c/agent/map',
        agentDisclose: 'POST /v1/pcaf/part-c/agent/disclose',
      },
      partcRegistry: {
        note:     'Insurer book: settings, clients, projects and the policies written against them.',
        settings: 'GET/PUT /v1/partc/settings',
        clients:  'GET/POST /v1/partc/clients',
        projects: 'GET/POST /v1/partc/projects',
        policies: 'GET /v1/partc/policies — flattened book, filter by reportingYear',
        boq:      'GET/POST /v1/partc/projects/:projectId/boq — BOQ revisions',
        boqDiff:  'POST /v1/partc/projects/:projectId/boq/compare — line diff, emissions delta, restatement check',
        storage:  'GET /v1/partc/storage — what this deployment can persist',
      },
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
        coach:     'POST /v1/agent/coach    — AI Borrower Coaching (Stage 2: +32% completion rate)',
        triage:    'POST /v1/agent/triage   — Tiered Decision Framework (70-85% auto / 10-20% AI / 5-10% manual)',
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
router.use('/pcaf/part-c', pcafPartCRouter);
router.use('/partc', partcRegistryRouter);

module.exports = router;
