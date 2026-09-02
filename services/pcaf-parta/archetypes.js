/**
 * What kind of project this is decides which metrics exist for it.
 *
 * Part C has a policy gate: CAR/EAR cover means use_stage_years = 0, so B1, B4
 * and B7 are zero by scope rule rather than by omission, and a user cannot
 * override it. Part A needs the same discipline for a different reason — an
 * efficiency retrofit produces an emission REDUCTION against its own past, a
 * renewable project produces AVOIDED emissions against a counterfactual, and
 * the two are not interchangeable. Letting a user pick freely is how a
 * reduction gets reported as an avoidance.
 */

'use strict';

const ARCHETYPES = {
  'efficiency-retrofit': {
    id: 'efficiency-retrofit',
    label: 'Efficiency retrofit',
    description: 'Capital deployed to reduce the emissions of an existing asset or process.',
    example: 'Replacing a coal or fuel-oil kiln with electric or hydrogen-ready equipment.',
    /* Reductions are measured against the entity's own base year. */
    impact: 'reduction',
    forwardLooking: 'EER',
    forwardLookingLabel: 'Expected Emission Reductions',
    comparedAgainst: 'a base year',
  },
  'renewable-generation': {
    id: 'renewable-generation',
    label: 'Renewable generation',
    description: 'Capital deployed to build generation that displaces higher-emitting supply.',
    example: 'A solar or wind project displacing grid electricity.',
    /* Avoidance is measured against a counterfactual — what would have happened. */
    impact: 'avoided',
    forwardLooking: 'EAE',
    forwardLookingLabel: 'Expected Avoided Emissions',
    comparedAgainst: 'a counterfactual scenario',
  },
  'general': {
    id: 'general',
    label: 'General purpose',
    description: 'Financing with no specific reduction or avoidance claim.',
    impact: null,
    forwardLooking: null,
    comparedAgainst: null,
  },
};

const list = () => Object.values(ARCHETYPES).map(a => ({ ...a }));

function forId(id) {
  const a = ARCHETYPES[id];
  if (!a) {
    const err = new Error(`Unknown project archetype "${id}". Known: ${Object.keys(ARCHETYPES).join(', ')}.`);
    err.statusCode = 400; err.code = 'UNKNOWN_ARCHETYPE';
    throw err;
  }
  return a;
}

module.exports = { ARCHETYPES, list, forId };
