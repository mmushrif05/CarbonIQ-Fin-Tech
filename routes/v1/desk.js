/**
 * CarbonIQ FinTech — Fund Desk endpoints
 *
 *   GET  /v1/desk/position?attributionBasis=outstanding&portfolioId=…
 *        The bank's position over both books, in one read.
 *
 *   POST /v1/desk/adopt   { recordId, portfolioId, commitment?, startYear? }
 *        Put a GCF pipeline candidate on the capital book as a pipeline
 *        investment, carrying the link, the gate answer and the pledge.
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
