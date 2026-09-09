/**
 * Financed emissions: the project's emissions, times the lender's share.
 *
 * §5.3 sets the boundary for project finance plainly. A financial institution
 * SHALL report the absolute scope 1 and 2 emissions of the project. Scope 3
 * SHOULD be covered where relevant — the standard names nuclear and hydro
 * power, infrastructure such as airports and highways, and oil and gas
 * exploration as examples where it is. Removed emissions MAY be reported but
 * SHALL be reported separately from absolute emissions.
 *
 * So scope 1 and 2 are required and their absence is an error; scope 3 is
 * optional and its absence is a disclosure, not a zero. Reporting an unmeasured
 * scope 3 as nought would understate the figure while looking complete.
 */

'use strict';

const { traced, absent } = require('./provenance');

const REF = 'PCAF Part A Third Edition §5.3, Emission scopes covered';

/**
 * @param {Object} p
 * @param {number} p.attributionFactor
 * @param {number} p.projectScope1_tCO2e
 * @param {number} p.projectScope2_tCO2e
 * @param {number|null} [p.projectScope3_tCO2e]
 * @param {boolean} [p.scope3Relevant]
 * @param {number|null} [p.removals_tCO2e]
 */
function financedEmissions({
  attributionFactor: af, projectScope1_tCO2e, projectScope2_tCO2e,
  projectScope3_tCO2e, scope3Relevant, removals_tCO2e,
}) {
  for (const [name, v] of [['scope 1', projectScope1_tCO2e], ['scope 2', projectScope2_tCO2e]]) {
    if (!Number.isFinite(v) || v < 0) {
      const err = new Error(
        `The project's ${name} emissions are required. PCAF §5.3 states a financial `
        + 'institution shall report the absolute scope 1 and 2 emissions of the project.');
      err.statusCode = 400; err.code = 'SCOPE_1_2_REQUIRED';
      throw err;
    }
  }

  const attribute = (v, scope) => traced({
    value: +(v * af).toFixed(2),
    unit: 'tCO2e',
    equation: `financed ${scope} = project ${scope} × attribution factor`,
    inputs: { [`project_${scope.replace(/\s/g, '')}_tCO2e`]: v, attributionFactor: af },
    basis: 'Measured',
    reference: REF,
  });

  const s1 = attribute(projectScope1_tCO2e, 'scope 1');
  const s2 = attribute(projectScope2_tCO2e, 'scope 2');

  const s3 = Number.isFinite(projectScope3_tCO2e)
    ? attribute(projectScope3_tCO2e, 'scope 3')
    : absent('Financed scope 3 emissions',
        scope3Relevant
          ? 'Scope 3 was marked relevant for this project but no figure was supplied. '
            + 'It is reported as absent rather than as zero, because an unmeasured scope '
            + 'and a scope of nought are different claims.'
          : 'Scope 3 was not marked relevant for this project. PCAF states scope 3 '
            + 'should be covered if relevant; where it is not, its absence is the disclosure.',
        REF);

  /* Removals are reported but never folded into the absolute figure. */
  const removals = Number.isFinite(removals_tCO2e)
    ? attribute(removals_tCO2e, 'removals')
    : null;

  const scope1And2 = +(s1.value + s2.value).toFixed(2);

  return {
    scope1: s1,
    scope2: s2,
    scope1And2: traced({
      value: scope1And2,
      unit: 'tCO2e',
      equation: 'financed scope 1 and 2 = financed scope 1 + financed scope 2',
      inputs: { financedScope1: s1.value, financedScope2: s2.value },
      basis: 'Measured',
      reference: REF,
    }),
    scope3: s3,
    /* Removals sit beside the inventory, never inside it. */
    removals,
    removalsNote: removals
      ? 'Removed emissions are reported separately from absolute emissions and are '
        + 'not included in any total above (§5.3).'
      : null,
    category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
  };
}

module.exports = { financedEmissions };
