// @ts-check
/**
 * Screening, the two rankings, the structures and the Concept Note package.
 *
 * A gate is not a score and the two ranked lists are never merged: adaptation
 * ranks on beneficiaries per dollar and never on carbon.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../../platform/auth/authenticate');
const { doc, body, str, bool, obj } = require('../../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const store = require('../../../infrastructure/store');
const screening = require('../../../domain/screening');
const instruments = require('../../../domain/instruments');
const cnPackage = require('../../../application/cn-package');
const { sendPdf, sendDocx } = require('../../../../../platform/reporting/pdf-response');
const handle = require('../../../../../platform/http/async-handler');

const { readWeights } = require('./shared');

const router = Router();

router.get('/screening', authenticate, defaultLimiter,
  doc({ summary: 'The accreditation gate: eligible, flagged, excluded',
    description: 'A gate, not a score. A category A project is excluded rather than '
      + 'down-ranked, because down-ranking drifts a pipeline towards projects that touch '
      + 'nobody. `flagged` exists because a finding is not always a verdict.',
    response: body({ screening: obj, source: str, sample: bool }, ['screening']) }),
  handle(async (req, res) => {
  const { projects, source, sample } = await store.list(req.orgId);
  res.json({
    screening: screening.screen(projects, { accreditation: store.seedMeta().accreditation }),
    source,
    sample,
  });
}));

/** Two ranked lists, never merged, on the weighting the reader set. */
router.get('/ranking', authenticate, defaultLimiter,
  doc({ summary: 'Two ranked lists, never merged, on the weighting the reader set',
    description: 'Adaptation never ranks on carbon: its impact metric is beneficiaries per '
      + 'dollar. Three of GCF\'s six investment criteria rest on judgements this system does '
      + 'not hold and are named unscored; a missing component is dropped and its weight '
      + 'renormalised, never scored zero.',
    response: body({ ranking: obj, accreditation: obj, source: str, sample: bool }, ['ranking']) }),
  handle(async (req, res) => {
  const weights = readWeights(req);
  const { projects, source, sample } = await store.list(req.orgId);
  res.json({
    ranking: screening.rank(projects, {
      accreditation: store.seedMeta().accreditation,
      weights,
    }),
    source,
    sample,
  });
}));

/**
 * The answer Lot 2 asks for: which two go forward, and why.
 *
 * Carries the runners-up with what would move them, the criteria that could not
 * be scored, and where the computed ranking disagrees with the recorded
 * selection — because a recommendation that hides its own limits is worth
 * nothing to the person who has to defend it.
 */
router.get('/recommendation', authenticate, defaultLimiter,
  doc({ summary: 'Which two, why, and what could not be weighed',
    response: body({ recommendation: obj, accreditation: obj, source: str, sample: bool }, ['recommendation']) }),
  handle(async (req, res) => {
  const weights = readWeights(req);
  const take = req.query.take === undefined ? undefined : Number(req.query.take);
  if (take !== undefined && (!Number.isInteger(take) || take < 1 || take > 10)) {
    return res.status(400).json({
      error: 'INVALID_TAKE',
      message: 'take must be a whole number between 1 and 10. The ToR asks for up to two.',
    });
  }
  const { projects, source, sample } = await store.list(req.orgId);
  res.json({
    recommendation: screening.recommend(projects, {
      accreditation: store.seedMeta().accreditation,
      weights,
      take,
    }),
    source,
    sample,
  });
}));

/** The seven structures across the pipeline, with the barrier nothing covers. */
router.get('/instruments', authenticate, defaultLimiter,
  doc({ summary: "Seven structures, and the pipeline's mandate gap",
    description: 'Coverage is always reported with what it leaves standing, because the '
      + 'uncovered barrier is what kills a deal. Minimum concessionality means a structuring '
      + 'answer can be that the project does not need GCF support.',
    response: body({ instruments: obj, accreditation: obj, source: str, sample: bool }, ['instruments']) }),
  handle(async (req, res) => {
  const { projects, source, sample } = await store.list(req.orgId);
  res.json({
    instruments: instruments.structurePipeline(projects, {
      accreditation: store.seedMeta().accreditation,
    }),
    source,
    sample,
  });
}));

router.get('/instruments/:id', authenticate, defaultLimiter,
  doc({ summary: 'The structure that fits one candidate, and the barrier it leaves standing',
    response: body({ structuring: obj, accreditation: obj, source: str, sample: bool }, ['structuring']) }),
  handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  res.json({
    structuring: instruments.structureFor(project, {
      accreditation: store.seedMeta().accreditation,
    }),
    source,
    sample,
  });
}));

/**
 * The Concept Note input package.
 *
 * Every input this system holds, in GCF Concept Note order, with each marked
 * held, partial or external. It does not write the Concept Note: a GCF
 * submission is an argument made by people who carry the institutional
 * commitments behind it, and software that drafted one would produce something
 * fluent and unsupported.
 */
router.get('/cn/:id', authenticate, defaultLimiter,
  doc({ summary: 'Concept Note input package — JSON, PDF or Word',
    description: 'It lays out every held input in GCF\'s section A-H order and marks each held, '
      + 'partial or external. It does not write the Concept Note. A package is never complete '
      + 'while an external input is outstanding.',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    response: body({ package: obj }, ['package']) }),
  handle(async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (!['json', 'pdf', 'docx'].includes(format)) {
    return res.status(400).json({
      error: 'INVALID_FORMAT',
      message: 'format must be json, pdf or docx.',
    });
  }

  const { project, sample } = await store.get(req.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }

  const pkg = cnPackage.buildPackage(project, {
    accreditation: store.seedMeta().accreditation,
    sample,
    sampleNote: store.seedMeta().sampleNote,
  });

  const stem = `gcf-concept-note-inputs-${project.code}`;
  if (format === 'docx') {
    return sendDocx(res, await cnPackage.buildPackageDOCX(pkg), `${stem}.docx`, 'CN input package');
  }
  if (format === 'pdf') {
    return sendPdf(res, cnPackage.buildPackagePDF(pkg), `${stem}.pdf`, 'CN input package');
  }
  return res.json({ package: pkg, sample });
}));

module.exports = router;
