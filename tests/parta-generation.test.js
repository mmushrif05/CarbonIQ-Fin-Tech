/**
 * A renewable project assessed from what it generates.
 *
 * The value of this path is not that it saves typing. It is that a typed
 * emissions figure is accountable to nobody — the trace said "Measured" over
 * a number a person invented, and the data quality option was a dropdown that
 * could be set to the best score PCAF awards with no evidence behind it.
 *
 * These tests pin the three things that make the derived path different: the
 * factor carries its publisher and basis wherever the number goes, the option
 * is earned rather than chosen, and a physically impossible generation figure
 * is refused instead of multiplied.
 */

'use strict';

const parta   = require('../services/pcaf-parta');
const grid    = require('../services/pcaf-parta/grid-factors');
const { deriveFromGeneration } = require('../services/pcaf-parta/generation');

const EXPOSURE = {
  projectName: 'Solar Project', archetype: 'renewable-generation',
  outstandingAmount: 12000000, totalProjectEquityPlusDebt: 40000000, currency: 'USD',
};
const run = (generation, extra = {}) =>
  parta.assessExposure({ ...EXPOSURE, generation, ...extra });

const GEN = { annualGeneration_MWh: 90600, country: 'LK', installedCapacity_MW: 60, basis: 'projected' };

describe('Two bases are held, and they are never silently interchanged', () => {
  test('every country offered carries at least one sourced factor', () => {
    for (const c of grid.list()) {
      const held = [c.gridAverage, c.combinedMargin].filter(Boolean);
      expect(`${c.code}:${held.length > 0}`).toBe(`${c.code}:true`);
      for (const f of held) {
        expect(typeof f.value).toBe('number');
        expect(f.publisher).toBeTruthy();
        expect(f.vintage).toBeTruthy();
        expect(f.source).toBeTruthy();
      }
    }
  });

  test('Sri Lanka displaces on the combined margin and consumes on the grid average', () => {
    // 0.8108 against 0.500 — a 62% gap on the same grid. Using either for both
    // is the error this separation exists to prevent.
    expect(grid.resolve('LK', 'displacement').value).toBe(0.8108);
    expect(grid.resolve('LK', 'consumption').value).toBe(0.5);
    expect(grid.resolve('LK', 'displacement').substituted).toBe(false);
  });

  test('where a basis is not held the substitution is declared, not hidden', () => {
    // Singapore publishes OM and BM but no combined margin is held here.
    const sg = grid.resolve('SG', 'displacement');
    expect(sg.substituted).toBe(true);
    expect(sg.basis).toBe('gridAverage');
    expect(sg.substitutionNote).toMatch(/weaker basis/);

    // Uganda is the mirror image: a combined margin but no consumption factor.
    const ug = grid.resolve('UG', 'consumption');
    expect(ug.substituted).toBe(true);
    expect(ug.basis).toBe('combinedMargin');
  });

  test('a substitution reaches the assumptions register rather than a comment', () => {
    const r = run({ ...GEN, country: 'SG' });
    expect(r.generation.assumptions.some(a => /not held for Singapore/.test(a))).toBe(true);
  });

  test('a country with no factor is refused, not defaulted', () => {
    expect(() => grid.resolve('ZZ', 'displacement')).toThrow(/No grid emission factor is held/);
    try { grid.resolve('ZZ', 'displacement'); } catch (e) {
      expect(e.code).toBe('GRID_FACTOR_NOT_HELD');
      expect(e.statusCode).toBe(501);
    }
  });
});

describe('The same plant in four countries', () => {
  /* The spread is the argument. An identical 60 MW plant generating an
     identical 90,600 MWh displaces 68 times more in Sri Lanka than in Norway,
     because what it displaces is a property of the grid, not the panel. */
  const cases = [
    ['LK', 73458.48, 22037.54],
    ['SG', 36421.20, 10926.36],
    ['UG', 18618.30,  5585.49],
    ['NO',  1078.14,   323.44],
  ];

  test.each(cases)('%s displaces %s tCO2e, of which the lender finances %s', (country, project, financed) => {
    const r = run({ ...GEN, country });
    expect(r.generation.projectAvoided.value).toBe(project);
    expect(r.impact.metrics[0].figure.value).toBe(financed);
  });

  test('Norway displaces least because its grid is already clean', () => {
    const no = run({ ...GEN, country: 'NO' });
    const lk = run({ ...GEN, country: 'LK' });
    expect(no.generation.projectAvoided.value).toBeLessThan(lk.generation.projectAvoided.value / 50);
  });

  test('the factor travels with the figure — publisher, vintage and basis', () => {
    const ug = run({ ...GEN, country: 'UG' });
    const d = ug.generation.factors.displacement;
    expect(d.publisher).toMatch(/UNFCCC CDM standardized baseline ASB0054-2022/);
    expect(d.basis).toBe('combinedMargin');
    expect(d.vintage).toBe('2022');
    expect(ug.impact.metrics[0].counterfactualSource).toMatch(/ASB0054-2022/);
  });
});

describe('The scopes are derived, and scope 1 being nil is a finding', () => {
  const r = run(GEN);

  test('scope 1 is zero with the reason, not an unmeasured gap', () => {
    expect(r.generation.projectScope1.value).toBe(0);
    expect(r.generation.projectScope1.basis).toMatch(/no fuel combustion/);
    expect(r.generation.projectScope1.assumptions[0]).toMatch(/standby|SF6/i);
  });

  test('scope 2 is the auxiliary draw at the consumption factor, not the margin', () => {
    // 90,600 MWh x 0.5% = 453 MWh of parasitic load, x 0.500 = 226.5 tCO2e.
    expect(r.generation.factors.auxiliaryConsumption_MWh).toBe(453);
    expect(r.generation.projectScope2.value).toBe(226.5);
    expect(r.generation.projectScope2.inputs.gridFactor_tCO2e_per_MWh).toBe(0.5);
  });

  test('metered auxiliary consumption replaces the assumption, and says so', () => {
    const assumed = run(GEN);
    const metered = run({ ...GEN, auxiliaryConsumption_MWh: 700 });
    expect(metered.generation.factors.auxiliaryMetered).toBe(true);
    expect(metered.generation.projectScope2.value).toBe(350);
    expect(metered.generation.projectScope2.basis).toMatch(/Measured/);
    expect(assumed.generation.assumptions.length)
      .toBeGreaterThan(metered.generation.assumptions.length);
  });

  test('the financed figure is still the lender\'s share of scope 1 and 2', () => {
    expect(r.inventory.scope1And2.value).toBe(67.95);   // 226.5 x 0.3
  });
});

describe('The data quality option is earned', () => {
  test('generation with a specific grid factor derives Option 2a', () => {
    const r = run(GEN);
    expect(r.inventory.dataQuality.option).toBe('2a');
    expect(r.inventory.dataQuality.score).toBe(2);
    expect(r.inventory.dataQuality.derived).toBe(true);
    expect(r.inventory.dataQuality.derivationReason).toMatch(/primary physical activity data/);
  });

  test('claiming a better option without evidence is refused', () => {
    // Option 1a is score 1 and requires independently verified emissions.
    // It used to be one click away with nothing behind it.
    expect(() => run(GEN, { dataQualityOption: '1a' })).toThrow(/places this run at Option 2a/);
    try { run(GEN, { dataQualityOption: '1a' }); } catch (e) {
      expect(e.code).toBe('DQ_OPTION_NOT_EARNED');
      expect(e.statusCode).toBe(400);
      expect(e.remedy).toMatch(/justification/);
    }
  });

  test('a justification is honoured and recorded beside the score', () => {
    const r = run(GEN, {
      dataQualityOption: '1b',
      dataQualityOverrideJustification: 'Plant reported its own metered emissions to the lender.',
    });
    expect(r.inventory.dataQuality.option).toBe('1b');
    expect(r.inventory.dataQuality.derived).toBe(false);
    expect(r.inventory.dataQuality.derivedOption).toBe('2a');
    expect(r.inventory.dataQuality.overrideJustification).toMatch(/metered emissions/);
  });

  test('claiming the option the evidence already supports needs no justification', () => {
    expect(() => run(GEN, { dataQualityOption: '2a' })).not.toThrow();
  });

  test('without a derivation an option is still required', () => {
    expect(() => parta.assessExposure({
      ...EXPOSURE, archetype: 'general', projectScope1_tCO2e: 10, projectScope2_tCO2e: 5,
    })).toThrow(/data quality option is required/);
  });
});

describe('A physically impossible generation figure is refused', () => {
  test('90,600 MWh from 60 MW is 17.2% and inside Sri Lanka\'s band', () => {
    const p = run(GEN).generation.plausibility;
    expect(p.capacityFactorPct).toBe(17.2);
    expect(p.status).toBe('within_band');
    expect(p.nameplateCeiling_MWh).toBe(525600);
  });

  test('the same figure is above band in Norway, where the sun is not', () => {
    const p = run({ ...GEN, country: 'NO' }).generation.plausibility;
    expect(p.status).toBe('above_band');
    expect(p.note).toMatch(/outside the 8-11% band/);
  });

  test('283,000 MWh from 60 MW is refused — no PV plant reaches 53.8%', () => {
    expect(() => run({ ...GEN, annualGeneration_MWh: 283000 }))
      .toThrow(/No photovoltaic plant achieves that/);
    try { run({ ...GEN, annualGeneration_MWh: 283000 }); } catch (e) {
      expect(e.code).toBe('GENERATION_NOT_PHYSICALLY_POSSIBLE');
      expect(e.statusCode).toBe(422);
      // The overwhelmingly likely cause, named.
      expect(e.remedy).toMatch(/kWh entered as MWh/);
    }
  });

  test('without capacity the check does not run, and says so rather than passing', () => {
    const p = run({ annualGeneration_MWh: 90600, country: 'LK' }).generation.plausibility;
    expect(p.ran).toBe(false);
    expect(p.status).toBeUndefined();
    expect(p.reason).toMatch(/could not be checked/);
  });
});

describe('Projected and metered are different claims', () => {
  test('a projection reports Expected Avoided Emissions, annualised', () => {
    const m = run({ ...GEN, basis: 'projected' }).impact.metrics[0];
    expect(m.metric).toBe('Expected Avoided Emissions (EAE)');
    expect(m.figure.unit).toBe('tCO2e per year');
    expect(m.annualisedNote).toMatch(/annualised basis/);
  });

  test('metered output reports realised avoided emissions', () => {
    const m = run({ ...GEN, basis: 'metered' }).impact.metrics[0];
    expect(m.metric).toBe('Financed avoided emissions');
  });

  test('either way the counterfactual comes from the store, never blank', () => {
    for (const basis of ['projected', 'metered']) {
      const m = run({ ...GEN, basis }).impact.metrics[0];
      expect(m.counterfactual).toMatch(/Sri Lanka national system/);
      expect(m.counterfactualSource).toMatch(/DNA Sri Lanka/);
    }
  });

  test('nothing derived ever enters the Part A inventory', () => {
    const r = run(GEN);
    const avoided = r.impact.metrics[0].figure.value;
    expect(r.inventory.scope1And2.value).toBe(67.95);
    expect(r.inventory.scope1And2.value).not.toBe(avoided);
    expect(JSON.stringify(r.inventory)).not.toContain(String(avoided));
  });
});

describe('The generation path is gated by archetype, like everything else', () => {
  test('a general-purpose exposure ignores a generation block entirely', () => {
    const r = parta.assessExposure({
      ...EXPOSURE, archetype: 'general', dataQualityOption: '2b',
      projectScope1_tCO2e: 100, projectScope2_tCO2e: 50, generation: GEN,
    });
    expect(r.generation).toBeNull();
    expect(r.inventory.scope1And2.value).toBe(45);   // 150 x 0.3, the typed figures
    expect(r.impact.metrics).toHaveLength(0);
  });
});
