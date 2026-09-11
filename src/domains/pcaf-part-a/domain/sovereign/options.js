// @ts-check
/**
 * Which data-quality option a sovereign emissions figure has earned.
 *
 * §5.9's Table 5.9-6 scores by how the country's emissions were obtained, and
 * for a sovereign that is a property of the *source*, not of anything the bank
 * did: the country's own verified UNFCCC submission is Option 1a, an unverified
 * one 1b, a physical energy-activity estimate Option 2, a sectoral-revenue
 * estimate 3a, and a proxy country 3b. The dataset carries a `basis` on each
 * figure; this maps it to the option, and the engine then reads the score from
 * the sovereign table (never another class's).
 *
 * A caller may still name a different option — it may hold evidence this system
 * never received — but only with a justification, which is recorded beside the
 * score. That is the same discipline the renewable-generation path follows:
 * claiming a better option than the source supports is exactly what this
 * refuses to wave through.
 */

'use strict';

const dataQuality = require('../data-quality');

/**
 * The source basis on a held figure → the §5.9 option it earns. A basis not in
 * this map (e.g. an illustrative provisional figure) earns no option on its
 * own and the caller must name one.
 */
const BASIS_TO_OPTION = Object.freeze({
  'unfccc-reported-verified': '1a',
  'unfccc-reported-unverified': '1b',
  'provider-relayed': '1b',
  /* EDGAR and Climate Watch are third-party estimates of the territorial
     figure, standing in for the country's own UNFCCC submission — an available
     but unverified reported figure, Option 1b. Named on the trace so a reviewer
     sees it is not the country's own report. */
  'edgar-estimated': '1b',
  'climatewatch-estimated': '1b',
  'energy-activity': '2',
  'revenue-sector': '3a',
  'proxy-country': '3b',
  proxy: '3b',
});

/**
 * Resolve the option and its score.
 *
 * @param {Object} p
 * @param {string|null} [p.basis]        the source basis on the held figure
 * @param {string|null} [p.requested]    an option the caller named
 * @param {string|null} [p.overrideJustification]
 * @returns {any}
 */
function resolveOption({ basis, requested, overrideJustification } = {}) {
  const derived = basis ? BASIS_TO_OPTION[basis] || null : null;

  if (!derived) {
    if (!requested) {
      const err = /** @type {any} */ (new Error(
        'A data quality option is required. The emissions source '
        + `(${basis || 'unstated'}) does not map to a §5.9 option on its own, so name `
        + 'one from Table 5.9-6 (1a, 1b, 2, 3a, 3b).'));
      err.statusCode = 400; err.code = 'DQ_OPTION_REQUIRED';
      err.remedy = 'Supply dataQualityOption, or source the figure from UNFCCC (1a/1b), '
        + 'an energy-activity estimate (2), a sectoral estimate (3a) or a proxy country (3b).';
      throw err;
    }
    return { ...dataQuality.score('sovereign-debt', requested), derived: false, fromBasis: null };
  }

  const differs = requested && String(requested).toLowerCase() !== derived;
  if (differs && !overrideJustification) {
    const err = /** @type {any} */ (new Error(
      `The emissions source places this at Option ${derived}, but Option ${requested} `
      + 'was requested.'));
    err.statusCode = 400; err.code = 'DQ_OPTION_NOT_EARNED';
    err.remedy = 'Use the derived option, or supply a justification stating what evidence '
      + 'supports the option requested. The justification is recorded beside the score.';
    throw err;
  }

  const chosen = differs ? String(requested).toLowerCase() : derived;
  return {
    ...dataQuality.score('sovereign-debt', chosen),
    derived: !differs,
    fromBasis: basis,
    derivedOption: derived,
    overrideJustification: differs ? overrideJustification : null,
  };
}

module.exports = { resolveOption, BASIS_TO_OPTION };
