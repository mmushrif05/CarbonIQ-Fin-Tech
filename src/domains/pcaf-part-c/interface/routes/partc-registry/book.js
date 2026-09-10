// @ts-check
/**
 * The insurer book: settings, clients, and the projects that carry the
 * policies.
 *
 * The hierarchy is deliberately flat — organisation, client, project — with no
 * broker, reinsurer or class-of-business level. Policies live on the project
 * because one building typically carries CAR through construction and then IDI
 * for ten years.
 */

'use strict';

const { Router } = require('express');
const { settingsSchema, clientSchema, clientUpdateSchema, projectSchema, projectUpdateSchema, policySchema } = require('../../schemas/partc-registry');
const { doc, recordOf, listOf, body, str, bool, obj, arr } = require('../../../../../platform/http/openapi-hints');
const authenticate   = require('../../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../../platform/http/pagination');
const validate     = require('../../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const registry = require('../../../application/partc-registry');
const store    = require('../../../../../platform/database/store');
const handle = require('../../../../../platform/http/async-handler');

const router = Router();

// ---------------------------------------------------------------------------
// Storage capability
// ---------------------------------------------------------------------------
router.get('/storage', authenticate, defaultLimiter,
  doc({ summary: 'What this deployment can actually persist',
    response: body({ storage: obj }, ['storage']) }),
  (_req, res) => {
  res.json({ storage: store.capability() });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', authenticate, defaultLimiter,
  doc({ summary: 'Insurer settings: reporting year, premium basis, restatement threshold',
    response: body({ settings: obj }, ['settings']) }),
  handle(async (req, res) => {
  res.json({ settings: await registry.getSettings(req.orgId) });
}));

router.put('/settings', authenticate, defaultLimiter,
  doc({ summary: 'Change the insurer settings',
    description: 'Base year, significance threshold and recalculation triggers live here and '
      + 'are printed in every report. Where no base year is set the report says so rather '
      + 'than implying the current year.',
    response: body({ settings: obj }, ['settings']) }),
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
  doc({ summary: 'Record an insured party', status: 201,
    response: body({ client: obj }, ['client']) }),
  validate({ body: clientSchema }),
  doc({ summary: 'Create an insured party', status: 201, response: { type: 'object', properties: { client: recordOf(clientSchema, 'clientId', {}, 'Client') } } }),
  handle(async (req, res) => {
    res.status(201).json({ client: await registry.createClient(req.orgId, req.body) });
  }));

router.get('/clients/:clientId', authenticate, defaultLimiter,
  doc({ summary: 'One insured party, with its projects',
    response: body({ client: obj, projects: arr() }, ['client']) }),
  handle(async (req, res) => {
  const orgId = req.orgId;
  const client = await registry.getClient(orgId, req.params.clientId);
  if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
  const projects = await registry.listProjects(orgId, { clientId: req.params.clientId });
  res.json({ client, projects });
}));

router.patch('/clients/:clientId', authenticate, defaultLimiter,
  doc({ summary: 'Change an insured party',
    response: body({ client: obj }, ['client']) }),
  validate({ body: clientUpdateSchema }),
  handle(async (req, res) => {
    const client = await registry.updateClient(req.orgId, req.params.clientId, req.body);
    if (!client) return res.status(404).json({ error: 'CLIENT_NOT_FOUND', message: `No client ${req.params.clientId}.` });
    res.json({ client });
  }));

router.delete('/clients/:clientId', authenticate, defaultLimiter,
  doc({ summary: 'Remove an insured party',
    description: 'Refused where anything is attached, and the refusal names what.',
    response: body({ deleted: bool, clientId: str }) }),
  handle(async (req, res) => {
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
  doc({ summary: 'Record an insured project', status: 201,
    response: body({ project: obj }, ['project']) }),
  validate({ body: projectSchema }),
  handle(async (req, res) => {
    res.status(201).json({ project: await registry.createProject(req.orgId, req.body) });
  }));

router.get('/projects/:projectId', authenticate, defaultLimiter,
  doc({ summary: 'One insured project, with its policies inline',
    response: body({ project: obj }, ['project']) }),
  handle(async (req, res) => {
  const project = await registry.getProject(req.orgId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
  res.json({ project });
}));

router.patch('/projects/:projectId', authenticate, defaultLimiter,
  doc({ summary: 'Change an insured project',
    response: body({ project: obj }, ['project']) }),
  validate({ body: projectUpdateSchema }),
  handle(async (req, res) => {
    const project = await registry.updateProject(req.orgId, req.params.projectId, req.body);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    res.json({ project });
  }));

router.delete('/projects/:projectId', authenticate, defaultLimiter,
  doc({ summary: 'Remove a project',
    description: 'A project carrying a bill of quantities cannot be deleted, and the refusal '
      + 'names what is attached.',
    response: body({ deleted: bool, projectId: str }) }),
  handle(async (req, res) => {
  res.json(await registry.deleteProject(req.orgId, req.params.projectId));
}));

// ---------------------------------------------------------------------------
// Policies on a project
// ---------------------------------------------------------------------------
router.post('/projects/:projectId/policies', authenticate, defaultLimiter,
  doc({ summary: 'Add a policy to a project', status: 201,
    description: "A policy's reporting year is its inception year. Policies live on the "
      + 'project because one building typically carries CAR through construction and then '
      + 'IDI for ten years.',
    response: body({ project: obj }, ['project']) }),
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
  doc({ summary: 'Everything a run needs about one policy, resolved',
    response: body({ context: obj }, ['context']) }),
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

module.exports = router;
