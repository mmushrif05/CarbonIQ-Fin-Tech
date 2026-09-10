// @ts-check
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
const authenticate   = require('../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../platform/http/pagination');
const { doc, recordOf, listOf } = require('../../../../platform/http/openapi-hints');
const validate     = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');

const registry = require('../../application/partc-registry');
const store    = require('../../../../platform/database/store');
const { seedDemoBook } = require('../../application/partc-demo-data');
const { sendPdf, sendDocx } = require('../../../../platform/reporting/pdf-response');
const boq = require('../../application/partc-boq');
const assessments = require('../../application/partc-assessments');
const portfolio   = require('../../application/partc-portfolio');
const comparatives = require('../../application/partc-comparatives');
const disclosure   = require('../../application/partc-disclosure');

const {
  settingsSchema, clientSchema, clientUpdateSchema,
  projectSchema, projectUpdateSchema, policySchema
} = require('../schemas/partc-registry');
const { boqRevisionSchema, compareRequestSchema } = require('../schemas/partc-boq');
const { createAssessmentSchema, statusChangeSchema } = require('../schemas/partc-assessment');

const router = Router();

const handle = require('../../../../platform/http/async-handler');
const { numberOr } = require('../../../../shared/numbers');

// ---------------------------------------------------------------------------
// Storage capability
// ---------------------------------------------------------------------------
router.get('/storage', authenticate, defaultLimiter, (_req, res) => {
  res.json({ storage: store.capability() });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ settings: await registry.getSettings(req.orgId) });
}));

router.put('/settings', authenticate, defaultLimiter,
  validate({ body: settingsSchema }),
  handle(async (req, res) => {
    res.json({ settings: await registry.saveSettings(req.orgId, req.body) });
  }));

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
router.get('/clients', authenticate, defaultLimiter, paged(),
  doc({ summary: 'List insured parties', response: listOf('clients', recordOf(clientSchema, 'clientId', {}, 'Client')) }),
  handle(async (req, res) => {
    sendList(req, res, 'clients', await registry.listClients(req.orgId));
  }));

router.post('/clients', authenticate, defaultLimiter,
  validate({ body: clientSchema }),
  doc({ summary: 'Create an insured party', status: 201, response: { type: 'object', properties: { client: recordOf(clientSchema, 'clientId', {}, 'Client') } } }),
  handle(async (req, res) => {
    res.status(201).json({ client: await registry.createClient(req.orgId, req.body) });
  }));

router.get('/clients/:clientId', authenticate, defaultLimiter, handle(async (req, res) => {
  const orgId = req.orgId;
  const client = await registry.getClient(orgId, req.params.clientId);
  if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
  const projects = await registry.listProjects(orgId, { clientId: req.params.clientId });
  res.json({ client, projects });
}));

router.patch('/clients/:clientId', authenticate, defaultLimiter,
  validate({ body: clientUpdateSchema }),
  handle(async (req, res) => {
    const client = await registry.updateClient(req.orgId, req.params.clientId, req.body);
    if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
    res.json({ client });
  }));

router.delete('/clients/:clientId', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json(await registry.deleteClient(req.orgId, req.params.clientId));
}));

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
router.get('/projects', authenticate, defaultLimiter, paged('clientId', 'reportingYear'),
  doc({ summary: 'List projects, with their policies inline', response: listOf('projects', recordOf(projectSchema, 'projectId', { clientName: { type: 'string' }, policies: { type: 'array', items: recordOf(policySchema, 'policyId', {}, 'Policy') } }, 'Project')) }),
  handle(async (req, res) => {
    /* `limit` asks for a page; without it the whole list comes back as it
       always has. A page carries the cursor for the next one and nothing else
       changes shape. On the store's own keyset where the filter is a key it
       indexes; filtering by reporting year reads inside the policies array,
       so that page is cut from the list. */
    if (req.query.limit !== undefined && !req.query.reportingYear) {
      const where = req.query.clientId ? { clientId: req.query.clientId } : {};
      const pg = await store.page('projects', req.orgId, { limit: req.query.limit, cursor: req.query.cursor, where });
      const page = { limit: pg.limit, nextCursor: pg.nextCursor, hasMore: pg.nextCursor !== null };
      res.locals.page = page;
      return res.json({ projects: pg.items, page });
    }
    const projects = await registry.listProjects(req.orgId, {
      clientId: req.query.clientId, reportingYear: req.query.reportingYear
    });
    sendList(req, res, 'projects', projects);
  }));

router.post('/projects', authenticate, defaultLimiter,
  validate({ body: projectSchema }),
  handle(async (req, res) => {
    res.status(201).json({ project: await registry.createProject(req.orgId, req.body) });
  }));

router.get('/projects/:projectId', authenticate, defaultLimiter, handle(async (req, res) => {
  const project = await registry.getProject(req.orgId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
  res.json({ project });
}));

router.patch('/projects/:projectId', authenticate, defaultLimiter,
  validate({ body: projectUpdateSchema }),
  handle(async (req, res) => {
    const project = await registry.updateProject(req.orgId, req.params.projectId, req.body);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    res.json({ project });
  }));

router.delete('/projects/:projectId', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json(await registry.deleteProject(req.orgId, req.params.projectId));
}));

// ---------------------------------------------------------------------------
// Policies on a project
// ---------------------------------------------------------------------------
router.post('/projects/:projectId/policies', authenticate, defaultLimiter,
  validate({ body: policySchema }),
  handle(async (req, res) => {
    const project = await registry.addPolicy(req.orgId, req.params.projectId, req.body);
    res.status(201).json({ project });
  }));

router.delete('/projects/:projectId/policies/:policyId', authenticate, defaultLimiter,
  handle(async (req, res) => {
    const project = await registry.removePolicy(req.orgId, req.params.projectId, req.params.policyId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    res.json({ project });
  }));

/** Everything the engine needs to assess this policy, assembled from the book. */
router.get('/projects/:projectId/policies/:policyId/context', authenticate, defaultLimiter,
  handle(async (req, res) => {
    const ctx = await registry.buildAssessmentContext(
      req.orgId, req.params.projectId, req.params.policyId);
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

router.get('/projects/:projectId/boq', authenticate, defaultLimiter, paged(),
  doc({ summary: 'List the bill-of-quantities revisions of a project, oldest first' }),
  handle(async (req, res) => {
  const revisions = await boq.listRevisions(req.orgId, req.params.projectId);
  sendList(req, res, 'revisions', revisions, {
    summary: {
      count: revisions.length,
      latest: revisions.length ? revisions[revisions.length - 1].label : null,
      needsReview: revisions.length
        ? revisions[revisions.length - 1].mappingCarryForward.needsReview.length : 0
    }
  });
  }));

router.post('/projects/:projectId/boq', authenticate, defaultLimiter,
  validate({ body: boqRevisionSchema }),
  handle(async (req, res) => {
    const project = await registry.getProject(req.orgId, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    const revision = await boq.createRevision(req.orgId, req.params.projectId, req.body);
    res.status(201).json({ revision });
  }));

router.get('/boq/:revisionId', authenticate, defaultLimiter, handle(async (req, res) => {
  const revision = await boq.getRevision(req.orgId, req.params.revisionId);
  if (!revision) return res.status(404).json({ error: 'REVISION_NOT_FOUND', message: `No BOQ revision ${req.params.revisionId}.` });
  res.json({ revision });
}));

router.delete('/boq/:revisionId', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json(await boq.deleteRevision(req.orgId, req.params.revisionId));
}));

/**
 * Compare two revisions with every non-BOQ input held constant, so the
 * movement is attributable to the bill of quantities and nothing else.
 */
router.post('/projects/:projectId/boq/compare', authenticate, defaultLimiter,
  validate({ body: compareRequestSchema }),
  handle(async (req, res) => {
    const orgId = req.orgId;
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
    if (!ctx) return res.status(409).json({
      error: 'NO_ASSESSMENT_CONTEXT',
      message: 'The project and policy could not be resolved into an engine input, so the two revisions cannot be compared on a constant basis.',
      remedy: 'Check the policy is still on this project and carries a premium, a sum insured and a period.',
    });

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

router.get('/assessments', authenticate, defaultLimiter, paged('projectId', 'policyId', 'reportingYear', 'status'),
  doc({ summary: 'List assessments — each bound to a policy, a BOQ revision and a reporting year' }),
  handle(async (req, res) => {
  if (req.query.limit !== undefined) {
    /** @type {Record<string, any>} */
    const where = {};
    if (req.query.projectId) where.projectId = req.query.projectId;
    if (req.query.policyId) where.policyId = req.query.policyId;
    if (req.query.reportingYear) where.reportingYear = Number(req.query.reportingYear);
    if (req.query.status) where.status = req.query.status;
    const pg = await store.page(assessments.COLLECTION, req.orgId, { limit: req.query.limit, cursor: req.query.cursor, where });
    const page = { limit: pg.limit, nextCursor: pg.nextCursor, hasMore: pg.nextCursor !== null };
    res.locals.page = page;
    return res.json({ assessments: pg.items, page });
  }
  const list = await assessments.listAssessments(req.orgId, {
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

router.post('/assessments', authenticate, defaultLimiter,
  validate({ body: createAssessmentSchema }),
  handle(async (req, res) => {
    const { assessment, registers } = await assessments.createAssessment(req.orgId, req.body);
    res.status(201).json({ assessment, registers });
  }));

router.get('/assessments/:assessmentId', authenticate, defaultLimiter, handle(async (req, res) => {
  const a = await assessments.getAssessment(req.orgId, req.params.assessmentId);
  if (!a) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: `No assessment ${req.params.assessmentId}.` });
  res.json({ assessment: a });
}));

/** Move through draft → under review → locked. */
router.post('/assessments/:assessmentId/status', authenticate, defaultLimiter,
  validate({ body: statusChangeSchema }),
  handle(async (req, res) => {
    const a = await assessments.changeStatus(
      req.orgId, req.params.assessmentId, req.body.status,
      { note: req.body.note, actor: (req.actor && req.actor.label) || req.orgId });
    res.json({ assessment: a });
  }));

router.delete('/assessments/:assessmentId', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json(await assessments.deleteAssessment(req.orgId, req.params.assessmentId));
}));

/** Quick per-year counts. The full position is /portfolio/:year. */
router.get('/periods/:year', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ period: await assessments.yearSummary(req.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// Portfolio — what the insurer discloses for a reporting year
// ---------------------------------------------------------------------------

router.get('/portfolio/:year', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ portfolio: await portfolio.rollUp(req.orgId, req.params.year) });
}));

/** What to fix first, ranked by how much of the disclosed figure it moves. */
router.get('/portfolio/:year/dq-plan', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ plan: await portfolio.improvementPlan(req.orgId, req.params.year) });
}));

/** Which emission factors to localise first, across the whole book. */
router.get('/portfolio/:year/factor-gaps', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ gaps: await portfolio.factorGapPriority(req.orgId, req.params.year) });
}));

/**
 * This year against last year, with the prior figure stated on both bases
 * where it has since been restated.
 */
router.get('/portfolio/:year/comparatives', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ comparatives: await comparatives.compare(req.orgId, req.params.year) });
}));

/** Every restatement recorded against a reporting year. */
router.get('/portfolio/:year/restatements', authenticate, defaultLimiter, handle(async (req, res) => {
  res.json({ restatements: await comparatives.restatementsFor(req.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// The annual disclosure — the document the insurer publishes
//
// Built from locked assessments only. Refused with a 409 when the year holds
// none, because an empty disclosure would read as a position of zero rather
// than as no position at all.
// ---------------------------------------------------------------------------
router.get('/disclosure/:year', authenticate, defaultLimiter, handle(async (req, res) => {
  const orgId  = req.orgId;
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
router.get('/policies', authenticate, defaultLimiter, paged('reportingYear'),
  doc({ summary: 'The flattened book: every policy with its project and client', response: listOf('policies', recordOf(policySchema, 'policyId', { projectId: { type: 'string' }, clientId: { type: 'string' } }, 'BookPolicy'), { summary: { type: 'object', additionalProperties: true } }) }),
  handle(async (req, res) => {
  const policies = await registry.listPolicies(req.orgId, { reportingYear: req.query.reportingYear });
  const byYear = policies.reduce((acc, p) => {
    const y = p.reportingYear || 'unknown';
    acc[y] = (acc[y] || 0) + 1;
    return acc;
  }, {});
  sendList(req, res, 'policies', policies, {
    summary: {
      total: policies.length,
      byReportingYear: byYear,
      totalPremium: policies.reduce((n, p) => n + numberOr(p.premium), 0),
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
router.post('/demo/seed', authenticate, defaultLimiter, handle(async (req, res) => {
  const orgId = req.orgId;
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
