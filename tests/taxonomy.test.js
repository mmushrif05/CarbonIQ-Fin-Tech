/**
 * CarbonIQ FinTech — Taxonomy Alignment Tests
 */

const { checkAllTaxonomies } = require('../services/taxonomy');

describe('Taxonomy Alignment', () => {
  test('low-carbon project aligns as ASEAN Green', () => {
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 500,
      buildingArea_m2: 2000,
      reductionPct: 30,
      hasLCA: true,
      hasEPD: true
    });

    // 500 tCO2e / 2000 m2 = 250 kgCO2e/m2 → under 500 threshold
    expect(result.asean.tier).toBe('green');
  });

  test('mid-carbon project is ASEAN Transition', () => {
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 1200,
      buildingArea_m2: 2000,
      reductionPct: 15,
      hasLCA: true,
      hasEPD: false
    });

    // 1200 tCO2e / 2000 m2 = 600 kgCO2e/m2 → between 500-800
    expect(result.asean.tier).toBe('transition');
  });

  test('high-carbon project is not aligned', () => {
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 2000,
      buildingArea_m2: 2000,
      reductionPct: 5,
      hasLCA: false,
      hasEPD: false
    });

    // 2000 tCO2e / 2000 m2 = 1000 kgCO2e/m2 → above 800
    expect(result.asean.tier).toBe('not_aligned');
  });

  test('Singapore carbon tax exposure is calculated', () => {
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 1000,
      buildingArea_m2: 5000,
      reductionPct: 20,
      hasLCA: true,
      hasEPD: false
    });

    // 1000 tCO2e × S$45 = S$45,000
    expect(result.singapore.carbonTaxExposure_SGD).toBe(45000);
  });

  test('EU taxonomy flags large buildings for WLC requirement', () => {
    const result = checkAllTaxonomies({
      totalEmission_tCO2e: 800,
      buildingArea_m2: 6000,
      reductionPct: 15,
      hasLCA: true,
      hasEPD: false
    });

    expect(result.eu.requiresWholeLifeCarbon).toBe(true);
  });
});
