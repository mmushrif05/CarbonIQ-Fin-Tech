/**
 * CarbonIQ FinTech — PCAF Part C: B4 Replacement (use stage)
 *
 * MVP scope: HVAC ONLY (agreed ruling). B4 reduces to B4.2 — the refrigerant
 * re-released when HVAC plant is replaced within the cover window:
 *
 *   replacements = max(ceil(use_stage_years / service_life) - 1, 0)   // -1 excludes the original install
 *   B4.2 = replacements × charge_kg × GWP × eol_loss_rate
 *
 * B4.1 (component-by-component like-for-like replacement per RICS §5.2.4) is
 * DEFERRED. Over a typical 10-year IDI window, durable BOQ components have
 * a service life longer than the window and are replaced zero times, so B4.1
 * contributes little; the reference workbook's non-zero B4.1 came entirely
 * from assumed short-life items that were not in the BOQ.
 *
 * Like-for-like principle (retained for B4.1 when it lands): a replacement
 * carries TODAY's carbon, frozen — never a projected future product.
 *
 * Gated: use_stage_years = 0 on CAR/EAR means B4 = 0.
 */

'use strict';

const { traced, assumption } = require('./provenance');
const factors = require('./factors');

/** replacements within the window, excluding the original installation */
function replacementCount(useStageYears, serviceLifeYears) {
  const years = Number(useStageYears) || 0;
  const life  = Number(serviceLifeYears) || 0;
  if (years <= 0 || life <= 0) return 0;
  return Math.max(Math.ceil(years / life) - 1, 0);
}

function b4Replacement({ useStageYears, chargeKg, gwpValue, hvacServiceLifeYears } = {}) {
  const years = Number(useStageYears) || 0;

  if (years <= 0) {
    return traced({
      value: 0, unit: 'kgCO2e', module: 'B4', label: 'B4 Replacement (use stage)',
      equation: 'B4 = 0 (no use stage — policy gated)',
      inputs: { useStageYears: 0 },
      assumptions: [assumption('B4_GATED',
        'B4 not computed: the policy carries no use stage (CAR/EAR).', 'info', {})]
    });
  }

  const lifeRef = Number.isFinite(Number(hvacServiceLifeYears)) && Number(hvacServiceLifeYears) > 0
    ? { key: 'input.hvacServiceLife_years', value: Number(hvacServiceLifeYears), unit: 'years',
        tier: 'Local', reference: 'Client/project-supplied HVAC service life' }
    : factors.b1b4Default('hvacServiceLife_years');

  const eolRef = factors.b1b4Default('eolLossRate');
  const life   = Number(lifeRef.value) || 20;
  const reps   = replacementCount(years, life);
  const charge = Number(chargeKg) || 0;
  const gwp    = Number(gwpValue) || 0;
  const value  = reps * charge * gwp * (Number(eolRef.value) || 0);

  const assumptions = [
    assumption('B4_HVAC_ONLY',
      'B4 covers HVAC refrigerant re-release only (B4.2). Component-by-component replacement (B4.1, RICS §5.2.4 like-for-like) is not included in this scope.',
      'notable', {})
  ];

  if (reps === 0) {
    assumptions.push(assumption('B4_NO_REPLACEMENT',
      `HVAC service life of ${life} years exceeds the ${years}-year cover window, so no replacement falls inside it and B4 is zero. B4 becomes material on longer cover periods or shorter-lived plant.`,
      'info', { life, years }));
  }

  return traced({
    value, unit: 'kgCO2e', module: 'B4', label: 'B4 Replacement (use stage)',
    equation: 'B4.2 = max(ceil(use_stage_years / hvac_service_life) − 1, 0) × charge_kg × GWP × eol_loss_rate',
    inputs: { useStageYears: years, hvacServiceLife_years: life, replacements: reps,
              charge_kg: charge, gwp, scope: 'B4.2 only (HVAC) — B4.1 deferred' },
    factors: [lifeRef, eolRef],
    assumptions
  });
}

module.exports = { b4Replacement, replacementCount };
