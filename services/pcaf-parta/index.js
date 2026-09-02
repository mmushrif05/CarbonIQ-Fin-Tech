/**
 * PCAF Part A — assess one exposure.
 *
 * The result has two containers and they never merge. `inventory` is the Part A
 * financed-emissions figure, scope 3 Category 15 of the reporting institution.
 * `impact` holds reductions, avoided emissions and forward-looking metrics,
 * which rest on optional supplemental guidance rather than on Part A, and which
 * PCAF requires never obfuscate nor replace the inventory.
 *
 * The archetype decides which impact metrics exist. A user cannot pick them
 * freely: an efficiency retrofit reduces against its own base year, a renewable
 * project avoids against a counterfactual, and reporting one as the other is
 * exactly the confusion the separation is here to prevent.
 */

'use strict';

const archetypes  = require('./archetypes');
const dataQuality = require('./data-quality');
const { attributionFactor } = require('./attribution');
const { financedEmissions } = require('./emissions');
const impact = require('./impact');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition.';

function assessExposure(input) {
  const {
    projectName, counterparty, sector, reportingYear,
    assetClass = 'project-finance', archetype: archetypeId = 'general',
    outstandingAmount, totalProjectEquityPlusDebt, currency, attributionOverrideJustification,
    dataQualityOption,
    projectScope1_tCO2e, projectScope2_tCO2e, projectScope3_tCO2e, scope3Relevant, removals_tCO2e,
    reduction, avoided,
  } = input;

  const archetype = archetypes.forId(archetypeId);

  const af = attributionFactor({
    assetClass,
    outstandingAmount,
    denominator: totalProjectEquityPlusDebt,
    overrideJustification: attributionOverrideJustification,
  });

  const inventory = financedEmissions({
    attributionFactor: af.value,
    projectScope1_tCO2e, projectScope2_tCO2e, projectScope3_tCO2e,
    scope3Relevant, removals_tCO2e,
  });

  const dq = dataQuality.score(assetClass, dataQualityOption);

  /* Economic intensity — a Part A reporting recommendation (DCL p.127),
     expressed per million of currency lent. */
  const economicIntensity = outstandingAmount > 0
    ? +((inventory.scope1And2.value / (outstandingAmount / 1e6))).toFixed(2)
    : null;

  /* The impact container. Gated: an archetype that makes no reduction or
     avoidance claim gets no metrics, rather than zeros. */
  const impactBlock = { archetype: archetype.label, metrics: [] };

  if (archetype.impact === 'reduction' && reduction) {
    impactBlock.metrics.push(impact.expectedEmissionReductions({
      attributionFactor: af.value, ...reduction,
    }));
  }

  if (archetype.impact === 'avoided' && avoided) {
    if (avoided.projectAvoided_tCO2e !== undefined) {
      impactBlock.metrics.push(impact.avoidedEmissions({ attributionFactor: af.value, ...avoided }));
    }
    if (avoided.annualAvoided_tCO2e !== undefined) {
      impactBlock.metrics.push(impact.expectedAvoidedEmissions({ attributionFactor: af.value, ...avoided }));
    }
  }

  impactBlock.notComparable = impact.NOT_COMPARABLE;

  return {
    standard: STANDARD,
    project: { projectName, counterparty, sector, reportingYear, assetClass, archetype: archetype.id, currency },

    attribution: af,

    inventory: {
      ...inventory,
      economicIntensity_tCO2e_per_M: economicIntensity,
      economicIntensityNote: 'Economic emission intensity, expressed per million of the '
        + 'stated currency lent (PCAF Disclosure Checklist Part A, p.127).',
      dataQuality: dq,
    },

    impact: impactBlock,
  };
}

module.exports = { assessExposure, archetypes, dataQuality, STANDARD };
