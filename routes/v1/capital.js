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
 *   POST            /v1/capital/demo            seed a worked book for a demo
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
const { seedCapitalDemo, sampleBook } = require('../../services/capital-demo-data');

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

// ---------------------------------------------------------------------------

router.get('/storage', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json({ storage: store.capability() });
});

router.get('/dashboard', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const raw = req.query.carbonWeight;
  const carbonWeight = raw === undefined || raw === '' ? 0.5 : Number(raw);
  if (!Number.isFinite(carbonWeight)) {
    return res.status(400).json({
      error: 'BAD_WEIGHT',
      message: `carbonWeight must be a number between 0 and 1; received "${raw}".`,
    });
  }
  /* The forecast assumptions ride on the query string for the same reason the
     weighting does: they are questions a reader asks of one book, not
     properties of the book. They come back in the payload, so a screenshot of
     a curve always carries the assumptions that produced it. */
  const opts = {
    carbonWeight,
    horizonYears: req.query.horizonYears ? Number(req.query.horizonYears) : null,
    gridDeclinePctPerYear: req.query.gridDeclinePct ? Number(req.query.gridDeclinePct) : 0,
    drawdownYears: req.query.drawdownYears ? Number(req.query.drawdownYears) : 3,
  };
  for (const [key, max] of [['horizonYears', 30], ['gridDeclinePctPerYear', 20], ['drawdownYears', 15]]) {
    const v = opts[key];
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > max)) {
      return res.status(400).json({
        error: 'BAD_ASSUMPTION',
        message: `${key} must be a number between 0 and ${max}; received "${v}".`,
      });
    }
  }

  const held = await book.readBook(req.apiKey.orgId, { portfolioId: req.query.portfolioId });
  const result = metrics.dashboard(held, opts);

  /* An empty book leaves a correct screen with nothing on it — and where
     storage is not writable (a serverless runtime with no Firebase) the seed
     endpoint is refused, so there is no way to put figures there at all. The
     worked book is therefore computed through the same engine and returned
     marked as a sample. Nothing is stored, and `sample` travels with the
     payload so the screen can say what it is showing. The moment one real
     portfolio is recorded, this stops. */
  if (result.empty) {
    const shown = metrics.dashboard({ ...sampleBook(), storage: held.storage }, opts);
    shown.sample = true;
    shown.empty = false;
    shown.sampleNote = 'Sample figures. Nothing is recorded in this book yet, so a worked '
      + 'example is shown in place of a blank screen — it is computed by the same engine and '
      + 'stored nowhere. Record a portfolio, or adjust these numbers under Record, and your own '
      + 'position replaces it.';
    shown.emptyNote = result.emptyNote;
    return res.json({ dashboard: shown });
  }

  result.sample = false;
  res.json({ dashboard: result });
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
