/**
 * CarbonIQ FinTech — PCAF Part C: Plausibility Checks
 *
 * MVP behaviour (agreed ruling): checks RUN on every assessment but never
 * interrupt. Findings are written to the Assumptions and Limitations Register
 * and surfaced in the report annex, so the client's screen stays clean while
 * nothing goes undisclosed.
 *
 * Full development: the same findings become interactive challenges raised
 * before the disclosure is issued. Building the checks now means that change
 * is a re-wiring, not a rebuild.
 *
 * Severity: 'info' | 'notable' | 'material'
 */

'use strict';

const factors = require('./factors');

/** Typical construction-stage intensity band for A4+A5, kgCO2e/m². */
const PER_M2_BAND = { low: 10, high: 120 };

function _finding(code, severity, message, context = {}) {
  return { code, severity, message, context, interactive: false };
}

/**
 * @param {Object} params
 * @param {Object} params.rollupResult - output of rollup()
 * @param {Object} params.a4
 * @param {Object} params.a5
 * @param {Object} params.b1
 * @param {Object} params.policy
 * @param {number} params.gifa_m2
 * @returns {Object[]} findings
 */
function runChecks({ rollupResult, a4, a5, b1, policy = {}, gifa_m2 }) {
  const findings = [];
  const construction = rollupResult ? rollupResult.construction.value : 0;
  const gifa = Number(gifa_m2) || 0;

  // 1 — per-m² intensity outside the plausible band
  if (gifa > 0 && construction > 0) {
    const perM2 = construction / gifa;
    if (perM2 < PER_M2_BAND.low) {
      findings.push(_finding('CHK_PER_M2_LOW', 'material',
        `Construction intensity of ${perM2.toFixed(1)} kgCO2e/m² is below the typical band of ${PER_M2_BAND.low}-${PER_M2_BAND.high} kgCO2e/m². This usually indicates missing scope — site energy, demolition or an incomplete BOQ.`,
        { perM2, band: PER_M2_BAND }));
    } else if (perM2 > PER_M2_BAND.high) {
      findings.push(_finding('CHK_PER_M2_HIGH', 'notable',
        `Construction intensity of ${perM2.toFixed(1)} kgCO2e/m² is above the typical band of ${PER_M2_BAND.low}-${PER_M2_BAND.high} kgCO2e/m². Check quantities, units and haul distances.`,
        { perM2, band: PER_M2_BAND }));
    }
  }

  // 2 — a single sub-module dominating the figure
  if (a5 && a5.children && construction > 0) {
    for (const sub of a5.children) {
      const share = sub.value / construction;
      if (share >= 0.85) {
        findings.push(_finding('CHK_SINGLE_MODULE_DOMINANCE', 'material',
          `${sub.module} accounts for ${(share * 100).toFixed(1)}% of the construction figure. The disclosure rests almost entirely on this one input — verify it before relying on the result.`,
          { module: sub.module, sharePct: share * 100 }));
      }
    }
  }

  // 3 — materials with no haul distance
  if (a4 && a4.items) {
    const zeroDistance = a4.items.filter(i => i.value === 0);
    if (zeroDistance.length > 0) {
      findings.push(_finding('CHK_ZERO_DISTANCE_MATERIALS', 'notable',
        `${zeroDistance.length} of ${a4.items.length} material(s) have no transport distance and contribute zero to A4: ${zeroDistance.map(i => i.label).join(', ')}.`,
        { count: zeroDistance.length, materials: zeroDistance.map(i => i.label) }));
    }
  }

  // 4 — use-stage larger than the mandatory figure (presentation risk)
  if (rollupResult && rollupResult.useStage.value > 0 && construction > 0) {
    const ratio = rollupResult.useStage.value / construction;
    if (ratio >= 1) {
      findings.push(_finding('CHK_USESTAGE_EXCEEDS_CONSTRUCTION', 'notable',
        `The optional use-stage line (${Math.round(rollupResult.useStage.value).toLocaleString()} kgCO2e) is ${ratio.toFixed(1)}× the mandatory construction figure. Both are correct, but the reader must not conflate them — they are reported as separate lines and are never summed.`,
        { ratio }));
    }
  }

  // 5 — B1 de-minimis position (information only)
  if (b1 && b1.value > 0 && construction > 0) {
    const thresholdRef = factors.b1b4Default('deMinimisThreshold');
    const threshold = Number(thresholdRef.value) || 0.05;
    const ratio = b1.value / construction;
    findings.push(_finding('CHK_B1_DE_MINIMIS', 'info',
      `B1 refrigerant is ${(ratio * 100).toFixed(1)}% of A4+A5 (de-minimis threshold ${(threshold * 100).toFixed(0)}%). ${ratio < threshold ? 'Below threshold.' : 'Material.'} Reported for information only — nothing is excluded.`,
      { ratioPct: ratio * 100, thresholdPct: threshold * 100, excluded: false }));
  }

  // 6 — attribution factor sanity
  const af = rollupResult ? rollupResult.summary.attributionFactor : 0;
  if (af <= 0) {
    findings.push(_finding('CHK_NO_ATTRIBUTION', 'material',
      'Attribution factor is zero, so the insurer IAE is zero regardless of project emissions. Check that premium and project cost were both captured.',
      {}));
  } else if (af > 1) {
    findings.push(_finding('CHK_ATTRIBUTION_GT_1', 'material',
      `Attribution factor of ${af} exceeds 1.0. The insurer's share cannot exceed the whole project — check the basis and currency of the premium and project cost.`,
      { attributionFactor: af }));
  }

  // 7 — policy type vs computed scope
  if (policy.policyType && rollupResult) {
    const type = String(policy.policyType).toUpperCase();
    if ((type === 'CAR' || type === 'EAR') && rollupResult.useStage.value > 0) {
      findings.push(_finding('CHK_GATE_VIOLATION', 'material',
        `A ${type} policy produced a non-zero use-stage figure. This should be impossible — the policy gate must zero B1, B4 and B7.`,
        { policyType: type, useStage: rollupResult.useStage.value }));
    }
  }

  return findings;
}

module.exports = { runChecks, PER_M2_BAND };
