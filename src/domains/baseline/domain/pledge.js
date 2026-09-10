// @ts-check
/**
 * An organisation's pledge against its baseline, and where it stands.
 *
 * A pledge is a **declared** statement — a commitment the institution made,
 * in its own words, in a document a reader can go and find. It is never
 * computed and never inferred from a trajectory, because a number this
 * product derived and then printed as a commitment would be the exact failure
 * `src/shared/report-integrity.js` exists to prevent.
 *
 * What *is* computed is the position: where the book stands today against the
 * pledge, how far is left, and whether the direction of travel closes the gap
 * in the time remaining. That figure is measured, is labelled as such, and
 * says plainly when it cannot be worked out.
 */

'use strict';

/** @typedef {import('../../../shared/types').AppError} AppError */

const { maybeNumber } = require('../../../shared/numbers');

/**
 * @typedef {Object} Pledge
 * @property {number} targetPct reduction against the baseline, as the entity stated it
 * @property {number} targetYear
 * @property {number} baseYear
 * @property {string} statedBy the entity — a pledge belongs to whoever made it
 * @property {string} reference the document it can be read in
 * @property {string} [basis] what the percentage is of, in the entity's words
 */

/**
 * @param {any} input
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validate(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'A pledge is required.' };
  const pct = maybeNumber(input.targetPct);
  if (pct === undefined || pct <= 0 || pct > 100) {
    return { ok: false, reason: 'targetPct must be a reduction between 0 and 100 per cent.' };
  }
  const base = maybeNumber(input.baseYear);
  const target = maybeNumber(input.targetYear);
  if (base === undefined || target === undefined) return { ok: false, reason: 'A base year and a target year are required.' };
  if (target <= base) return { ok: false, reason: 'The target year must be after the base year.' };
  if (!String(input.statedBy || '').trim()) {
    return { ok: false, reason: 'statedBy is required: a pledge belongs to whoever made it, and this product does not make one.' };
  }
  if (!String(input.reference || '').trim()) {
    return { ok: false, reason: 'A reference is required: a commitment a reader cannot go and find is not evidence.' };
  }
  return { ok: true };
}

/** The pledge as it is recorded — declared throughout, never derived. */
function record(input, ctx = {}) {
  const v = validate(input);
  if (!v.ok) {
    const err = /** @type {AppError} */ (new Error(v.reason));
    err.statusCode = 400; err.code = 'INVALID_PLEDGE';
    throw err;
  }
  return {
    targetPct: Number(input.targetPct),
    baseYear: Number(input.baseYear),
    targetYear: Number(input.targetYear),
    basis: String(input.basis || '').trim() || null,
    statedBy: String(input.statedBy).trim(),
    reference: String(input.reference).trim(),
    kind: 'declared',
    recordedAt: new Date().toISOString(),
    recordedBy: ctx.actor || null,
  };
}

/**
 * Where the book stands against the pledge.
 *
 * @param {Pledge|null} pledge
 * @param {{baselineValue?: number|null, currentValue?: number|null, asOfYear?: number|null}} position
 *   `baselineValue` is the figure in the base year, `currentValue` today's.
 * @returns {Object} the position, or a statement of what it is missing
 */
function progress(pledge, position = {}) {
  if (!pledge) {
    return { available: false, reason: 'No pledge has been recorded for this organisation.',
      needs: 'Record one at PUT /v1/baselines/pledge. Nothing is assumed: a target this product chose would not be a commitment.' };
  }
  const from = maybeNumber(position.baselineValue);
  const at = maybeNumber(position.currentValue);
  const year = maybeNumber(position.asOfYear) ?? new Date().getUTCFullYear();

  const target = from === undefined ? null : from * (1 - pledge.targetPct / 100);

  if (from === undefined || at === undefined) {
    return {
      available: false,
      pledge,
      targetValue: target,
      reason: 'The position cannot be measured until both the base-year figure and the current figure are held.',
      needs: from === undefined
        ? `A baseline figure for ${pledge.baseYear}.`
        : 'A current figure for the book.',
    };
  }

  /* Reduction achieved, as a percentage of where it started. A rise is a
     negative achievement rather than an absent one — a book moving the wrong
     way is the thing a pledge screen most needs to say. */
  const achievedPct = from === 0 ? 0 : ((from - at) / from) * 100;
  const remainingPct = pledge.targetPct - achievedPct;
  const yearsLeft = pledge.targetYear - year;

  return {
    available: true,
    kind: 'measured',
    pledge,
    baseValue: from,
    currentValue: at,
    targetValue: round2(target),
    achievedPct: round2(achievedPct),
    remainingPct: round2(remainingPct),
    onTrack: remainingPct <= 0 ? true : null,
    yearsRemaining: yearsLeft,
    /* Deliberately not a forecast. Whether the remaining gap closes depends on
       a book that has not been written yet, and a straight line drawn through
       two points and printed beside a commitment reads as a plan. */
    direction: at < from ? 'reducing' : at > from ? 'rising' : 'flat',
    note: remainingPct <= 0
      ? 'The pledged reduction has been reached on this measure.'
      : `${round2(remainingPct)} percentage points remain against a pledge of ${pledge.targetPct}% by ${pledge.targetYear}.`,
  };
}

const round2 = n => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

module.exports = { validate, record, progress };
