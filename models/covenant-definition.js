/**
 * CarbonIQ FinTech — Covenant Definition Model
 *
 * Schema for green loan carbon KPI definitions.
 */

const { COVENANT_DEFAULTS } = require('../config/constants');

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
