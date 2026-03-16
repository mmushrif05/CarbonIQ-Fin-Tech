/**
 * CarbonIQ FinTech — API v1 Router
 *
 * Aggregates all v1 endpoints under /v1 prefix.
 * Each route file handles its own auth middleware.
 *
 * Endpoints:
 *   GET  /v1                              → API info
 *   POST /v1/assess                       → BOQ assessment
 *   GET  /v1/projects/:projectId          → Project carbon data
 *   GET  /v1/projects/:projectId/score    → Carbon Finance Score
 *   GET  /v1/projects/:projectId/taxonomy → Taxonomy alignment
 *   GET  /v1/projects/:projectId/pcaf     → PCAF-compliant output
 *   POST /v1/projects/:projectId/covenant → Covenant check
 *   GET  /v1/portfolio                    → Portfolio aggregation
 *   POST /v1/webhooks                     → Webhook registration
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
const extractRouter = require('./extract');
const agentRouter = require('./agent');

const router = Router();

// API info — no auth required
router.get('/', (_req, res) => {
  res.json({
    api: 'CarbonIQ FinTech',
    version: `v1 (${config.version})`,
    status: config.apiEnabled ? 'active' : 'disabled',
    endpoints: {
      extract: 'POST /v1/extract',
      assess: 'POST /v1/assess',
      project: 'GET /v1/projects/:projectId',
      score: 'GET /v1/projects/:projectId/score',
      taxonomy: 'GET /v1/projects/:projectId/taxonomy',
      pcaf: 'GET /v1/projects/:projectId/pcaf',
      covenant: 'POST /v1/projects/:projectId/covenant',
      portfolio: 'GET /v1/portfolio',
      webhooks: 'POST /v1/webhooks',
      agent: {
        screen:    'POST /v1/agent/screen',
        underwrite:'POST /v1/agent/underwrite',
        covenants: 'POST /v1/agent/covenants',
        runs:      'GET /v1/agent/runs',
        run:       'GET /v1/agent/runs/:runId'
      }
    },
    documentation: 'https://carboniq.online/docs/api'
  });
});

// Mount route modules
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

module.exports = router;
