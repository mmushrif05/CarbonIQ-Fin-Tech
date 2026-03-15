/**
 * CarbonIQ FinTech — Green Loan Covenant Service
 *
 * Checks project carbon metrics against loan covenant KPIs.
 * Supports: total tCO2e, intensity (kgCO2e/m2), EPD coverage,
 * reduction %, and material substitution rate.
 *
 * Implementation: Steps 10-11
 */

/**
 * Check a single covenant against project data.
 *
 * @param {Object} covenant - { metric, operator, threshold, buildingArea_m2 }
 * @param {Object} projectMetrics - From engine bridge
 * @returns {Object} { result, currentValue, threshold, variance, details }
 */
function checkCovenant(covenant, projectMetrics) {
  const currentValue = getMetricValue(covenant.metric, projectMetrics, covenant.buildingArea_m2);

  if (currentValue === null) {
    return {
      result: 'error',
      message: `Unable to calculate metric: ${covenant.metric}`,
      currentValue: null,
      threshold: covenant.threshold
    };
  }

  const passed = evaluateOperator(currentValue, covenant.operator, covenant.threshold);
  const variance = currentValue - covenant.threshold;
  const variancePct = covenant.threshold !== 0
    ? Math.round((variance / covenant.threshold) * 1000) / 10
    : 0;

  // Warning threshold: within 10% of breach
  const isWarning = !passed ? false :
    Math.abs(variancePct) <= 10;

  return {
    result: passed ? (isWarning ? 'warning' : 'pass') : 'breach',
    metric: covenant.metric,
    currentValue: Math.round(currentValue * 100) / 100,
    threshold: covenant.threshold,
    operator: covenant.operator,
    variance: Math.round(variance * 100) / 100,
    variancePct,
    checkedAt: new Date().toISOString()
  };
}

function getMetricValue(metric, projectMetrics, buildingArea) {
  switch (metric) {
    case 'total_tco2e':
      return projectMetrics.totalBaseline_tCO2e;
    case 'tco2e_per_m2':
      if (!buildingArea || buildingArea <= 0) return null;
      return (projectMetrics.totalBaseline_tCO2e * 1000) / buildingArea;
    case 'epd_coverage':
      return projectMetrics.epdCoveragePct || 0;
    case 'reduction_pct':
      return projectMetrics.reductionPct || 0;
    case 'material_substitution_rate':
      return projectMetrics.substitutionRate || 0;
    default:
      return null;
  }
}

function evaluateOperator(value, operator, threshold) {
  switch (operator) {
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'eq': return Math.abs(value - threshold) < 0.01;
    default: return false;
  }
}

module.exports = { checkCovenant };
