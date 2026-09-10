// @ts-check
/**
 * CarbonIQ FinTech — Covenant Definition Model
 *
 * Schema for green loan carbon KPI definitions.
 */

const { COVENANT_DEFAULTS } = require('../constants');

/**
 * One carbon KPI on a sustainability-linked loan: a metric, a comparison and
 * a number the borrower has to stay the right side of.
 *
 * @typedef {object} CovenantDefinition
 * @property {string} metric          an id from `COVENANT_DEFAULTS.metrics`
 * @property {string} operator        an id from `COVENANT_DEFAULTS.operators`
 * @property {number} threshold       the figure the metric is held to
 * @property {string} [checkFrequency] one of `COVENANT_DEFAULTS.checkFrequencies`
 * @property {string} [label]
 */

/**
 * Every problem with a definition, not the first one.
 *
 * A validator that stops at the first failure makes a caller fix one field,
 * resubmit, and be told about the next — which for a form with four fields is
 * four round trips to learn what one response could have said.
 *
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors  empty when valid
 */

/**
 * @param {CovenantDefinition} def
 * @returns {ValidationResult}
 */
function validateCovenantDefinition(def) {
  const validMetrics = COVENANT_DEFAULTS.metrics.map(m => m.id);
  const validOperators = COVENANT_DEFAULTS.operators;
  const validFrequencies = COVENANT_DEFAULTS.checkFrequencies;

  const errors = [];
  if (!validMetrics.includes(def.metric)) errors.push(`Invalid metric: ${def.metric}`);
  if (!validOperators.includes(def.operator)) errors.push(`Invalid operator: ${def.operator}`);
  if (def.checkFrequency && !validFrequencies.includes(def.checkFrequency)) {
    errors.push(`Invalid frequency: ${def.checkFrequency}`);
  }
  if (typeof def.threshold !== 'number') errors.push('Threshold must be a number');

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCovenantDefinition };
