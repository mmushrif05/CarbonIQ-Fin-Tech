/**
 * CarbonIQ FinTech — Covenant Engine Tests
 */

const { checkCovenant } = require('../services/covenant');

describe('Covenant Engine', () => {
  const projectMetrics = {
    totalBaseline_tCO2e: 1500,
    reductionPct: 18,
    epdCoveragePct: 45,
    substitutionRate: 8
  };

  test('passes when under threshold (lte)', () => {
    const result = checkCovenant(
      { metric: 'total_tco2e', operator: 'lte', threshold: 2000 },
      projectMetrics
    );
    expect(result.result).toBe('pass');
    expect(result.currentValue).toBe(1500);
  });

  test('breaches when over threshold (lte)', () => {
    const result = checkCovenant(
      { metric: 'total_tco2e', operator: 'lte', threshold: 1000 },
      projectMetrics
    );
    expect(result.result).toBe('breach');
    expect(result.variance).toBe(500);
  });

  test('warns when close to threshold (within 10%)', () => {
    const result = checkCovenant(
      { metric: 'total_tco2e', operator: 'lte', threshold: 1600 },
      projectMetrics
    );
    // 1500 vs 1600 → 6.25% variance → warning
    expect(result.result).toBe('warning');
  });

  test('calculates carbon intensity with building area', () => {
    const result = checkCovenant(
      { metric: 'tco2e_per_m2', operator: 'lte', threshold: 500, buildingArea_m2: 5000 },
      projectMetrics
    );
    // 1500 tCO2e * 1000 / 5000 m2 = 300 kgCO2e/m2
    expect(result.currentValue).toBe(300);
    expect(result.result).toBe('pass');
  });

  test('returns error for missing building area on intensity metric', () => {
    const result = checkCovenant(
      { metric: 'tco2e_per_m2', operator: 'lte', threshold: 500 },
      projectMetrics
    );
    expect(result.result).toBe('error');
  });

  test('checks reduction percentage', () => {
    const result = checkCovenant(
      { metric: 'reduction_pct', operator: 'gte', threshold: 20 },
      projectMetrics
    );
    expect(result.result).toBe('breach');
    expect(result.currentValue).toBe(18);
  });
});
