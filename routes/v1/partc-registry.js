/**
 * CarbonIQ FinTech — PCAF Part C Registry Endpoints
 *
 * The insurer's book: settings, clients, and the projects and policies that
 * assessments are run against.
 *
 *   GET/PUT  /v1/partc/settings
 *   GET/POST /v1/partc/clients          ·  GET/PATCH/DELETE /clients/:clientId
 *   GET/POST /v1/partc/projects         ·  GET/PATCH/DELETE /projects/:projectId
 *   POST     /v1/partc/projects/:projectId/policies
 *   DELETE   /v1/partc/projects/:projectId/policies/:policyId
 *   GET      /v1/partc/policies                     flattened book, filterable by year
 *   GET      /v1/partc/projects/:projectId/policies/:policyId/context
 *   GET      /v1/partc/storage                      what this deployment can persist
 *
 * Storage honesty: on a serverless runtime with no Firebase configured, every
 * write is refused with a 503 rather than accepted and lost. GET /storage
 * reports the active mode so an operator can see it before trusting the app.
 */

'use strict';

const { Router }   = require('express');
const apiKeyAuth   = require('../../middleware/api-key');
const validate     = require('../../middleware/validate');
const { defaultLimiter } = require('../../middleware/rate-limit');

const registry = require('../../services/partc-registry');
const store    = require('../../services/partc-store');
const { seedDemoBook } = require('../../services/partc-demo-data');

const {
  settingsSchema, clientSchema, clientUpdateSchema,
  projectSchema, projectUpdateSchema, policySchema
} = require('../../schemas/partc-registry');

const router = Router();

/** Turn a service-thrown error carrying statusCode into a clean response. */
function fail(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.code || 'REGISTRY_ERROR',
    message: err.message,
    ...(err.remedy ? { remedy: err.remedy } : {})
  });
}

const handle = fn => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) { if (err.statusCode) return fail(res, err); next(err); }
};

// ---------------------------------------------------------------------------
// Storage capability
// ---------------------------------------------------------------------------
router.get('/storage', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json({ storage: store.capability() });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ settings: await registry.getSettings(req.apiKey.orgId) });
}));

router.put('/settings', apiKeyAuth, defaultLimiter,
  validate({ body: settingsSchema }),
  handle(async (req, res) => {
    res.json({ settings: await registry.saveSettings(req.apiKey.orgId, req.body) });
  }));

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
router.get('/clients', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ clients: await registry.listClients(req.apiKey.orgId) });
}));

router.post('/clients', apiKeyAuth, defaultLimiter,
  validate({ body: clientSchema }),
  handle(async (req, res) => {
    res.status(201).json({ client: await registry.createClient(req.apiKey.orgId, req.body) });
  }));

router.get('/clients/:clientId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const orgId = req.apiKey.orgId;
  const client = await registry.getClient(orgId, req.params.clientId);
  if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
  const projects = await registry.listProjects(orgId, { clientId: req.params.clientId });
  res.json({ client, projects });
}));

router.patch('/clients/:clientId', apiKeyAuth, defaultLimiter,
  validate({ body: clientUpdateSchema }),
  handle(async (req, res) => {
    const client = await registry.updateClient(req.apiKey.orgId, req.params.clientId, req.body);
    if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
    res.json({ client });
  }));

router.delete('/clients/:clientId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json(await registry.deleteClient(req.apiKey.orgId, req.params.clientId));
}));

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
router.get('/projects', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const projects = await registry.listProjects(req.apiKey.orgId, {
    clientId: req.query.clientId, reportingYear: req.query.reportingYear
  });
  res.json({ projects });
}));

router.post('/projects', apiKeyAuth, defaultLimiter,
  validate({ body: projectSchema }),
  handle(async (req, res) => {
    res.status(201).json({ project: await registry.createProject(req.apiKey.orgId, req.body) });
  }));

router.get('/projects/:projectId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const project = await registry.getProject(req.apiKey.orgId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
  res.json({ project });
}));

router.patch('/projects/:projectId', apiKeyAuth, defaultLimiter,
  validate({ body: projectUpdateSchema }),
  handle(async (req, res) => {
    const project = await registry.updateProject(req.apiKey.orgId, req.params.projectId, req.body);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    res.json({ project });
  }));

router.delete('/projects/:projectId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json(await registry.deleteProject(req.apiKey.orgId, req.params.projectId));
}));

// ---------------------------------------------------------------------------
// Policies on a project
// ---------------------------------------------------------------------------
router.post('/projects/:projectId/policies', apiKeyAuth, defaultLimiter,
  validate({ body: policySchema }),
  handle(async (req, res) => {
    const project = await registry.addPolicy(req.apiKey.orgId, req.params.projectId, req.body);
    res.status(201).json({ project });
  }));

router.delete('/projects/:projectId/policies/:policyId', apiKeyAuth, defaultLimiter,
  handle(async (req, res) => {
    const project = await registry.removePolicy(req.apiKey.orgId, req.params.projectId, req.params.policyId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    res.json({ project });
  }));

/** Everything the engine needs to assess this policy, assembled from the book. */
router.get('/projects/:projectId/policies/:policyId/context', apiKeyAuth, defaultLimiter,
  handle(async (req, res) => {
    const ctx = await registry.buildAssessmentContext(
      req.apiKey.orgId, req.params.projectId, req.params.policyId);
    if (!ctx) return res.status(404).json({ error: 'CONTEXT_NOT_FOUND', message: 'No such project or policy.' });
    res.json({ context: ctx });
  }));

// ---------------------------------------------------------------------------
// The flattened book
// ---------------------------------------------------------------------------
router.get('/policies', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const policies = await registry.listPolicies(req.apiKey.orgId, { reportingYear: req.query.reportingYear });
  const byYear = policies.reduce((acc, p) => {
    const y = p.reportingYear || 'unknown';
    acc[y] = (acc[y] || 0) + 1;
    return acc;
  }, {});
  res.json({
    policies,
    summary: {
      total: policies.length,
      byReportingYear: byYear,
      totalPremium: policies.reduce((n, p) => n + (Number(p.premium) || 0), 0),
      withUseStage: policies.filter(p => p.scope && p.scope.useStageApplies).length
    }
  });
}));

// ---------------------------------------------------------------------------
// POST /demo/seed — load the Ceylon Insurance demo book
//
// Present so the MVP can be demonstrated from the UI without a shell. Refuses
// when the organisation already holds clients, so it can never quietly
// duplicate a real book.
// ---------------------------------------------------------------------------
router.post('/demo/seed', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const orgId = req.apiKey.orgId;
  const existing = await registry.listClients(orgId);
  if (existing.length > 0 && req.body.force !== true) {
    return res.status(409).json({
      error: 'BOOK_NOT_EMPTY',
      message: `This organisation already holds ${existing.length} client(s). Seeding would duplicate them.`,
      remedy: 'Send { "force": true } to seed anyway, or remove the existing clients first.'
    });
  }
  const result = await seedDemoBook(registry, orgId);
  res.status(201).json({
    seeded: result.summary,
    insurer: result.settings.insurerName,
    storage: store.capability()
  });
}));

module.exports = router;
