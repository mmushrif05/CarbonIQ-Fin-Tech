/**
 * CarbonIQ FinTech — Capital book endpoints
 *
 *   GET  /v1/capital/dashboard?carbonWeight=0.5&portfolioId=…
 *        Everything the dashboard draws, derived from one read of the book.
 *
 *   GET/POST        /v1/capital/portfolios      ·  PATCH /portfolios/:id
 *   GET/POST        /v1/capital/investments     ·  PATCH /investments/:id
 *   GET/POST        /v1/capital/payments        ·  DELETE /payments/:id
 *   GET             /v1/capital/storage         what this deployment can persist
 *   POST            /v1/capital/demo            copy the baseline into the store
 *
 * The book's starting position is `data/capital/book.json`, versioned in the
 * repository rather than in an external database. Records an organisation has
 * made of its own win entirely over it; the two are never blended, and the
 * payload's `source` says which was read.
 *
 * `carbonWeight` is a query parameter rather than a stored setting because it
 * is a question a reader asks of the same book — "what if I cared more about
 * carbon than return?" — not a property of the book. It travels back in the
 * response so a screenshot of a ranking always carries the weighting that
 * produced it.
 *
 * Storage honesty is the same as the rest of the application: on a serverless
 * runtime with no Firebase, a write is refused with a 503 rather than accepted
 * and lost.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate   = require('../../middleware/validate');
const { defaultLimiter } = require('../../middleware/rate-limit');

const book    = require('../../services/capital-book');
const metrics = require('../../services/capital-metrics');
const store   = require('../../services/partc-store');
const { seedCapitalDemo } = require('../../services/capital-demo-data');
const baseline = require('../../services/capital-baseline');
const { basket: basketOf } = require('../../services/capital-basket');
const adjust = require('../../services/capital-adjust');

const {
  portfolioSchema, portfolioUpdateSchema,
  investmentSchema, investmentUpdateSchema,
  paymentSchema,
} = require('../../schemas/capital');

const router = Router();

function fail(res, err) {
  return res.status(err.statusCode || 500).json({
    error: err.code || 'CAPITAL_ERROR',
    message: err.message,
    ...(err.remedy ? { remedy: err.remedy } : {}),
  });
}

const handle = fn => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) { if (err.statusCode) return fail(res, err); next(err); }
};


/* The baseline note, declared once. Three endpoints say it, and three copies
   of a sentence is how one of them ends up saying something the others do not. */
const BASELINE_NOTE = 'Illustrative dataset — not client records.';

/**
 * The questions a reader may ask of the book, validated once.
 *
 * Every one of these is a question rather than a property of the book — what
 * if I cared more about carbon, what if I looked further out, what if the grid
 * cleans up faster — so they travel on the request and come back in the
 * payload, and a screenshot always carries what produced it.
 *
 * Declared here because three endpoints read them. When the same validation
 * lived in two places, one of them accepted a horizon the other refused.
 *
 * @returns {{value: object}|{error: object}}
 */
function readOptions(query = {}, body = {}) {
  const pick = (key) => (body[key] !== undefined && body[key] !== null ? body[key] : query[key]);

  const rawWeight = pick('carbonWeight');
  const carbonWeight = rawWeight === undefined || rawWeight === '' ? 0.5 : Number(rawWeight);
  if (!Number.isFinite(carbonWeight)) {
    return { error: {
      error: 'BAD_WEIGHT',
      message: `carbonWeight must be a number between 0 and 1; received "${rawWeight}".`,
    } };
  }

  const attributionBasis = pick('attributionBasis') || 'outstanding';
  if (!metrics.ATTRIBUTION_BASES.includes(attributionBasis)) {
    return { error: {
      error: 'BAD_BASIS',
      message: `attributionBasis must be one of ${metrics.ATTRIBUTION_BASES.join(', ')}; `
        + `received "${attributionBasis}".`,
    } };
  }

  const value = {
    carbonWeight,
    attributionBasis,
    horizonYears: pick('horizonYears') ? Number(pick('horizonYears')) : null,
    gridDeclinePctPerYear: pick('gridDeclinePct') ? Number(pick('gridDeclinePct')) : 0,
    drawdownYears: pick('drawdownYears') ? Number(pick('drawdownYears')) : 3,
  };
  for (const [key, max] of [['horizonYears', 30], ['gridDeclinePctPerYear', 20], ['drawdownYears', 15]]) {
    const v = value[key];
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > max)) {
      return { error: {
        error: 'BAD_ASSUMPTION',
        message: `${key} must be a number between 0 and ${max}; received "${v}".`,
      } };
    }
  }
  return { value };
}

// ---------------------------------------------------------------------------

router.get('/storage', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json({ storage: store.capability() });
});

router.get('/dashboard', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  /* The weighting and the forecast assumptions ride on the query string
     because each is a question a reader asks of one book, not a property of
     it. They come back in the payload, so a screenshot of a curve always
     carries the assumptions that produced it. Validated by `readOptions`,
     which the basket and compute endpoints share — the same rules in three
     places would be three chances for one of them to drift. */
  const opts = readOptions(req.query);
  if (opts.error) return res.status(400).json(opts.error);

  const held = await book.readBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId });
  const result = metrics.dashboard(held, opts.value);

  /* An empty book leaves a correct screen with nothing on it — and where
     storage is not writable (a serverless runtime with no Firebase) the seed
     endpoint is refused, so there is no way to put figures there at all. The
     worked book is therefore computed through the same engine and returned
     marked as a sample. Nothing is stored, and `sample` travels with the
     payload so the screen can say what it is showing. The moment one real
     portfolio is recorded, this stops. */
  if (result.empty) {
    const base = baseline.baselineBook();
    if (!base) {
      result.sample = false;
      result.source = 'none';
      result.adjusted = false;
      return res.json({ dashboard: result });
    }
    const filtered = req.query.portfolioId
      ? {
        portfolios: base.portfolios.filter(p => p.id === req.query.portfolioId),
        investments: base.investments.filter(i => i.portfolioId === req.query.portfolioId),
        payments: base.payments.filter(p => p.portfolioId === req.query.portfolioId),
      }
      : base;
    const shown = metrics.dashboard({ ...filtered, storage: held.storage }, opts.value);
    shown.sample = true;
    shown.source = 'baseline';
    shown.empty = false;
    shown.sampleNote = BASELINE_NOTE;
    shown.emptyNote = result.emptyNote;
    shown.adjusted = false;
    return res.json({ dashboard: shown });
  }

  result.sample = false;
  result.source = 'recorded';
  result.adjusted = false;
  res.json({ dashboard: result });
}));

/**
 * The basket — what writing these would do.
 *
 * Selection travels on the query string rather than in a body, because it is a
 * question about a book and not a change to one: it is idempotent, it is
 * shareable as a link, and nothing about it is written down. A basket is never
 * persisted; committing a project is a separate, deliberate act through
 * PATCH /investments/:id.
 *
 * It runs on the same book the dashboard is showing — the recorded one, or the
 * repository baseline where nothing has been recorded — so the funding figures
 * cannot be drawn from a different book than the position they are set against.
 */
router.get('/basket', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const opts = readOptions(req.query);
  if (opts.error) return res.status(400).json(opts.error);

  const raw = req.query.select === undefined ? '' : String(req.query.select);
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  /* A cap, so a hand-edited query string cannot turn one request into a
     hundred forecast runs. The pipeline is a handful of projects; a selection
     larger than this is a mistake, not a use case. */
  if (ids.length > 25) {
    return res.status(400).json({
      error: 'TOO_MANY_SELECTED',
      message: `A basket holds at most 25 projects; received ${ids.length}.`,
    });
  }

  const held = await book.readBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId });
  const recorded = held.portfolios.length > 0 || held.investments.length > 0;
  const source = recorded ? held : (baseline.baselineBook() || held);

  /* The scenario is drawn on the chart's axis, so it takes the chart's horizon
     and grid trajectory — a run over a different span would be plotted against
     the wrong years. */
  const result = basketOf(source, ids, {
    attributionBasis: opts.value.attributionBasis,
    horizonYears: opts.value.horizonYears,
    gridDeclinePctPerYear: opts.value.gridDeclinePctPerYear,
  });
  result.sample = !recorded;
  result.source = recorded ? 'recorded' : 'baseline';
  res.json({ basket: result });
}));

/**
 * The effective book — what the adjust drawer edits against.
 *
 * The recorded book where one exists, the repository baseline otherwise: the
 * same choice `/dashboard` makes, so the drawer cannot show a reader one book
 * while the screen behind it derives from another. `source` says which, for
 * the same reason it does everywhere else here.
 *
 * Read-only, and deliberately the whole book rather than a page of it — it is
 * tens of rows, and a drawer that paginated would let a reader adjust a figure
 * they could not see the effect of.
 */
router.get('/book', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const held = await book.readBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId });
  const recorded = held.portfolios.length > 0 || held.investments.length > 0;
  const base = recorded ? held : (baseline.baselineBook() || held);
  res.json({
    book: {
      portfolios: base.portfolios,
      investments: base.investments,
      payments: base.payments,
    },
    source: recorded ? 'recorded' : 'baseline',
    sample: !recorded,
    storage: held.storage || null,
  });
}));

/**
 * Compute a dashboard from the book **as the reader has adjusted it**.
 *
 * POST rather than GET because an overlay is a body, not a query string, and
 * because the shape of it is open-ended. It is nonetheless a **read**: nothing
 * is stored, no id is issued, and calling it twice changes nothing. That is
 * deliberate and it is what makes the screen adjustable on a deployment that
 * can persist nothing — which is this one.
 *
 * The overlay names changed values; the base book still comes from the store
 * or the repository. A browser therefore cannot hand over a book of its own
 * invention, only a set of edits to one that exists, and an id matching
 * nothing comes back named rather than quietly becoming a new row.
 *
 * Every figure in the response is derived by the same functions that derive
 * the recorded dashboard. The overlay changes inputs and nothing else.
 */
router.post('/compute', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const body = req.body || {};
  const opts = readOptions(req.query, body);
  if (opts.error) return res.status(400).json(opts.error);

  const overlay = body.overlay && typeof body.overlay === 'object' ? body.overlay : {};
  /* A cap on the overlay, so a hand-written body cannot turn one request into
     an unbounded amount of work. The book is tens of rows; anything past this
     is a mistake rather than a use case. */
  const editCount = Object.keys(overlay.portfolios || {}).length
    + Object.keys(overlay.investments || {}).length
    + (Array.isArray(overlay.payments) ? overlay.payments.length : 0);
  if (editCount > 500) {
    return res.status(400).json({
      error: 'OVERLAY_TOO_LARGE',
      message: `An overlay may touch at most 500 records; received ${editCount}.`,
    });
  }

  const held = await book.readBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId });
  const recorded = held.portfolios.length > 0 || held.investments.length > 0;
  const base = recorded ? held : (baseline.baselineBook() || held);

  const applied = adjust.applyOverlay(base, overlay);
  const result = metrics.dashboard({ ...applied.book, storage: held.storage }, opts.value);

  /* Where the reader has changed nothing this is the ordinary dashboard, and
     it says so — an "adjusted" mark on an unadjusted screen would train a
     reader to ignore the mark that matters. */
  result.adjusted = applied.changed > 0;
  result.adjustedCount = applied.changed;
  result.adjustedNote = applied.changed > 0 ? adjust.ADJUSTED_NOTE : null;
  result.unknownIds = applied.unknownIds;
  result.sample = !recorded;
  result.source = recorded ? 'recorded' : 'baseline';
  if (!recorded) result.sampleNote = BASELINE_NOTE;

  const selected = Array.isArray(body.select) ? body.select.map(String).filter(Boolean) : [];
  const basket = selected.length > 25
    ? null
    : basketOf(applied.book, selected, {
      attributionBasis: opts.value.attributionBasis,
      horizonYears: opts.value.horizonYears,
      gridDeclinePctPerYear: opts.value.gridDeclinePctPerYear,
    });

  res.json({ dashboard: result, basket });
}));

// ── Portfolios ─────────────────────────────────────────────────────────────

router.get('/portfolios', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({ portfolios: await book.listPortfolios(req.apiKey.orgId) });
}));

router.post('/portfolios', apiKeyAuth, defaultLimiter,
  validate({ body: portfolioSchema }),
  handle(async (req, res) => {
    res.status(201).json({ portfolio: await book.createPortfolio(req.apiKey.orgId, req.body) });
  }));

router.patch('/portfolios/:id', apiKeyAuth, defaultLimiter,
  validate({ body: portfolioUpdateSchema }),
  handle(async (req, res) => {
    const updated = await book.updatePortfolio(req.apiKey.orgId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: `No portfolio ${req.params.id}.` });
    res.json({ portfolio: updated });
  }));

// ── Investments ────────────────────────────────────────────────────────────

router.get('/investments', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({
    investments: await book.listInvestments(req.apiKey.orgId, {
      portfolioId: req.query.portfolioId,
      status: req.query.status,
    }),
  });
}));

router.post('/investments', apiKeyAuth, defaultLimiter,
  validate({ body: investmentSchema }),
  handle(async (req, res) => {
    res.status(201).json({ investment: await book.createInvestment(req.apiKey.orgId, req.body) });
  }));

router.patch('/investments/:id', apiKeyAuth, defaultLimiter,
  validate({ body: investmentUpdateSchema }),
  handle(async (req, res) => {
    const updated = await book.updateInvestment(req.apiKey.orgId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: `No investment ${req.params.id}.` });
    res.json({ investment: updated });
  }));

// ── Payments ───────────────────────────────────────────────────────────────

router.get('/payments', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.json({
    payments: await book.listPayments(req.apiKey.orgId, {
      portfolioId: req.query.portfolioId,
      investmentId: req.query.investmentId,
    }),
  });
}));

router.post('/payments', apiKeyAuth, defaultLimiter,
  validate({ body: paymentSchema }),
  handle(async (req, res) => {
    res.status(201).json({ payment: await book.createPayment(req.apiKey.orgId, req.body) });
  }));

router.delete('/payments/:id', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  await book.deletePayment(req.apiKey.orgId, req.params.id);
  res.status(204).end();
}));

// ── A worked book, for a demonstration ─────────────────────────────────────

router.post('/demo', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  res.status(201).json(await seedCapitalDemo(req.apiKey.orgId));
}));

module.exports = router;
