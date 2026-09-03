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

const BOOK_PATH = path.join(__dirname, '..', 'data', 'capital', 'book.json');

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
 * The baseline, or null when the file is missing or unreadable.
 *
 * Null rather than a throw: a missing baseline means the screen has nothing to
 * show, which the caller already knows how to say. Crashing the request would
 * turn a presentational gap into an outage.
 */
function readBaseline() {
  if (_cache !== undefined && _cache !== null) return _cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8'));
    _cache = _deepFreeze({
      portfolios: parsed.portfolios || [],
      investments: parsed.investments || [],
      payments: parsed.payments || [],
      meta: parsed._meta || null,
    });
  } catch (_) {
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
