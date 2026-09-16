/**
 * §5.6 — motor vehicle loans: the table, the engine, the register class.
 *
 * The anchors are the standard's own: Table 5.6-1 is the one Part A table
 * where two options score 1 (1a and 1b); a Sri-Lanka-wide distance statistic is
 * local under fn 146, so a make/model efficiency reaches score 2 from the
 * registration certificate alone; a borrower's vehicles under different
 * options carry the lowest quality in the mix (p.93); the value at origination
 * unknown means 100 % attribution, the standard's own default (p.91); a
 * non-plug-in hybrid burns petrol only and a plug-in with no manufacturer
 * split is 100 % combustion (p.96).
 */

'use strict';

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const dq = require('../src/domains/pcaf-part-a/domain/data-quality');
const { assessMotorVehicles } = require('../src/domains/pcaf-part-a/domain/motor-vehicles');
const dataset = require('../src/domains/pcaf-part-a/domain/motor-vehicles/dataset');
const { withVehicleFactors } = require('../src/domains/pcaf-part-a/application/vehicle-factors');
const register = require('../src/domains/pcaf-part-a/application/register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const manifest = require('../data/pcaf-parta/vehicles/MANIFEST.json');
const { issueKey } = require('./helpers/key');

let ORG = 'org-motor-vehicles';
let KEY;
const YEAR = 2024;

/* The factors the registry seeds, resolved once for the engine tests. */
let factors;
beforeAll(async () => {
  const issued = await issueKey({ orgId: ORG, keyName: 'motor vehicles' });
  ORG = issued.orgId; KEY = issued.key;
  ({ resolvedFactors: factors } = await withVehicleFactors({ country: 'LK' }, { orgId: null }));
});

const facility = (vehicles, over = {}) => assessMotorVehicles({
  exposure: { outstanding: 3e6, currency: 'LKR' }, value: { atOrigination: 6e6 }, vehicles, resolvedFactors: factors, ...over,
});
const aqua = (over = {}) => ({ vehicleClass: 'car_hybrid', makeModel: 'Toyota Aqua 2021', efficiency: { value: 33.6, unit: 'km/L', cycle: 'WLTC' }, ...over });

describe('Table 5.6-1', () => {
  test('two options score 1, and the rest are 2a→2, 2b→3, 3a→4, 3b→5 — the table is its own', () => {
    for (const [opt, sc] of [['1a', 1], ['1b', 1], ['2a', 2], ['2b', 3], ['3a', 4], ['3b', 5]]) {
      expect(dq.score('motor-vehicle-loans', opt).score).toBe(sc);
    }
    expect(dq.tableFor('motor-vehicle-loans').table).toBe('Table 5.6-1');
    /* Not the corporate table (1b is 2 there) and not the property table (2a is 3 there). */
    expect(dq.score('business-loans-unlisted-equity', '1b').score).toBe(2);
    expect(dq.score('commercial-real-estate', '2a').score).toBe(3);
  });

  test('the statistics are provisional, checksummed, and the manifest is what the table produces', () => {
    const rel = dataset.release();
    expect(rel.tables[0].status).toBe('provisional');
    expect(manifest.checksum).toBe(rel.checksum);
    expect(manifest.tables).toEqual(rel.tables);
    expect(dataset.classFor('average')).toBeTruthy();
    expect(dataset.energyContent('petrol').value).toBeCloseTo(8.94, 2);
  });

  test('the registry holds the Sri Lankan annual distance by class, ESMAP 2000, disclosed as such', () => {
    expect(factors.annualDistanceByClass.car_petrol.value).toBe(8274);
    expect(factors.annualDistanceByClass.three_wheeler.value).toBe(19676);
    expect(factors.annualDistanceByClass.car_petrol.baseline.provisional).toBe(true);
    expect(factors.petrol.value).toBeCloseTo(0.2495, 4);
  });
});

describe('The option is derived per vehicle from what is supplied', () => {
  test('actual fuel consumed is Option 1a, score 1, priced through the fuel’s energy content', () => {
    const r = facility([{ fuelConsumed: { petrol_L: 1200 } }]);
    const v = r.inventory.vehicles[0];
    expect(v.option).toBe('1a'); expect(v.score).toBe(1);
    /* 1,200 L × 8.94 kWh/L × 0.2495 kgCO2e/kWh = 2,676 kg → 2.68 t, before attribution. */
    expect(v.emissions.scope1).toBeCloseTo(2.68, 2);
    expect(v.energy.fuel_kWh).toBeCloseTo(1200 * 8.94, 0);
  });

  test('make/model efficiency × an odometer distance is Option 1b, score 1', () => {
    const v = facility([aqua({ distance: { value_km: 15000, basis: 'actual' } })]).inventory.vehicles[0];
    expect(v.option).toBe('1b'); expect(v.score).toBe(1);
    /* 33.6 km/L → 2.976 L/100km; 15,000 km → 446.4 L. */
    expect(v.efficiency.value).toBeCloseTo(2.9762, 3);
    expect(v.efficiency.conversion).toMatch(/100 ÷ 33.6/);
    expect(v.energy.litres).toBeCloseTo(446.43, 1);
  });

  test('make/model efficiency × the Sri-Lanka-wide statistic is Option 2a, score 2 — local under fn 146', () => {
    const v = facility([aqua()]).inventory.vehicles[0];
    expect(v.option).toBe('2a'); expect(v.score).toBe(2);
    expect(v.distance).toMatchObject({ km: 8274, basis: 'local' });
    expect(v.distance.source).toMatch(/registry baseline vehicle_annual_distance_km, class car_petrol/);
    expect(v.traced.assumptions.join(' ')).toMatch(/local under fn 146/);
  });

  test('a regional statistic keyed as such is Option 2b, score 3', () => {
    const v = facility([aqua({ distance: { value_km: 8800, basis: 'regional', source: 'India two-wheeler study' } })]).inventory.vehicles[0];
    expect(v.option).toBe('2b'); expect(v.score).toBe(3);
  });

  test('the vehicle class alone is Option 3a, score 4, on the provisional class figure; no class at all is 3b, score 5', () => {
    const a = facility([{ vehicleClass: 'three_wheeler' }]).inventory.vehicles[0];
    expect(a.option).toBe('3a'); expect(a.score).toBe(4);
    expect(a.efficiency.basis).toBe('class');
    expect(a.traced.assumptions.join(' ')).toMatch(/provisional vehicle-statistics table/);
    const b = facility([{}]).inventory.vehicles[0];
    expect(b.option).toBe('3b'); expect(b.score).toBe(5);
    expect(b.label).toBe('Average vehicle');
  });

  test('a class the statistics do not hold is refused by name', () => {
    expect(() => facility([{ vehicleClass: 'hovercraft' }])).toThrow(expect.objectContaining({ code: 'VEHICLE_CLASS_NOT_HELD' }));
  });
});

describe('The rules the standard states for this class', () => {
  test('a borrower’s vehicles under different options carry the lowest quality in the mix (p.93)', () => {
    const r = facility([aqua({ distance: { value_km: 15000, basis: 'actual' } }), { vehicleClass: 'three_wheeler' }]);
    expect(r.inventory.vehicles.map(v => v.option)).toEqual(['1b', '3a']);
    expect(r.inventory.dataQuality).toMatchObject({ option: '3a', score: 4, mix: ['1b', '3a'] });
    expect(r.inventory.dataQuality.rule).toMatch(/lowest data quality in the mix/);
  });

  test('the value at origination unknown is 100 % attribution, the standard’s default, and the trace says so (p.91)', () => {
    const r = facility([aqua()], { value: undefined });
    expect(r.attribution.value).toBe(1);
    expect(r.denominator.state).toBe('assumed-100pct');
    expect(r.attribution.assumptions[0]).toMatch(/100 % attribution is assumed/);
    const known = facility([aqua()]);
    expect(known.attribution.value).toBe(0.5);
    expect(known.inventory.financedScope1And2.combined).toBeCloseTo(known.inventory.vehicleEmissions.combined * 0.5, 1);
  });

  test('an outstanding above the value at origination is refused', () => {
    expect(() => facility([aqua()], { exposure: { outstanding: 7e6 } })).toThrow(expect.objectContaining({ code: 'ATTRIBUTION_ABOVE_ONE' }));
  });

  test('a non-plug-in hybrid burns petrol only; a plug-in with no split is 100 % combustion; an electric car is scope 2 on the grid factor (p.96)', () => {
    const hev = facility([aqua()]).inventory.vehicles[0];
    expect(hev.emissions.scope2).toBe(0);
    const phev = facility([{ vehicleClass: 'car_petrol', fuel: 'plug-in-hybrid', makeModel: 'X', efficiency: { value: 5, unit: 'L/100km' } }]).inventory.vehicles[0];
    expect(phev.distance.electricKm).toBe(0);
    expect(phev.traced.assumptions.join(' ')).toMatch(/100 % combustion assumed/);
    const ev = facility([{ vehicleClass: 'car_electric', makeModel: 'BYD Atto 3', efficiency: { value: 13.8, unit: 'kWh/100km' }, distance: { value_km: 10000, basis: 'actual' } }]).inventory.vehicles[0];
    expect(ev.emissions.scope1).toBe(0);
    /* 10,000 km × 13.8 kWh/100km = 1,380 kWh × 0.3757 kg/kWh = 0.52 t. */
    expect(ev.emissions.scope2).toBeCloseTo(0.52, 2);
    expect(ev.factors.electricity.baseline.metric).toBe('grid_emission_factor_kgCO2e_kWh');
  });

  test('scope 3 is absent unless a new vehicle’s production emissions are reported, first year only', () => {
    expect(facility([aqua()]).inventory.productionScope3.absent).toBe(true);
    const r = facility([aqua({ productionEmissions_tCO2e: 6 })]);
    expect(r.inventory.productionScope3.value).toBe(3);
    expect(r.inventory.productionScope3.assumptions[0]).toMatch(/first year only/);
  });

  test('no vehicle is a refusal, not a facility of zero', () => {
    expect(() => facility([])).toThrow(expect.objectContaining({ code: 'VEHICLES_REQUIRED' }));
  });
});

describe('On the register and over HTTP', () => {
  async function clear() {
    for (const e of await store.list(repo.EXPOSURES, ORG)) await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
  }
  beforeEach(clear);
  afterAll(clear);

  const lease = (over = {}) => ({
    assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'VL-1' },
    counterparty: { name: 'K. Silva' }, productType: 'lease',
    exposure: { outstanding: 3e6, currency: 'LKR' }, value: { atOrigination: 6e6 },
    vehicles: [aqua()], ...over,
  });

  test('a lease is recorded in the one shape, its position is the class’s own, and the consolidated row names Table 5.6-1', async () => {
    const e = await register.record(ORG, lease());
    expect(e.assetClass).toBe('motor-vehicle-loans');
    expect(e.counterparty.sector).toBe('car_hybrid');
    expect(e.result.exposure.instrument).toBe('lease');
    expect(e.result.inventory.dataQuality.scope1And2).toMatchObject({ option: '2a', score: 2 });
    expect(e.result.inventory.scope3.absent).toBe(true);
    expect(e.result.native.inventory.vehicles).toHaveLength(1);
    const pos = await register.position(ORG, YEAR, { assetClass: 'motor-vehicle-loans' });
    expect(pos).toMatchObject({ section: '§5.6', exposures: 1 });
    expect(pos.groupings).toEqual([{ key: 'bySector', label: 'Vehicle class' }, { key: 'byKind', label: 'Product' }]);
    expect(pos.improvementPlan.targetNote).toMatch(/registration certificate/);
    const c = await consolidated.position(ORG, YEAR);
    const row = c.classes.find(x => x.assetClass === 'motor-vehicle-loans');
    expect(row.status).toBe('recorded');
    expect(row.dataQuality.table).toBe('Table 5.6-1 option mapping');
    expect(row.headline.basis).toMatch(/§5\.6/);
  });

  test('the stateless route prices a facility and the register route records one; a bad unit is a named refusal', async () => {
    const stateless = await request(app).post('/v1/pcaf/part-a/motor-vehicles/assess').set('x-api-key', KEY)
      .send({ exposure: { outstanding: 1e6 }, vehicles: [{ vehicleClass: 'motorcycle' }] }).expect(200);
    expect(stateless.body.inventory.dataQuality.option).toBe('3a');
    expect(stateless.body.attribution.value).toBe(1);
    const rec = await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).send(lease()).expect(201);
    expect(rec.body.exposure.result.inventory.dataQuality.scope1And2.score).toBe(2);
    const bad = await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY)
      .send(lease({ vehicles: [{ vehicleClass: 'car_petrol', efficiency: { value: 14, unit: 'kWh/100km' } }] })).expect(400);
    expect(bad.body.error || bad.body.code).toBe('EFFICIENCY_UNIT_MISMATCH');
    const ref = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', KEY).expect(200);
    const mv = ref.body.assetClasses.find(c => c.id === 'motor-vehicle-loans');
    expect(mv.assessRoute).toBe('/v1/pcaf/part-a/motor-vehicles/assess');
    expect(mv.vehicleClasses.map(c => c.key)).toContain('three_wheeler');
  });
});
