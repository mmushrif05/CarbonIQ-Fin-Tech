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
const pcafPartARouter     = require('./pcaf-parta');
const partcRegistryRouter = require('./partc-registry');
const capitalRouter       = require('./capital');
const gcfRouter           = require('./gcf');
const deskRouter          = require('./desk');
const ndcSdgRouter        = require('./ndc-sdg');
const uiConfigRouter      = require('./ui-config');

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
      pcafPartA: {
        note:      'Financed emissions — the lender\'s scope 3 Category 15. Separate engine and separate scope from Part C.',
        reference: 'GET /v1/pcaf/part-a/reference — asset classes, archetypes and the data-quality options for each',
        assess:    'POST /v1/pcaf/part-a/assess — attribute one exposure and score its data quality',
      },
      pcafPartC: {
        note:    'Insurance-associated emissions. Separate scope from /v1/projects/:id/pcaf, which serves A1-A3 financed emissions for lending.',
        assess:  'POST /v1/pcaf/part-c/assess — insurance-associated emissions (A4/A5 + B1/B4/B7)',
        form:    'POST /v1/pcaf/part-c/form',
        report:  'POST /v1/pcaf/part-c/report — pdf | docx | json',
        factors:     'GET /v1/pcaf/part-c/factors',
        conformance: 'GET /v1/pcaf/part-c/conformance — rule, implementation and proving test',
        methodology: 'GET /v1/pcaf/part-c/methodology?format=json|pdf|docx — scope, equations, factors, worked example and limits',
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
        assessments: 'GET/POST /v1/partc/assessments — bound to policy, BOQ revision and year',
        lifecycle:   'POST /v1/partc/assessments/:id/status — draft | under_review | locked',
        period:      'GET /v1/partc/periods/:year — locked totals, coverage, weighted data quality',
        portfolio:   'GET /v1/partc/portfolio/:year — the reporting-year position',
        dqPlan:      'GET /v1/partc/portfolio/:year/dq-plan — ranked improvement actions',
        factorGaps:  'GET /v1/partc/portfolio/:year/factor-gaps — which factors to localise first',
        comparatives: 'GET /v1/partc/portfolio/:year/comparatives — this year against last, on a comparable basis',
        restatements: 'GET /v1/partc/portfolio/:year/restatements — as previously reported vs as restated',
        disclosure:   'GET /v1/partc/disclosure/:year?format=json|pdf|docx — the annual disclosure',
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
        // Each value is the route alone. A description belongs in `notes`
        // beside it: consumers read these strings as addresses, and appending
        // prose to one changes the address.
        notes: {
          coach:  'AI Borrower Coaching — guides an incomplete application towards a submittable one.',
          triage: 'Tiered Decision Framework — expected distribution 70-85% automated, 10-20% AI-assisted, 5-10% manual.',
        },
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
      },
      ndcSdg: {
        assess:            'POST /v1/ndc-sdg/assess',
        certificate:       'POST /v1/ndc-sdg/certificate',
        verifyCertificate: 'POST /v1/ndc-sdg/certificate/verify',
        framework:         'GET /v1/ndc-sdg/framework',
      },
    },
    documentation: 'https://carboniqfintech.netlify.app/docs/api'
  });
});

// No auth — this is the request that supplies the credential for every
// request after it, so it cannot itself require one.
router.use('/', uiConfigRouter);

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
/* Part A is financed emissions for lending; Part C is insurance-associated
   emissions. Separate mounts, separate engines, never merged. */
router.use('/pcaf/part-a', pcafPartARouter);
router.use('/partc', partcRegistryRouter);
router.use('/capital', capitalRouter);
router.use('/gcf', gcfRouter);
router.use('/desk', deskRouter);
router.use('/ndc-sdg', ndcSdgRouter);

module.exports = router;
