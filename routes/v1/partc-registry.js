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
const boq = require('../../services/partc-boq');

const {
  settingsSchema, clientSchema, clientUpdateSchema,
  projectSchema, projectUpdateSchema, policySchema
} = require('../../schemas/partc-registry');
const { boqRevisionSchema, compareRequestSchema } = require('../../schemas/partc-boq');

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
// BOQ revisions
//
// A bill of quantities is never final: tender, then variation orders, then
// as-built. Each revision inherits the mappings of the one before it, so only
// genuinely new lines need a human.
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/boq', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const revisions = await boq.listRevisions(req.apiKey.orgId, req.params.projectId);
  res.json({
    revisions,
    summary: {
      count: revisions.length,
      latest: revisions.length ? revisions[revisions.length - 1].label : null,
      needsReview: revisions.length
        ? revisions[revisions.length - 1].mappingCarryForward.needsReview.length : 0
    }
  });
}));

router.post('/projects/:projectId/boq', apiKeyAuth, defaultLimiter,
  validate({ body: boqRevisionSchema }),
  handle(async (req, res) => {
    const project = await registry.getProject(req.apiKey.orgId, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    const revision = await boq.createRevision(req.apiKey.orgId, req.params.projectId, req.body);
    res.status(201).json({ revision });
  }));

router.get('/boq/:revisionId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const revision = await boq.getRevision(req.apiKey.orgId, req.params.revisionId);
  if (!revision) return res.status(404).json({ error: 'REVISION_NOT_FOUND', message: `No BOQ revision ${req.params.revisionId}.` });
  res.json({ revision });
}));

router.delete('/boq/:revisionId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json(await boq.deleteRevision(req.apiKey.orgId, req.params.revisionId));
}));

/**
 * Compare two revisions with every non-BOQ input held constant, so the
 * movement is attributable to the bill of quantities and nothing else.
 */
router.post('/projects/:projectId/boq/compare', apiKeyAuth, defaultLimiter,
  validate({ body: compareRequestSchema }),
  handle(async (req, res) => {
    const orgId = req.apiKey.orgId;
    const { projectId } = req.params;

    const project = await registry.getProject(orgId, projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${projectId}.` });

    const revisions = await boq.listRevisions(orgId, projectId);
    const to = revisions.find(r => r.revisionId === req.body.toRevisionId);
    if (!to) return res.status(404).json({ error: 'REVISION_NOT_FOUND', message: `No revision ${req.body.toRevisionId} on this project.` });

    let from;
    if (req.body.fromRevisionId) {
      from = revisions.find(r => r.revisionId === req.body.fromRevisionId);
      if (!from) return res.status(404).json({ error: 'REVISION_NOT_FOUND', message: `No revision ${req.body.fromRevisionId} on this project.` });
    } else {
      const idx = revisions.findIndex(r => r.revisionId === to.revisionId);
      from = idx > 0 ? revisions[idx - 1] : null;
      if (!from) return res.status(400).json({
        error: 'NO_PRIOR_REVISION',
        message: `${to.label} is the first revision on this project, so there is nothing to compare it against.`
      });
    }

    const settings = await registry.getSettings(orgId);
    const policies = project.policies || [];
    const policy = req.body.policyId
      ? policies.find(p => p.policyId === req.body.policyId)
      : policies[0];
    if (!policy) return res.status(400).json({
      error: 'NO_POLICY',
      message: 'This project has no policy, so an attribution factor cannot be applied to the comparison.'
    });

    const ctx = await registry.buildAssessmentContext(orgId, projectId, policy.policyId);

    const comparison = boq.compareRevisions({
      from, to,
      enginePolicy: ctx.enginePolicy,
      siteInputs: {
        gifa_m2: req.body.siteInputs.gifa_m2 || project.gifa_m2,
        demolitionKm: req.body.siteInputs.demolitionKm,
        wasteDisposalKm: req.body.siteInputs.wasteDisposalKm,
        previousProject: req.body.siteInputs.previousProject || null
      },
      distances: req.body.distances,
      thresholdPct: settings.restatementThresholdPct
    });

    res.json({ comparison, policy: { policyId: policy.policyId, lineType: policy.lineType, reportingYear: policy.reportingYear } });
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
  const result = await seedDemoBook(registry, orgId, boq);
  res.status(201).json({
    seeded: result.summary,
    insurer: result.settings.insurerName,
    storage: store.capability()
  });
}));

module.exports = router;
