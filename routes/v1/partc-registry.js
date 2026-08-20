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
 *   GET      /v1/partc/portfolio/:year/comparatives  this year against last
 *   GET      /v1/partc/portfolio/:year/restatements  what has been restated
 *   GET      /v1/partc/disclosure/:year              annual disclosure — JSON, PDF or Word
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
const { sendPdf, sendDocx } = require('../../services/pdf-response');
const boq = require('../../services/partc-boq');
const assessments = require('../../services/partc-assessments');
const portfolio   = require('../../services/partc-portfolio');
const comparatives = require('../../services/partc-comparatives');
const disclosure   = require('../../services/partc-disclosure');

const {
  settingsSchema, clientSchema, clientUpdateSchema,
  projectSchema, projectUpdateSchema, policySchema
} = require('../../schemas/partc-registry');
const { boqRevisionSchema, compareRequestSchema } = require('../../schemas/partc-boq');
const { createAssessmentSchema, statusChangeSchema } = require('../../schemas/partc-assessment');

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
// Assessments
//
// One assessment is one PCAF calculation bound to a policy, a BOQ revision
// and a reporting year. Only a locked assessment enters the annual
// disclosure; a locked assessment is never edited, only superseded.
// ---------------------------------------------------------------------------

router.get('/assessments', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const list = await assessments.listAssessments(req.apiKey.orgId, {
    projectId: req.query.projectId, policyId: req.query.policyId,
    reportingYear: req.query.reportingYear, status: req.query.status
  });
  res.json({
    assessments: list,
    summary: {
      total: list.length,
      byStatus: list.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {})
    }
  });
}));

router.post('/assessments', apiKeyAuth, defaultLimiter,
  validate({ body: createAssessmentSchema }),
  handle(async (req, res) => {
    const { assessment, registers } = await assessments.createAssessment(req.apiKey.orgId, req.body);
    res.status(201).json({ assessment, registers });
  }));

router.get('/assessments/:assessmentId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const a = await assessments.getAssessment(req.apiKey.orgId, req.params.assessmentId);
  if (!a) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: `No assessment ${req.params.assessmentId}.` });
  res.json({ assessment: a });
}));

/** Move through draft → under review → locked. */
router.post('/assessments/:assessmentId/status', apiKeyAuth, defaultLimiter,
  validate({ body: statusChangeSchema }),
  handle(async (req, res) => {
    const a = await assessments.changeStatus(
      req.apiKey.orgId, req.params.assessmentId, req.body.status,
      { note: req.body.note, actor: req.apiKey.orgName || req.apiKey.orgId });
    res.json({ assessment: a });
  }));

router.delete('/assessments/:assessmentId', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json(await assessments.deleteAssessment(req.apiKey.orgId, req.params.assessmentId));
}));

/** Quick per-year counts. The full position is /portfolio/:year. */
router.get('/periods/:year', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ period: await assessments.yearSummary(req.apiKey.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// Portfolio — what the insurer discloses for a reporting year
// ---------------------------------------------------------------------------

router.get('/portfolio/:year', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ portfolio: await portfolio.rollUp(req.apiKey.orgId, req.params.year) });
}));

/** What to fix first, ranked by how much of the disclosed figure it moves. */
router.get('/portfolio/:year/dq-plan', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ plan: await portfolio.improvementPlan(req.apiKey.orgId, req.params.year) });
}));

/** Which emission factors to localise first, across the whole book. */
router.get('/portfolio/:year/factor-gaps', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ gaps: await portfolio.factorGapPriority(req.apiKey.orgId, req.params.year) });
}));

/**
 * This year against last year, with the prior figure stated on both bases
 * where it has since been restated.
 */
router.get('/portfolio/:year/comparatives', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ comparatives: await comparatives.compare(req.apiKey.orgId, req.params.year) });
}));

/** Every restatement recorded against a reporting year. */
router.get('/portfolio/:year/restatements', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ restatements: await comparatives.restatementsFor(req.apiKey.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// The annual disclosure — the document the insurer publishes
//
// Built from locked assessments only. Refused with a 409 when the year holds
// none, because an empty disclosure would read as a position of zero rather
// than as no position at all.
// ---------------------------------------------------------------------------
router.get('/disclosure/:year', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const orgId  = req.apiKey.orgId;
  const year   = req.params.year;
  const format = String(req.query.format || 'json').toLowerCase();

  if (!['json', 'pdf', 'docx'].includes(format)) {
    return res.status(400).json({
      error: 'UNSUPPORTED_FORMAT',
      message: `Format "${format}" is not supported.`,
      remedy: 'Use format=json, format=pdf or format=docx.'
    });
  }

  const d = await disclosure.buildAnnualDisclosure(orgId, year, {
    includeAuditTrail: req.query.auditTrail !== 'false'
  });

  const stem = `${String(d.meta.insurer || 'insurer').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-iae-fy${d.meta.reportingYear}`;

  if (format === 'json') return res.json({ disclosure: d });

  if (format === 'docx') {
    return sendDocx(res, await disclosure.buildDisclosureDOCX(d), `${stem}.docx`, 'annual disclosure');
  }

  return sendPdf(res, disclosure.buildDisclosurePDF(d), `${stem}.pdf`, 'annual disclosure');
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
