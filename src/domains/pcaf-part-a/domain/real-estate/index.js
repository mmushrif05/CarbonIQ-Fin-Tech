// @ts-check
/**
 * PCAF Part A §5.4 (commercial real estate) and §5.5 (mortgages) — one engine
 * for one calculation the two classes share: financed building emissions =
 * building scope 1 and 2 × (outstanding ÷ property value at origination).
 *
 * classify → denominator (origination value, fixed) → building emissions from
 * however the energy is known (which sets the option and the data-quality
 * score) → attribute. Scope 1 and 2 are reported combined at minimum, with the
 * split carried. Construction emissions are optional for CRE and not required
 * for mortgages: they are reported absent by default, and a developer-reported
 * construction figure is carried as scope 3 category 15, separate and never
 * summed with operational scope 1 and 2.
 *
 * The engine does every arithmetic operation and every figure is traced. It
 * stores nothing; the same request twice returns the same answer.
 */

'use strict';

const { classify } = require('./classify');
const { realEstateDenominator } = require('./denominator');
const { buildingEmissions } = require('./energy');
const dataQuality = require('../data-quality');
const { traced, absent } = require('../provenance');
const rs = require('./dataset');

const STANDARD = 'PCAF (2025). Global GHG Accounting and Reporting Standard Part A: Financed '
  + 'Emissions. Third Edition, §5.4 / §5.5 and Chapter 6.';

const r2 = n => +Number(n).toFixed(2);

/**
 * @param {Object} input
 * @returns {Object} the traced financed-emissions result for one property exposure
 */
function assessRealEstate(input = {}) {
  const classified = classify(input);
  const country = (input.country || 'LK').toUpperCase();

  const exposure = input.exposure || {};
  const v = input.value || {};
  const denom = realEstateDenominator({
    outstanding: exposure.outstanding,
    valueAtOrigination: v.atOrigination,
    latestValue: v.latest,
    modification: v.modification,
    currency: exposure.currency || 'LKR',
  });

  const energy = buildingEmissions({
    country,
    metered: input.energy,
    label: input.label,
    buildingType: input.buildingType,
    floorArea_m2: input.floorArea_m2,
    buildingCount: input.buildingCount,
  });

  const af = denom.rawValue;
  const attribute = (buildingValue, label) => traced({
    value: r2(buildingValue * af),
    unit: 'tCO2e',
    equation: `financed ${label} = building ${label} × attribution factor`,
    inputs: { [`building_${label.replace(/[^a-z0-9]/gi, '_')}_tCO2e`]: buildingValue, attributionFactor: denom.factor.value },
    basis: `Measured (Option ${energy.option})`,
    reference: 'PCAF Part A Third Edition §5.4 / §5.5',
  });

  const be = energy.buildingEmissions;
  const financedScope1 = attribute(be.scope1, 'scope 1');
  const financedScope2 = attribute(be.scope2, 'scope 2');
  const financedCombined = r2(Number(financedScope1.value) + Number(financedScope2.value));

  const dq = dataQuality.score(classified.class, energy.option);

  /* Construction emissions: optional (CRE) or not required (mortgages), so
     absent by default; a developer-reported figure is carried as scope 3 cat 15,
     separate and never summed with operational scope 1 and 2. */
  const dev = Number(input.developerConstructionEmissions_tCO2e);
  const construction = classified.class === 'commercial-real-estate' && Number.isFinite(dev) && dev >= 0
    ? traced({
        value: r2(dev * af), unit: 'tCO2e',
        equation: 'financed construction scope 3 = developer-reported construction emissions × attribution factor',
        inputs: { developerConstructionEmissions_tCO2e: dev, attributionFactor: denom.factor.value },
        basis: 'Declared by the developer',
        reference: 'PCAF Part A Third Edition §5.4 (pp.77–78) — construction emissions optional, scope 3 category 15',
        assumptions: ['Reported separately and never summed with operational scope 1 and 2.'],
      })
    : absent('Financed construction emissions (scope 3 category 15)',
        classified.class === 'mortgages'
          ? 'Not required under §5.5: the homeowner does not account for the builder’s emissions (fn 132).'
          : 'Optional under §5.4 and not reported here; supplied only where the developer reports it.',
        'PCAF Part A Third Edition §5.4 (pp.77–78)');

  return {
    standard: STANDARD,
    property: {
      class: classified.class,
      section: classified.section,
      country,
      buildingType: input.buildingType || null,
      notes: classified.notes,
      dataset: rs.release().tables[0],
    },
    denominator: { state: denom.state, valueAtOrigination: denom.value, factor: denom.factor },
    attribution: denom.factor,
    inventory: {
      financedScope1And2: {
        combined: financedCombined,
        scope1: financedScope1,
        scope2: financedScope2,
        unit: 'tCO2e',
        note: 'The re/insurer’s attributed share of the building’s operational scope 1 and 2, '
          + 'reported combined at minimum with the split carried (§5.4 p.79; Chapter 6).',
      },
      buildingEmissions: energy.buildingEmissions,
      energy: energy.energy,
      factors: energy.factors,
      dataQuality: dq,
      constructionScope3: construction,
      category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },
    provisional: energy.provisional,
  };
}

module.exports = { assessRealEstate, STANDARD };
