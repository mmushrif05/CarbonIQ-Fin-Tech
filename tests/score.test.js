/**
 * CarbonIQ FinTech — Carbon Finance Score Tests
 */

const { calculateCarbonFinanceScore } = require('../services/score');

describe('Carbon Finance Score', () => {
  test('returns green classification for high-scoring project', () => {
    const result = calculateCarbonFinanceScore({
      materials80Pct: {
        items: [
          { inTop80Pct: true, epdVerified: true },
          { inTop80Pct: true, epdVerified: true },
          { inTop80Pct: true, _gwpAdjusted: true },
          { inTop80Pct: false }
        ]
      },
      approvalStatus: { total: 10, approved: 9, pending: 1, rejected: 0 },
      verification: { status: 'verified' },
      reduction: { actual: 25, target: 20 },
      certification: { level: 'gold' }
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.classification).toBe('green');
    expect(result.dataCompleteness).toBe(100);
  });

  test('returns brown classification for poor project', () => {
    const result = calculateCarbonFinanceScore({
      materials80Pct: { items: [{ inTop80Pct: true }] },
      approvalStatus: { total: 10, approved: 2, pending: 5, rejected: 3 },
      verification: null,
      reduction: { actual: 2, target: 20 },
      certification: null
    });

    expect(result.score).toBeLessThan(40);
    expect(result.classification).toBe('brown');
  });

  test('returns transition classification for mid-range project', () => {
    const result = calculateCarbonFinanceScore({
      materials80Pct: {
        items: [
          { inTop80Pct: true, _gwpAdjusted: true },
          { inTop80Pct: true },
          { inTop80Pct: false }
        ]
      },
      approvalStatus: { total: 10, approved: 6, pending: 4, rejected: 0 },
      verification: { status: 'in_review' },
      reduction: { actual: 10, target: 20 },
      certification: { level: 'silver' }
    });

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.classification).toBe('transition');
  });

  test('handles empty/null data gracefully', () => {
    const result = calculateCarbonFinanceScore({});

    expect(result.score).toBe(0);
    expect(result.classification).toBe('brown');
    expect(result.dataCompleteness).toBe(0);
  });

  test('score is clamped between 0 and 100', () => {
    const result = calculateCarbonFinanceScore({
      materials80Pct: { items: [] },
      approvalStatus: null,
      verification: null,
      reduction: null,
      certification: null
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
