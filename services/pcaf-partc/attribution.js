/**
 * CarbonIQ FinTech — PCAF Part C: Attribution Factor
 *
 * The insurer's slice of a project's emissions (spec §5):
 *
 *   motor             = premium / total cost of ownership
 *   project_specific  = premium / total project cost
 *   annual            = premium / revenue
 *   treaty            = reinsurance ceded / gross premium
 *
 * Precision policy: the ratio is carried UNROUNDED through the whole
 * calculation and rounded only for display. Rounding the factor first (as
 * the reference workbook does at 4 dp) shifts the disclosed IAE by ~1%.
 * Set `precision` to reproduce a rounded basis when a legacy figure must
 * be matched exactly.
 */

'use strict';

const { traced, assumption } = require('./provenance');

const BASES = {
  motor:            { numerator: 'premium', denominator: 'tco',            label: 'Premium / total cost of ownership' },
  project_specific: { numerator: 'premium', denominator: 'projectCost',    label: 'Premium / total project cost' },
  annual:           { numerator: 'premium', denominator: 'revenue',        label: 'Premium / annual revenue' },
  treaty:           { numerator: 'ceded',   denominator: 'grossPremium',   label: 'Reinsurance ceded / gross premium' }
};

/**
 * @param {Object} policy
 * @param {string} policy.basis       - one of BASES
 * @param {number} policy.premium
 * @param {number} [policy.projectCost] / [policy.tco] / [policy.revenue]
 * @param {number} [policy.ceded] / [policy.grossPremium]
 * @param {number} [policy.reinsuranceCeded] - net-premium mode (gross - ceded)
 * @param {number} [policy.precision] - decimal places to round the factor to
 * @returns {Object} traced value
 */
function attributionFactor(policy = {}) {
  const basis = policy.basis || 'project_specific';
  const spec  = BASES[basis];
  const assumptions = [];

  if (!spec) {
    return traced({
      value: 0, unit: 'ratio', module: 'attribution', label: 'Attribution factor',
      equation: 'unknown basis', inputs: { basis },
      assumptions: [assumption('ATTR_UNKNOWN_BASIS',
        `Attribution basis "${basis}" not recognised. Factor set to 0.`, 'material', { basis })]
    });
  }

  let numerator = Number(policy[spec.numerator]);

  // Net-premium mode: the chain double-counting control in spec §8.
  // Gross premium prices the slice; net premium avoids counting the ceded
  // portion twice across the insurance chain (including NITF cessions).
  if (basis !== 'treaty' && Number.isFinite(Number(policy.reinsuranceCeded)) && Number(policy.reinsuranceCeded) > 0) {
    const ceded = Number(policy.reinsuranceCeded);
    numerator = numerator - ceded;
    assumptions.push(assumption('ATTR_NET_PREMIUM',
      `Net-premium mode: reinsurance ceded of ${ceded.toLocaleString()} deducted from gross premium to avoid double counting across the insurance chain.`,
      'info', { ceded }));
  }

  const denominator = Number(policy[spec.denominator]);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return traced({
      value: 0, unit: 'ratio', module: 'attribution', label: 'Attribution factor',
      equation: `${spec.numerator} / ${spec.denominator}`,
      inputs: { basis, numerator: numerator || null, denominator: denominator || null },
      assumptions: [assumption('ATTR_MISSING_INPUTS',
        `Attribution cannot be computed: ${spec.label} requires both values and a positive denominator. Factor set to 0.`,
        'material', { basis })]
    });
  }

  let value = numerator / denominator;

  if (Number.isFinite(Number(policy.precision))) {
    const p = Number(policy.precision);
    const rounded = Number(value.toFixed(p));
    assumptions.push(assumption('ATTR_ROUNDED_BASIS',
      `Attribution factor rounded to ${p} decimal places (${rounded}) before use, in place of the exact ratio ${value}. This shifts the disclosed IAE proportionally.`,
      'notable', { exact: value, rounded, precision: p }));
    value = rounded;
  }

  if (value > 1) {
    assumptions.push(assumption('ATTR_EXCEEDS_ONE',
      `Attribution factor of ${value} exceeds 1.0 — the insurer's slice cannot exceed the whole project. Check that ${spec.numerator} and ${spec.denominator} are on the same basis and currency.`,
      'material', { value }));
  }

  return traced({
    value, unit: 'ratio', module: 'attribution', label: 'Attribution factor',
    equation: `${spec.numerator} / ${spec.denominator}`,
    inputs: { basis, basisLabel: spec.label, numerator, denominator },
    assumptions
  });
}

module.exports = { attributionFactor, BASES };
