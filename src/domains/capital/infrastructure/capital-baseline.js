// @ts-check
/**
 * CarbonIQ FinTech — The baseline book, held in the repository
 *
 * The capital book's starting position lives in `data/capital/book.json`,
 * beside the factor tables that already sit there, rather than in an external
 * database.
 *
 * That is a deliberate choice and not a shortcut. A demonstration book has no
 * business depending on a network round trip: there is no latency, no
 * credential to configure, no service that can be down in front of a client,
 * and every change to the baseline is a reviewable commit rather than an
 * invisible write. It also removes the one thing that made this screen
 * unusable on a fresh deployment — a serverless runtime with no Firebase
 * refuses writes, so the seed endpoint could not put figures on the screen at
 * all.
 *
 * ── Precedence, and why it is all-or-nothing ────────────────────────────────
 *
 * If an organisation has recorded anything of its own, its records win
 * **entirely** and this file is not read. The two are never merged. A real
 * total sitting beside an invented one with nothing on screen to separate them
 * is a failure this project has already had once, on the portfolio dashboard,
 * where six fields were quietly filled from a demo constant while the headline
 * came from the API. One book or the other, and the payload says which.
 *
 * The file is read once and frozen. A caller that mutated it would be editing
 * every future request's baseline, which is exactly the kind of action at a
 * distance that makes a figure impossible to trace.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Joi = require('joi');

const { checked, strictNumber } = require('../../../shared/reference-data');
const { STATUSES, DELIVERY_STATES } = require('../domain/book-model');
const log = require('../../../platform/observability/logger').for('capital-baseline');

const BOOK_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'capital', 'book.json');

let _cache = null;

/** Nothing downstream may mutate the baseline, so it is frozen all the way down. */
function _deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) _deepFreeze(value[key]);
  }
  return value;
}

/**
 * The shape the book has to have before any figure is read off it.
 *
 * Every id is required because the three arrays are joined on them: a payment
 * whose `investmentId` matches nothing is drawn money attributed to no
 * facility, and it would be summed into the disbursed total while appearing
 * against no row on the screen — a book that does not add up to itself.
 * `commitment` and `amount` are strict numbers for the reason the whole guard
 * exists: a quoted figure multiplies fine and then fails a comparison.
 */
const bookSchema = Joi.object({
  _meta: Joi.object().unknown(true).optional(),
  portfolios: Joi.array().items(Joi.object({
    id: Joi.string().max(60).required(),
    name: Joi.string().max(200).required(),
    allocatedBudget: strictNumber.min(0).required(),
  }).unknown(true)).required(),
  investments: Joi.array().items(Joi.object({
    id: Joi.string().max(60).required(),
    portfolioId: Joi.string().max(60).required(),
    name: Joi.string().max(200).required(),
    commitment: strictNumber.min(0).required(),
    status: Joi.string().valid(...STATUSES).required(),
    delivery: Joi.string().valid(...DELIVERY_STATES).required(),
  }).unknown(true)).required(),
  payments: Joi.array().items(Joi.object({
    id: Joi.string().max(60).required(),
    investmentId: Joi.string().max(60).required(),
    amount: strictNumber.required(),
  }).unknown(true)).required(),
}).unknown(true).custom((book, helpers) => {
  const portfolios = new Set(book.portfolios.map((/** @type {any} */ p) => p.id));
  const investments = new Set(book.investments.map((/** @type {any} */ i) => i.id));
  for (const inv of book.investments) {
    if (!portfolios.has(inv.portfolioId)) {
      return helpers.error('any.custom', { error: new Error(
        `investment ${inv.id} sits in portfolio ${inv.portfolioId}, which is not on the book`) });
    }
  }
  for (const pay of book.payments) {
    if (!investments.has(pay.investmentId)) {
      return helpers.error('any.custom', { error: new Error(
        `payment ${pay.id} is against investment ${pay.investmentId}, which is not on the book`) });
    }
  }
  return book;
});

/**
 * The baseline, or null when the file is missing, unreadable or malformed.
 *
 * Null rather than a throw: a missing baseline means the screen has nothing to
 * show, which the caller already knows how to say. Crashing the request would
 * turn a presentational gap into an outage.
 *
 * A book that **fails its schema** is treated the same way and not as usable
 * data, which is the choice that matters: a screen saying it has no baseline
 * is a screen a reader can act on, and a screen drawing a curve from a book
 * whose payments point at facilities that are not on it is one they cannot.
 * The reason is logged at warn rather than swallowed, so the difference
 * between "no file" and "a bad file" reaches whoever has to fix it.
 */
function readBaseline() {
  if (_cache !== undefined && _cache !== null) return _cache;
  try {
    const parsed = checked('data/capital/book.json',
      JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8')), bookSchema);
    _cache = _deepFreeze({
      portfolios: parsed.portfolios || [],
      investments: parsed.investments || [],
      payments: parsed.payments || [],
      meta: parsed._meta || null,
    });
  } catch (err) {
    log.warn({ err, kind: 'invalid' }, 'capital baseline book unavailable — the screen will say so');
    _cache = null;
  }
  return _cache;
}

/** A mutable copy, so a caller can filter or extend without touching the source. */
function baselineBook() {
  const base = readBaseline();
  if (!base) return null;
  return {
    portfolios: base.portfolios.map(p => ({ ...p })),
    investments: base.investments.map(i => ({ ...i, emissions: { ...(i.emissions || {}) } })),
    payments: base.payments.map(p => ({ ...p })),
  };
}

function isAvailable() {
  return readBaseline() !== null;
}

/** Test helper — forget the cached read. */
function _reset() { _cache = null; }

module.exports = { baselineBook, isAvailable, readBaseline, BOOK_PATH, _reset };
