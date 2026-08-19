/**
 * CarbonIQ FinTech — PCAF Part C: B1 Refrigerant Fugitive Emissions (use stage)
 *
 *   B1 = charge_kg × annual_leak_rate × GWP × use_stage_years
 *
 * Charge priority (spec §11):
 *   actual kg  >  capacity_kW × ~0.3 kg/kW (CIBSE TM65)  >  GIFA × 0.03 kg/m²
 * The per-m² basis is a literature assumption, not a formal standard, and is
 * always recorded as such: refrigerant charge scales with cooling capacity,
 * not floor area.
 *
 * Leak rate comes from the equipment type (IPCC 2019 Refinement Table 7.9);
 * GWP from the refrigerant (IPCC AR5, 100-yr).
 *
 * De-minimis: the 5% GHG Protocol / US EPA threshold is reported for
 * information only. Nothing is ever auto-excluded.
 *
 * Gated: use_stage_years = 0 on CAR/EAR means B1 = 0.
 */

'use strict';

const { traced, assumption } = require('./provenance');
const factors = require('./factors');

function b1Refrigerant({ equipmentType, refrigerant, chargeKg, capacityKW, gifa_m2, useStageYears } = {}) {
  const years = Number(useStageYears) || 0;
  const assumptions = [];

  if (years <= 0) {
    return traced({
      value: 0, unit: 'kgCO2e', module: 'B1', label: 'B1 Refrigerant (use stage)',
      equation: 'B1 = 0 (no use stage — policy gated)',
      inputs: { useStageYears: 0 },
      assumptions: [assumption('B1_GATED',
        'B1 not computed: the policy carries no use stage (CAR/EAR).', 'info', {})]
    });
  }

  const leak = factors.leakRate(equipmentType || '');
  const gwp  = factors.gwp(refrigerant || '');

  if (leak.fallback) {
    assumptions.push(assumption('B1_LEAK_FALLBACK',
      `Equipment type "${equipmentType || 'not supplied'}" not recognised. Default annual leak rate of ${leak.value} applied (IPCC mid-range).`,
      'notable', { equipmentType: equipmentType || null }));
  }
  if (gwp.fallback || !gwp.value) {
    assumptions.push(assumption('B1_GWP_FALLBACK',
      `Refrigerant "${refrigerant || 'not supplied'}" not found in the AR5 GWP table. B1 cannot be quantified for this equipment.`,
      'material', { refrigerant: refrigerant || null }));
  }

  // --- charge basis, in priority order ---
  let charge = 0;
  let chargeBasis = null;
  const chargeFactors = [];

  if (Number.isFinite(Number(chargeKg)) && Number(chargeKg) > 0) {
    charge = Number(chargeKg);
    chargeBasis = 'actual';
  } else if (Number.isFinite(Number(capacityKW)) && Number(capacityKW) > 0) {
    const perKW = factors.b1b4Default('chargePerKW_kg');
    charge = Number(capacityKW) * Number(perKW.value);
    chargeBasis = 'capacity';
    chargeFactors.push(perKW);
    assumptions.push(assumption('B1_CHARGE_CAPACITY',
      `Refrigerant charge estimated from ${capacityKW} kW cooling capacity at ${perKW.value} kg/kW (CIBSE TM65). Supply the actual charge from the HVAC schedule to improve this.`,
      'notable', { capacityKW, perKW: perKW.value, charge }));
  } else if (Number(gifa_m2) > 0) {
    const bench = factors.b1b4Default('chargeBenchmark_kg_per_m2');
    charge = Number(gifa_m2) * Number(bench.value);
    chargeBasis = 'benchmark_per_m2';
    chargeFactors.push(bench);
    assumptions.push(assumption('B1_CHARGE_BENCHMARK',
      `Refrigerant charge estimated as ${bench.value} kg/m² × ${gifa_m2} m² = ${charge} kg. This per-m² basis is a literature assumption, not a formal standard — charge scales with cooling capacity, not floor area. Replace with the actual charge or capacity when the HVAC design is available.`,
      'material', { benchmark: bench.value, gifa_m2, charge }));
  } else {
    assumptions.push(assumption('B1_NO_CHARGE',
      'No refrigerant charge, cooling capacity or floor area supplied. B1 set to zero.', 'material', {}));
  }

  const value = charge * (Number(leak.value) || 0) * (Number(gwp.value) || 0) * years;

  return traced({
    value, unit: 'kgCO2e', module: 'B1', label: 'B1 Refrigerant (use stage)',
    equation: 'B1 = charge_kg × annual_leak_rate × GWP × use_stage_years',
    inputs: { equipmentType: equipmentType || null, refrigerant: refrigerant || null,
              charge_kg: charge, chargeBasis, leakRate: leak.value, gwp: gwp.value, useStageYears: years },
    factors: [leak, gwp, ...chargeFactors],
    assumptions
  });
}

/**
 * De-minimis check — INFORMATION ONLY. Never excludes anything.
 * @param {number} b1Value        B1 in kgCO2e
 * @param {number} constructionValue  A4+A5 in kgCO2e
 */
function deMinimisCheck(b1Value, constructionValue) {
  const thresholdRef = factors.b1b4Default('deMinimisThreshold');
  const threshold = Number(thresholdRef.value) || 0.05;
  if (!constructionValue || constructionValue <= 0) {
    return { applicable: false, threshold, reference: thresholdRef.reference };
  }
  const ratio = b1Value / constructionValue;
  return {
    applicable: true,
    ratio,
    ratioPct: ratio * 100,
    threshold,
    thresholdPct: threshold * 100,
    flag: ratio < threshold ? 'Below de-minimis threshold' : 'Material (>= threshold)',
    excluded: false,
    note: 'Information only — nothing is excluded on the basis of this check.',
    reference: thresholdRef.reference
  };
}

module.exports = { b1Refrigerant, deMinimisCheck };
