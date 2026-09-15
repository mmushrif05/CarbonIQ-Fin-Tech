// @ts-check
/**
 * The assessment lifecycle routes for one candidate — Phase 1 Stages 4–6.
 *
 * The validation (the assessor's sign-off), the signable assessment report,
 * and the return-to-sponsor loop (gap list, return, return letter). These sit
 * apart from `pipeline.js` only so that neither file passes five hundred lines;
 * `registerAssessmentRoutes(router)` mounts them on the same pipeline router,
 * so they share its base path and there is one router, not two.
 */

'use strict';

const authenticate = require('../../../../../platform/auth/authenticate');
const { doc, body, str, obj, arr } = require('../../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const bool = require('../../../../../platform/http/openapi-hints').bool;
const validate = require('../../../../../platform/http/validate');
const { emptyBody } = require('../../../../../platform/http/validate').schemas;
const { gcfValidationSchema } = require('../../schemas/gcf');
const store = require('../../../infrastructure/store');
const criteria = require('../../../domain/criteria');
const validation = require('../../../domain/validation');
const returnLoop = require('../../../domain/return-loop');
const { logframe } = require('../../../domain/logframe');
const assessmentReport = require('../../../application/assessment-report');
const returnLetter = require('../../../application/return-letter');
const { sendPdf, sendDocx } = require('../../../../../platform/reporting/pdf-response');
const partcStore = require('../../../../../platform/database/store');
const handle = require('../../../../../platform/http/async-handler');

/** @param {import('express').Router} router */
function registerAssessmentRoutes(router) {
/**
 * The assessor's validation of a project — its state, ratings and sign-off,
 * read beside the engine's own evidence coverage of the six criteria so the
 * assessor's judgement sits next to what the record actually holds. A read: it
 * computes nothing and stores nothing.
 */
router.get('/pipeline/:id/validation', authenticate, defaultLimiter,
  doc({ summary: 'The assessor validation of a candidate — state, per-criterion ratings, recommendation and history',
    description: 'The assessor\'s validation beside the engine\'s six-criteria evidence coverage. A project '
      + 'never validated reads as a draft with nothing rated. A read; stores nothing.',
    response: body({ validation: obj, criteria: obj, source: str, sample: bool }, ['validation']) }),
  handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  res.json({ validation: validation.current(project), criteria: criteria.assess(project), source, sample });
}));

/**
 * One assessor change to the validation — start the review, rate a criterion,
 * record a recommendation, sign it off, or reopen it. The `validate` scope is
 * the assessor's alone (with the administrator through the ladder): the person
 * who prepares a submission does not validate it. The transition rules live in
 * `domain/validation.js`; the shipped sample is refused with the same 409 as a
 * stage move, because a validation is a fact about a recorded project.
 */
router.post('/pipeline/:id/validation', authenticate, defaultLimiter,
  validate({ body: gcfValidationSchema }),
  doc({ summary: 'Record an assessor validation change — start review, rate, recommend, validate or reopen',
    description: 'Requires the `validate` scope (the assessor\'s, and the administrator\'s through the ladder). '
      + '`to` names the target state and is omitted for a rating-only update; the lifecycle is '
      + 'draft → under_review → validated, reopened back to under_review. Ratings are words '
      + '(strong/adequate/weak), never a number; a recommendation is required to validate. Every change '
      + 'is a dated, attributed entry in the history. The shipped sample answers 409 `SAMPLE_NOT_EDITABLE`.',
    response: body({ project: obj, validation: obj, criteria: obj, storage: obj }, ['project', 'validation']) }),
  handle(async (req, res) => {
  const saved = await store.setValidation(req.orgId, req.params.id, req.body, { by: (req.actor && req.actor.label) || req.orgId });
  res.json({
    project: saved,
    validation: validation.current(saved),
    criteria: criteria.assess(saved),
    storage: partcStore.capability(),
  });
}));

/**
 * The signable GCF assessment report — the appraisal a committee reads and the
 * assessor signs. Built from the record, its validation and the engine's own
 * evidence coverage; a read that stores nothing. A draft is told apart from a
 * sign-off on the document's own face, so an unvalidated assessment is never
 * mistaken for a completed one.
 */
router.get('/pipeline/:id/assessment-report', authenticate, defaultLimiter,
  doc({ summary: 'The GCF assessment report for one candidate — JSON, PDF or Word',
    description: 'DFCC’s own appraisal: the six criteria with the assessor’s rating beside the '
      + 'engine’s evidence, the results logframe, the recommendation and a sign-off block naming the '
      + 'assessor and the date. Not a GCF decision. `?format=pdf|word` for a document; JSON by default. '
      + 'A read; stores nothing.',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    query: { format: 'json (default), pdf or word' },
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
  const { project } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  const ctx = { logframe: logframe(project) };
  const facts = assessmentReport.assessmentFacts(project, ctx);
  const format = req.query.format || 'json';
  if (format === 'word' || format === 'docx') {
    return sendDocx(res, await assessmentReport.assessmentDOCX(project, ctx), `${facts.safeName}.docx`, 'assessment');
  }
  if (format === 'pdf') {
    return sendPdf(res, assessmentReport.assessmentPDF(project, ctx), `${facts.safeName}.pdf`, 'assessment');
  }
  res.json({ report: assessmentReport.assessmentJSON(project, ctx) });
}));

/**
 * The return-to-sponsor state: the gap list, the resubmission comparison
 * against the last returned version, and the returns history. A read.
 */
router.get('/pipeline/:id/return', authenticate, defaultLimiter,
  doc({ summary: 'The return-to-sponsor state — the gap list, the resubmission comparison and the returns history',
    description: 'Gaps are drawn from the assessment: sub-criteria the record does not hold and criteria the '
      + 'assessor rated weak, each with a remedy. The comparison sorts today’s gaps against the last return '
      + 'into resolved, still-outstanding and newly-raised. A read; stores nothing.',
    response: body({ gaps: obj, comparison: obj, returns: arr(), source: str, sample: bool }, ['gaps', 'comparison']) }),
  handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  res.json({
    gaps: returnLoop.gaps(project),
    comparison: returnLoop.comparison(project),
    returns: validation.current(project).returns || [],
    source, sample,
  });
}));

/**
 * Record a return to the sponsor. The assessor's act (the `validate` scope):
 * the gap list is snapshotted so the resubmission comparison has a fixed point.
 * Refused unless the assessment is validated with a non-clean recommendation.
 */
router.post('/pipeline/:id/return', authenticate, validate({ body: emptyBody }), defaultLimiter,
  doc({ summary: 'Return a validated assessment to the sponsor, snapshotting the gap list',
    description: 'Requires the `validate` scope. Refused with 409 `NOTHING_TO_RETURN` unless the assessment is '
      + 'validated with a recommendation of "recommend with conditions" or "do not recommend". The shipped '
      + 'sample answers 409 `SAMPLE_NOT_EDITABLE`.',
    response: body({ project: obj, gaps: obj, comparison: obj, storage: obj }, ['project', 'gaps']) }),
  handle(async (req, res) => {
  const saved = await store.returnToSponsor(req.orgId, req.params.id, { by: (req.actor && req.actor.label) || req.orgId });
  res.json({
    project: saved,
    gaps: returnLoop.gaps(saved),
    comparison: returnLoop.comparison(saved),
    storage: partcStore.capability(),
  });
}));

/**
 * The return letter — the document the sponsor receives. Built from the gap
 * list; a read that stores nothing.
 */
router.get('/pipeline/:id/return-letter', authenticate, defaultLimiter,
  doc({ summary: 'The return-to-sponsor letter for one candidate — JSON, PDF or Word',
    description: 'The assessor’s decision, the gaps to address each with its remedy, and what happens next. '
      + 'A working document between DFCC and the sponsor, not a GCF decision. `?format=pdf|word`; JSON by default.',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    query: { format: 'json (default), pdf or word' },
    response: body({ letter: obj }, ['letter']) }),
  handle(async (req, res) => {
  const { project } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  const facts = returnLetter.letterFacts(project);
  const format = req.query.format || 'json';
  if (format === 'word' || format === 'docx') {
    return sendDocx(res, await returnLetter.letterDOCX(project), `${facts.safeName}.docx`, 'return-letter');
  }
  if (format === 'pdf') {
    return sendPdf(res, returnLetter.letterPDF(project), `${facts.safeName}.pdf`, 'return-letter');
  }
  res.json({ letter: returnLetter.letterJSON(project) });
}));
}

module.exports = { registerAssessmentRoutes };
