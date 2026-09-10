// @ts-check
/**
 * The reporting-year position and the document published from it.
 *
 * Built from locked assessments only. A year holding none is refused rather
 * than rendered as a position of zero.
 */

'use strict';

const { Router } = require('express');
const { policySchema, demoSeedSchema } = require('../../schemas/partc-registry');
const { doc, recordOf, listOf, body, str, obj } = require('../../../../../platform/http/openapi-hints');
const authenticate   = require('../../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../../platform/http/pagination');
const validate     = require('../../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const registry = require('../../../application/partc-registry');
const store    = require('../../../../../platform/database/store');
const { seedDemoBook } = require('../../../application/partc-demo-data');
const { sendPdf, sendDocx } = require('../../../../../platform/reporting/pdf-response');
const boq = require('../../../application/partc-boq');
const portfolio   = require('../../../application/partc-portfolio');
const comparatives = require('../../../application/partc-comparatives');
const disclosure   = require('../../../application/partc-disclosure');
const handle = require('../../../../../platform/http/async-handler');
const { numberOr } = require('../../../../../shared/numbers');

const router = Router();


router.get('/portfolio/:year', authenticate, defaultLimiter,
  doc({ summary: 'The reporting-year position, with the DQ improvement plan and factor gaps',
    description: 'The disclosed data-quality score is premium-weighted (Box 6-3, p.107), with '
      + 'ceded premium substituted for treaty reinsurance (Box 6-4, p.108). A policy carrying '
      + 'no score is excluded from the weighting rather than counted as zero, and the count of '
      + 'what was excluded travels with the score.',
    response: body({ portfolio: obj }, ['portfolio']) }),
  handle(async (req, res) => {
  res.json({ portfolio: await portfolio.rollUp(req.orgId, req.params.year) });
}));

/** What to fix first, ranked by how much of the disclosed figure it moves. */
router.get('/portfolio/:year/dq-plan', authenticate, defaultLimiter,
  doc({ summary: 'What to fix first, ranked by how much of the disclosed figure it moves',
    response: body({ plan: obj }, ['plan']) }),
  handle(async (req, res) => {
  res.json({ plan: await portfolio.improvementPlan(req.orgId, req.params.year) });
}));

/** Which emission factors to localise first, across the whole book. */
router.get('/portfolio/:year/factor-gaps', authenticate, defaultLimiter,
  doc({ summary: 'Which emission factors to localise first, across the whole book',
    response: body({ gaps: obj }, ['gaps']) }),
  handle(async (req, res) => {
  res.json({ gaps: await portfolio.factorGapPriority(req.orgId, req.params.year) });
}));

/**
 * This year against last year, with the prior figure stated on both bases
 * where it has since been restated.
 */
router.get('/portfolio/:year/comparatives', authenticate, defaultLimiter,
  doc({ summary: 'This year against last, on a basis that survives a change of book',
    description: 'A policy\'s reporting year is its inception year, so two years cover two '
      + 'different sets of policies: the movement is reported as fact alongside the note that '
      + 'it is not on its own a change in performance. Intensity and the emissions-weighted '
      + 'data-quality score are the measures that survive the change.',
    response: body({ comparatives: obj }, ['comparatives']) }),
  handle(async (req, res) => {
  res.json({ comparatives: await comparatives.compare(req.orgId, req.params.year) });
}));

/** Every restatement recorded against a reporting year. */
router.get('/portfolio/:year/restatements', authenticate, defaultLimiter,
  doc({ summary: 'As previously reported against as restated, with the reason',
    response: body({ restatements: obj }, ['restatements']) }),
  handle(async (req, res) => {
  res.json({ restatements: await comparatives.restatementsFor(req.orgId, req.params.year) });
}));

// ---------------------------------------------------------------------------
// The annual disclosure — the document the insurer publishes
//
// Built from locked assessments only. Refused with a 409 when the year holds
// none, because an empty disclosure would read as a position of zero rather
// than as no position at all.
// ---------------------------------------------------------------------------
router.get('/disclosure/:year',
  doc({ summary: 'The annual disclosure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    description: 'Built from locked assessments only. A year holding none is refused with a '
      + '409 rather than rendered as a position of zero: an empty disclosure would read as '
      + '"we insured nothing carbon-intensive", which is a different claim from "we have not '
      + 'measured yet".',
    response: body({ disclosure: obj }, ['disclosure']) }), authenticate, defaultLimiter, handle(async (req, res) => {
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
router.post('/demo/seed', authenticate,
  validate({ body: demoSeedSchema }), defaultLimiter,
  doc({ summary: 'Seed a worked insurer book, for a demonstration', status: 201,
    description: 'Refused with a 409 where the organisation already holds clients, because '
      + 'seeding over a real book would duplicate it. `force` says to seed anyway.',
    response: body({ seeded: obj, insurer: str, storage: obj }, ['seeded']) }), handle(async (req, res) => {
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
