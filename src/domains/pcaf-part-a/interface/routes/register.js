// @ts-check
/**
 * The PCAF Part A exposure register over HTTP.
 *
 *   GET    /v1/pcaf/part-a/years                    which years this book holds
 *   GET    /v1/pcaf/part-a/book/:year               the entity's stated book total
 *   PUT    /v1/pcaf/part-a/book                     state it — coverage's denominator
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
const { registerExposureSchema, bookSchema, noBodySchema } = require('../schemas/register');

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

module.exports = router;
