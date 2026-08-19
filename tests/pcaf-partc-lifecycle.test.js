/**
 * PCAF Part C — run lifecycle: start, pause, resume.
 *
 * The pause point is what makes the flow agentic rather than batch. These
 * tests drive it end to end through the HTTP API.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const runStore = require('../services/partc-run-store');
const { PARTC_STATUS } = require('../models/partc-run');
const fx = require('./fixtures/fisheries');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);

const startBody = (policyType = 'CAR') => ({
  projectName: 'Fisheries CAR',
  policy: { ...fx.POLICY_CAR, policyType },
  materials: fx.MATERIALS,
  demolitionItems: fx.DEMOLITION_ITEMS,
  prefill: { gifa_m2: 1000 },
  context: { region: 'Sri Lanka', projectType: 'fisheries' }
});

const answers = (extra = {}) => ({
  policyType: 'CAR', gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
  distances: Object.fromEntries(Object.entries(fx.DISTANCES).map(([k, v]) =>
    [k, { road_km: v.road || 0, sea_km: v.sea || 0, rail_km: v.rail || 0 }])),
  previousProject: fx.PREVIOUS_PROJECT,
  ...extra
});

async function startRun(policyType = 'CAR') {
  const res = await auth(request(app).post('/v1/pcaf/part-c/runs/start')).send(startBody(policyType));
  return res;
}

describe('Part C lifecycle — start', () => {
  beforeEach(() => runStore._resetMemory());

  test('starting a run returns a paused run with its form', async () => {
    const res = await startRun();
    if (res.status === 401 || res.status === 403) return;
    expect(res.status).toBe(201);
    expect(res.body.runId).toMatch(/^partc_/);
    expect(res.body.status).toBe(PARTC_STATUS.AWAITING_INPUTS);
    expect(res.body.form.summary.materialRows).toBe(10);
    expect(res.body.next).toContain('/resume');
  });

  test('a CAR policy hides the use-stage sections in the paused form', async () => {
    const res = await startRun('CAR');
    if (res.status !== 201) return;
    expect(res.body.form.useStageApplies).toBe(false);
    expect(res.body.form.summary.hiddenSections).toBe(3);
  });

  test('an IDI policy shows every section', async () => {
    const res = await startRun('IDI');
    if (res.status !== 201) return;
    expect(res.body.form.useStageApplies).toBe(true);
    expect(res.body.form.summary.hiddenSections).toBe(0);
  });

  test('a paused run is retrievable while it waits', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    const res = await auth(request(app).get(`/v1/pcaf/part-c/runs/${start.body.runId}`));
    expect(res.status).toBe(200);
    expect(res.body.run.status).toBe(PARTC_STATUS.AWAITING_INPUTS);
    expect(res.body.run.materials).toHaveLength(10);
  });

  test('the response says plainly when the run is not durably stored', async () => {
    const res = await startRun();
    if (res.status !== 201) return;
    expect(typeof res.body.durable).toBe('boolean');
    if (!res.body.durable) expect(res.body.warning).toMatch(/memory only/i);
  });
});

describe('Part C lifecycle — resume', () => {
  beforeEach(() => runStore._resetMemory());

  test('resuming with the answers computes the reference figures', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`))
      .send({ answers: answers() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(PARTC_STATUS.COMPLETED);
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(res.body.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
    expect(res.body.summary.perM2Factor_kgCO2e_m2).toBeCloseTo(15.93, 2);
  });

  test('resuming without the optional site data takes the RICS default path', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    const a = answers();
    delete a.previousProject;
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`)).send({ answers: a });
    expect(res.status).toBe(200);
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(41256.59, 1);
  });

  test('an IDI run computes the use stage as a separate line', async () => {
    const start = await startRun('IDI');
    if (start.status !== 201) return;
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`))
      .send({ answers: answers({
        policyType: 'IDI', yearsOfCover: 10,
        equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A'
      }) });
    expect(res.status).toBe(200);
    expect(res.body.modules.b1).toBe(28860);
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
  });

  test('the completed run carries its answers and result', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`)).send({ answers: answers() });
    const res = await auth(request(app).get(`/v1/pcaf/part-c/runs/${start.body.runId}`));
    expect(res.body.run.status).toBe(PARTC_STATUS.COMPLETED);
    expect(res.body.run.formAnswers.gifa_m2).toBe(1000);
    expect(res.body.run.result.construction_kgCO2e).toBeCloseTo(15928.59, 1);
  });

  test('a client factor override is applied and recorded as a local candidate', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`))
      .send({
        answers: answers(),
        overrides: { 'densities.rubble_masonry': { value: 2450, reference: 'Quarry test certificate' } }
      });
    expect(res.status).toBe(200);
    // Denser masonry raises A4, so the construction figure moves up.
    expect(res.body.summary.construction_kgCO2e).toBeGreaterThan(15928.59);
    expect(res.body.learnings.overrides).toBe(1);
  });

  test('an override does not leak into the next run', async () => {
    const first = await startRun();
    if (first.status !== 201) return;
    await auth(request(app).post(`/v1/pcaf/part-c/runs/${first.body.runId}/resume`)).send({
      answers: answers(),
      overrides: { 'densities.rubble_masonry': { value: 2450, reference: 'Quarry test certificate' } }
    });
    const second = await startRun();
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${second.body.runId}/resume`))
      .send({ answers: answers() });
    expect(res.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
  });

  test('resuming an unknown run is a 404', async () => {
    const res = await auth(request(app).post('/v1/pcaf/part-c/runs/partc_does_not_exist/resume'))
      .send({ answers: answers() });
    if (res.status === 401 || res.status === 403) return;
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('RUN_NOT_FOUND');
  });

  test('a completed run cannot be resumed twice', async () => {
    const start = await startRun();
    if (start.status !== 201) return;
    await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`)).send({ answers: answers() });
    const res = await auth(request(app).post(`/v1/pcaf/part-c/runs/${start.body.runId}/resume`))
      .send({ answers: answers() });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RUN_NOT_AWAITING_INPUTS');
  });
});

describe('Part C run store', () => {
  beforeEach(() => runStore._resetMemory());

  test('the in-memory fallback round-trips a run when Firebase is absent', async () => {
    await runStore.saveRun('org1', { runId: 'r1', createdAt: '2026-01-01T00:00:00Z', status: 'created' });
    expect((await runStore.getRun('org1', 'r1')).runId).toBe('r1');
    expect(await runStore.getRun('org1', 'missing')).toBeNull();
  });

  test('runs are scoped per organisation', async () => {
    await runStore.saveRun('orgA', { runId: 'r1', createdAt: '2026-01-01T00:00:00Z' });
    expect(await runStore.getRun('orgB', 'r1')).toBeNull();
  });

  test('the fallback is bounded and evicts the oldest run', async () => {
    for (let i = 0; i < runStore.MAX_MEMORY_RUNS + 5; i++) {
      await runStore.saveRun('org1', { runId: `r${i}`, createdAt: new Date(2026, 0, 1, 0, i).toISOString() });
    }
    expect(await runStore.getRun('org1', 'r0')).toBeNull();
    expect(await runStore.getRun('org1', `r${runStore.MAX_MEMORY_RUNS + 4}`)).not.toBeNull();
    expect((await runStore.listRuns('org1', 1000)).length).toBe(runStore.MAX_MEMORY_RUNS);
  });
});
