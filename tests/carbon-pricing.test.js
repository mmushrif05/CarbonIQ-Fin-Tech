/**
 * CarbonIQ FinTech — Carbon Pricing Service Tests
 */

const { calculateFinancialImpact } = require('../services/carbon-pricing');

describe('Carbon Pricing Service', () => {
  const BASE_OPTS = {
    emissions_tCO2e: 4200,
    loanAmount: 50000000,
    projectValue: 200000000,
    region: 'SG',
    cfsScore: 72,
    buildingArea_m2: 25000,
    loanTerm_years: 10,
  };

  test('calculates financial impact for Singapore region', () => {
    const result = calculateFinancialImpact(BASE_OPTS);
    expect(result).toBeDefined();
    expect(result.taxExposure).toBeDefined();
    expect(result.taxExposure.annualExposure_local).toBeGreaterThan(0);
    expect(result.taxExposure.currency).toBe('SGD');
    expect(result.loanPricing).toBeDefined();
    expect(result.strandedRisk).toBeDefined();
    expect(result.sensitivity).toBeDefined();
  });

  test('calculates for EU region', () => {
    const result = calculateFinancialImpact({ ...BASE_OPTS, region: 'EU' });
    expect(result.taxExposure.currency).toBe('EUR');
    expect(result.taxExposure.annualExposure_local).toBeGreaterThan(0);
  });

  test('calculates for Malaysia region', () => {
    const result = calculateFinancialImpact({ ...BASE_OPTS, region: 'MY' });
    expect(result.taxExposure.currency).toBe('MYR');
  });

  test('handles Hong Kong (no carbon tax)', () => {
    const result = calculateFinancialImpact({ ...BASE_OPTS, region: 'HK' });
    expect(result.taxExposure.annualExposure_local).toBe(0);
  });

  test('green score gets loan pricing benefit', () => {
    const result = calculateFinancialImpact({ ...BASE_OPTS, cfsScore: 80 });
    expect(result.loanPricing.adjustment_bps).toBeLessThan(0);
  });

  test('brown score gets no pricing benefit', () => {
    const result = calculateFinancialImpact({ ...BASE_OPTS, cfsScore: 30 });
    expect(result.loanPricing.adjustment_bps).toBe(0);
  });

  test('returns sensitivity analysis with table', () => {
    const result = calculateFinancialImpact(BASE_OPTS);
    expect(result.sensitivity).toBeDefined();
    expect(result.sensitivity.table).toBeDefined();
    expect(Array.isArray(result.sensitivity.table)).toBe(true);
    expect(result.sensitivity.table.length).toBeGreaterThan(0);
  });

  test('returns stranded risk assessment', () => {
    const result = calculateFinancialImpact(BASE_OPTS);
    expect(result.strandedRisk.riskLevel).toBeDefined();
    expect(result.strandedRisk.emissionsIntensity).toBeDefined();
    expect(result.strandedRisk.financialImpairment).toBeDefined();
  });
});
