/**
 * The six reporting lines, attributed, and never added to one another.
 *
 * §5.1 (pp.49–50) requires absolute emissions and emission removals as
 * separate numbers, and removals separate again from carbon credits retired
 * and generated. Table 5.1-4 is the standard's own example and reports six
 * lines: scope 1, scope 2, scope 3, removals, credits retired, credits
 * generated. A "net" figure may be added, but only beside the six.
 *
 * Every line uses the same attribution factor (p.49). The exception is a
 * scope estimated under 3b or 3c, which arrives already attributed — the
 * outstanding amount is inside its equation — and is passed through.
 */

'use strict';

const { traced, absent } = require('../provenance');

const REF = 'PCAF Part A Third Edition §5.1, pp.44 and 49–50';

function attributeLine({ label, investee, af, unit }) {
  if (investee && investee.alreadyAttributed) {
    return { ...investee, attributionApplied: false, label };
  }
  const v = investee && Number.isFinite(investee.value) ? investee.value : null;
  if (v === null) return null;
  return traced({
    value: +(v * af).toFixed(2),
    unit: unit || 'tCO2e',
    equation: `financed ${label} = attribution factor × company ${label}`,
    inputs: { attributionFactor: af, [`company_${label.replace(/\s+/g, '_')}`]: v },
    basis: investee.basis || 'Measured',
    reference: REF,
    assumptions: investee.assumptions || [],
  });
}

/**
 * @param {Object} p
 * @param {number|null} p.attributionFactor   null only when every line is 3b/3c
 * @param {Object} p.scope1  traced investee figure (or already-attributed)
 * @param {Object} p.scope2
 * @param {Object|null} p.scope3
 * @param {string|null} p.scope3AbsentReason
 * @param {Object|null} p.removals
 * @param {Object|null} p.creditsRetired
 * @param {Object|null} p.creditsGenerated
 */
function reportingLines(p) {
  const af = p.attributionFactor;
  const s1 = attributeLine({ label: 'scope 1', investee: p.scope1, af });
  const s2 = attributeLine({ label: 'scope 2', investee: p.scope2, af });

  const s3 = p.scope3
    ? attributeLine({ label: 'scope 3', investee: p.scope3, af })
    : absent('Financed scope 3 emissions',
        p.scope3AbsentReason
          ? `Not reported: ${p.scope3AbsentReason}. PCAF requires scope 3 across all sectors and requires an `
            + 'explanation where it cannot be reported because of data availability or uncertainty (§5.1, p.41).'
          : 'No scope 3 figure and no reason were supplied. Scope 3 is required across all sectors for reports '
            + 'published from 2025; an institution unable to report it shall explain why (§5.1, pp.40–41).',
        REF);

  const scope1And2 = traced({
    value: +((s1.value || 0) + (s2.value || 0)).toFixed(2),
    unit: 'tCO2e',
    equation: 'financed scope 1 and 2 = financed scope 1 + financed scope 2',
    inputs: { financedScope1: s1.value, financedScope2: s2.value },
    basis: 'Measured',
    reference: 'PCAF Part A Third Edition §5.1, p.40 — scope 3 disclosed separately from scope 1 and 2',
  });

  /* Removals and credits: attributed with the same logic (p.49), reported
     apart from the inventory and from each other. */
  const removals = attributeLine({ label: 'emission removals', investee: p.removals, af });
  const creditsRetired = attributeLine({ label: 'carbon credits retired', investee: p.creditsRetired, af });
  const creditsGenerated = attributeLine({ label: 'carbon credits generated', investee: p.creditsGenerated, af });

  return {
    scope1: s1, scope2: s2, scope1And2, scope3: s3,
    removals: removals || absent('Financed emission removals', 'The investee reported no emission removals, or none were entered. Reported separately when present (p.49).', REF),
    creditsRetired: creditsRetired || null,
    creditsGenerated: creditsGenerated || absent('Carbon credits generated', 'The investee reported no credits generated, or none were entered. Should be reported when present (p.49).', REF),
    separation: 'Absolute emissions, emission removals, and carbon credits retired and generated are reported as '
      + 'separate figures and are not netted against one another (§5.1, pp.49–50). Scope 3 is reported '
      + 'separately from scope 1 and 2 (p.40).',
    category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
  };
}

module.exports = { reportingLines };
