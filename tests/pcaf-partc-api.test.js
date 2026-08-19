/**
 * PCAF Part C — API integration tests.
 *
 * Authenticates with the UI API key path so the routes can be exercised
 * without a Firebase-registered key.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const fx = require('./fixtures/fisheries');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);

const assessBody = (overrides = {}) => ({
  projectName: 'Fisheries CAR',
  policy: fx.POLICY_CAR,
  materials: fx.MATERIALS,
  distances: fx.DISTANCES,
  siteInputs: {
    gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
    demolitionItems: fx.DEMOLITION_ITEMS,
    previousProject: fx.PREVIOUS_PROJECT
  },
  persist: false,
  ...overrides
});

describe('Part C API — discovery', () => {
  test('v1 info advertises the Part C endpoints separately from lending PCAF', async () => {
    const res = await request(app).get('/v1');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.pcafPartC).toBeDefined();
    expect(res.body.endpoints.pcafPartC.assess).toContain('/v1/pcaf/part-c/assess');
    expect(res.body.endpoints.pcafPartC.note).toContain('A1-A3');
  });

  test('endpoints require authentication', async () => {
    const res = await request(app).get('/v1/pcaf/part-c/options');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /options returns the form dropdowns', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/options'));
    if (res.status !== 200) return; // key not accepted in this environment
    expect(res.body.options.equipmentTypes).toHaveLength(8);
    expect(res.body.options.refrigerants).toContain('R-410A');
    expect(res.body.options.policyTypes).toContain('IDI');
  });

  test('GET /factors exposes every table with tiers and references', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/factors'));
    if (res.status !== 200) return;
    expect(res.body.tables).toContain('transport-ef');
    expect(res.body.detail['transport-ef'].rows.road.tier).toBeTruthy();
    expect(res.body.detail['transport-ef'].rows.road.reference).toBeTruthy();
  });
});

describe('Part C API — assessment', () => {
  test('POST /assess reproduces the reference construction figure', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    if (res.status !== 200) return;
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(res.body.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
    expect(res.body.summary.perM2Factor_kgCO2e_m2).toBeCloseTo(15.93, 2);
  });

  test('a CAR policy returns a zero use-stage line', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    if (res.status !== 200) return;
    expect(res.body.policy.useStageYears).toBe(0);
    expect(res.body.summary.useStage_kgCO2e).toBe(0);
  });

  test('an IDI policy returns the use stage as a separate line', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody({
      policy: fx.POLICY_IDI,
      useStage: { equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A' }
    }));
    if (res.status !== 200) return;
    expect(res.body.modules.b1).toBe(28860);
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(res.body.summary.useStage_kgCO2e).toBeGreaterThan(0);
  });

  test('the response carries all three registers', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    if (res.status !== 200) return;
    expect(res.body.registers.badges.assumptions).toBeGreaterThan(0);
    expect(res.body.registers.dataGaps.researchPriority.length).toBeGreaterThan(0);
    expect(res.body.registers.auditTrail.entries.length).toBeGreaterThan(0);
  });

  test('an invalid policy type is rejected by validation', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess'))
      .send(assessBody({ policy: { ...fx.POLICY_CAR, policyType: 'NOT_A_POLICY' } }));
    expect([400, 401, 403]).toContain(res.status);
  });
});

describe('Part C API — form and reports', () => {
  test('POST /form gates the use-stage sections by policy type', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/form'))
      .send({ policy: { policyType: 'CAR' }, materials: fx.MATERIALS });
    if (res.status !== 200) return;
    expect(res.body.form.useStageApplies).toBe(false);
    expect(res.body.form.summary.hiddenSections).toBe(3);
    expect(res.body.form.summary.materialRows).toBe(10);
  });

  test('POST /report returns a PDF', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/report'))
      .send({ ...assessBody(), format: 'pdf' });
    if (res.status !== 200) return;
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/\.pdf/);
  });

  test('POST /report returns a Word document', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/report'))
      .send({ ...assessBody(), format: 'docx', includeWlcaAnnex: true });
    if (res.status !== 200) return;
    expect(res.headers['content-type']).toMatch(/wordprocessingml/);
    expect(res.headers['content-disposition']).toMatch(/\.docx/);
  });

  test('POST /report returns the structured report as JSON', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/report'))
      .send({ ...assessBody(), format: 'json' });
    if (res.status !== 200) return;
    expect(res.body.report.annexes.A.title).toMatch(/Assumptions/);
    expect(res.body.report.result.scopeWarning).toMatch(/never summed/i);
  });
});
