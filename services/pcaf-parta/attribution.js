/**
 * The share of a project's emissions that belongs to the lender.
 *
 * For project finance the standard is explicit: the attribution factor is the
 * ratio between the outstanding amount (numerator) and the total equity and
 * debt of the financed project (denominator) — §5.3, "Attribution of
 * emissions". Other asset classes use other denominators (EVIC for listed
 * companies, property value at origination for real estate and mortgages), so
 * the denominator is a property of the asset class and never a shared default.
 *
 * A factor above 1 is refused rather than capped. The previous implementation
 * silently applied Math.min(1, loan / value), so a loan entered larger than the
 * project cost attributed 100% of the project's emissions with nothing on
 * screen saying so. A factor above 1 means the inputs are wrong; saying so is
 * the useful answer. An institution that genuinely means it may override, but
 * only with a justification, which is then carried into the report.
 */

'use strict';

const { traced } = require('./provenance');

const DENOMINATORS = {
  'project-finance': {
    field: 'totalProjectEquityPlusDebt',
    label: 'total project equity plus debt',
    reference: 'PCAF Part A Third Edition §5.3, Attribution of emissions',
  },
};

/**
 * @param {Object} p
 * @param {string} p.assetClass
 * @param {number} p.outstandingAmount
 * @param {number} p.denominator
 * @param {string} [p.overrideJustification] required to accept a factor above 1
 */
function attributionFactor({ assetClass, outstandingAmount, denominator, overrideJustification }) {
  const rule = DENOMINATORS[assetClass];
  if (!rule) {
    const err = new Error(`No attribution rule is held for asset class "${assetClass}".`);
    err.statusCode = 501;
    err.code = 'ATTRIBUTION_RULE_NOT_HELD';
    throw err;
  }

  if (!Number.isFinite(outstandingAmount) || outstandingAmount < 0) {
    const err = new Error('Outstanding amount must be a number of zero or more.');
    err.statusCode = 400; err.code = 'INVALID_OUTSTANDING';
    throw err;
  }

  /* Footnote 104: the factor can only be calculated where project-specific
     financial data is available. Where it is not, PCAF allows a rough
     estimation on other bases — but that is a different claim, and this engine
     will not manufacture it. */
  if (!Number.isFinite(denominator) || denominator <= 0) {
    const err = new Error(
      `The ${rule.label} must be a positive number. PCAF notes the attribution `
      + 'factor can only be calculated where project-specific financial data is '
      + 'available; where it is not, an estimate may be made on another basis, '
      + 'but it is not the same figure and is not computed here.');
    err.statusCode = 400; err.code = 'INVALID_DENOMINATOR';
    throw err;
  }

  const raw = outstandingAmount / denominator;

  if (raw > 1 && !overrideJustification) {
    const err = new Error(
      `The attribution factor comes to ${raw.toFixed(4)}, which is above 1: the `
      + `outstanding amount (${outstandingAmount}) exceeds the ${rule.label} `
      + `(${denominator}). That attributes more than the whole project's emissions `
      + 'to this lender, so it is refused rather than capped.');
    err.statusCode = 400;
    err.code = 'ATTRIBUTION_ABOVE_ONE';
    err.remedy = 'Check the outstanding amount and the denominator. If the figure is '
      + 'genuinely intended, supply a justification, which will be recorded in the report.';
    throw err;
  }

  return traced({
    value: +raw.toFixed(6),
    unit: 'ratio',
    equation: `attribution factor = outstanding amount ÷ ${rule.label}`,
    inputs: { outstandingAmount, [rule.field]: denominator },
    basis: 'Measured from the financial data supplied',
    reference: rule.reference,
    assumptions: raw > 1
      ? [`Attribution factor above 1 accepted on the stated justification: ${overrideJustification}`]
      : [],
  });
}

module.exports = { attributionFactor, DENOMINATORS };
