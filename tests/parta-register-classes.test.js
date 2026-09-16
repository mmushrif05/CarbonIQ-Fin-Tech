/**
 * One exposure register, every built Part A class.
 *
 * §5.2 shipped the register and the other engines shipped as stateless
 * routes, so a bank's property book, its project book and its listed holdings
 * could be assessed and never held. This is the same register with the
 * class on the row: each class has its engine, its preparation and an adapter
 * onto the one shape the projection, the roll-up and the screen read, and
 * the position is rolled up per class from one read and never across classes.
 *
 * The anchor here is the floor area: a Sri Lankan valuation states square
 * feet and the statistics are per square metre, so the area arrives with its
 * unit, the engine converts it once with an exact factor, and the trace shows
 * both. A land unit is refused by name.
 */

'use strict';

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const classes = require('../src/domains/pcaf-part-a/application/register-classes');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const { floorAreaM2, FT2_TO_M2 } = require('../src/domains/pcaf-part-a/domain/real-estate/area');
const { assessRealEstate } = require('../src/domains/pcaf-part-a/domain/real-estate');
const { issueKey } = require('./helpers/key');

let ORG = 'org-register-classes';
let KEY;
const YEAR = 2024;
const asOf = '2024-12-31';

const loan = (name = 'Lanka Apparel') => ({
  reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name, sector: 'Textiles' },
  outstanding: { amount: 1e6, asOf, currency: 'LKR' },
  denominator: { totalEquity: 6e5, totalDebt: 4e5, asOf, currency: 'LKR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) },
    scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) },
    scope3AbsentReason: 'not measured',
  },
});
const office = (over = {}) => ({
  assetClass: 'commercial-real-estate', reportingYear: YEAR,
  identifiers: { accountNumber: 'CRE-1' }, counterparty: { name: 'Colombo Office Tower' },
  buildingType: 'office', productType: 'purchase',
  exposure: { outstanding: 5e6, currency: 'LKR', asOf }, value: { atOrigination: 20e6 },
  floorArea: { value: 10763.91, unit: 'ft2' },
  ...over,
});
const house = () => ({
  assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'HL-1' }, counterparty: { name: 'N. Perera' },
  buildingType: 'residential_house', exposure: { outstanding: 4e6, currency: 'LKR' }, value: { atOrigination: 10e6 },
  energy: { electricity_kWh: 5000, fuel_kWh: 1000, fuelSource: 'lpg', emissionFactorBasis: 'average' },
});
const plant = () => ({
  assetClass: 'project-finance', reportingYear: YEAR, identifiers: { accountNumber: 'PF-1' },
  projectName: 'Mannar wind 10 MW', counterparty: 'Mannar Wind (Pvt) Ltd', sector: 'Power', archetype: 'general',
  outstandingAmount: 1e6, totalProjectEquityPlusDebt: 5e6, currency: 'LKR',
  projectScope1_tCO2e: 100, projectScope2_tCO2e: 50, dataQualityOption: '2a',
});
const holding = () => ({
  assetClass: 'listed-equity-corporate-bonds', reportingYear: YEAR, identifiers: { accountNumber: 'EQ-1' },
  instrument: 'listed-equity', onBalanceSheetAtYearEnd: true,
  counterparty: { name: 'Ceylon Holdings PLC', naceL2: '64' },
  outstanding: { amount: 100, asOf, currency: 'LKR' },
  denominator: { marketCapOrdinary: 600, totalDebtInterestBearing: 400, asOf, currency: 'LKR' },
  emissions: { scope1: { value: 1000, basis: 'reported-unverified', period: YEAR }, scope2: { value: 100, basis: 'reported-unverified', period: YEAR }, scope3AbsentReason: 'none' },
});

async function clear() {
  for (const e of await store.list(repo.EXPOSURES, ORG)) await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
  for (const b of await store.list(repo.BOOK, ORG)) await store.remove(repo.BOOK, ORG, b.reportingYear || b.id);
}

beforeAll(async () => {
  const issued = await issueKey({ orgId: ORG, keyName: 'parta register classes' });
  ORG = issued.orgId;
  KEY = issued.key;
});
beforeEach(clear);
afterAll(clear);

describe('the floor area and its unit', () => {
  test('square feet are converted once, with the exact factor, and the trace carries the area as keyed', () => {
    const a = floorAreaM2({ value: 10763.91, unit: 'ft2' });
    expect(a.m2).toBe(+(10763.91 * FT2_TO_M2).toFixed(4));
    expect(FT2_TO_M2).toBe(0.09290304);
    expect(a.asKeyed).toEqual({ value: 10763.91, unit: 'ft²' });
    expect(a.conversion).toMatch(/× 0\.09290304/);
    expect(floorAreaM2({ value: 1000, unit: 'sqm' }).m2).toBe(1000);
    expect(floorAreaM2(1000).asKeyed.unit).toBe('m²');
  });

  test('a land unit is refused by name with the remedy, and both areas at once is ambiguous', () => {
    for (const unit of ['perch', 'perches', 'acre', 'hectare']) {
      expect(() => floorAreaM2({ value: 20, unit })).toThrow(expect.objectContaining({ code: 'LAND_UNIT_NOT_FLOOR_AREA', statusCode: 400 }));
    }
    expect(() => floorAreaM2({ value: 20, unit: 'furlong' })).toThrow(expect.objectContaining({ code: 'FLOOR_AREA_UNIT_NOT_HELD' }));
    expect(() => floorAreaM2({ value: 0, unit: 'm2' })).toThrow(expect.objectContaining({ code: 'FLOOR_AREA_INVALID' }));
    expect(() => assessRealEstate({ class: 'commercial-real-estate', buildingType: 'office', exposure: { outstanding: 1 }, value: { atOrigination: 4 },
      floorArea: { value: 1, unit: 'm2' }, floorArea_m2: 1 })).toThrow(expect.objectContaining({ code: 'FLOOR_AREA_AMBIGUOUS' }));
  });

  test('an office keyed at 10,763.91 ft² is the 1,000 m² office, figure for figure, and the option is derived', () => {
    const inFeet = assessRealEstate({ class: 'commercial-real-estate', country: 'LK', buildingType: 'office',
      exposure: { outstanding: 5e6 }, value: { atOrigination: 20e6 }, floorArea: { value: 10763.91, unit: 'ft2' } });
    const inMetres = assessRealEstate({ class: 'commercial-real-estate', country: 'LK', buildingType: 'office',
      exposure: { outstanding: 5e6 }, value: { atOrigination: 20e6 }, floorArea_m2: 1000 });
    expect(inFeet.inventory.financedScope1And2.combined).toBe(inMetres.inventory.financedScope1And2.combined);
    expect(inFeet.inventory.energy.floorArea_m2).toBe(1000);
    expect(inFeet.inventory.energy.floorAreaAsKeyed).toEqual({ value: 10763.91, unit: 'ft²' });
    expect(inFeet.inventory.energy.floorAreaConversion).toMatch(/10763\.91 ft² × 0\.09290304/);
    expect(inMetres.inventory.energy.floorAreaAsKeyed).toBeUndefined();
    expect(inFeet.inventory.dataQuality.option).toBe('2b');
    expect(inFeet.inventory.dataQuality.score).toBe(4);
  });
});

describe('one register, every built class', () => {
  test('the register names six classes, each with its section, and §5.2 is the default', () => {
    expect(register.classes().map(c => c.assetClass).sort()).toEqual(
      ['business-loans-unlisted-equity', 'commercial-real-estate', 'listed-equity-corporate-bonds', 'mortgages', 'motor-vehicle-loans', 'project-finance']);
    expect(register.DEFAULT_CLASS).toBe('business-loans-unlisted-equity');
    expect(classes.classFor('mortgages').section).toBe('§5.5');
    expect(() => classes.classFor('use-of-proceeds')).toThrow(expect.objectContaining({ statusCode: 501, code: 'ASSET_CLASS_NOT_REGISTERED' }));
  });

  test('a property is recorded on the register in the one shape, with the engine’s own result kept whole beneath it', async () => {
    const e = await register.record(ORG, office());
    expect(e.assetClass).toBe('commercial-real-estate');
    expect(e.counterparty).toEqual({ name: 'Colombo Office Tower', sector: 'office', borrowerType: null, financialInstitution: false });
    const r = e.result;
    expect(r.exposure.outstanding).toMatchObject({ value: 5e6, unit: 'LKR' });
    expect(r.attribution.value).toBe(0.25);
    expect(r.inventory.scope1And2.value).toBe(r.native.inventory.financedScope1And2.combined);
    expect(r.inventory.scope1.value).toBe(r.native.inventory.financedScope1And2.scope1.value);
    expect(r.inventory.scope3.absent).toBe(true);
    expect(r.inventory.removals.absent).toBe(true);
    expect(r.inventory.dataQuality.scope1And2).toMatchObject({ option: '2b', score: 4 });
    expect(r.inventory.dataQuality.scope3.absent).toBe(true);
    expect(r.validation).toMatchObject({ verdict: 'clean', findings: [] });
    expect(r.native.inventory.energy.floorAreaAsKeyed).toEqual({ value: 10763.91, unit: 'ft²' });
    expect(e.standard).toMatch(/§5\.4/);
  });

  test('a mortgage, a project and a listed holding are recorded the same way', async () => {
    const m = await register.record(ORG, house());
    expect(m.result.inventory.dataQuality.scope1And2).toMatchObject({ option: '1b', score: 2 });
    expect(m.result.exposure.instrument).toBe('mortgage');
    const p = await register.record(ORG, plant());
    expect(p.result.exposure.counterparty.name).toBe('Mannar Wind (Pvt) Ltd');
    expect(p.result.attribution.value).toBe(0.2);
    expect(p.result.inventory.scope1And2.value).toBe(30);
    expect(p.result.inventory.dataQuality.scope1And2).toMatchObject({ option: '2a', score: 2 });
    expect(p.result.native.impact).toBeTruthy();
    const h = await register.record(ORG, holding());
    expect(h.result.exposure.outstanding).toMatchObject({ value: 100, unit: 'LKR' });
    expect(h.result.attribution.value).toBe(0.1);
    expect(h.result.inventory.scope1And2.value).toBe(110);
    expect(h.result.inventory.dataQuality.scope1And2.score).toBe(2);
  });

  test('a body that names one class and an engine class that disagrees is refused', async () => {
    await expect(register.record(ORG, office({ class: 'mortgages' })))
      .rejects.toMatchObject({ statusCode: 400, code: 'ASSET_CLASS_MISMATCH' });
  });

  test('one loan, once, holds across classes — the same facility reference in the same year is a 409', async () => {
    await register.record(ORG, office());
    await expect(register.record(ORG, house())).resolves.toBeTruthy();
    await expect(register.record(ORG, office({ counterparty: { name: 'Another tower' } })))
      .rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_LOAN' });
  });

  test('the position is per class, from one read, and a class the year holds nothing of is a 409 naming what it does hold', async () => {
    await register.record(ORG, loan());
    await register.record(ORG, office());
    await register.record(ORG, house());
    const bl = await register.position(ORG, YEAR);
    expect(bl.assetClass).toBe('business-loans-unlisted-equity');
    expect(bl.exposures).toBe(1);
    expect(bl.total.lines.scope1And2.value).toBe(1100);
    const cre = await register.position(ORG, YEAR, { assetClass: 'commercial-real-estate' });
    expect(cre).toMatchObject({ assetClass: 'commercial-real-estate', section: '§5.4', label: 'Commercial real estate', exposures: 1 });
    expect(cre.total.dataQuality.scope1And2.score).toBe(4);
    expect(Object.keys(cre.bySector)).toEqual(['office']);
    expect(cre.groupings).toEqual([{ key: 'bySector', label: 'Building type' }, { key: 'byKind', label: 'Product' }]);
    expect(cre.improvementPlan.targetNote).toMatch(/metered energy/);
    await expect(register.position(ORG, YEAR, { assetClass: 'project-finance' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'EMPTY_YEAR', message: expect.stringMatching(/Project finance.*holds exposures in: business-loans-unlisted-equity, commercial-real-estate, mortgages/) });
    const all = await register.positions(ORG, YEAR);
    expect(all.exposures).toBe(3);
    expect(all.byClass['project-finance']).toBeNull();
    expect(all.byClass['mortgages'].total.dataQuality.scope1And2.score).toBe(2);
    /* Nothing anywhere sums or averages the classes. */
    expect(all.total).toBeUndefined();
    expect(all.dataQuality).toBeUndefined();
  });

  test('the §5.2 position and its rows are unmoved by rows of other classes in the same year', async () => {
    await register.record(ORG, loan());
    const before = await register.position(ORG, YEAR);
    const rowsBefore = await register.rows(ORG, YEAR);
    await register.record(ORG, office());
    await register.record(ORG, plant());
    const after = await register.position(ORG, YEAR);
    expect(after.total).toEqual(before.total);
    expect(after.exposures).toBe(1);
    expect((await register.rows(ORG, YEAR)).length).toBe(rowsBefore.length);
    const byClass = await register.rowsByClass(ORG, YEAR);
    expect(Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])))
      .toEqual({ 'business-loans-unlisted-equity': 1, 'commercial-real-estate': 1, 'project-finance': 1, 'listed-equity-corporate-bonds': 0, 'mortgages': 0, 'motor-vehicle-loans': 0 });
  });

  test('the years say how many of each class they hold', async () => {
    await register.record(ORG, loan());
    await register.record(ORG, office());
    expect(await register.years(ORG)).toEqual([{ reportingYear: String(YEAR), bookTotalStated: false, exposures: 2,
      byClass: { 'business-loans-unlisted-equity': 1, 'commercial-real-estate': 1 } }]);
  });

  test('recomputing a property reads the baselines in force and reports the movement line by line', async () => {
    const e = await register.record(ORG, office());
    const { movement } = await register.recompute(ORG, e.exposureId);
    expect(movement.moved).toBe(false);
    expect(movement.lines.map(l => l.line)).toEqual(['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated']);
    expect(movement.dataQuality.after).toEqual({ scope1And2: 4, scope3: null });
  });

  test('the consolidated position lays every register class beside the others, one score each, and the register annex names the class', async () => {
    await register.record(ORG, loan());
    await register.record(ORG, office());
    await register.record(ORG, plant());
    await register.record(ORG, holding());
    await register.stateBook(ORG, { reportingYear: YEAR, totalLoansAndInvestments: 1e9, currency: 'LKR' });
    const pos = await consolidated.position(ORG, YEAR);
    const status = Object.fromEntries(pos.classes.map(c => [c.assetClass, c.status]));
    expect(status).toMatchObject({ 'business-loans-unlisted-equity': 'recorded', 'commercial-real-estate': 'recorded', 'project-finance': 'recorded',
      'listed-equity-corporate-bonds': 'recorded', 'mortgages': 'not-recorded', 'motor-vehicle-loans': 'not-recorded', 'sovereign-debt': 'not-recorded' });
    expect(pos.dataQuality.byClass.map(c => [c.section, c.score])).toEqual([['§5.1', 2], ['§5.2', 2], ['§5.3', 2], ['§5.4', 4]]);
    const at = k => pos.classes.find(c => c.assetClass === k);
    expect(pos.totals.headline.value).toBe(+(at('business-loans-unlisted-equity').headline.value + at('commercial-real-estate').headline.value
      + at('project-finance').headline.value + at('listed-equity-corporate-bonds').headline.value).toFixed(2));
    expect(pos.totals.headline.basis).toMatch(/§5\.1.*§5\.2.*§5\.3.*§5\.4/);
    expect(pos.coverage.assessedOutstanding).toBe(1e6 + 5e6 + 1e6 + 100);
    const rows = await consolidated.registerRows(ORG, YEAR);
    expect(rows.map(r => r.section)).toEqual(['§5.1', '§5.2', '§5.3', '§5.4']);
    expect(rows.find(r => r.section === '§5.4')).toMatchObject({ counterparty: 'Colombo Office Tower', sector: 'office', option: '2b', score: 4, attributionFactor: 0.25 });
  });
});

describe('over HTTP', () => {
  const post = body => request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).send(body);

  test('the classes route lists what the register holds', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/classes').set('x-api-key', KEY).expect(200);
    expect(res.body.defaultClass).toBe('business-loans-unlisted-equity');
    expect(res.body.classes.map(c => c.section)).toEqual(['§5.2', '§5.1', '§5.3', '§5.4', '§5.5', '§5.6']);
  });

  test('a property posted in square feet is recorded, listed by class, and its position is read by class', async () => {
    const rec = await post(office()).expect(201);
    expect(rec.body.exposure.result.native.inventory.energy.floorAreaAsKeyed).toEqual({ value: 10763.91, unit: 'ft²' });
    await post(loan()).expect(201);
    const list = await request(app).get(`/v1/pcaf/part-a/exposures?reportingYear=${YEAR}&assetClass=commercial-real-estate`).set('x-api-key', KEY).expect(200);
    expect(list.body.exposures).toHaveLength(1);
    expect(list.body.assetClass).toBe('commercial-real-estate');
    const pos = await request(app).get(`/v1/pcaf/part-a/position/${YEAR}?assetClass=commercial-real-estate`).set('x-api-key', KEY).expect(200);
    expect(pos.body).toMatchObject({ assetClass: 'commercial-real-estate', exposures: 1 });
    const def = await request(app).get(`/v1/pcaf/part-a/position/${YEAR}`).set('x-api-key', KEY).expect(200);
    expect(def.body).toMatchObject({ assetClass: 'business-loans-unlisted-equity', exposures: 1 });
    const years = await request(app).get('/v1/pcaf/part-a/years').set('x-api-key', KEY).expect(200);
    expect(years.body.years[0].byClass).toEqual({ 'business-loans-unlisted-equity': 1, 'commercial-real-estate': 1 });
  });

  test('the schema is the class’s own: a land unit is refused with its name, a §5.2 field on a property is a named 400', async () => {
    const land = await post(office({ floorArea: { value: 20, unit: 'perch' } })).expect(400);
    expect(land.body.error || land.body.code).toBe('LAND_UNIT_NOT_FLOOR_AREA');
    expect(land.body.remedy).toMatch(/ft²/);
    const wrong = await post(office({ denominator: { totalEquity: 1 } })).expect(400);
    expect(JSON.stringify(wrong.body)).toMatch(/denominator/);
  });

  test('the per-exposure §5.2 report refuses a row of another class by name; the consolidated register carries it', async () => {
    const rec = await post(office()).expect(201);
    const res = await request(app).post(`/v1/pcaf/part-a/exposures/${rec.body.exposure.exposureId}/report`).set('x-api-key', KEY).send({ format: 'json' }).expect(501);
    expect(res.body.error || res.body.code).toBe('REPORT_NOT_BUILT_FOR_CLASS');
    const csv = await request(app).get(`/v1/pcaf/part-a/financed-emissions/${YEAR}/register.csv`).set('x-api-key', KEY).expect(200);
    expect(csv.text).toMatch(/commercial-real-estate,§5\.4,pae_[a-z0-9]+,Colombo Office Tower,office,purchase,5000000/);
  });
});
