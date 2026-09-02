/**
 * A figure and how it was arrived at, together.
 *
 * The Part C engine returns every value with its equation, inputs, factors and
 * assumptions, so the registers and the data-quality score are derived from the
 * arithmetic rather than asserted alongside it. Part A follows the same rule:
 * a number that cannot show its working cannot be defended under review, and a
 * financed-emissions figure is read by an assurance provider.
 */

'use strict';

/**
 * @param {Object} p
 * @param {number|null} p.value
 * @param {string} p.unit
 * @param {string} p.equation   the equation as written in the standard
 * @param {Object} p.inputs     the values actually used
 * @param {string} p.basis      where the figure came from
 * @param {string} [p.reference] the clause it rests on
 * @param {string[]} [p.assumptions]
 */
function traced({ value, unit, equation, inputs, basis, reference, assumptions }) {
  return {
    value,
    unit,
    equation,
    inputs: inputs || {},
    basis,
    reference: reference || null,
    assumptions: assumptions || [],
  };
}

/** A figure the standard asks for that this run could not produce. */
function absent(what, reason, reference) {
  return { value: null, unit: null, absent: true, what, reason, reference: reference || null };
}

const isAbsent = v => Boolean(v) && v.absent === true;

module.exports = { traced, absent, isAbsent };
