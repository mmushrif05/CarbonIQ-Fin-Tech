// @ts-check
/**
 * The registry reaches the engines — Part 2 of the Amana readiness plan.
 *
 * A baseline that nothing reads is a table; what makes it a baseline is that
 * the figure a screen shows resolves from it and names it. So:
 *
 *   • the property engine's grid and fuel factors and its building-type
 *     intensity come from the registry when the application layer resolves
 *     them, and the trace names the scope and version behind each;
 *   • a type the registry does not hold falls back to the provisional table and
 *     the trace says so — nothing is averaged or invented;
 *   • the shipped seed resolves as provisional, so a demonstration runs and a
 *     disclosure knows it may not rest on it;
 *   • `GET /v1/baselines/for/:assetClass` answers what a class reads, with the
 *     figure in force and the register's proposed candidate, and refuses a
 *     class the register does not declare;
 *   • the two grid quantities never cross: the average is a scope 2 figure and
 *     the margins are for avoided emissions only.
 */

'use strict';

const platformStore = require('../src/platform/database/store');
const { withPropertyFactors } = require('../src/domains/pcaf-part-a/application/property-factors');
const { buildingEmissions } = require('../src/domains/pcaf-part-a/domain/real-estate/energy');
const registry = require('../src/domains/baseline/application/registry');
const { api, auth } = require('./helpers/api');

beforeEach(() => platformStore._resetMemory());

describe('the property engine reads the registry', () => {
  test('grid, fuel and intensity resolve from the shipped seed, provisional, and the trace names them', async () => {
    const input = await withPropertyFactors({ country: 'LK', buildingType: 'office', floorArea_m2: 1000 }, { orgId: 'ui' });
    expect(input.resolvedFactors.electricity_grid.value).toBe(0.3757);
    expect(input.resolvedFactors.electricity_grid.baseline.scope).toBe('seed');
    expect(input.resolvedFactors.diesel.value).toBe(0.2668);
    expect(input.resolvedFactors.intensityByType.office.value).toBe(250);

    const r = buildingEmissions(input);
    expect(r.option).toBe('2b');
    expect(r.energy.intensity_kWh_per_m2_yr).toBe(250);
    expect(r.factors.electricity).toBe(0.3757);
    expect(r.factors.baselines.electricity.metric).toBe('grid_emission_factor_kgCO2e_kWh');
    expect(r.factors.baselines.intensity.metric).toBe('building_energy_intensity_kWh_m2');
    expect(r.provisional).toBe(true);
    expect(r.traced.assumptions.join(' ')).toMatch(/shipped baseline set \(provisional\)/);
  });

  test('a building type the registry does not hold falls back to the table and says so', async () => {
    const input = await withPropertyFactors({ country: 'LK', buildingType: 'hotel', floorArea_m2: 1000 }, { orgId: 'ui' });
    expect(input.resolvedFactors.intensityByType.hotel).toBeUndefined();
    const r = buildingEmissions(input);
    expect(r.factors.baselines.intensity.scope).toBe('table');
    expect(r.traced.assumptions.join(' ')).toMatch(/provisional energy-statistics table/);
    /* The grid factor still came from the registry: fallback is per figure. */
    expect(r.factors.baselines.electricity.scope).toBe('seed');
  });

  test('a released organisation baseline replaces the seed for that organisation only', async () => {
    const ctx = { orgId: 'ui', actor: 'Ana', mayGovernMarket: false };
    const draft = await registry.createDraft({
      metric: 'grid_emission_factor_kgCO2e_kWh', scope: 'organisation', country: 'LK', orgId: 'ui',
      values: { value: 0.41 }, source: 'CEB, average system emission factor 2023, read from the Statistical Digest 2023 p.12',
    }, ctx);
    await registry.releaseDraft(draft.baselineId, ctx);

    const mine = await withPropertyFactors({ country: 'LK', metered: { electricity_kWh: 1000, fuel_kWh: 0, emissionFactorBasis: 'average' } }, { orgId: 'ui' });
    expect(mine.resolvedFactors.electricity_grid.value).toBe(0.41);
    expect(mine.resolvedFactors.electricity_grid.baseline.scope).toBe('organisation');
    expect(mine.resolvedFactors.electricity_grid.baseline.provisional).toBe(false);
    const r = buildingEmissions(mine);
    expect(r.buildingEmissions.scope2).toBe(0.41);
    expect(r.factors.baselines.electricity.version).toBe(1);

    const theirs = await withPropertyFactors({ country: 'LK', metered: { electricity_kWh: 1000, fuel_kWh: 0, emissionFactorBasis: 'average' } }, { orgId: 'other' });
    expect(theirs.resolvedFactors.electricity_grid.value).toBe(0.3757);
  });

  test('without the application layer the engine still runs on its table, marked as the table', () => {
    const r = buildingEmissions({ country: 'LK', buildingType: 'office', floorArea_m2: 1000 });
    expect(r.factors.baselines.electricity.scope).toBe('table');
    expect(r.factors.baselines.intensity.scope).toBe('table');
    expect(r.provisional).toBe(true);
  });
});

describe('the two grid quantities never cross', () => {
  test('the average is not a margin and the margins are not an average', async () => {
    const avg = await registry.effective('grid_emission_factor_kgCO2e_kWh', { country: 'LK' });
    expect(Object.keys(avg.values || {})).toEqual(['value']);
    const { metrics } = registry.metrics();
    const margins = metrics.find(m => m.key === 'grid_displacement_factor_tCO2e_MWh') || { fields: [], governs: '' };
    expect(margins.fields).toEqual(['operating_margin', 'build_margin', 'combined_margin']);
    expect(margins.governs).toMatch(/never a scope 2 factor/);
    const average = metrics.find(m => m.key === 'grid_emission_factor_kgCO2e_kWh') || { governs: '' };
    expect(average.governs).toMatch(/Never a displacement factor/);
  });
});

describe('GET /v1/baselines/for/:assetClass', () => {
  test('answers what mortgages read, with the figure in force and the proposed candidate', async () => {
    const r = (await auth(api().get('/v1/baselines/for/mortgages?country=LK')).expect(200)).body;
    expect(r.assetClass).toBe('mortgages');
    const keys = r.baselines.map(b => b.key);
    expect(keys).toEqual(expect.arrayContaining(['grid_emission_factor_average', 'building_energy_intensity', 'building_energy_per_dwelling']));
    const grid = r.baselines.find(b => b.key === 'grid_emission_factor_average');
    expect(grid.governed).toBe(true);
    expect(grid.effective.resolved).toBe(true);
    expect(grid.effective.provisional).toBe(true);
    expect(grid.adopted.verification).toBe('primary');
    const dwelling = r.baselines.find(b => b.key === 'building_energy_per_dwelling');
    expect(dwelling.adopted).toBeNull();
    expect(dwelling.absentReason).toMatch(/CEB/);
    expect(dwelling.effective.resolved).toBe(false);
  });

  test('a class the register does not declare is a 404 naming the vocabulary', async () => {
    const r = await auth(api().get('/v1/baselines/for/loans')).expect(404);
    expect(r.body.error).toBe('ASSET_CLASS_NOT_HELD');
    expect(r.body.remedy).toMatch(/business-loans-unlisted-equity/);
  });
});
