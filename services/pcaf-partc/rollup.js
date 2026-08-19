/**
 * CarbonIQ FinTech — PCAF Part C: Roll-up and Insurer IAE
 *
 *   construction  = A4 + A5                       <- THE PCAF FIGURE
 *   usestage      = B1 + B4 + B7                  <- separate line, never merged
 *   insurer_iae   = construction / 1000 × attribution_factor   (tCO2e)
 *   per_m2_factor = construction / GIFA           <- the reusable Sri Lanka factor
 *
 * STRUCTURAL SCOPE WALL: this module deliberately does NOT import
 * beyond-pcaf.js. B2/B5/B8 cannot reach the roll-up through this code path.
 * Spec §8 requires they never enter the PCAF figure, so the constraint is
 * enforced by the module graph rather than by convention.
 *
 * Aggregation rule (spec §8): compute per project, then sum. Premiums, costs
 * and emissions are never pooled across projects before attribution.
 */

'use strict';

const { traced } = require('./provenance');

function rollup({ a4, a5, b1, b4, b7, attributionFactor, gifa_m2 }) {
  const a4v = a4 ? a4.value : 0;
  const a5v = a5 ? a5.value : 0;
  const b1v = b1 ? b1.value : 0;
  const b4v = b4 ? b4.value : 0;
  const b7v = b7 ? b7.value : 0;

  const construction = traced({
    value: a4v + a5v, unit: 'kgCO2e', module: 'rollup',
    label: 'Construction emissions (A4 + A5) — the PCAF figure',
    equation: 'construction = A4 + A5',
    inputs: { a4: a4v, a5: a5v },
    children: [a4, a5].filter(Boolean)
  });

  const useStage = traced({
    value: b1v + b4v + b7v, unit: 'kgCO2e', module: 'rollup',
    label: 'Use-stage emissions (B1 + B4 + B7) — reported separately',
    equation: 'usestage = B1 + B4 + B7',
    inputs: { b1: b1v, b4: b4v, b7: b7v,
              scopeNote: 'Optional under PCAF Part C v2 §5.3. Reported separately and never merged into the A4+A5 construction figure.' },
    children: [b1, b4, b7].filter(Boolean)
  });

  const af = attributionFactor ? attributionFactor.value : 0;

  const insurerIAE = traced({
    value: (construction.value / 1000) * af, unit: 'tCO2e', module: 'rollup',
    label: "Insurer's construction IAE",
    equation: 'insurer_iae_tCO2e = (construction_kgCO2e / 1000) × attribution_factor',
    inputs: { construction_tCO2e: construction.value / 1000, attributionFactor: af },
    children: attributionFactor ? [attributionFactor] : []
  });

  const useStageInsurerShare = traced({
    value: (useStage.value / 1000) * af, unit: 'tCO2e', module: 'rollup',
    label: "Insurer's use-stage share — reported separately",
    equation: 'usestage_share_tCO2e = (usestage_kgCO2e / 1000) × attribution_factor',
    inputs: { usestage_tCO2e: useStage.value / 1000, attributionFactor: af }
  });

  const gifa = Number(gifa_m2) || 0;
  const perM2 = traced({
    value: gifa > 0 ? construction.value / gifa : 0,
    unit: 'kgCO2e/m2', module: 'rollup',
    label: 'Per-m² construction factor (reusable benchmark)',
    equation: 'per_m2_factor = construction_kgCO2e / GIFA',
    inputs: { construction_kgCO2e: construction.value, gifa_m2: gifa,
              note: gifa > 0 ? null : 'GIFA not supplied — per-m² factor unavailable' }
  });

  return {
    construction,
    useStage,
    insurerIAE,
    useStageInsurerShare,
    perM2Factor: perM2,
    summary: {
      construction_kgCO2e: construction.value,
      construction_tCO2e:  construction.value / 1000,
      useStage_kgCO2e:     useStage.value,
      useStage_tCO2e:      useStage.value / 1000,
      insurerIAE_tCO2e:    insurerIAE.value,
      useStageInsurerShare_tCO2e: useStageInsurerShare.value,
      perM2Factor_kgCO2e_m2: perM2.value,
      attributionFactor: af
    }
  };
}

module.exports = { rollup };
