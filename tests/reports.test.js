/**
 * CarbonIQ FinTech — Reports Service Tests
 */

const { generateReport, buildPDF } = require('../services/reports');

describe('Reports Service', () => {
  describe('generateReport', () => {
    test('generates PCAF report with default data', () => {
      const report = generateReport({ type: 'pcaf', period: '2025-Q4', orgName: 'Test Bank' });
      expect(report.type).toBe('pcaf');
      expect(report.organisation).toBe('Test Bank');
      expect(report.reportingPeriod).toContain('2025-Q4');
      expect(report.title).toContain('PCAF');
      expect(report.summary).toBeDefined();
      expect(report.assetClasses).toBeDefined();
    });

    test('generates GRI 305 report', () => {
      const report = generateReport({ type: 'gri305', period: '2025-Q4', orgName: 'Test Bank' });
      expect(report.type).toBe('gri305');
      expect(report.title).toContain('GRI 305');
      expect(report.disclosures).toBeDefined();
    });

    test('generates TCFD report', () => {
      const report = generateReport({ type: 'tcfd', period: '2025-Q4', orgName: 'Test Bank' });
      expect(report.type).toBe('tcfd');
      expect(report.title).toContain('TCFD');
      expect(report.pillars).toBeDefined();
    });

    test('generates IFRS S2 report', () => {
      const report = generateReport({ type: 'ifrs-s2', period: '2025-Q4', orgName: 'Test Bank' });
      expect(report.type).toBe('ifrs-s2');
      expect(report.title).toContain('IFRS');
      expect(report.disclosures).toBeDefined();
    });

    test('uses provided portfolioData', () => {
      const portfolioData = {
        totalProjects: 5,
        totalFinancedEmissions_tCO2e: 1000,
        taxonomyDistribution: { green: 3, transition: 1, brown: 1 },
      };
      const report = generateReport({ type: 'pcaf', period: '2025-Q4', orgName: 'Test', portfolioData });
      expect(report.summary).toBeDefined();
    });

    test('throws on unknown report type', () => {
      expect(() => generateReport({ type: 'invalid', period: '2025-Q4', orgName: 'Test' }))
        .toThrow();
    });
  });

  describe('buildPDF', () => {
    test('returns a readable stream', () => {
      const report = generateReport({ type: 'pcaf', period: '2025-Q4', orgName: 'Test Bank' });
      const stream = buildPDF(report);
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      return new Promise((resolve) => stream.on('end', resolve));
    });
  });
});
