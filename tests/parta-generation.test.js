/**
 * Renewable generation: two modes, two factors, and a data quality option that
 * follows the weakest link.
 *
 * The suite exists for three defects that are invisible on the page.
 *
 * Interchanging the combined margin and the grid average is a 62% error on Sri
 * Lanka's numbers that looks entirely correct. There is a test below that fails
 * if the two are ever swapped.
 *
 * Borrowing another country's capacity factor would pass or fail a project
 * against a place it is not in. No data now means no check.
 *
 * And a generation figure invented from a default capacity factor is not
 * primary physical activity data, however precisely it is printed — so it
 * cannot be scored as though it were.
 */

'use strict';

const parta = require('../services/pcaf-parta');
const cc    = require('../services/pcaf-parta/country-config');
const { deriveFromGeneration } = require('../services/pcaf-parta/generation');

const EXPOSURE = {
  projectName: 'Solar Project', archetype: 'renewable-generation',
  outstandingAmount: 12000000, totalProjectEquityPlusDebt: 40000000,
  currency: 'USD', reportingYear: 2026,
};
const run = (generation, extra = {}) => parta.assessExposure({ ...EXPOSURE, generation, ...extra });
const METERED = { country: 'LK', technology: 'solar_pv', basis: 'metered',
  installedCapacity_MW: 60, annualGeneration_MWh: 90600 };

describe('The two grid factors are never interchangeable', () => {
  test('displacement reads the combined margin; consumption reads the grid average', () => {
    expect(cc.displacementFactor('LK').key).toBe('combined_margin');
    expect(cc.displacementFactor('LK').value).toBe(0.8108);
    expect(cc.consumptionFactor('LK').key).toBe('grid_average');
    expect(cc.consumptionFactor('LK').value).toBe(0.5);
  });

  /* The swap test. If someone wires scope 2 to the combined margin or avoided
     emissions to the grid average, these numbers move and this fails. */
  test('scope 2 uses the grid average and avoided uses the combined margin', () => {
    const g = deriveFromGeneration({ ...METERED, mode: 'metered', reportingYear: 2026 });

    // 90,600 x 0.5% = 453 MWh auxiliary, x 0.500 (average) = 226.5
    expect(g.scope2.value).toBe(226.5);
    expect(g.scope2.inputs.gridAverage_tCO2e_per_MWh).toBe(0.5);

    // 90,600 x 0.8108 (combined margin) = 73,458.48
    expect(g.avoided.value).toBe(73458.48);
    expect(g.avoided.inputs.combinedMargin_tCO2e_per_MWh).toBe(0.8108);

    // Swapped, these would be 367.29 and 45,300. Assert they are not.
    expect(g.scope2.value).not.toBeCloseTo(453 * 0.8108, 2);
    expect(g.avoided.value).not.toBeCloseTo(90600 * 0.5, 2);
  });

  test('neither resolver takes a key, so neither can be handed the other\'s', () => {
    expect(cc.displacementFactor.length).toBe(1);   // (code) only
    expect(cc.consumptionFactor.length).toBe(1);
  });

  test('a missing combined margin is never filled from the grid average', () => {
    for (const code of ['SG', 'NO']) {
      const d = cc.displacementFactor(code);
      expect(`${code}:${d.absent}`).toBe(`${code}:true`);
      expect(d.reason).toMatch(/basis substitution|different basis|forbid/i);
    }
  });
});

describe('Fall back on geography, never on basis', () => {
  test('Uganda has no grid average, so the global average is used and labelled', () => {
    const c = cc.consumptionFactor('UG');
    expect(c.isGlobalDefault).toBe(true);
    expect(c.key).toBe('grid_average');          // same basis
    expect(c.value).toBe(0.473);                 // Ember global, 2024
    expect(c.publisher).toMatch(/Ember/);
  });

  test('Singapore and Norway still cannot produce an avoided figure', () => {
    for (const country of ['SG', 'NO']) {
      const r = run({ country, technology: 'solar_pv', basis: 'projected', installedCapacity_MW: 60 });
      expect(r.impact.metrics).toHaveLength(0);
      expect(r.impact.absent.absent).toBe(true);
    }
  });

  test('an unconfigured country is refused rather than defaulted', () => {
    expect(() => cc.forCountry('ZZ')).toThrow(/No configuration is held/);
  });
});

describe('Two modes, driven by the generation-figure dropdown', () => {
  test('projected derives generation from capacity and marks it derived', () => {
    const r = run({ country: 'LK', technology: 'solar_pv', basis: 'projected', installedCapacity_MW: 60 });
    // 60 MW x 15.7% (Sri Lanka national, Hambantota) x 8,760 h
    expect(r.generation.annualGeneration.value).toBe(82519.2);
    expect(r.generation.annualGeneration.source).toBe('derived');
    expect(r.generation.annualGeneration.driver).toBe('capacity');
  });

  test('metered never overwrites the generation it was given', () => {
    const r = run(METERED);
    expect(r.generation.annualGeneration.value).toBe(90600);
    expect(r.generation.annualGeneration.source).toBe('metered');
    expect(r.generation.annualGeneration.driver).toBe('generation');
  });

  test('a supplied generation in projected mode stops the derivation', () => {
    const r = run({ country: 'LK', technology: 'solar_pv', basis: 'projected',
      installedCapacity_MW: 60, annualGeneration_MWh: 80000 });
    expect(r.generation.annualGeneration.value).toBe(80000);
    expect(r.generation.annualGeneration.source).toBe('supplied');
  });

  test('metered mode refuses to invent the figure it exists to report', () => {
    expect(() => run({ country: 'LK', technology: 'solar_pv', basis: 'metered',
      installedCapacity_MW: 60 })).toThrow(/never derived/);
  });

  test('P90 is the conservative bound and is lower than P50', () => {
    const base = { country: 'LK', technology: 'solar_pv', basis: 'projected', installedCapacity_MW: 60 };
    const p50 = run({ ...base, yieldBasis: 'P50' }).generation.annualGeneration.value;
    const p90 = run({ ...base, yieldBasis: 'P90' }).generation.annualGeneration.value;
    expect(p90).toBeLessThan(p50);
    expect(p90).toBeCloseTo(p50 * 0.92, 1);
  });
});

describe('The data quality option follows the weakest link', () => {
  const cases = [
    ['metered',   'LK', '2a', 2, {}],
    ['metered',   'UG', '2b', 3, {}],   // global consumption factor
    ['projected', 'LK', '3a', 4, {}],   // generation derived from a default CF
    ['projected', 'UG', '3b', 5, {}],   // derived AND global factor
  ];

  test.each(cases)('%s in %s earns Option %s (score %s)', (basis, country, option, score) => {
    const gen = { country, technology: 'solar_pv', basis, installedCapacity_MW: 60,
      ...(basis === 'metered' ? { annualGeneration_MWh: 90600 } : {}) };
    const dq = run(gen).inventory.dataQuality;
    expect(dq.option).toBe(option);
    expect(dq.score).toBe(score);
  });

  test('the penalty says which link was weak', () => {
    const dq = run({ country: 'UG', technology: 'solar_pv', basis: 'projected',
      installedCapacity_MW: 60 }).inventory.dataQuality;
    expect(dq.derivationReason).toMatch(/default capacity factor/);
    expect(dq.derivationReason).toMatch(/global default/);
  });

  test('only a metered figure with a national factor reaches Option 2a', () => {
    expect(run(METERED).inventory.dataQuality.option).toBe('2a');
  });
});

describe('The physical check is per technology and per country', () => {
  test('no capacity-factor data for a country means no band, not a borrowed one', () => {
    /* Sri Lanka now carries national solar and wind figures, so the fallback
       case is tested where it still applies. Singapore holds neither. */
    const t = cc.technology('SG', 'solar_pv');
    expect(t.isGlobalDefault).toBe(true);
    expect(t.hasBand).toBe(false);
    expect(t.default_cf).toBe(0.174);
    expect(t.globalDefaultNote).toMatch(/not a national band/);
  });

  test('a country that holds its own figure is not given the global one', () => {
    const t = cc.technology('LK', 'solar_pv');
    expect(t.isGlobalDefault).toBe(false);
    expect(t.hasBand).toBe(true);
    expect(t.default_cf).toBe(0.157);
    expect(t.band_low).toBe(0.15);
    expect(t.band_high).toBe(0.19);
  });

  test('specific yield is reported beside the capacity factor', () => {
    const p = run(METERED).generation.plausibility;
    expect(p.capacityFactorPct).toBe(17.2);
    expect(p.specificYield_kWh_per_kWp).toBe(1510);   // 90,600 MWh / 60 MW
  });

  test('the limits are the technology\'s, so a solar band never judges wind', () => {
    expect(cc.limits('solar_pv').ceiling).toBe(0.35);
    expect(cc.limits('wind_on').ceiling).toBe(0.65);
    expect(cc.limits('hydro_ror').ceiling).toBe(0.95);
  });

  test('a figure above the technology ceiling is refused, with the causes named', () => {
    try {
      run({ ...METERED, annualGeneration_MWh: 283000 });
      throw new Error('should have refused');
    } catch (e) {
      expect(e.code).toBe('GENERATION_NOT_PHYSICALLY_POSSIBLE');
      expect(e.remedy).toMatch(/DC nameplate/);
      expect(e.remedy).toMatch(/more than twelve months/);
    }
  });

  test('a figure below the floor is refused, and a partial year is named', () => {
    try {
      run({ ...METERED, annualGeneration_MWh: 300 });
      throw new Error('should have refused');
    } catch (e) {
      expect(e.code).toBe('GENERATION_NOT_PHYSICALLY_POSSIBLE');
      expect(e.remedy).toMatch(/partial year|thousands mix-up/);
    }
  });

  test('27% would pass for wind and be refused for nothing — the ceiling differs', () => {
    // 141,912 MWh from 60 MW is 27%: impossible for PV, ordinary for wind.
    const gen = { country: 'LK', basis: 'metered', installedCapacity_MW: 60, annualGeneration_MWh: 141912 };
    expect(() => run({ ...gen, technology: 'solar_pv' })).not.toThrow();
    expect(() => run({ ...gen, technology: 'wind_on' })).not.toThrow();
    // But 200% is impossible for both.
    expect(() => run({ ...gen, technology: 'wind_on', annualGeneration_MWh: 1051200 })).toThrow();
  });
});

describe('Staleness is generic, not written for one country', () => {
  test('the Sri Lanka 2017 factor and the Uganda 2022 factor both flag at 2026', () => {
    expect(cc.staleness(cc.displacementFactor('LK'), 2026).stale).toBe(true);
    expect(cc.staleness(cc.displacementFactor('UG'), 2026).stale).toBe(true);
    expect(cc.staleness(cc.consumptionFactor('SG'), 2026).stale).toBe(false);
  });

  test('the notice names the years rather than the country', () => {
    const n = cc.staleness(cc.displacementFactor('LK'), 2026).note;
    expect(n).toMatch(/from 2017/);
    expect(n).toMatch(/9 years old/);
    expect(n).not.toMatch(/Sri Lanka/);
  });
});

describe('Lifetime avoided emissions', () => {
  test('degradation reduces the lifetime figure below a flat multiple', () => {
    const r = run({ ...METERED, lifetimeYears: 25, degradationRatePct: 0.5 });
    const annual = r.impact.metrics[0].figure.value;
    expect(r.impact.lifetime.value).toBeLessThan(annual * 25);
    expect(r.impact.lifetime.years).toBe(25);
  });

  test('a flat grid factor is labelled as conservative in one direction only', () => {
    const r = run(METERED);
    expect(r.impact.lifetime.trajectory).toBe('flat');
    expect(r.impact.lifetime.trajectoryNote).toMatch(/OVERSTATES/);
  });

  test('zero degradation gives exactly the flat multiple', () => {
    const r = run({ ...METERED, lifetimeYears: 10, degradationRatePct: 0 });
    const annual = r.generation.projectAvoided.value;
    expect(r.generation.lifetime.value).toBeCloseTo(annual * 10, 1);
  });
});

/*
 * Reported from the live screen: "check avoided emission graph is correct".
 * It was not. The chart plotted the PROJECT's avoided emissions — 74,151 in
 * year one, 1,746,703 over the life — under a caption reading "financed
 * share", while this bank's share at an attribution factor of 0.3 is 22,245
 * and 524,011. Out by a factor of 3.33, in the direction that flatters the
 * lender.
 *
 * The cause was a split: the TOTAL was attributed on the impact block while
 * the SERIES stayed unattributed on the generation block, and the chart read
 * the series. Anything drawing a lifetime curve now reads it from the same
 * place it reads the total.
 */
describe('The lifetime series is attributed, like the total beside it', () => {
  const r = run({ ...METERED, lifetimeYears: 25 });
  const af = r.attribution.value;
  const life = r.impact.lifetime;

  test('the impact series is the financed share, not the project figure', () => {
    expect(life.attributionFactor).toBe(af);
    expect(life.series).toHaveLength(25);
    expect(life.firstYear).toBeLessThan(r.generation.lifetime.firstYear);
  });

  test('year one of the curve equals the annual figure printed above it', () => {
    // The single check that would have caught this: the first point of the
    // chart and the headline annual figure describe the same year.
    expect(life.series[0].avoided_tCO2e).toBe(r.impact.metrics[0].figure.value);
  });

  test('the series sums to the total the caption states', () => {
    const summed = life.series.reduce((t, y) => t + y.avoided_tCO2e, 0);
    expect(Math.abs(summed - life.value)).toBeLessThan(1);
  });

  test('every point is the project point times the attribution factor', () => {
    const project = r.generation.lifetime.series;
    life.series.forEach((y, i) => {
      expect(Math.abs(y.avoided_tCO2e - project[i].avoided_tCO2e * af)).toBeLessThan(0.01);
    });
  });

  test('the project figure survives, named for what it is', () => {
    // Not deleted — a reader should see both levels and the ratio between them.
    expect(life.projectTotal).toBe(r.generation.lifetime.value);
    expect(life.projectTotal).toBeGreaterThan(life.value);
    expect(Math.abs(life.projectTotal * af - life.value)).toBeLessThan(1);
  });

  test('a full attribution makes the two identical, which is the sanity case', () => {
    const whole = run({ ...METERED, lifetimeYears: 25 }, { outstandingAmount: 40000000 });
    expect(whole.attribution.value).toBe(1);
    expect(whole.impact.lifetime.value).toBe(whole.impact.lifetime.projectTotal);
  });
});

/*
 * Reported from the live screen: "for wind the annual generation stays the
 * same as 178,704 for all countries". It did, and it was not a bug in the
 * derivation — every country fell back to the same IRENA global 34%, because
 * the config held no national capacity factor for anything. A tool where the
 * country selector cannot move the generation looks broken however correctly
 * it behaves, so the fix was data rather than code.
 */
describe('A national capacity factor makes the country selector do something', () => {
  const gen = (country, technology) =>
    run({ country, technology, installedCapacity_MW: 60 }).generation.annualGeneration;

  test('wind now differs between countries that hold their own figure', () => {
    expect(gen('LK', 'wind_on').value).toBe(139809.6);   // 26.6% national
    expect(gen('NO', 'wind_on').value).toBe(157680);     // 30.0% national
    expect(gen('SG', 'wind_on').value).toBe(178704);     // 34.0% global fallback
    expect(gen('LK', 'wind_on').value).not.toBe(gen('NO', 'wind_on').value);
  });

  test('solar differs where a national figure is held', () => {
    expect(gen('LK', 'solar_pv').value).toBe(82519.2);   // 15.7% national
    expect(gen('SG', 'solar_pv').value).toBe(91454.4);   // 17.4% global fallback
  });

  test('a national figure is not silently a global one', () => {
    expect(gen('LK', 'wind_on').derivation.cfIsGlobal).toBe(false);
    expect(gen('SG', 'wind_on').derivation.cfIsGlobal).toBe(true);
  });

  test('every national capacity factor carries its source and its caveat', () => {
    for (const [country, tech] of [['LK', 'solar_pv'], ['LK', 'wind_on'], ['NO', 'wind_on']]) {
      const t = cc.technology(country, tech);
      expect(`${country}/${tech}:${t.isGlobalDefault}`).toBe(`${country}/${tech}:false`);
      expect(t.source).toBeTruthy();
      expect(t.url).toBeTruthy();
      expect(t.publisher).toBeTruthy();
      expect(Number.isFinite(t.year)).toBe(true);
      /* Each of these rests on one or two plants, not a fleet average, and
         says so — the gap between "national" and "representative" is exactly
         what a reviewer would probe. */
      expect(t.caveat).toBeTruthy();
      expect(t.verification).toBe('secondary_reported');
    }
  });

  test('the band brackets the default it ships with', () => {
    for (const [country, tech] of [['LK', 'solar_pv'], ['LK', 'wind_on'], ['NO', 'wind_on']]) {
      const t = cc.technology(country, tech);
      expect(t.band_low).toBeLessThanOrEqual(t.default_cf);
      expect(t.band_high).toBeGreaterThanOrEqual(t.default_cf);
    }
  });
});

describe('Every config value carries a citation', () => {
  test('no orphan numbers anywhere in the country config', () => {
    const orphans = [];
    const check = (path, f) => {
      if (!f || typeof f !== 'object' || !('value' in f)) return;
      for (const k of ['year', 'source', 'url', 'publisher']) {
        if (!f[k]) orphans.push(`${path}.${k}`);
      }
    };
    for (const [code, c] of Object.entries(cc.CONFIG.countries)) {
      for (const [k, f] of Object.entries(c.grid_factors)) check(`${code}.${k}`, f);
    }
    for (const [k, f] of Object.entries(cc.CONFIG.global_defaults.grid_factors)) {
      check(`global.${k}`, f);
    }
    expect(orphans).toEqual([]);
  });

  test('every value states how well it was verified', () => {
    const d = cc.displacementFactor('LK');
    expect(cc.CONFIG.verification_levels[d.verification]).toBeTruthy();
  });
});
