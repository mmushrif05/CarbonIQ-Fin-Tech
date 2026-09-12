// @ts-check
/**
 * The §5.4 / §5.5 attribution denominator: the property value at origination.
 *
 * Outstanding ÷ property value at origination (land, building and
 * improvements), and the value is **fixed** for every subsequent year (§5.4
 * p.78, §5.5 p.84). Three states, because origination values are held in some
 * countries and revalued annually in others, and the rule exists precisely to
 * stop an annual revaluation drifting the attribution:
 *
 *   origination — the value at origination is held and used;
 *   latest-fixed — origination is unobtainable, so the latest value is used and
 *     then fixed for every subsequent year, never re-read;
 *   modified — a modification, renewal, refinance or extension with a new
 *     valuation updates the origination value to that date, and it is fixed
 *     again from there.
 *
 * A factor above 1 (a loan larger than the property value at origination) is
 * refused as an input error rather than carried, the same coherence guard §5.2
 * applies: an attributed share above 100% is almost always a value in the wrong
 * units or a loan against something other than this property.
 */

'use strict';

const { traced } = require('../provenance');
const { refuse } = require('./classify');

const REF = 'PCAF Part A Third Edition §5.4 (p.78) and §5.5 (p.84), attribution of emissions';

/**
 * @param {Object} p
 * @param {number} p.outstanding                  outstanding amount, in the exposure currency
 * @param {number} [p.valueAtOrigination]         the value at origination (preferred)
 * @param {number} [p.latestValue]                the latest value, used and then fixed where origination is unobtainable
 * @param {{ newValuation: number, date?: string }} [p.modification]  a modification with a new valuation
 * @param {string} [p.currency]
 */
function realEstateDenominator(p) {
  if (!Number.isFinite(p.outstanding) || p.outstanding < 0) {
    throw refuse('INVALID_OUTSTANDING', 'Outstanding must be a number of zero or more.');
  }

  let value, state, note;
  if (p.modification && Number.isFinite(p.modification.newValuation) && p.modification.newValuation > 0) {
    value = p.modification.newValuation; state = 'modified';
    note = `A modification with a new valuation${p.modification.date ? ` on ${p.modification.date}` : ''} `
      + 'updated the origination value to that date; it is fixed again from there.';
  } else if (Number.isFinite(p.valueAtOrigination) && Number(p.valueAtOrigination) > 0) {
    value = Number(p.valueAtOrigination); state = 'origination';
    note = 'The property value at origination, fixed for every subsequent year.';
  } else if (Number.isFinite(p.latestValue) && Number(p.latestValue) > 0) {
    value = Number(p.latestValue); state = 'latest-fixed';
    note = 'The value at origination was unobtainable, so the latest value is used and then fixed '
      + 'for every subsequent year — never re-read on an annual revaluation.';
  } else {
    throw refuse('ORIGINATION_VALUE_REQUIRED',
      'A property value at origination is required (or the latest value where origination is '
      + 'unobtainable, or a modification with a new valuation).', 400,
      'Supply valueAtOrigination, or latestValue, or modification.newValuation.');
  }

  const raw = p.outstanding / value;
  if (raw > 1) {
    throw refuse('ATTRIBUTION_ABOVE_ONE',
      `The attribution factor comes to ${raw.toFixed(4)}, above 1: the outstanding amount `
      + `(${p.outstanding}) exceeds the property value at origination (${value}). That attributes `
      + 'more than the whole building and is refused as an input error rather than capped.', 400,
      'Check the outstanding amount and the property value are in the same currency and units.');
  }

  return {
    state,
    value,
    factor: traced({
      value: +raw.toFixed(9),
      unit: 'ratio',
      equation: 'attribution factor = outstanding ÷ property value at origination',
      inputs: { outstanding: p.outstanding, valueAtOrigination: value, currency: p.currency || null },
      basis: `Measured (${state})`,
      reference: REF,
      assumptions: [note],
    }),
    rawValue: raw,
  };
}

module.exports = { realEstateDenominator, REF };
