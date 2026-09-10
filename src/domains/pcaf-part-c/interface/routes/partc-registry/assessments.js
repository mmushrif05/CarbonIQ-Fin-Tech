// @ts-check
/**
 * Assessments and the reporting-year total.
 *
 * One calculation bound to a policy, a BOQ revision and a year. Lifecycle is
 * draft, under review, locked — and a locked assessment is never edited, only
 * superseded.
 */

'use strict';

const { Router } = require('express');
const { doc, body, str, bool, obj } = require('../../../../../platform/http/openapi-hints');
const authenticate   = require('../../../../../platform/auth/authenticate');
const { paged } = require('../../../../../platform/http/pagination');
const validate     = require('../../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const store    = require('../../../../../platform/database/store');
const assessments = require('../../../application/partc-assessments');
const { createAssessmentSchema, statusChangeSchema } = require('../../schemas/partc-assessment');
const handle = require('../../../../../platform/http/async-handler');

const router = Router();

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
  doc({ summary: 'Create an assessment bound to a policy, BOQ revision and reporting year',
    status: 201,
    description: 'The binding is what lets a figure in an annual disclosure be traced back to '
      + 'the bill of quantities behind it.',
    response: body({ assessment: obj, registers: obj }, ['assessment']) }),
  validate({ body: createAssessmentSchema }),
  handle(async (req, res) => {
    const { assessment, registers } = await assessments.createAssessment(req.orgId, req.body);
    res.status(201).json({ assessment, registers });
  }));

router.get('/assessments/:assessmentId', authenticate, defaultLimiter,
  doc({ summary: 'One assessment, bound to its policy, BOQ revision and reporting year',
    response: body({ assessment: obj }, ['assessment']) }),
  handle(async (req, res) => {
  const a = await assessments.getAssessment(req.orgId, req.params.assessmentId);
  if (!a) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND', message: `No assessment ${req.params.assessmentId}.` });
  res.json({ assessment: a });
}));

/** Move through draft → under review → locked. */
router.post('/assessments/:assessmentId/status', authenticate, defaultLimiter,
  doc({ summary: 'Move an assessment through draft, under review and locked',
    description: 'Only a locked assessment enters the disclosure, and a locked one is never '
      + 'edited — only superseded. Locking one version supersedes the previously locked one, '
      + 'so a policy-year never has two.',
    response: body({ assessment: obj }, ['assessment']) }),
  validate({ body: statusChangeSchema }),
  handle(async (req, res) => {
    const a = await assessments.changeStatus(
      req.orgId, req.params.assessmentId, req.body.status,
      { note: req.body.note, actor: (req.actor && req.actor.label) || req.orgId });
    res.json({ assessment: a });
  }));

router.delete('/assessments/:assessmentId', authenticate, defaultLimiter,
  doc({ summary: 'Remove an assessment',
    description: 'A locked assessment is never edited and never removed — it is superseded by '
      + 'a new version.',
    response: body({ deleted: bool, assessmentId: str }) }),
  handle(async (req, res) => {
  res.json(await assessments.deleteAssessment(req.orgId, req.params.assessmentId));
}));

/** Quick per-year counts. The full position is /portfolio/:year. */
router.get('/periods/:year', authenticate, defaultLimiter,
  doc({ summary: 'Locked totals, coverage and emissions-weighted data quality for a year',
    response: body({ period: obj }, ['period']) }),
  handle(async (req, res) => {
  res.json({ period: await assessments.yearSummary(req.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// Portfolio — what the insurer discloses for a reporting year
// ---------------------------------------------------------------------------

module.exports = router;
