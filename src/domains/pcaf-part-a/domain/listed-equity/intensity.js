/**
 * Economic emission intensity, and the correction for market movement that
 * asset owners and managers may apply to it (Box 5.1-3, pp.51–53).
 *
 *   intensity = Σ_i (outstanding_i ÷ EVIC_i × emissions_i) ÷ AuM
 *   ADJ_b,T   = Σ_i W_T,i × (EVIC_b,i ÷ EVIC_T,i)
 *
 * A bull market raises every EVIC, the intensity falls, and a reduction
 * target becomes a moving one. The adjustment restates either the base year
 * (× ADJ) or the current year (÷ ADJ). Two rules travel with it: if the
 * adjustment is applied, both the unadjusted and adjusted intensity SHALL be
 * reported (p.52); and the approach was tested by asset owners and managers —
 * "further research is needed" before it is applied to a bank's loan exposure
 * (p.51). The result carries that sentence rather than a bank-flavoured
 * variant this standard has not sanctioned.
 */

'use strict';

const REF = 'PCAF Part A Third Edition §5.1, Box 5.1-3 (pp.51–53)';

function refuse(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

/**
 * @param {Object[]} holdings  [{ outstanding, evic, emissions }] in one currency
 * @param {number} [aum]       defaults to Σ outstanding
 */
function economicIntensity(holdings, aum) {
  if (!Array.isArray(holdings) || !holdings.length) throw refuse('HOLDINGS_REQUIRED', 'At least one holding is needed.');
  let financed = 0, sumOut = 0;
  for (const h of holdings) {
    const o = Number(h.outstanding), e = Number(h.evic), m = Number(h.emissions);
    if (!(o >= 0) || !(e > 0) || !(m >= 0)) throw refuse('HOLDING_INVALID', 'Each holding needs outstanding ≥ 0, EVIC > 0 and emissions ≥ 0.');
    financed += (o / e) * m;
    sumOut += o;
  }
  const denom = Number.isFinite(Number(aum)) && Number(aum) > 0 ? Number(aum) : sumOut;
  return {
    value: +(financed / denom).toFixed(4),
    unit: 'tCO2e per unit of currency',
    financed: +financed.toFixed(4),
    denominator: denom,
    equation: 'economic emission intensity = Σ (outstanding_i ÷ EVIC_i × emissions_i) ÷ total outstanding or AuM',
    reference: REF,
  };
}

/**
 * Box 5.1-3 with the weights W_T as the standard defines them — the
 * portfolio weights at the current period.
 *
 * @param {Object[]} pairs  [{ weightT, evicBase, evicCurrent }]
 */
function adjustmentFactor(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) throw refuse('PAIRS_REQUIRED', 'Base-year and current-year EVIC are needed per holding, with current weights.');
  let adj = 0, wsum = 0;
  for (const p of pairs) {
    const w = Number(p.weightT), b = Number(p.evicBase), t = Number(p.evicCurrent);
    if (!(w >= 0) || !(b > 0) || !(t > 0)) throw refuse('PAIR_INVALID', 'Each holding needs weightT ≥ 0, evicBase > 0 and evicCurrent > 0.');
    adj += w * (b / t);
    wsum += w;
  }
  if (Math.abs(wsum - 1) > 0.005) {
    throw refuse('WEIGHTS_NOT_NORMALISED', `Current-period weights sum to ${wsum.toFixed(4)}, not 1.`);
  }
  return {
    value: +adj.toFixed(4),
    equation: 'ADJ_b,T = Σ_i W_T,i × (EVIC_b,i ÷ EVIC_T,i)',
    reference: REF,
  };
}

/**
 * Both restatements, beside the unadjusted figures, as p.52 requires.
 *
 * @param {Object} p  { intensityBase, intensityCurrent, adj }
 */
function adjustedIntensities({ intensityBase, intensityCurrent, adj }) {
  const b = Number(intensityBase), t = Number(intensityCurrent), a = Number(adj);
  if (!(b > 0) || !(t >= 0) || !(a > 0)) throw refuse('ADJUST_INPUTS_INVALID', 'Base intensity > 0, current intensity ≥ 0 and ADJ > 0 are needed.');
  const backward = +(b * a).toFixed(4);   // base year restated
  const current = +(t / a).toFixed(4);    // current year restated
  return {
    unadjusted: { base: b, current: t, change: +((t - b) / b).toFixed(6) },
    backward: { base: backward, current: t, change: +((t - backward) / backward).toFixed(6),
      equation: 'intensity_adjusted(b) = intensity(b) × ADJ_b,T' },
    currentYear: { base: b, current, change: +((current - b) / b).toFixed(6),
      equation: 'intensity_adjusted(T) = intensity(T) ÷ ADJ_b,T' },
    adj: a,
    requirement: 'Where the adjustment factor is applied, both the unadjusted and the adjusted economic emission intensity shall be reported separately, ideally with the factor and how it was constructed (Box 5.1-3, p.52).',
    applicability: 'An approach for asset owners and asset managers. Further research is needed to evaluate whether the adjustment factor applies to banks using economic emission intensity over total loan exposure (p.51).',
    reference: REF,
  };
}

module.exports = { economicIntensity, adjustmentFactor, adjustedIntensities };
