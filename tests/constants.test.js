const {
  MATERIAL_CARBON_FACTORS,
  REGIONAL_BENCHMARKS,
  TAXONOMY_THRESHOLDS,
  PCAF_DATA_QUALITY,
  SCORE_BANDS,
  PROJECT_TYPES,
} = require('../models/constants');

describe('Domain Constants', () => {
  it('has carbon factors for all material categories', () => {
    const categories = ['concrete', 'steel', 'timber', 'aluminium', 'glass', 'insulation', 'masonry', 'plastics', 'other'];
    for (const cat of categories) {
      expect(MATERIAL_CARBON_FACTORS[cat]).toBeDefined();
      expect(typeof MATERIAL_CARBON_FACTORS[cat].factor).toBe('number');
    }
  });

  it('has regional benchmarks for all supported regions', () => {
    for (const region of ['GLOBAL', 'ASEAN', 'EU', 'HK', 'SG']) {
      const b = REGIONAL_BENCHMARKS[region];
      expect(b.excellent).toBeLessThan(b.good);
      expect(b.good).toBeLessThan(b.average);
      expect(b.average).toBeLessThan(b.poor);
    }
  });

  it('has taxonomy thresholds for all regions', () => {
    for (const region of ['ASEAN', 'EU', 'HK', 'SG']) {
      expect(TAXONOMY_THRESHOLDS[region]).toBeDefined();
      expect(TAXONOMY_THRESHOLDS[region].residential).toBeGreaterThan(0);
    }
  });

  it('has PCAF data quality definitions for levels 1-5', () => {
    for (let i = 1; i <= 5; i++) {
      expect(PCAF_DATA_QUALITY[i]).toBeDefined();
      expect(PCAF_DATA_QUALITY[i].label).toBeTruthy();
    }
  });

  it('has score bands covering 0-100', () => {
    const bands = Object.values(SCORE_BANDS);
    expect(Math.min(...bands.map(b => b.min))).toBe(0);
    expect(Math.max(...bands.map(b => b.max))).toBe(100);
  });

  it('has standard project types', () => {
    expect(PROJECT_TYPES).toContain('residential');
    expect(PROJECT_TYPES).toContain('commercial');
    expect(PROJECT_TYPES.length).toBeGreaterThanOrEqual(5);
  });

  it('constants are frozen (immutable)', () => {
    MATERIAL_CARBON_FACTORS.newMaterial = { factor: 999 };
    expect(MATERIAL_CARBON_FACTORS.newMaterial).toBeUndefined();
  });
});
