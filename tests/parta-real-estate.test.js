/**
 * §5.4 / §5.5 — the real-estate engine. One engine for both classes: financed
 * building scope 1 and 2 = building scope 1 and 2 × (outstanding ÷ property
 * value at origination). How the energy is known sets the option and the score.
 *
 * The anchor behaviours the standard's "done when" names: a metered building
 * scores 1 with a supplier factor and 2 without; a floor-area estimate with no
 * label scores 4; a modification updates the origination value. Plus the gate's
 * redirects and the coherence refusals.
 */

'use strict';

const { assessRealEstate } = require('../src/domains/pcaf-part-a/domain/real-estate');

const cre = (over = {}) => assessRealEstate({
  class: 'commercial-real-estate', country: 'LK', buildingType: 'office',
  exposure: { outstanding: 5e6, currency: 'LKR' }, value: { atOrigination: 20e6 },
  floorArea_m2: 1000, ...over,
});

describe('The option is set by how the building energy is known (Tables 5.4-1 / 5.5-1)', () => {
  test('metered energy with a supplier-specific factor is Option 1a, score 1', () => {
    const r = assessRealEstate({ class: 'mortgages', country: 'LK', buildingType: 'residential_house',
      exposure: { outstanding: 4e6 }, value: { atOrigination: 10e6 },
      energy: { electricity_kWh: 5000, fuel_kWh: 1000, fuelSource: 'lpg', emissionFactorBasis: 'supplier', electricityFactor: 0.4, fuelFactor: 0.2 } });
    expect(r.inventory.dataQuality.option).toBe('1a');
    expect(r.inventory.dataQuality.score).toBe(1);
  });

  test('the same metered building with an average factor is Option 1b, score 2', () => {
    const r = assessRealEstate({ class: 'mortgages', country: 'LK', buildingType: 'residential_house',
      exposure: { outstanding: 4e6 }, value: { atOrigination: 10e6 },
      energy: { electricity_kWh: 5000, fuel_kWh: 1000, fuelSource: 'lpg', emissionFactorBasis: 'average' } });
    expect(r.inventory.dataQuality.option).toBe('1b');
    expect(r.inventory.dataQuality.score).toBe(2);
  });

  test('an official label and floor area is Option 2a, score 3', () => {
    const r = cre({ label: 'C', floorArea_m2: 1000, buildingType: 'office' });
    expect(r.inventory.dataQuality.option).toBe('2a');
    expect(r.inventory.dataQuality.score).toBe(3);
  });

  test('a floor-area estimate with no label is Option 2b, score 4', () => {
    const r = cre();
    expect(r.inventory.dataQuality.option).toBe('2b');
    expect(r.inventory.dataQuality.score).toBe(4);
  });

  test('a building count with no floor area is Option 3, score 5', () => {
    const r = cre({ floorArea_m2: undefined, buildingCount: 3 });
    expect(r.inventory.dataQuality.option).toBe('3');
    expect(r.inventory.dataQuality.score).toBe(5);
  });
});

describe('The figure: building scope 1 and 2, attributed on the origination value', () => {
  test('an office at 1000 m² attributes a quarter of its scope 1 and 2', () => {
    const r = cre();
    /* office 160 kWh/m²·yr × 1000 = 160,000 kWh; 85% elec × 0.53, 15% diesel × 0.267. */
    expect(r.inventory.buildingEmissions.scope2).toBeCloseTo(72.08, 1);
    expect(r.inventory.buildingEmissions.scope1).toBeCloseTo(6.41, 1);
    expect(r.inventory.buildingEmissions.combined).toBeCloseTo(78.49, 1);
    expect(r.attribution.value).toBe(0.25);
    expect(r.inventory.financedScope1And2.combined).toBeCloseTo(19.62, 1);
  });

  test('scope 1 and 2 are carried apart and the combined figure is their sum, never a scope 3', () => {
    const r = cre();
    const inv = r.inventory.financedScope1And2;
    expect(inv.combined).toBeCloseTo(inv.scope1.value + inv.scope2.value, 5);
    /* construction (scope 3 cat 15) is absent by default and never in the combined figure. */
    expect(r.inventory.constructionScope3.absent).toBe(true);
  });

  test('a developer construction figure is carried as scope 3 category 15, apart', () => {
    const r = cre({ developerConstructionEmissions_tCO2e: 4000 });
    expect(r.inventory.constructionScope3.value).toBeCloseTo(1000, 0); // 4000 × 0.25
    expect(r.inventory.constructionScope3.value).not.toBe(r.inventory.financedScope1And2.combined);
  });
});

describe('The origination-value denominator and its three states', () => {
  test('a modification with a new valuation updates the origination value', () => {
    const r = cre({ value: { atOrigination: 20e6, modification: { newValuation: 25e6, date: '2025-06-01' } } });
    expect(r.denominator.state).toBe('modified');
    expect(r.denominator.valueAtOrigination).toBe(25e6);
  });

  test('the latest value is used and fixed where origination is unobtainable', () => {
    const r = cre({ value: { latest: 30e6 } });
    expect(r.denominator.state).toBe('latest-fixed');
    expect(r.denominator.valueAtOrigination).toBe(30e6);
  });

  test('no value at all is refused, never assumed', () => {
    expect(() => cre({ value: {} })).toThrow();
  });

  test('an attribution factor above 1 (loan larger than the property) is refused, not capped', () => {
    expect(() => cre({ exposure: { outstanding: 30e6 }, value: { atOrigination: 20e6 } }))
      .toThrow(/above 1/i);
  });
});

describe('The gate redirects what is not this class', () => {
  test('a listed owner is redirected to §5.1', () => {
    expect(() => cre({ borrowerListed: true })).toThrow(/5\.1|listed/i);
  });
  test('a property-secured loan for another purpose is redirected to §5.2', () => {
    expect(() => cre({ securedForOtherPurpose: true })).toThrow(/5\.2|business loan/i);
  });
  test('a HELOC is out of scope for mortgages', () => {
    expect(() => assessRealEstate({ class: 'mortgages', country: 'LK', buildingType: 'residential_house',
      exposure: { outstanding: 1e6 }, value: { atOrigination: 5e6 }, floorArea_m2: 100, productType: 'heloc' }))
      .toThrow(/HEL/i);
  });
  test('a construction mortgage is not required and is out of scope', () => {
    expect(() => assessRealEstate({ class: 'mortgages', country: 'LK', buildingType: 'residential_house',
      exposure: { outstanding: 1e6 }, value: { atOrigination: 5e6 }, floorArea_m2: 100, productType: 'construction' }))
      .toThrow(/construction/i);
  });
  test('CRE construction is optional — it runs, with a note', () => {
    const r = cre({ productType: 'construction' });
    expect(r.property.notes.join(' ')).toMatch(/optional under §5\.4/i);
    expect(r.inventory.financedScope1And2.combined).toBeGreaterThan(0);
  });
});

describe('The score renders as a category with the scale, never a fraction', () => {
  test('the data-quality label is "score: N (Option X)" and never "N / 5"', () => {
    const r = cre();
    expect(r.inventory.dataQuality.label).toMatch(/Data quality score: 4 \(Option 2b\)/);
    expect(r.inventory.dataQuality.label).not.toMatch(/\/\s*5\b/);
  });
});
