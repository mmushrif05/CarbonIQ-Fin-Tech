// @ts-check
/**
 * The PCAF Part A exposure register over HTTP.
 *
 *   GET    /v1/pcaf/part-a/years                    which years this book holds
 *   GET    /v1/pcaf/part-a/book/:year               the entity's stated book total
 *   PUT    /v1/pcaf/part-a/book                     state it — coverage's denominator
 *   GET    /v1/pcaf/part-a/settings                 the entity's recalculation protocol
 *   PUT    /v1/pcaf/part-a/settings                 set it — base year, threshold, triggers
 *   GET    /v1/pcaf/part-a/exposures                a year's book, a page at a time
 *   POST   /v1/pcaf/part-a/exposures                record one
 *   GET    /v1/pcaf/part-a/exposures/:id            one, with its whole trace
 *   PUT    /v1/pcaf/part-a/exposures/:id            change it; the engine reruns
 *   POST   /v1/pcaf/part-a/exposures/:id/recompute  rerun on the same input, and say what moved
 *   DELETE /v1/pcaf/part-a/exposures/:id            remove it
 *   GET    /v1/pcaf/part-a/position/:year           the reporting-year position
 *
 * These are the routes that write, so unlike §5.2's two stateless reads they
 * need a durable store: on a deployment that can persist nothing they answer
 * 503 naming `DATABASE_URL` rather than accepting a record and dropping it.
 * That refusal is the storage seam's, not this file's.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, obj, arr, num, str } = require('../../../../platform/http/openapi-hints');
const { sendList, paged } = require('../../../../platform/http/pagination');
const validate = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const handle = require('../../../../platform/http/async-handler');
const store = require('../../../../platform/database/store');

const register = require('../../application/register');
const sovereign = require('../../application/sovereign-register');
const partaReport = require('../../application/parta-report');
const { sendPdf, sendDocx } = require('../../../../platform/reporting/pdf-response');
const { registerExposureSchema, bookSchema, noBodySchema, reportRequestSchema, disclosureQuerySchema, settingsSchema } = require('../schemas/register');
const { sovereignExposureSchema } = require('../schemas/sovereign');

const router = Router();

// ---------------------------------------------------------------------------
// What this deployment can hold, and what it already holds
// ---------------------------------------------------------------------------

router.get('/storage', authenticate, defaultLimiter,
  doc({ summary: 'What this deployment can actually persist for Part A',
    response: body({ storage: obj }, ['storage']) }),
  (_req, res) => {
    res.json({ storage: store.capability() });
  });

router.get('/years', authenticate, defaultLimiter,
  doc({ summary: 'The reporting years this book holds exposures for',
    description: 'Each says whether the entity has stated its total loans and investments for '
      + 'that year, because without it coverage cannot be a percentage of anything.',
    response: body({ years: arr() }, ['years']) }),
  handle(async (req, res) => {
    res.json({ years: await register.years(req.orgId) });
  }));

// ---------------------------------------------------------------------------
// The book total — the denominator coverage needs
// ---------------------------------------------------------------------------

router.get('/book/:year', authenticate, defaultLimiter,
  doc({ summary: 'The reporting entity\'s stated total loans and investments for a year',
    response: body({ book: obj }) }),
  handle(async (req, res) => {
    const book = await register.getBook(req.orgId, req.params.year);
    if (!book) {
      return res.status(404).json({
        error: 'BOOK_NOT_STATED',
        message: `The total loans and investments for ${req.params.year} has not been stated, so coverage `
          + 'for that year cannot be a percentage of anything.',
        remedy: 'PUT /v1/pcaf/part-a/book with the reporting year and the total.',
      });
    }
    return res.json({ book });
  }));

router.put('/book', authenticate, defaultLimiter,
  doc({ summary: 'State the total loans and investments for a reporting year',
    description: 'Coverage is assessed outstanding over the whole book (PCAF Disclosure Checklist '
      + 'Part A, p.124). Nothing here can derive an institution\'s book total, so it is recorded '
      + 'as declared, with who stated it, and that travels with every coverage figure it produces.',
    response: body({ book: obj }, ['book']) }),
  validate({ body: bookSchema }),
  handle(async (req, res) => {
    res.json({ book: await register.stateBook(req.orgId, req.body) });
  }));

// ---------------------------------------------------------------------------
// The reporting entity's settings — the recalculation protocol
// ---------------------------------------------------------------------------

router.get('/settings', authenticate, defaultLimiter,
  doc({ summary: 'The reporting entity\'s recalculation protocol — base year, significance threshold and triggers',
    description: 'Chapter 6 requires a disclosure to state its recalculation protocol. The base year is '
      + 'null until the entity sets one, because a base year is a claim about history and the report says '
      + 'so rather than implying the current year.',
    response: body({ settings: obj }, ['settings']) }),
  handle(async (req, res) => {
    res.json({ settings: await register.getSettings(req.orgId) });
  }));

router.put('/settings', authenticate, defaultLimiter,
  doc({ summary: 'Set the reporting entity\'s recalculation protocol',
    description: 'A movement of at least the significance threshold is a recalculation trigger. Only the '
      + 'protocol fields are accepted; anything else is ignored rather than written.',
    response: body({ settings: obj }, ['settings']) }),
  validate({ body: settingsSchema }),
  handle(async (req, res) => {
    res.json({ settings: await register.saveSettings(req.orgId, req.body) });
  }));

// ---------------------------------------------------------------------------
// The exposures
// ---------------------------------------------------------------------------

router.get('/exposures', authenticate, defaultLimiter, paged(),
  doc({ summary: 'A reporting year\'s exposures, a page at a time',
    description: 'Requires a year: the register is organised by reporting year because Part A '
      + 'accounts for positions at one date, and a list across years is two books in one table.',
    response: body({ exposures: arr(), reportingYear: str }, ['exposures']) }),
  handle(async (req, res) => {
    const year = req.query.reportingYear;
    if (!year) {
      return res.status(400).json({
        error: 'REPORTING_YEAR_REQUIRED',
        message: 'Name the reporting year. Part A accounts for positions at one date, so a list across '
          + 'years is two books in one table.',
        remedy: 'GET /v1/pcaf/part-a/exposures?reportingYear=2024',
      });
    }
    const page = await register.listExposures(req.orgId, year, {
      limit: req.query.limit, cursor: req.query.cursor,
    });
    return sendList(req, res, 'exposures', page.items, { reportingYear: String(year), nextCursor: page.nextCursor });
  }));

router.post('/exposures', authenticate, defaultLimiter,
  doc({ summary: 'Record one exposure in the register',
    description: 'The engine runs before anything is written, so an exposure the standard refuses '
      + 'never reaches the book. Both halves are kept — the input the bank keyed and the result the '
      + 'engine computed — so a later factor correction is a decision somebody takes rather than '
      + 'something that happens to them.',
    response: body({ exposure: obj }, ['exposure']) }),
  validate({ body: registerExposureSchema }),
  handle(async (req, res) => {
    res.status(201).json({ exposure: await register.record(req.orgId, req.body) });
  }));

router.get('/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'One exposure, with the input it was computed from and its whole trace',
    response: body({ exposure: obj }, ['exposure']) }),
  handle(async (req, res) => {
    res.json({ exposure: await register.get(req.orgId, req.params.exposureId) });
  }));

router.put('/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'Change a recorded exposure; the engine reruns over the new input',
    description: 'There is no partial update of a figure. The figures are derived, and changing one '
      + 'without rerunning the engine would put a number in the book that no equation produces.',
    response: body({ exposure: obj }, ['exposure']) }),
  validate({ body: registerExposureSchema }),
  handle(async (req, res) => {
    res.json({ exposure: await register.update(req.orgId, req.params.exposureId, req.body) });
  }));

router.post('/exposures/:exposureId/recompute', authenticate, defaultLimiter,
  doc({ summary: 'Rerun the engine over the input already held, and say what moved',
    description: 'Nothing recomputes on read, so a figure somebody was shown yesterday is the figure '
      + 'they see today until this is called. The response reports the movement and the standard '
      + 'edition on each side of it.',
    response: body({ exposure: obj, movement: obj }, ['exposure', 'movement']) }),
  /* It takes no body: the input is the one already held, which is what makes
     it a recomputation rather than a change. The empty schema is there so the
     route carries one — every write on this surface does, and a POST that
     silently accepted a body would look like it used it. */
  validate({ body: noBodySchema }),
  handle(async (req, res) => {
    res.json(await register.recompute(req.orgId, req.params.exposureId));
  }));

router.delete('/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'Remove an exposure from the register',
    response: body({ exposureId: str, removed: obj }, ['exposureId']) }),
  handle(async (req, res) => {
    res.json(await register.remove(req.orgId, req.params.exposureId));
  }));

// ---------------------------------------------------------------------------
// The reporting-year position
// ---------------------------------------------------------------------------

router.get('/position/:year', authenticate, defaultLimiter,
  doc({ summary: 'The reporting-year position, rolled up from the recorded exposures',
    description: 'Read from the stored roll-up projection rather than the whole records: an exposure '
      + 'is several kilobytes, most of it the provenance trace, and the roll-up needs eighteen fields. '
      + 'Coverage is real here — assessed outstanding over the stated book total. A year holding no '
      + 'exposures is a 409, because an empty book and an unmeasured one are different claims.',
    response: body({ reportingYear: str, total: obj, coverage: obj, exposures: num }, ['reportingYear', 'total']) }),
  handle(async (req, res) => {
    res.json(await register.position(req.orgId, req.params.year, {
      improvementTarget: req.query.improvementTarget === undefined
        ? undefined : Number(req.query.improvementTarget),
    }));
  }));

// ---------------------------------------------------------------------------
// The §5.9 sovereign register — its own exposures, over the shared book total
// ---------------------------------------------------------------------------

/*
 * A separate register from §5.2's because the result shapes differ, but the
 * same discipline: both halves kept, nothing recomputes on read, one bond
 * once, a 409 on an empty year. Coverage is against the shared book total
 * (PUT /book), so there is no sovereign book of its own.
 */

router.get('/sovereign/years', authenticate, defaultLimiter,
  doc({ summary: 'The reporting years the sovereign book holds exposures for',
    response: body({ years: arr() }, ['years']) }),
  handle(async (req, res) => {
    res.json({ years: await sovereign.years(req.orgId) });
  }));

router.get('/sovereign/exposures', authenticate, defaultLimiter, paged(),
  doc({ summary: 'A reporting year\'s sovereign exposures, a page at a time',
    response: body({ exposures: arr(), reportingYear: str }, ['exposures']) }),
  handle(async (req, res) => {
    const year = req.query.reportingYear;
    if (!year) {
      return res.status(400).json({
        error: 'REPORTING_YEAR_REQUIRED',
        message: 'Name the reporting year. Part A accounts for positions at one date.',
        remedy: 'GET /v1/pcaf/part-a/sovereign/exposures?reportingYear=2024',
      });
    }
    const page = await sovereign.listExposures(req.orgId, year, { limit: req.query.limit, cursor: req.query.cursor });
    return sendList(req, res, 'exposures', page.items, { reportingYear: String(year), nextCursor: page.nextCursor });
  }));

router.post('/sovereign/exposures', authenticate, defaultLimiter,
  doc({ summary: 'Record one sovereign exposure in the register',
    description: 'The engine runs before anything is written. Both halves are kept — what the bank keyed '
      + 'and what the engine computed — and one bond is recorded once (a repeated reference is a 409).',
    response: body({ exposure: obj }, ['exposure']) }),
  validate({ body: sovereignExposureSchema }),
  handle(async (req, res) => {
    res.status(201).json({ exposure: await sovereign.record(req.orgId, req.body) });
  }));

router.get('/sovereign/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'One sovereign exposure, with the input it was computed from and its whole trace',
    response: body({ exposure: obj }, ['exposure']) }),
  handle(async (req, res) => {
    res.json({ exposure: await sovereign.get(req.orgId, req.params.exposureId) });
  }));

router.put('/sovereign/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'Change a recorded sovereign exposure; the engine reruns over the new input',
    response: body({ exposure: obj }, ['exposure']) }),
  validate({ body: sovereignExposureSchema }),
  handle(async (req, res) => {
    res.json({ exposure: await sovereign.update(req.orgId, req.params.exposureId, req.body) });
  }));

router.post('/sovereign/exposures/:exposureId/recompute', authenticate, defaultLimiter,
  doc({ summary: 'Rerun the sovereign engine over the input already held, and say what moved',
    description: 'Reports the movement across scope 1 on both LULUCF boundaries, scope 2 and 3, the '
      + 'data-quality score and the findings — a change in the engine or the sovereign dataset, never '
      + 'in what the bank recorded.',
    response: body({ exposure: obj, movement: obj }, ['exposure', 'movement']) }),
  validate({ body: noBodySchema }),
  handle(async (req, res) => {
    res.json(await sovereign.recompute(req.orgId, req.params.exposureId));
  }));

router.delete('/sovereign/exposures/:exposureId', authenticate, defaultLimiter,
  doc({ summary: 'Remove a sovereign exposure from the register',
    response: body({ exposureId: str, removed: obj }, ['exposureId']) }),
  handle(async (req, res) => {
    res.json(await sovereign.remove(req.orgId, req.params.exposureId));
  }));

router.get('/sovereign/position/:year', authenticate, defaultLimiter,
  doc({ summary: 'The sovereign reporting-year position, rolled up from the recorded exposures',
    description: 'Read from the stored roll-up projection. Scope 1 is summed on both LULUCF boundaries '
      + 'and never added together; the disclosed data-quality score is weighted by outstanding amount '
      + '(p.128); coverage is assessed outstanding over the stated book total. A year with no sovereign '
      + 'exposures is a 409.',
    response: body({ reportingYear: str, totals: obj, coverage: obj, exposures: num }, ['reportingYear', 'totals']) }),
  handle(async (req, res) => {
    res.json(await sovereign.position(req.orgId, req.params.year));
  }));

// ---------------------------------------------------------------------------
// The §5.2 disclosure and the per-exposure report
// ---------------------------------------------------------------------------

/*
 * Both are read-scoped and store nothing. The document is one content model in
 * the order PCAF Chapter 6 reads, rendered by the platform report standard —
 * the same renderer Part C uses — so a requirement satisfied in one document
 * cannot go missing from the other. Every figure is one the register returned;
 * the engine did the arithmetic and this path never recomputes it.
 */

const R = require('../../reporting/report');

/* One delivery path for both documents. `built.input.result` is present for a
   single exposure and absent for the annual disclosure, which is how the
   right renderer is chosen without a second branch per format. */
const deliver = async (res, built, format, kind) => {
  if (format === 'docx') {
    const buf = await (built.input.result ? R.exposureDOCX(built.input) : R.disclosureDOCX(built.input));
    return sendDocx(res, buf, `${built.safeName}.docx`, kind);
  }
  if (format === 'pdf') {
    const doc = built.input.result ? R.exposurePDF(built.input) : R.disclosurePDF(built.input);
    return sendPdf(res, doc, `${built.safeName}.pdf`, kind);
  }
  return res.json({ report: { cover: built.model.cover, checklist: built.model.checklist, facts: built.facts } });
};

router.get('/disclosure/:year', authenticate, defaultLimiter,
  validate({ query: disclosureQuerySchema }),
  doc({ summary: 'The annual PCAF Part A §5.2 disclosure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    description: 'Built from the reporting-year position in the exposure register, in the order '
      + 'PCAF Chapter 6 reads. A year holding no exposures is a 409. The checklist covers the §5.2 '
      + 'asset class only, so it cannot reach a hundred per cent — this report is one input to a '
      + 'Chapter 6 disclosure, not the disclosure.',
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
    const built = await partaReport.annualDisclosure(req.orgId, req.params.year, {
      insurer: req.query.insurer, currency: req.query.currency, country: req.query.country,
    });
    await deliver(res, built, req.query.format || 'json', 'disclosure');
  }));

router.post('/exposures/:exposureId/report', authenticate, defaultLimiter,
  validate({ body: reportRequestSchema }),
  doc({ summary: 'The per-exposure §5.2 report for one recorded exposure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
    const built = await partaReport.exposureReport(req.orgId, req.params.exposureId, {
      insurer: req.body.insurer,
    });
    await deliver(res, built, req.body.format || 'json', 'exposure');
  }));

// ---------------------------------------------------------------------------
// The §5.9 sovereign disclosure and the per-holding report
// ---------------------------------------------------------------------------

/*
 * The §5.9 mirror of the two §5.2 report routes, over the sovereign register
 * and its own content model — scope 1 on two LULUCF boundaries, PPP-GDP
 * attribution, one score weighted by outstanding. Read-scoped and stores
 * nothing; the engine did the arithmetic and this path never recomputes it.
 * A `POST /sovereign/exposures/:id/report` is read-scoped despite being a POST,
 * so `scopes.js` carries a rule for it ahead of the write rule for
 * `/sovereign/exposures`, exactly as the §5.2 report route does.
 */

const sovereignReport = require('../../application/sovereign-report');
const SR = require('../../reporting/sovereign/report');

const deliverSovereign = async (res, built, format, kind) => {
  const isHolding = Boolean(built.input.result);
  if (format === 'docx') {
    const buf = await (isHolding ? SR.holdingDOCX(built.input) : SR.disclosureDOCX(built.input));
    return sendDocx(res, buf, `${built.safeName}.docx`, kind);
  }
  if (format === 'pdf') {
    const docu = isHolding ? SR.holdingPDF(built.input) : SR.disclosurePDF(built.input);
    return sendPdf(res, docu, `${built.safeName}.pdf`, kind);
  }
  return res.json({ report: { cover: built.model.cover, checklist: built.model.checklist, facts: built.facts } });
};

router.get('/sovereign/disclosure/:year', authenticate, defaultLimiter,
  validate({ query: disclosureQuerySchema }),
  doc({ summary: 'The annual PCAF Part A §5.9 sovereign-debt disclosure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    description: 'Built from the sovereign reporting-year position, in the order PCAF Chapter 6 '
      + 'reads. Scope 1 is reported on both LULUCF boundaries and never summed; the score is weighted '
      + 'by outstanding amount. A year holding no sovereign exposures is a 409. The checklist covers '
      + 'the §5.9 asset class only, so it cannot reach a hundred per cent.',
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
    const built = await sovereignReport.annualDisclosure(req.orgId, req.params.year, {
      insurer: req.query.insurer, currency: req.query.currency,
    });
    await deliverSovereign(res, built, req.query.format || 'json', 'disclosure');
  }));

router.post('/sovereign/exposures/:exposureId/report', authenticate, defaultLimiter,
  validate({ body: reportRequestSchema }),
  doc({ summary: 'The per-holding §5.9 report for one recorded sovereign exposure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
    const built = await sovereignReport.holdingReport(req.orgId, req.params.exposureId, {
      insurer: req.body.insurer,
    });
    await deliverSovereign(res, built, req.body.format || 'json', 'holding');
  }));

module.exports = router;
