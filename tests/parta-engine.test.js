/**
 * PCAF Part A — the engine.
 *
 * These pin the rules that would be wrong silently: the option-to-score lookup
 * that differs by asset class, the attribution factor that must refuse rather
 * than cap, the scopes the standard requires against the one it does not, and
 * the separation between the inventory and everything the supplement covers.
 */

'use strict';

const { assessExposure } = require('../services/pcaf-parta');
const dq = require('../services/pcaf-parta/data-quality');
const { attributionFactor } = require('../services/pcaf-parta/attribution');
const { financedEmissions } = require('../services/pcaf-parta/emissions');
const impact = require('../services/pcaf-parta/impact');

const BASE = {
  projectName: 'Cement Company 1', counterparty: 'Ceylon Cement PLC', sector: 'Cement',
  reportingYear: 2026, archetype: 'efficiency-retrofit',
  outstandingAmount: 12000000, totalProjectEquityPlusDebt: 40000000,
  currency: 'USD', dataQualityOption: '2b',
  projectScope1_tCO2e: 410000, projectScope2_tCO2e: 52000,
};

describe('Data quality is a table per asset class, not a global lookup', () => {
  test('project finance follows Table 5.3-1', () => {
    const expected = { '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5, '3c': 5 };
    for (const [option, score] of Object.entries(expected)) {
      expect(dq.score('project-finance', option).score).toBe(score);
    }
  });

  test('an asset class with no table held is refused, never given another class\'s', () => {
    // The mapping is not uniform across classes, so substituting a table would
    // return a plausible number that is wrong.
    expect(() => dq.score('mortgages', '2a')).toThrow(/no pcaf part a data quality table/i);
    try { dq.score('mortgages', '2a'); } catch (e) { expect(e.code).toBe('DQ_TABLE_NOT_HELD'); }
  });

  test('an option outside the table is refused and the valid ones are named', () => {
    try { dq.score('project-finance', '9z'); } catch (e) {
      expect(e.code).toBe('UNKNOWN_DQ_OPTION');
      expect(e.message).toContain('1a');
    }
  });

  test('the score renders as a category with its scale, never as a fraction', () => {
    const s = dq.score('project-finance', '2b');
    expect(s.label).toBe('Data quality score: 3 (Option 2b)');
    expect(s.label).not.toMatch(/\/\s*5/);
    expect(s.scale).toMatch(/1 is the highest/i);
  });

  test('across a book the score is weighted by outstanding amount, not premium', () => {
    const w = dq.weightedByOutstanding([
      { score: 2, outstanding: 100 }, { score: 3, outstanding: 300 },
    ]);
    expect(w.score).toBe(2.75);
    expect(w.basis).toBe('outstanding amount');
  });

  test('an exposure with no score is excluded from the weighting, not counted as zero', () => {
    const w = dq.weightedByOutstanding([
      { score: 2, outstanding: 100 }, { score: null, outstanding: 900 },
    ]);
    expect(w.score).toBe(2);
    expect(w.excluded).toBe(1);
  });
});

describe('Attribution refuses what it cannot honestly compute', () => {
  test('project finance divides by total project equity plus debt', () => {
    const a = attributionFactor({ assetClass: 'project-finance', outstandingAmount: 12e6, denominator: 40e6 });
    expect(a.value).toBe(0.3);
    expect(a.equation).toMatch(/total project equity plus debt/);
  });

  test('a factor above 1 is refused, not capped', () => {
    // The screenshot case: a 500,000 loan against a 250,000 project value.
    try {
      attributionFactor({ assetClass: 'project-finance', outstandingAmount: 500000, denominator: 250000 });
      throw new Error('should have refused');
    } catch (e) {
      expect(e.code).toBe('ATTRIBUTION_ABOVE_ONE');
      expect(e.message).toContain('2.0000');
      expect(e.remedy).toMatch(/justification/i);
    }
  });

  test('and is accepted only with a justification, which is recorded', () => {
    const a = attributionFactor({
      assetClass: 'project-finance', outstandingAmount: 500000, denominator: 250000,
      overrideJustification: 'Denominator is a stale valuation pending refinance.',
    });
    expect(a.value).toBe(2);
    expect(a.assumptions[0]).toMatch(/stale valuation/);
  });

  test('a missing denominator is refused rather than defaulted', () => {
    try { attributionFactor({ assetClass: 'project-finance', outstandingAmount: 1, denominator: 0 }); }
    catch (e) { expect(e.code).toBe('INVALID_DENOMINATOR'); }
  });
});

describe('The scopes the standard requires, and the one it does not', () => {
  test('scope 1 and 2 are required — §5.3 says shall', () => {
    try { financedEmissions({ attributionFactor: 0.3, projectScope1_tCO2e: 10 }); }
    catch (e) { expect(e.code).toBe('SCOPE_1_2_REQUIRED'); }
  });

  test('an unsupplied scope 3 is absent, never zero', () => {
    const r = financedEmissions({ attributionFactor: 0.3, projectScope1_tCO2e: 100, projectScope2_tCO2e: 100 });
    expect(r.scope3.absent).toBe(true);
    expect(r.scope3.value).toBeNull();
  });

  test('removals are reported beside the inventory, never inside it', () => {
    const r = financedEmissions({
      attributionFactor: 1, projectScope1_tCO2e: 100, projectScope2_tCO2e: 100, removals_tCO2e: 40,
    });
    expect(r.removals.value).toBe(40);
    expect(r.scope1And2.value).toBe(200);   // unchanged by the removal
  });
});

describe('The supplement\'s prohibitions are refusals, not warnings', () => {
  test.each(['economic-intensity', 'input-output', 'EEIO'])(
    'avoided emissions estimated via %s are refused', basis => {
      try {
        impact.avoidedEmissions({
          attributionFactor: 1, projectAvoided_tCO2e: 1,
          counterfactual: 'grid', counterfactualSource: 'CEB', estimationBasis: basis,
        });
        throw new Error('should have refused');
      } catch (e) { expect(e.code).toBe('PROHIBITED_ESTIMATION_BASIS'); }
    });

  test('avoided emissions without a counterfactual are refused', () => {
    try { impact.avoidedEmissions({ attributionFactor: 1, projectAvoided_tCO2e: 1 }); }
    catch (e) { expect(e.code).toBe('COUNTERFACTUAL_REQUIRED'); }
  });

  test('the avoided period must match the counterparty\'s generated-emissions period', () => {
    try {
      impact.avoidedEmissions({
        attributionFactor: 1, projectAvoided_tCO2e: 1, counterfactual: 'grid',
        counterfactualSource: 'CEB', reportingPeriod: 2026, counterpartyEmissionsPeriod: 2025,
      });
    } catch (e) { expect(e.code).toBe('TIMEFRAME_INCONSISTENT'); }
  });
});

describe('EER reproduces the supplement\'s worked example', () => {
  test('(100,000 − 50,000) ÷ (2030 − 2025) × (2027 − 2025) = 20,000', () => {
    const r = impact.expectedEmissionReductions({
      attributionFactor: 1, baseYear: 2025, baseYearEmissions_tCO2e: 100000,
      targetYear: 2030, targetYearEmissions_tCO2e: 50000, asOfYear: 2027,
    });
    expect(r.figure.value).toBe(20000);
  });

  test('and is then attributed to the lender', () => {
    const r = impact.expectedEmissionReductions({
      attributionFactor: 0.1, baseYear: 2025, baseYearEmissions_tCO2e: 100000,
      targetYear: 2030, targetYearEmissions_tCO2e: 50000, asOfYear: 2027,
    });
    expect(r.figure.value).toBe(2000);
  });

  test('EAE is annualised, as the supplement requires', () => {
    const r = impact.expectedAvoidedEmissions({
      attributionFactor: 0.5, annualAvoided_tCO2e: 48000,
      counterfactual: 'grid average displaced', counterfactualSource: 'CEB 2025',
    });
    expect(r.figure.value).toBe(24000);
    expect(r.figure.unit).toBe('tCO2e per year');
  });
});

describe('The archetype decides which metrics exist', () => {
  test('a retrofit reports a reduction against a base year, and no avoidance', () => {
    const r = assessExposure({
      ...BASE,
      reduction: { baseYear: 2025, baseYearEmissions_tCO2e: 100000, targetYear: 2030, targetYearEmissions_tCO2e: 50000, asOfYear: 2027 },
      avoided: { annualAvoided_tCO2e: 999999, counterfactual: 'x', counterfactualSource: 'y' },
    });
    const names = r.impact.metrics.map(m => m.metric);
    expect(names).toContain('Expected Emission Reductions (EER)');
    expect(names.join()).not.toMatch(/Avoided/);
  });

  test('a renewable project reports avoidance against a counterfactual, and no reduction', () => {
    const r = assessExposure({
      ...BASE, archetype: 'renewable-generation', dataQualityOption: '2a',
      reduction: { baseYear: 2025, baseYearEmissions_tCO2e: 1, targetYear: 2030, targetYearEmissions_tCO2e: 0 },
      avoided: { annualAvoided_tCO2e: 48000, counterfactual: 'grid displaced', counterfactualSource: 'CEB 2025' },
    });
    const names = r.impact.metrics.map(m => m.metric);
    expect(names).toContain('Expected Avoided Emissions (EAE)');
    expect(names.join()).not.toMatch(/Reduction/);
  });

  test('a general-purpose loan claims neither, rather than reporting zeros', () => {
    const r = assessExposure({ ...BASE, archetype: 'general' });
    expect(r.impact.metrics).toHaveLength(0);
  });
});

describe('The inventory and the impact figures never merge', () => {
  const r = assessExposure({
    ...BASE, archetype: 'renewable-generation', dataQualityOption: '2a',
    projectScope1_tCO2e: 120, projectScope2_tCO2e: 340,
    avoided: { annualAvoided_tCO2e: 48000, counterfactual: 'grid displaced', counterfactualSource: 'CEB 2025' },
  });

  test('they sit in separate containers', () => {
    expect(r.inventory.scope1And2.value).toBe(138);
    expect(r.impact.metrics[0].figure.value).toBe(14400);
    expect(JSON.stringify(r.inventory)).not.toMatch(/14400/);
  });

  test('every impact figure carries the non-comparability statement', () => {
    expect(r.impact.notComparable).toMatch(/never added to them/i);
    for (const m of r.impact.metrics) expect(m.notComparable).toBeTruthy();
  });

  test('and says it rests on the supplement, not on Part A', () => {
    expect(r.impact.metrics[0].scopeNote).toMatch(/not on Part A/i);
  });

  test('the inventory names itself as Category 15', () => {
    expect(r.inventory.category).toMatch(/Category 15/);
  });
});

describe('Every figure shows its working', () => {
  const r = assessExposure(BASE);

  test('the attribution factor carries its equation and inputs', () => {
    expect(r.attribution.equation).toContain('÷');
    expect(r.attribution.inputs.outstandingAmount).toBe(12000000);
  });

  test('economic intensity is per million lent, as the checklist recommends', () => {
    // 138,600 tCO2e over 12M = 11,550 tCO2e per million.
    expect(r.inventory.economicIntensity_tCO2e_per_M).toBe(11550);
    expect(r.inventory.economicIntensityNote).toMatch(/p\.127/);
  });
});
