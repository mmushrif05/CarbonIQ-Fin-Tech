/**
 * CarbonIQ FinTech — Beyond-PCAF Whole-Life Annex (B2 / B5 / B8)
 *
 * VOLUNTARY. NOT PART OF THE PCAF FIGURE.
 *
 * Spec §8 defines a three-tier scope discipline:
 *   1. MANDATORY        A4 + A5           -> the PCAF figure
 *   2. OPTIONAL         B1 + B4 + B7      -> separate use-stage line
 *   3. BEYOND-PCAF      B2 + B5 + B8      -> this module, its own annex
 *
 * Tier 3 must NEVER enter the roll-up. That rule is enforced structurally:
 * rollup.js does not import this file, and a test asserts the PCAF figure is
 * unchanged when these values are non-zero. This module is delivered as a
 * standalone whole-life annex only.
 *
 *   B2 = maintenance_allowance × GIFA × cover_years / reference_study_period
 *   B5 = refurbishment_allowance × GIFA × cover_years / reference_study_period
 *   B8 = 0 (disabled)
 */

'use strict';

const { traced, assumption } = require('./provenance');
const factors = require('./factors');

function _allowanceModule({ moduleId, label, allowanceKey, gifa_m2, useStageYears, overrideAllowance }) {
  const gifa  = Number(gifa_m2) || 0;
  const years = Number(useStageYears) || 0;
  const rspRef = factors.wlcaDefault('referenceStudyPeriod_years');
  const rsp    = Number(rspRef.value) || 60;

  const allowanceRef = Number.isFinite(Number(overrideAllowance)) && Number(overrideAllowance) > 0
    ? { key: `input.${allowanceKey}`, value: Number(overrideAllowance), unit: 'kgCO2e/m2 GIA',
        tier: 'Local', reference: 'Client-supplied allowance' }
    : factors.wlcaDefault(allowanceKey);

  if (years <= 0 || gifa <= 0) {
    return traced({
      value: 0, unit: 'kgCO2e', module: moduleId, label,
      equation: `${moduleId} = 0 (policy gated or no GIFA)`,
      inputs: { gifa_m2: gifa, useStageYears: years },
      assumptions: [assumption(`${moduleId}_GATED`,
        `${moduleId} not computed: no use-stage cover period or no floor area.`, 'info', {})]
    });
  }

  const allowance = Number(allowanceRef.value) || 0;
  const value = allowance * gifa * years / rsp;

  return traced({
    value, unit: 'kgCO2e', module: moduleId, label,
    equation: `${moduleId} = allowance_kgCO2e_per_m2 × GIFA × cover_years / reference_study_period`,
    inputs: { allowance, gifa_m2: gifa, coverYears: years, referenceStudyPeriod: rsp },
    factors: [allowanceRef, rspRef]
  });
}

function beyondPcafAnnex({ gifa_m2, useStageYears, b2Allowance, b5Allowance, b8Manual } = {}) {
  const b2 = _allowanceModule({
    moduleId: 'B2', label: 'B2 Maintenance (voluntary)',
    allowanceKey: 'b2Maintenance_kgCO2e_m2', gifa_m2, useStageYears, overrideAllowance: b2Allowance
  });

  const b5 = _allowanceModule({
    moduleId: 'B5', label: 'B5 Refurbishment (voluntary)',
    allowanceKey: 'b5Refurbishment_kgCO2e_m2', gifa_m2, useStageYears, overrideAllowance: b5Allowance
  });

  b5.assumptions.push(assumption('B5_INDICATIVE',
    'The B5 refurbishment allowance is INDICATIVE. Unlike B2 (GLA-backed at 10 kgCO2e/m²), B5 has no single strong standard source and is discretionary — often omitted in practice. The more defensible method is a percentage of upfront A1-A5, which activates when the embodied layer lands.',
    'notable', {}));

  const b8Ref = factors.wlcaDefault('b8Unregulated');
  const b8Value = Number.isFinite(Number(b8Manual)) && Number(b8Manual) > 0 ? Number(b8Manual) : 0;
  const b8 = traced({
    value: b8Value, unit: 'kgCO2e', module: 'B8', label: 'B8 Unregulated / user activities (disabled)',
    equation: 'B8 = 0 (disabled placeholder)',
    inputs: { manualEntry: b8Value || null },
    factors: [b8Ref],
    assumptions: [assumption('B8_DISABLED',
      'B8 is not a module in ISO 21930:2017 or EN 15978 for buildings, which run B1-B7 only. It originates in EN 15804 / infrastructure standards ("user utilization of infrastructure"). For a building there is no defined module and no robust factor; unregulated and plug loads belong in B6. Disabled to avoid false precision and double-counting.',
      'info', {})]
  });

  const total = b2.value + b5.value + b8.value;

  return traced({
    value: total, unit: 'kgCO2e', module: 'BEYOND_PCAF',
    label: 'Beyond-PCAF whole-life annex (B2 + B5 + B8)',
    equation: 'annex_total = B2 + B5 + B8',
    inputs: { b2: b2.value, b5: b5.value, b8: b8.value,
              scopeWarning: 'VOLUNTARY — never included in the PCAF figure or the use-stage line' },
    children: [b2, b5, b8]
  });
}

module.exports = { beyondPcafAnnex };
