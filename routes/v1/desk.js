/**
 * CarbonIQ FinTech — Fund Desk endpoints
 *
 *   GET  /v1/desk/position?attributionBasis=outstanding&portfolioId=…
 *        The bank's position over both books, in one read.
 *
 *   GET  /v1/desk/candidates?…weights
 *        What is waiting: the gate, the two rankings that are never merged,
 *        the structure and the barrier it leaves standing, and whether each is
 *        already on the book.
 *
 *   GET  /v1/desk/readiness?year=…
 *        Year end: what the disclosure cannot state, which entity facts are
 *        still absent, and how far each candidate is from a submission.
 *
 *   POST /v1/desk/adopt   { recordId, portfolioId, commitment?, startYear? }
 *        Put a GCF pipeline candidate on the capital book as a pipeline
 *        investment, carrying the link, the gate answer and the pledge.
 *
 *   POST /v1/desk/scenario  { select: [investmentId…], … }
 *        If we wrote these, what changes. A read: nothing is stored, no id is
 *        issued, and it is idempotent. Committing to a project stays a
 *        separate, deliberate PATCH on the investment.
 *
 * The desk is a **read** over two books that already exist. The one write it
 * offers creates a candidate on the book; committing to it is a separate,
 * deliberate PATCH on the investment, as it already was.
 *
 * `attributionBasis` rides on the query string rather than being stored,
 * because it is a question a reader asks of one book — "what does it carry
 * today" versus "what would it carry fully drawn" — and not a property of the
 * book. It travels back in the payload, so a screenshot always carries the
 * basis that produced it.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');

const desk = require('../../services/desk');
const attribution = require('../../services/capital-attribution');
const gcfStore = require('../../services/gcf/store');
const { basket } = require('../../services/capital-basket');
const screening = require('../../services/gcf/screening');

const router = Router();

function fail(res, err) {
  return res.status(err.statusCode || 500).json({
    error: err.code || 'DESK_ERROR',
    message: err.message,
    ...(err.remedy ? { remedy: err.remedy } : {}),
  });
}

const handle = fn => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) { if (err.statusCode) return fail(res, err); next(err); }
};

/** The position over both books. */
router.get('/position', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const basis = req.query.attributionBasis || 'outstanding';
  if (!attribution.BASES.includes(basis)) {
    return res.status(400).json({
      error: 'BAD_BASIS',
      message: `attributionBasis must be one of ${attribution.BASES.join(', ')}; received "${basis}".`,
    });
  }
  const position = await desk.read(req.apiKey.orgId, {
    attributionBasis: basis,
    portfolioId: req.query.portfolioId,
  });
  res.json({ position });
}));


/**
 * The weighting is a question a reader asks of one pool, not a property of it.
 * Only a changed weight is sent, so an untouched one is answered by the
 * engine's own default rather than asserted by the browser, and the weighting
 * comes back in the payload so a screenshot always carries what produced it.
 */
function readWeights(req) {
  const supplied = {};
  let any = false;
  for (const key of Object.keys(screening.DEFAULT_WEIGHTS)) {
    const raw = req.query[key];
    if (raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) {
      const err = new Error(`${key} must be a number of zero or more; received "${raw}".`);
      err.statusCode = 400;
      err.code = 'BAD_WEIGHT';
      throw err;
    }
    supplied[key] = v;
    any = true;
  }
  return any ? supplied : undefined;
}

/** What is waiting, gated and ranked, and whether it is already on the book. */
router.get('/candidates', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const weights = readWeights(req);
  const [pipeline, effective] = await Promise.all([
    gcfStore.list(req.apiKey.orgId),
    desk.effectiveBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId }),
  ]);

  res.json({
    candidates: {
      ...desk.candidates(pipeline.projects, effective.book.investments, {
        accreditation: gcfStore.seedMeta().accreditation,
        weights,
      }),
      source: pipeline.source,
      sample: pipeline.sample,
      bookSource: effective.source,
    },
  });
}));

/** Year end: what cannot be stated, and how far each candidate is from a submission. */
router.get('/readiness', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const year = req.query.year === undefined || req.query.year === ''
    ? new Date().getUTCFullYear()
    : Number(req.query.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({
      error: 'INVALID_YEAR',
      message: 'year must be a four-digit reporting year.',
    });
  }

  const pipeline = await gcfStore.list(req.apiKey.orgId);
  const entityDisclosures = await gcfStore.entityDisclosures(req.apiKey.orgId).catch(() => null);

  res.json({
    readiness: {
      ...desk.readiness(pipeline.projects, {
        accreditation: gcfStore.seedMeta().accreditation,
        entityDisclosures,
        reportingYear: year,
        sample: pipeline.sample,
        sampleNote: gcfStore.seedMeta().sampleNote,
      }),
      source: pipeline.source,
    },
  });
}));

/**
 * If we wrote these, what changes.
 *
 * A read that stores nothing, issues no id and is idempotent, so a reader can
 * ask it as often as they like. It runs on **the same book the position is
 * showing** — `effectiveBook` is shared, so a scenario can never be modelled
 * against a different book from the figures printed above it.
 *
 * The engine is `capital-basket` unchanged. Both sides of the comparison run
 * on the commitment basis whatever the desk is displaying, because attribution
 * on outstanding scales a project by what has been drawn and a facility
 * written this morning has drawn nothing — on that basis the answer would be
 * "this changes nothing" from a question that had not been asked.
 */
router.post('/scenario', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const body = req.body || {};
  const raw = Array.isArray(body.select) ? body.select : String(body.select || '').split(',');
  const select = raw.map(s => String(s).trim()).filter(Boolean);
  if (select.length > 50) {
    return res.status(400).json({
      error: 'TOO_MANY',
      message: 'A basket of more than 50 projects is not a decision anybody is taking in one sitting.',
    });
  }

  const basis = body.attributionBasis || 'outstanding';
  if (!attribution.BASES.includes(basis)) {
    return res.status(400).json({
      error: 'BAD_BASIS',
      message: `attributionBasis must be one of ${attribution.BASES.join(', ')}; received "${basis}".`,
    });
  }

  const effective = await desk.effectiveBook(req.apiKey.orgId, { portfolioId: body.portfolioId });
  const result = basket(effective.book, select, { attributionBasis: basis });

  res.json({
    scenario: {
      ...result,
      source: effective.source,
      sample: effective.sample,
      /* Said in the payload as well as on the screen, because whoever is asked
         to accept these figures will read one of the two. */
      storedNote: 'Nothing here was written down. A scenario issues no id, changes no record, and '
        + 'committing to a project remains a separate and deliberate act.',
    },
  });
}));

/**
 * Put a candidate on the book.
 *
 * A write, so it is refused with a 503 on a deployment that cannot persist
 * rather than accepted and lost — the same rule the rest of the application
 * follows. The candidate lands at `pipeline`, which is a position on the book
 * and not yet a decision to lend.
 */
router.post('/adopt', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const body = req.body || {};
  const result = await desk.adoptCandidate(req.apiKey.orgId, {
    recordId: body.recordId,
    portfolioId: body.portfolioId,
    commitment: body.commitment,
    startYear: body.startYear,
    phasing: body.phasing,
    notes: body.notes,
    by: req.apiKey.orgId,
  });
  res.status(201).json({
    investment: result.investment,
    screening: result.screening,
    from: { recordId: result.project.id, code: result.project.code, source: result.source },
    note: 'Adopted at pipeline status. The screening verdict recorded on the investment is the gate '
      + 'answer as it stood today; it is carried, not enforced, because a bank may finance from its '
      + 'own balance sheet what it cannot take to the Fund as the accredited entity.',
  });
}));

module.exports = router;
