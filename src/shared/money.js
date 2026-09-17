// @ts-check
/**
 * One way to print an amount of money, and one way to print a scale.
 *
 * Nine screens carried their own money formatter and seven of them printed a
 * dollar sign in front of whatever the figure was — on a Sri Lankan book kept
 * in rupees, in front of a GCF ask that is in US dollars, and in front of
 * figures that carried no currency at all. A symbol is a claim about the
 * currency, and on a regulated document a wrong one is a wrong figure. So an
 * amount is printed with its **ISO code** and never a symbol, the code the
 * record carries and nothing inferred: `LKR 250,000,000`, `USD 72,000,000`.
 *
 * The other half is scale. A chief executive does not read `6100000000`; they
 * read `6.1 bn`. Every figure therefore has three forms and the caller picks
 * the one the place can carry:
 *
 *   full       LKR 250,000,000              — a table cell, a register row
 *   short      LKR 250 mn                   — a tile, a chart label
 *   annotated  LKR 250,000,000 (250 mn)     — prose, a figure block, a form
 *
 * The scale words are `bn`, `mn` and `k`, lower case, a space before them;
 * a figure below a thousand carries none, and the annotated form adds the
 * short one only from a million up, because `(750 k)` beside `750,000` tells a
 * reader nothing they did not have. The browser carries the same rules in
 * `ui/js/format.js` and a test holds the two to one another, so a screen and
 * the document it downloads cannot print one amount two ways.
 *
 * Absence is a dash, never `0`: `Number(null)` is 0, which this repository has
 * shipped three defects by forgetting.
 */

'use strict';

const { maybeNumber } = require('../shared/numbers');

const ABSENT = '—';
const MINUS = '−';

/** The scale steps, largest first. */
const STEPS = /** @type {Array<[number, string]>} */ ([[1e9, 'bn'], [1e6, 'mn'], [1e3, 'k']]);

/**
 * A figure with thousands separators and at most `dp` decimals.
 * @param {unknown} value
 * @param {number} [dp]
 */
function separated(value, dp = 2) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  return n.toLocaleString('en-US', { maximumFractionDigits: dp });
}

/**
 * A figure with thousands separators at exactly `dp` decimals — the form the
 * documents print tonnes in, `12,038.240`.
 * @param {unknown} value
 * @param {number} [dp]
 */
function fixed(value, dp = 3) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/**
 * The scale of a figure: `{ value: 6.1, unit: 'bn' }` for 6,100,000,000.
 * Rounded to two decimals; a figure that rounds up to the next step takes
 * it, so 999,999,999 is `1 bn` and never `1,000 mn`.
 * @param {number} n
 * @returns {{ value: number, unit: string }}
 */
function scaleOf(n) {
  const a = Math.abs(n);
  const r2 = x => Math.round(x * 100) / 100;
  for (let i = 0; i < STEPS.length; i++) {
    const [size, unit] = STEPS[i];
    if (a < size) continue;
    const v = r2(a / size);
    /* 999,999,999 rounds to 1,000 mn; the step above says the same thing in
       one word. */
    if (v >= 1000 && i > 0) return { value: r2(a / STEPS[i - 1][0]), unit: STEPS[i - 1][1] };
    return { value: v, unit };
  }
  const v = r2(a);
  return v >= 1000 ? { value: r2(a / STEPS[STEPS.length - 1][0]), unit: STEPS[STEPS.length - 1][1] } : { value: v, unit: '' };
}

/**
 * The short form: `250 mn`, `6.1 bn`, `750 k`, `420`. No currency here.
 * @param {unknown} value
 */
function short(value) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  const s = scaleOf(n);
  const body = s.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${n < 0 ? MINUS : ''}${body}${s.unit ? ` ${s.unit}` : ''}`;
}

/** The currency code in front of a printed figure, or nothing. */
const withCode = (code, body) => (code ? `${String(code).trim().toUpperCase()} ${body}` : body);

/**
 * The full form: `LKR 250,000,000`. A negative figure carries the minus
 * before the code, where a reader looks for it: `−USD 1,200,000`.
 * @param {unknown} value
 * @param {string} [currency]
 * @param {number} [dp]
 */
function money(value, currency, dp = 0) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  const body = withCode(currency, Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: dp }));
  return n < 0 ? `${MINUS}${body}` : body;
}

/**
 * The short form with its code: `LKR 250 mn`, `−USD 1.2 mn`.
 * @param {unknown} value
 * @param {string} [currency]
 */
function moneyShort(value, currency) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  const body = withCode(currency, short(Math.abs(n)));
  return n < 0 ? `${MINUS}${body}` : body;
}

/**
 * The full form with the scale beside it from a million up:
 * `LKR 250,000,000 (250 mn)`; below that, the full form alone.
 * @param {unknown} value
 * @param {string} [currency]
 */
function moneyAnnotated(value, currency) {
  const n = maybeNumber(value);
  if (n === undefined) return ABSENT;
  const full = money(n, currency);
  return Math.abs(n) >= 1e6 ? `${full} (${short(Math.abs(n))})` : full;
}

module.exports = { separated, fixed, short, money, moneyShort, moneyAnnotated, scaleOf, ABSENT };
