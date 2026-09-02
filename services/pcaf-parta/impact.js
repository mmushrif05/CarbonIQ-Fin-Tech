/**
 * Reductions, avoided emissions and the forward-looking metrics.
 *
 * These are NOT financed emissions and this module exists to keep them apart.
 *
 * Two things the Third Edition says that decide the design.
 *
 * First, avoided emissions have LEFT Part A. §5.3 states that earlier editions
 * carried guidance for estimating avoided emissions from renewable energy
 * projects, and that "beginning with this Third Edition (December 2025),
 * avoided emissions are no longer covered in this Standard" — they move to the
 * optional supplemental guidance on Financed Avoided Emissions and
 * Forward-looking Metrics. That supplement is explicit that it "does not
 * include renewable energy-specific calculation guidance"; for that, PCAF
 * points back to earlier editions. So anything computed here rests on the
 * supplement, not on Part A, and the output says which.
 *
 * Second, the supplement's own prohibitions, both "shall":
 *
 *   Disclosure of financed avoided emissions shall not obfuscate nor replace
 *   disclosures covered under Part A of the PCAF Global Standard.
 *
 *   Financial institutions shall not estimate avoided emissions based on
 *   economic intensities such as input-output models due to the high
 *   uncertainty and low credibility associated with such an approach.
 *
 * The first is why nothing in this file is ever summed into the inventory, and
 * why every result carries the non-comparability statement. The second is a
 * refusal, below.
 */

'use strict';

const { traced } = require('./provenance');

const SUPPLEMENT = 'PCAF (2025). Financed avoided emissions & forward-looking metrics — '
  + 'supplemental guidance to Part A. December 2025.';

const NOT_COMPARABLE =
  'Financed avoided emissions and forward-looking metrics are not comparable with '
  + 'financed emissions and are never added to them. They are reported separately '
  + 'and do not replace the Part A inventory.';

/** The prohibited estimation bases, refused rather than computed. */
const PROHIBITED_BASES = ['economic-intensity', 'input-output', 'eeio'];

function _refuseProhibited(basis) {
  if (basis && PROHIBITED_BASES.includes(String(basis).toLowerCase())) {
    const err = new Error(
      'Avoided emissions may not be estimated from economic intensities or '
      + 'input-output models. PCAF states institutions shall not do so, because of '
      + 'the high uncertainty and low credibility of that approach.');
    err.statusCode = 422;
    err.code = 'PROHIBITED_ESTIMATION_BASIS';
    err.remedy = 'Use physical activity data — generation output and a displaced '
      + 'emission factor with its source and vintage.';
    throw err;
  }
}

/**
 * Realised avoided emissions, attributed to the lender.
 *
 * The counterfactual is the whole claim, so it is required and travels with the
 * figure. An avoided-emissions number without the scenario it is measured
 * against says nothing.
 */
function avoidedEmissions({
  attributionFactor: af, projectAvoided_tCO2e, counterfactual, counterfactualSource,
  estimationBasis, reportingPeriod, counterpartyEmissionsPeriod,
}) {
  _refuseProhibited(estimationBasis);

  if (!counterfactual || !counterfactualSource) {
    const err = new Error(
      'Avoided emissions require the counterfactual scenario and its source. '
      + 'Avoided emissions are defined relative to a situation that did not happen, '
      + 'so the figure is meaningless without stating which situation.');
    err.statusCode = 400; err.code = 'COUNTERFACTUAL_REQUIRED';
    throw err;
  }

  /* "The time period over which financed avoided emissions are reported shall
     be consistent with the timeframe of the financed (generated) emissions of
     the counterparty." */
  const timeframeConsistent = !reportingPeriod || !counterpartyEmissionsPeriod
    || String(reportingPeriod) === String(counterpartyEmissionsPeriod);

  if (!timeframeConsistent) {
    const err = new Error(
      `The avoided-emissions period (${reportingPeriod}) differs from the period of `
      + `the counterparty's generated emissions (${counterpartyEmissionsPeriod}). PCAF `
      + 'requires the two be consistent.');
    err.statusCode = 400; err.code = 'TIMEFRAME_INCONSISTENT';
    throw err;
  }

  return {
    metric: 'Financed avoided emissions',
    figure: traced({
      value: +(projectAvoided_tCO2e * af).toFixed(2),
      unit: 'tCO2e',
      equation: 'financed avoided emissions = project avoided emissions × attribution factor',
      inputs: { projectAvoided_tCO2e, attributionFactor: af },
      basis: 'Measured against the stated counterfactual',
      reference: SUPPLEMENT,
      assumptions: [`Counterfactual: ${counterfactual}`, `Source: ${counterfactualSource}`],
    }),
    counterfactual,
    counterfactualSource,
    notComparable: NOT_COMPARABLE,
    scopeNote: 'Avoided emissions are no longer covered by Part A; from the Third '
      + 'Edition (December 2025) they sit in optional supplemental guidance. This '
      + 'figure rests on that supplement, not on the Part A Standard.',
  };
}

/**
 * Expected Emission Reductions — forward-looking, against a base year.
 *
 * The supplement's worked example interpolates linearly between the base year
 * and the target year, and reports a percentage achieved against expectation:
 * (100,000 − 50,000) / (2030 − 2025) × (2027 − 2025) = 20,000.
 */
function expectedEmissionReductions({
  attributionFactor: af, baseYear, baseYearEmissions_tCO2e,
  targetYear, targetYearEmissions_tCO2e, asOfYear,
}) {
  if (!(targetYear > baseYear)) {
    const err = new Error('The target year must be after the base year.');
    err.statusCode = 400; err.code = 'INVALID_HORIZON';
    throw err;
  }

  const totalReduction = baseYearEmissions_tCO2e - targetYearEmissions_tCO2e;
  const year = Number.isFinite(asOfYear) ? asOfYear : targetYear;
  const elapsed = Math.max(0, Math.min(year, targetYear) - baseYear);
  const interpolated = totalReduction / (targetYear - baseYear) * elapsed;

  return {
    metric: 'Expected Emission Reductions (EER)',
    comparedAgainst: `base year ${baseYear}`,
    figure: traced({
      value: +(interpolated * af).toFixed(2),
      unit: 'tCO2e',
      equation: 'EER = (base year emissions − target year emissions) ÷ (target year − base year) '
        + '× (as-of year − base year) × attribution factor',
      inputs: { baseYear, baseYearEmissions_tCO2e, targetYear, targetYearEmissions_tCO2e, asOfYear: year, attributionFactor: af },
      basis: 'Projected, interpolated linearly between the base year and the target year',
      reference: SUPPLEMENT,
    }),
    achieved: null,
    achievedNote: 'Achieved reductions and the percentage achieved against expectation '
      + 'begin at the first reporting period with realised emissions.',
    notComparable: NOT_COMPARABLE,
  };
}

/**
 * Expected Avoided Emissions — forward-looking, against a counterfactual.
 *
 * "The fundamental difference with Expected Emission Reductions is that the
 * projected emissions are compared to a counterfactual scenario", and "the EAE
 * shall be calculated on an annualized basis".
 */
function expectedAvoidedEmissions({
  attributionFactor: af, annualAvoided_tCO2e, counterfactual, counterfactualSource,
  estimationBasis, years,
}) {
  _refuseProhibited(estimationBasis);

  if (!counterfactual || !counterfactualSource) {
    const err = new Error('Expected avoided emissions require the counterfactual scenario and its source.');
    err.statusCode = 400; err.code = 'COUNTERFACTUAL_REQUIRED';
    throw err;
  }

  return {
    metric: 'Expected Avoided Emissions (EAE)',
    comparedAgainst: 'a counterfactual scenario',
    /* Annualised, as the supplement requires — not a lifetime total, which
       would look far larger and mean something else. */
    figure: traced({
      value: +(annualAvoided_tCO2e * af).toFixed(2),
      unit: 'tCO2e per year',
      equation: 'EAE (annualised) = annual avoided emissions × attribution factor',
      inputs: { annualAvoided_tCO2e, attributionFactor: af },
      basis: 'Projected against the stated counterfactual, on an annualised basis',
      reference: SUPPLEMENT,
      assumptions: [`Counterfactual: ${counterfactual}`, `Source: ${counterfactualSource}`],
    }),
    /* Carried at the top level as well as inside the figure's assumptions.
       The counterfactual is the claim, so a consumer rendering this metric
       must not have to dig into a provenance tree to state it. */
    counterfactual,
    counterfactualSource,
    horizonYears: Number.isFinite(years) ? years : null,
    annualisedNote: 'PCAF requires EAE to be calculated on an annualised basis. A '
      + 'lifetime total is a different figure and is not reported here.',
    notComparable: NOT_COMPARABLE,
    scopeNote: 'Rests on the supplemental guidance, not on Part A.',
  };
}

module.exports = {
  avoidedEmissions, expectedEmissionReductions, expectedAvoidedEmissions,
  NOT_COMPARABLE, PROHIBITED_BASES, SUPPLEMENT,
};
