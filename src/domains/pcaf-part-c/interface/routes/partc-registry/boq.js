// @ts-check
/**
 * Bills of quantities: revisions, and the comparison between two of them.
 *
 * A bill is never final, so a project holds a series and an assessment binds to
 * exactly one. A comparison holds every non-BOQ input constant, so the movement
 * is attributable to the bill alone.
 */

'use strict';

const { Router } = require('express');
const { doc, body, str, bool, obj } = require('../../../../../platform/http/openapi-hints');
const authenticate   = require('../../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../../platform/http/pagination');
const validate     = require('../../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const registry = require('../../../application/partc-registry');
const boq = require('../../../application/partc-boq');
const { boqRevisionSchema, compareRequestSchema } = require('../../schemas/partc-boq');
const handle = require('../../../../../platform/http/async-handler');

const router = Router();

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
  doc({ summary: 'Add a BOQ revision', status: 201,
    description: 'A revision inherits the previous one\'s factor mappings, stable ids and '
      + 'haul distances, so only genuinely new lines need review. Match keys ignore the '
      + 'quantity — a revision exists because quantities changed.',
    response: body({ revision: obj }, ['revision']) }),
  validate({ body: boqRevisionSchema }),
  handle(async (req, res) => {
    const project = await registry.getProject(req.orgId, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND', message: `No project ${req.params.projectId}.` });
    const revision = await boq.createRevision(req.orgId, req.params.projectId, req.body);
    res.status(201).json({ revision });
  }));

router.get('/boq/:revisionId', authenticate, defaultLimiter,
  doc({ summary: 'One BOQ revision',
    response: body({ revision: obj }, ['revision']) }),
  handle(async (req, res) => {
  const revision = await boq.getRevision(req.orgId, req.params.revisionId);
  if (!revision) return res.status(404).json({ error: 'REVISION_NOT_FOUND', message: `No BOQ revision ${req.params.revisionId}.` });
  res.json({ revision });
}));

router.delete('/boq/:revisionId', authenticate, defaultLimiter,
  doc({ summary: 'Remove a BOQ revision',
    response: body({ deleted: bool, revisionId: str }) }),
  handle(async (req, res) => {
  res.json(await boq.deleteRevision(req.orgId, req.params.revisionId));
}));

/**
 * Compare two revisions with every non-BOQ input held constant, so the
 * movement is attributable to the bill of quantities and nothing else.
 */
router.post('/projects/:projectId/boq/compare', authenticate, defaultLimiter,
  doc({ summary: 'Line diff, emissions delta and restatement check between two revisions',
    description: 'Every non-BOQ input is held constant, so the movement is attributable to '
      + 'the bill of quantities alone.',
    response: body({ comparison: obj, policy: obj }, ['comparison']) }),
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

module.exports = router;
