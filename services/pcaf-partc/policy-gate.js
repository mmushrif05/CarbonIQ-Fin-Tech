/**
 * CarbonIQ FinTech — PCAF Part C: Policy Gate
 *
 * The scope rule from PCAF Part C v2 §5.3, Fig 5.3-1:
 *
 *   CAR / EAR  -> construction cover only. There is no use stage.
 *                 use_stage_years = 0, so B1 = B4 = B7 = 0.
 *   IDI        -> use stage applies over the cover period (default 10 yr).
 *   Property   -> use stage applies (treated as IDI-like).
 *
 * The gate is a SCOPE rule, not a client preference. Per the agreed MVP
 * form, the client enters "years of cover" — but that value applies only
 * WITHIN the gate. On a CAR/EAR policy the entered value is ignored and
 * recorded as such: a construction policy has no use stage to measure.
 *
 * Every zero produced here is an explicit, traced zero — never a silent one.
 */

'use strict';

const { traced, assumption } = require('./provenance');

const USE_STAGE_POLICIES = ['IDI', 'PROPERTY'];
const CONSTRUCTION_ONLY  = ['CAR', 'EAR'];
const DEFAULT_IDI_YEARS  = 10;

/**
 * Resolve the use-stage window for a policy.
 *
 * @param {Object} params
 * @param {string} params.policyType        - 'CAR' | 'EAR' | 'IDI' | 'Property'
 * @param {number} [params.yearsOfCover]    - Client-entered cover period
 * @returns {Object} traced value; .value is the number of use-stage years
 */
function useStageYears({ policyType, yearsOfCover }) {
  const type = String(policyType || '').trim().toUpperCase();
  const entered = Number(yearsOfCover);
  const hasEntered = Number.isFinite(entered) && entered > 0;

  if (CONSTRUCTION_ONLY.includes(type)) {
    const assumptions = [
      assumption(
        'GATE_CONSTRUCTION_ONLY',
        `Policy type ${type} covers construction only. Use-stage years set to 0 per PCAF Part C v2 §5.3 — B1, B4 and B7 are not computed.`,
        'info',
        { policyType: type }
      )
    ];
    if (hasEntered) {
      assumptions.push(assumption(
        'GATE_OVERRIDE_IGNORED',
        `A cover period of ${entered} year(s) was entered but does not apply to a ${type} policy. The scope gate takes precedence: a construction policy has no use stage.`,
        'notable',
        { policyType: type, enteredYears: entered }
      ));
    }
    return traced({
      value: 0, unit: 'years', module: 'gate', label: 'Use-stage years',
      equation: 'use_stage_years = 0 for CAR/EAR (construction cover only)',
      inputs: { policyType: type, yearsOfCoverEntered: hasEntered ? entered : null },
      assumptions
    });
  }

  if (USE_STAGE_POLICIES.includes(type)) {
    const years = hasEntered ? entered : DEFAULT_IDI_YEARS;
    const assumptions = [];
    if (!hasEntered) {
      assumptions.push(assumption(
        'GATE_DEFAULT_YEARS',
        `No cover period supplied. Default ${DEFAULT_IDI_YEARS}-year IDI/Decennial window applied.`,
        'notable', { policyType: type, years }
      ));
    } else if (entered !== DEFAULT_IDI_YEARS) {
      assumptions.push(assumption(
        'GATE_NONSTANDARD_YEARS',
        `Cover period of ${entered} years differs from the standard ${DEFAULT_IDI_YEARS}-year IDI/Decennial window. Client value honoured and disclosed.`,
        'notable', { policyType: type, years: entered }
      ));
    }
    return traced({
      value: years, unit: 'years', module: 'gate', label: 'Use-stage years',
      equation: 'use_stage_years = cover period for IDI/Property policies',
      inputs: { policyType: type, yearsOfCoverEntered: hasEntered ? entered : null },
      assumptions
    });
  }

  // Unrecognised policy type — fail closed to construction-only.
  return traced({
    value: 0, unit: 'years', module: 'gate', label: 'Use-stage years',
    equation: 'use_stage_years = 0 (unrecognised policy type — failed closed)',
    inputs: { policyType: policyType || null },
    assumptions: [assumption(
      'GATE_UNKNOWN_POLICY',
      `Policy type "${policyType}" not recognised. Use-stage modules excluded (failed closed to construction-only scope).`,
      'material', { policyType: policyType || null }
    )]
  });
}

/** True when the policy admits a use stage at all. */
function hasUseStage(policyType) {
  return USE_STAGE_POLICIES.includes(String(policyType || '').trim().toUpperCase());
}

module.exports = { useStageYears, hasUseStage, USE_STAGE_POLICIES, CONSTRUCTION_ONLY, DEFAULT_IDI_YEARS };
