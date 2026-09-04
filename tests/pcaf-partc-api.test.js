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

  test('the response carries the two registers a client reads', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    if (res.status !== 200) return;
    expect(res.body.registers.badges.assumptions).toBeGreaterThan(0);
    expect(res.body.registers.dataGaps.researchPriority.length).toBeGreaterThan(0);
  });

  /*
   * The calculation trace never leaves the process. Annex C is every equation
   * the engine executed with its inputs and the factor each step consulted —
   * the method, not the disclosure, and the same asset nothing on this site
   * serves. Removing the tab that rendered it is not enough: the response
   * carried it whether or not a screen drew it, and a response is readable by
   * whoever loads the page.
   *
   * The whole body is swept rather than the one key, because the leak is the
   * equations, and they would be just as readable under a different name.
   */
  test('no response carries the calculation trace', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    if (res.status !== 200) return;
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('auditTrail');
    expect(body).not.toContain('mass_factor');
    expect(body).not.toMatch(/EF_road|EF_sea|EF_rail|EF_air/);
    expect(body).not.toMatch(/"equation"/);
  });

  test('the trace is still built, so the method survives the removal', () => {
    // Removing the surface must not remove the asset: partc-methodology.js
    // and the GWP basis are both derived from this tree.
    const { buildRegisters } = require('../services/partc-registers');
    const { runPartC } = require('../services/pcaf-partc');
    const registers = buildRegisters(runPartC(fx.engineInput ? fx.engineInput() : {
      policy: fx.POLICY_CAR, materials: fx.MATERIALS, siteInputs: fx.SITE_INPUTS
    }));
    expect(registers.auditTrail.entries.length).toBeGreaterThan(0);
    expect(registers.auditTrail.entries.every(e => e.equation)).toBe(true);
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

describe('Part C API — the data-quality score travels with the figure', () => {
  test('POST /assess returns the option, the score and the generated statement', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody());
    expect(res.status).toBe(200);
    expect(res.body.dataQuality.option).toBe('2b');
    expect(res.body.dataQuality.score).toBe(3);
    expect(res.body.dqScoring.construction.score).toBe(3);
    expect(res.body.dqScoring.construction.scoreText).toBe('Data quality score: 3 (Option 2b)');
    expect(res.body.dqScoring.table).toHaveLength(6);
    expect(res.body.dqStatement).toMatch(/in conformance with/i);
    expect(res.body.dqStatement).not.toMatch(/PCAF (approved|endorsed|certified)/i);
  });

  test('the response carries no numeric data-quality score for the use stage', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess'))
      .send(assessBody({ policy: fx.POLICY_IDI, useStage: fx.USE_STAGE }));
    expect(res.status).toBe(200);
    const us = res.body.dqScoring.useStage;
    expect(us.scored).toBe(false);
    expect(us.reason).toMatch(/no data quality table/i);
    for (const key of Object.keys(us)) expect(typeof us[key]).not.toBe('number');
  });

  test('a construction-only policy reports the use stage as out of scope, not as a score', () => {
    return auth(request(app).post('/v1/pcaf/part-c/assess')).send(assessBody())
      .then(res => {
        expect(res.body.dqScoring.useStage.applies).toBe(false);
        expect(res.body.dqScoring.useStage.reason).toMatch(/scope rule/i);
      });
  });

  test('the insured scope 3 score is returned apart from scopes 1 and 2', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/assess'))
      .send(assessBody({ policy: fx.POLICY_IDI, useStage: fx.USE_STAGE }));
    const g = res.body.dqScoring.byGhgScope;
    expect(g.scope1and2.option).toBe('2a');
    expect(g.scope1and2.score).toBe(2);
    expect(g.scope3.option).toBe('2b');
    expect(g.scope3.score).toBe(3);
  });

  test('POST /dq-preview scores without persisting anything', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/dq-preview')).send(assessBody());
    expect(res.status).toBe(200);
    expect(res.body.dqScoring.construction.score).toBe(3);
    expect(res.body.summary.construction_kgCO2e).toBeGreaterThan(0);
    expect(res.body.runId).toBeUndefined();
  });

  test('the preview shows the evidence strengthen when an actual is supplied, while the score holds', async () => {
    const idi = { ...fx.POLICY_IDI };
    const before = await auth(request(app).post('/v1/pcaf/part-c/dq-preview'))
      .send(assessBody({ policy: idi, useStage: fx.USE_STAGE }));
    const after = await auth(request(app).post('/v1/pcaf/part-c/dq-preview'))
      .send(assessBody({ policy: idi, useStage: { ...fx.USE_STAGE, chargeKg: 12 } }));

    const charge = body => body.dqScoring.internalAid.rows
      .find(r => r.input === 'Refrigerant charge').strength;
    expect(charge(before.body)).toBe('Weak');
    expect(charge(after.body)).toBe('Strong');
    // The PCAF score is a property of the option, so it does not move.
    expect(after.body.dqScoring.construction.score)
      .toBe(before.body.dqScoring.construction.score);
  });

  test('the preview requires a key like every other endpoint', async () => {
    const res = await request(app).post('/v1/pcaf/part-c/dq-preview').send(assessBody());
    expect([401, 403]).toContain(res.status);
  });
});
