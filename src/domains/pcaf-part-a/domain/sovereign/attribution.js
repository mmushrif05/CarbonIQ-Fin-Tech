// @ts-check
/**
 * A sovereign's attribution factor — the one place Part A does not divide by
 * equity plus debt.
 *
 * §5.9 (p.144): `attribution factor = exposure to sovereign bond (USD) ÷
 * PPP-adjusted GDP (international USD)`. PPP-adjusted GDP stands in for the
 * "value of the country" because a sovereign has no equity to measure, and
 * debt alone distorts wildly — Hong Kong's near-zero debt would attribute
 * 1,369× Singapore's emissions per dollar (Annex 10.3, p.202). It is a flow
 * standing in for a stock, a mismatch the standard accepts consciously.
 *
 * There is no cap and none is needed: a single institution's holding is always
 * a tiny fraction of a nation's output. A factor above 1 therefore cannot be a
 * real sovereign exposure — it is an input error (an exposure in the wrong
 * units, a GDP in the wrong ones) — so it is refused, not carried.
 *
 * The denominator is held in millions of international USD (the World Bank's
 * unit); the exposure is absolute USD. The conversion is on the trace so a
 * reviewer can follow it.
 */

'use strict';

const { traced } = require('../provenance');

const REF = 'PCAF Part A Third Edition §5.9, Attribution of emissions (p.144); Annex 10.3 (pp.201–204)';

/**
 * @param {Object} p
 * @param {number} p.exposureUsd            outstanding exposure, absolute USD
 * @param {number} p.pppGdpMillionUsd       PPP-adjusted GDP, millions of international USD
 * @param {number} [p.pppGdpYear]
 */
function sovereignAttributionFactor({ exposureUsd, pppGdpMillionUsd, pppGdpYear }) {
  if (!Number.isFinite(exposureUsd) || exposureUsd < 0) {
    const err = /** @type {any} */ (new Error('Exposure must be a number of zero or more (absolute USD).'));
    err.statusCode = 400; err.code = 'INVALID_EXPOSURE';
    throw err;
  }
  if (!Number.isFinite(pppGdpMillionUsd) || pppGdpMillionUsd <= 0) {
    const err = /** @type {any} */ (new Error(
      'PPP-adjusted GDP must be a positive number in millions of international USD.'));
    err.statusCode = 400; err.code = 'INVALID_PPP_GDP';
    throw err;
  }

  const denominatorUsd = pppGdpMillionUsd * 1e6;
  const raw = exposureUsd / denominatorUsd;

  if (raw > 1) {
    const err = /** @type {any} */ (new Error(
      `The attribution factor comes to ${raw.toFixed(4)}, above 1: the exposure `
      + `(${exposureUsd} USD) exceeds the country's whole PPP-adjusted GDP `
      + `(${pppGdpMillionUsd} million USD). That cannot be a real sovereign holding, `
      + 'so it is refused as an input error rather than capped.'));
    err.statusCode = 400; err.code = 'ATTRIBUTION_ABOVE_ONE';
    err.remedy = 'Check the exposure is in absolute USD and the PPP-adjusted GDP is in '
      + 'millions of international USD.';
    throw err;
  }

  return {
    ...traced({
      value: +raw.toFixed(9),
      unit: 'ratio',
      equation: 'attribution factor = exposure (USD) ÷ PPP-adjusted GDP (international USD)',
      inputs: { exposureUsd, pppGdpMillionUsd, pppGdpDenominatorUsd: denominatorUsd, pppGdpYear: pppGdpYear || null },
      basis: 'Measured from the exposure and the country PPP-adjusted GDP',
      reference: REF,
      assumptions: [
        'PPP-adjusted GDP is a flow standing in for the value of the country; the '
        + 'stock-over-flow mismatch is accepted per Annex 10.3.',
      ],
    }),
    /* The unrounded ratio, used to attribute emissions so the figure matches
       the standard's worked example: rounding the factor to nine places first
       drifts Hong Kong's 91 to 90.9. `value` above is the display figure. */
    rawValue: raw,
  };
}

module.exports = { sovereignAttributionFactor, REF };
