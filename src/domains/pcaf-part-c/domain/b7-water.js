/**
 * CarbonIQ FinTech — PCAF Part C: B7 Operational Water (use stage)
 *
 *   occupants = actual, else GIFA / occupant_density
 *   volume_m3 = actual annual volume, else occupants × L/person/day × 365 / 1000
 *   B7 = volume_m3 × (supply_EF + wastewater_EF) × use_stage_years
 *
 * Supply and wastewater are kept as separate factors and summed, so either
 * can be localised independently. This is operational water only — water
 * HEATING belongs to B6 and is not included here.
 *
 * Data gap: no Sri Lankan water-supply or wastewater-treatment carbon factor
 * exists. DEFRA (UK) values stand in and are flagged on every run.
 *
 * Gated: use_stage_years = 0 on CAR/EAR means B7 = 0.
 */

'use strict';

const { traced, assumption } = require('./provenance');
const factors = require('./factors');
const { numberOr } = require('../../../shared/numbers');

function b7Water({ occupants, gifa_m2, annualVolume_m3, useStageYears } = {}) {
  const years = numberOr(useStageYears);

  if (years <= 0) {
    return traced({
      value: 0, unit: 'kgCO2e', module: 'B7', label: 'B7 Operational water (use stage)',
      equation: 'B7 = 0 (no use stage — policy gated)',
      inputs: { useStageYears: 0 },
      assumptions: [assumption('B7_GATED',
        'B7 not computed: the policy carries no use stage (CAR/EAR).', 'info', {})]
    });
  }

  const supply     = factors.waterEF('supply');
  const wastewater = factors.waterEF('wastewater');
  const usedFactors = [supply, wastewater];
  const assumptions = [];

  // --- occupants ---
  let occ = numberOr(occupants);
  if (occ <= 0) {
    const densityRef = factors.waterBenchmark('occupantDensity_m2_per_person');
    usedFactors.push(densityRef);
    const gifa = numberOr(gifa_m2);
    occ = gifa > 0 && Number(densityRef.value) > 0 ? gifa / Number(densityRef.value) : 0;
    if (occ > 0) {
      assumptions.push(assumption('B7_OCCUPANT_BENCHMARK',
        `Occupancy not supplied. Derived as ${gifa} m² ÷ ${densityRef.value} m²/person = ${occ.toFixed(1)} occupants. Supply the actual figure to improve this.`,
        'notable', { gifa, density: densityRef.value, occupants: occ }));
    }
  }

  // --- volume ---
  let volume = numberOr(annualVolume_m3);
  let volumeBasis = 'actual';
  if (volume <= 0) {
    const useRef = factors.waterBenchmark('waterUse_L_per_person_day');
    usedFactors.push(useRef);
    volume = occ * Number(useRef.value) * 365 / 1000;
    volumeBasis = 'derived from occupancy';
    if (volume > 0) {
      assumptions.push(assumption('B7_VOLUME_BENCHMARK',
        `Annual water volume not supplied. Derived as ${occ.toFixed(1)} occupants × ${useRef.value} L/person/day × 365 = ${volume.toFixed(1)} m³. Metered consumption would replace this benchmark.`,
        'notable', { occupants: occ, litresPerPersonDay: useRef.value, volume_m3: volume }));
    }
  }

  if (volume <= 0) {
    assumptions.push(assumption('B7_NO_BASIS',
      'Neither occupancy, floor area nor metered volume was supplied. B7 set to zero.', 'material', {}));
  }

  assumptions.push(assumption('B7_SL_FACTOR_GAP',
    'Water supply and wastewater factors are DEFRA (UK) interim values. No Sri Lankan water-supply or wastewater-treatment carbon factor exists; local values (grid mix, pumping heads, any desalination) would likely differ.',
    'notable', { supplyEF: supply.value, wastewaterEF: wastewater.value }));

  const combinedEF = numberOr(supply.value) + numberOr(wastewater.value);
  const value = volume * combinedEF * years;

  return traced({
    value, unit: 'kgCO2e', module: 'B7', label: 'B7 Operational water (use stage)',
    equation: 'B7 = annual_volume_m3 × (supply_EF + wastewater_EF) × use_stage_years',
    inputs: { occupants: occ, annualVolume_m3: volume, volumeBasis,
              supplyEF: supply.value, wastewaterEF: wastewater.value,
              combinedEF, useStageYears: years,
              note: 'Operational water only — water heating is B6 and is excluded' },
    factors: usedFactors,
    assumptions
  });
}

module.exports = { b7Water };
