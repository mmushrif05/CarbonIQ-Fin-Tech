/**
 * CarbonIQ FinTech — PCAF Output Tests
 */

const { generatePCAFOutput } = require('../services/pcaf');

describe('PCAF v3 Output', () => {
  test('generates PCAF output with attribution factor', () => {
    const result = generatePCAFOutput({
      emissionSummary: {
        totalBaseline_tCO2e: 1500,
        totalMaterials: 200,
        unmatchedItems: 10,
        conversionFailures: 5
      },
      materials80Pct: {
        items: [
          { inTop80Pct: true, factorSource: 'A1-A3' },
          { inTop80Pct: true, factorSource: 'A1-A3' },
          { inTop80Pct: true, factorSource: 'ICE' },
          { inTop80Pct: false }
        ],
        totalItems: 200
      },
      loanAmount: 50000000,
      projectValue: 100000000
    });

    expect(result.financedEmissions.attributionFactor).toBe(0.5);
    expect(result.financedEmissions.total_tCO2e).toBe(750);
    expect(result.dataQuality.score).toBe(2);
    expect(result.methodology.classificationSystem).toBe('ECCS 6-step hierarchy');
  });

  test('assigns score 5 when no materials data', () => {
    const result = generatePCAFOutput({
      emissionSummary: { totalBaseline_tCO2e: 0, totalMaterials: 0, unmatchedItems: 0, conversionFailures: 0 },
      materials80Pct: null
    });

    expect(result.dataQuality.score).toBe(5);
  });

  test('assigns score 1 when all EPDs verified', () => {
    const result = generatePCAFOutput({
      emissionSummary: { totalBaseline_tCO2e: 500, totalMaterials: 50, unmatchedItems: 0, conversionFailures: 0 },
      materials80Pct: {
        items: [
          { inTop80Pct: true, epdVerified: true },
          { inTop80Pct: true, epdVerified: true }
        ],
        totalItems: 50
      }
    });

    expect(result.dataQuality.score).toBe(1);
  });

  test('uses default attribution when loan/project values missing', () => {
    const result = generatePCAFOutput({
      emissionSummary: { totalBaseline_tCO2e: 1000, totalMaterials: 100, unmatchedItems: 0, conversionFailures: 0 },
      materials80Pct: { items: [{ inTop80Pct: true, factorSource: 'ICE' }], totalItems: 100 }
    });

    expect(result.financedEmissions.attributionFactor).toBe(1);
    expect(result.financedEmissions.total_tCO2e).toBe(1000);
  });
});
