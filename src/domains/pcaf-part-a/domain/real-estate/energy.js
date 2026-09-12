// @ts-check
/**
 * The §5.4 / §5.5 building-emissions equation and the option it earns.
 *
 * PCAF estimates a building's scope 1 and 2 as energy by source × an emission
 * factor per source (§5.4 p.79). How the energy is known decides the option and
 * so the data-quality score. The shared property table is Tables 5.4-1 and 5.5-1:
 *
 *   1a metered energy × a supplier-specific (market-based) factor → score 1
 *   1b metered energy × an average (location-based) factor         → score 2
 *   2a an official energy label × floor area (statistical energy)  → score 3
 *   2b building-type & location statistics × floor area            → score 4
 *   3  building-type & location statistics × the building count     → score 5
 *
 * Electricity is the building's scope 2, on-site fuel combustion its scope 1.
 * Nothing here divides by anything or attributes — that is the denominator's
 * job; this returns the building's own (100%) emissions, traced, and the option.
 */

'use strict';

const { traced } = require('../provenance');
const { numberOr } = require('../../../../shared/numbers');
const { refuse } = require('./classify');
const rs = require('./dataset');

const REF = 'PCAF Part A Third Edition §5.4 (p.79) / §5.5, building emissions by energy source × factor';
const r2 = n => +Number(n).toFixed(2);

/**
 * @param {Object} p
 * @param {string} p.country
 * @param {Object} [p.metered]      { electricity_kWh, fuel_kWh, fuelSource, emissionFactorBasis: 'supplier'|'average', electricityFactor?, fuelFactor? }
 * @param {string} [p.label]        an official energy label class (A..G) — Option 2a
 * @param {string} [p.buildingType] a held building-type key — Options 2b / 3
 * @param {number} [p.floorArea_m2] Options 2a / 2b
 * @param {number} [p.buildingCount] Option 3 (no floor area)
 * @returns {{ option: string, buildingEmissions: any, energy: any, factors: any, traced: any, provisional: boolean }}
 */
function buildingEmissions(p) {
  const factors = rs.factorsFor(p.country);
  if (!factors) {
    throw refuse('REAL_ESTATE_FACTORS_NOT_HELD',
      `No grid and fuel emission factors are held for country "${p.country}".`, 400,
      'Supply metered energy with explicit factors, or add the country to the energy-statistics set.');
  }

  /* Option 1: metered energy. Supplier-specific factor → 1a; average → 1b. */
  if (p.metered && (Number.isFinite(p.metered.electricity_kWh) || Number.isFinite(p.metered.fuel_kWh))) {
    const m = p.metered;
    const supplier = m.emissionFactorBasis === 'supplier';
    const elecKwh = numberOr(m.electricity_kWh, 0);
    const fuelKwh = numberOr(m.fuel_kWh, 0);
    const fuelSrc = m.fuelSource === 'lpg' ? 'lpg' : 'diesel';
    const elecFactor = supplier && Number.isFinite(m.electricityFactor) ? Number(m.electricityFactor) : factors.electricity_grid.value;
    const fuelFactor = supplier && Number.isFinite(m.fuelFactor) ? Number(m.fuelFactor) : factors[fuelSrc].value;
    if (supplier && !(Number.isFinite(m.electricityFactor) || Number.isFinite(m.fuelFactor))) {
      throw refuse('SUPPLIER_FACTOR_REQUIRED',
        'Option 1a claims a supplier-specific (market-based) factor but none was supplied.', 400,
        'Supply electricityFactor and/or fuelFactor, or set emissionFactorBasis to "average" for Option 1b.');
    }
    const scope2 = r2(elecKwh * elecFactor / 1000);
    const scope1 = r2(fuelKwh * fuelFactor / 1000);
    return build('metered', supplier ? '1a' : '1b', { electricity_kWh: elecKwh, fuel_kWh: fuelKwh, fuelSource: fuelSrc },
      scope1, scope2, { electricity: elecFactor, fuel: fuelFactor, basis: supplier ? 'supplier-specific (market-based)' : 'average (location-based)', provisional: !supplier },
      supplier ? [] : ['Location-based grid and fuel factors are provisional pending a released baseline.']);
  }

  /* Options 2/3 need a building type held in the statistics. */
  const type = p.buildingType ? rs.typeFor(p.buildingType) : null;
  if (!type) {
    throw refuse('BUILDING_TYPE_NOT_HELD',
      `Estimating energy needs a held building type; "${p.buildingType || 'none'}" is not in the set (${rs.typeKeys().join(', ')}).`,
      400, 'Supply metered energy, or a held buildingType.');
  }
  const intensity = type.intensity_kWh_per_m2_yr.value;
  const share = type.electricityShare;
  const emit = (energyKwh) => {
    const elec = energyKwh * share, fuel = energyKwh * (1 - share);
    return {
      scope2: r2(elec * factors.electricity_grid.value / 1000),
      scope1: r2(fuel * factors[type.fuelSource].value / 1000),
      elec, fuel,
    };
  };

  /* Option 2a: an official energy label × floor area. */
  if (p.label && Number.isFinite(p.floorArea_m2) && Number(p.floorArea_m2) > 0) {
    const classes = rs.labelClasses().classes;
    const li = classes[String(p.label).toUpperCase()];
    if (!Number.isFinite(li)) {
      throw refuse('LABEL_CLASS_NOT_HELD',
        `Energy label class "${p.label}" is not in the label table (${Object.keys(classes).join(', ')}).`, 400,
        'Supply a held label class (A–G), or use Option 2b with a building type.');
    }
    const energyKwh = li * Number(p.floorArea_m2);
    const e = emit(energyKwh);
    return build('label-floor-area', '2a', { electricity_kWh: r2(e.elec), fuel_kWh: r2(e.fuel), fuelSource: type.fuelSource, energyKwh: r2(energyKwh), labelClass: String(p.label).toUpperCase() },
      e.scope1, e.scope2, { electricity: factors.electricity_grid.value, fuel: factors[type.fuelSource].value, basis: 'statistical (label class × floor area)', provisional: true },
      ['Label-class intensities are illustrative, not a Sri Lankan scheme (fn 129).', 'Grid and fuel factors are provisional.']);
  }

  /* Option 2b: building-type statistics × floor area. */
  if (Number.isFinite(p.floorArea_m2) && Number(p.floorArea_m2) > 0) {
    const energyKwh = intensity * Number(p.floorArea_m2);
    const e = emit(energyKwh);
    return build('type-location-floor-area', '2b', { electricity_kWh: r2(e.elec), fuel_kWh: r2(e.fuel), fuelSource: type.fuelSource, energyKwh: r2(energyKwh), intensity_kWh_per_m2_yr: intensity, floorArea_m2: Number(p.floorArea_m2) },
      e.scope1, e.scope2, { electricity: factors.electricity_grid.value, fuel: factors[type.fuelSource].value, basis: 'statistical (building-type intensity × floor area)', provisional: true },
      ['Building-type energy intensities and factors are provisional and indicative, not a Sri Lankan measurement.']);
  }

  /* Option 3: statistics × building count (no floor area). */
  if (Number.isFinite(p.buildingCount) && Number(p.buildingCount) > 0) {
    const perFloor = rs.floorAreaPerBuilding(type.key);
    if (!Number.isFinite(perFloor)) {
      throw refuse('PER_BUILDING_FLOOR_AREA_NOT_HELD',
        `No typical floor area per building is held for type "${type.key}".`, 400, 'Supply a floorArea_m2 to use Option 2b.');
    }
    const energyKwh = intensity * Number(perFloor) * Number(p.buildingCount);
    const e = emit(energyKwh);
    return build('type-location-building-count', '3', { electricity_kWh: r2(e.elec), fuel_kWh: r2(e.fuel), fuelSource: type.fuelSource, energyKwh: r2(energyKwh), intensity_kWh_per_m2_yr: intensity, floorAreaPerBuilding_m2: perFloor, buildingCount: Number(p.buildingCount) },
      e.scope1, e.scope2, { electricity: factors.electricity_grid.value, fuel: factors[type.fuelSource].value, basis: 'statistical (intensity × typical floor area × building count)', provisional: true },
      ['Statistical energy per building is the lowest quality on the scale; a floor area would reach Option 2b.']);
  }

  throw refuse('BUILDING_ENERGY_INPUT_REQUIRED',
    'Estimating a building’s emissions needs one of: metered energy; an energy label and floor area; '
    + 'a building type and floor area; or a building type and a building count.', 400,
    'Supply metered energy, or floorArea_m2, or buildingCount with a held buildingType.');
}

function build(basis, option, energy, scope1, scope2, factors, assumptions) {
  const combined = r2(scope1 + scope2);
  return {
    option,
    energy,
    factors,
    provisional: Boolean(factors.provisional),
    buildingEmissions: {
      scope1, scope2, combined, unit: 'tCO2e',
      note: 'Electricity is the building’s scope 2, on-site fuel combustion its scope 1. Reported '
        + 'combined at minimum (Chapter 6), with the split carried; this is the building’s own '
        + '(100%) figure before attribution.',
    },
    traced: traced({
      value: combined, unit: 'tCO2e',
      equation: 'building scope 1 and 2 = Σ energy by source × emission factor by source',
      inputs: { basis, scope1, scope2, ...energy },
      basis: `Measured (Option ${option})`,
      reference: REF,
      assumptions,
    }),
  };
}

module.exports = { buildingEmissions, REF };
