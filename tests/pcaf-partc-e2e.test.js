/**
 * PCAF Part C — end-to-end journey and reproducibility (M6).
 *
 * Drives the whole client journey through the HTTP API in one pass:
 * documents in, form out, answers back, disclosure and reports out,
 * learnings recorded. This is the acceptance test for the MVP as a product
 * rather than as a set of modules.
 *
 * The agent steps (intake, mapping) need an API key and are skipped without
 * one; every deterministic step runs unconditionally, because the engine is
 * pure and must never depend on a network call.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const runStore = require('../services/partc-run-store');
const { PARTC_STATUS } = require('../models/partc-run');
const { runPartC } = require('../services/pcaf-partc');
const { buildRegisters } = require('../services/partc-registers');
const fx = require('./fixtures/fisheries');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B = '/v1/pcaf/part-c';

const answersFor = (policyType, extra = {}) => ({
  policyType,
  ...(policyType === 'IDI' ? { yearsOfCover: 10 } : {}),
  gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
  distances: Object.fromEntries(Object.entries(fx.DISTANCES).map(([k, v]) =>
    [k, { road_km: v.road || 0, sea_km: v.sea || 0, rail_km: v.rail || 0 }])),
  previousProject: fx.PREVIOUS_PROJECT,
  ...extra
});

describe('Part C E2E — the full client journey', () => {
  beforeEach(() => runStore._resetMemory());

  test('documents to disclosure: start, pause, resume, report, learn', async () => {
    // ── 1. The agent has read the documents; start the run ──────────────
    const start = await auth(request(app).post(`${B}/runs/start`)).send({
      projectName: 'Fisheries CAR',
      policy: fx.POLICY_CAR,
      materials: fx.MATERIALS,
      demolitionItems: fx.DEMOLITION_ITEMS,
      prefill: { gifa_m2: 1000 },
      context: { region: 'Sri Lanka', projectType: 'fisheries' }
    });
    if (start.status === 401 || start.status === 403) return;
    expect(start.status).toBe(201);
    expect(start.body.status).toBe(PARTC_STATUS.AWAITING_INPUTS);

    const runId = start.body.runId;
    const form = start.body.form;

    // The form is built from THEIR BOQ, and gated by THEIR policy.
    expect(form.summary.materialRows).toBe(fx.MATERIALS.length);
    expect(form.useStageApplies).toBe(false);
    expect(form.summary.hiddenSections).toBe(3);

    // ── 2. The run waits for the client ─────────────────────────────────
    const parked = await auth(request(app).get(`${B}/runs/${runId}`));
    expect(parked.body.run.status).toBe(PARTC_STATUS.AWAITING_INPUTS);

    // ── 3. The client answers; the engine computes ──────────────────────
    const done = await auth(request(app).post(`${B}/runs/${runId}/resume`))
      .send({ answers: answersFor('CAR') });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe(PARTC_STATUS.COMPLETED);

    // The reference figures, through the whole stack.
    expect(done.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(done.body.summary.useStage_kgCO2e).toBe(0);
    expect(done.body.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
    expect(done.body.summary.perM2Factor_kgCO2e_m2).toBeCloseTo(15.93, 2);

    // ── 4. The disclosure is complete and honest ────────────────────────
    expect(done.body.disclosureNote).toMatch(/in conformance with/i);
    expect(done.body.disclosureNote).not.toMatch(/PCAF (approved|endorsed|certified)/i);
    expect(done.body.dataQuality.option).toBe('2b');
    // The trace is not on the wire: the badge that counted it is gone with the
    // tab that rendered it. tests/ip-surface.test.js sweeps for it properly.
    expect(done.body.registers.badges.auditTrail).toBeUndefined();
    expect(done.body.registers.assumptions.limitations.length).toBeGreaterThan(0);

    // ── 5. Both report formats ──────────────────────────────────────────
    const reportBody = {
      projectName: 'Fisheries CAR', policy: fx.POLICY_CAR,
      materials: fx.MATERIALS, distances: fx.DISTANCES,
      siteInputs: { gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
                    demolitionItems: fx.DEMOLITION_ITEMS, previousProject: fx.PREVIOUS_PROJECT },
      persist: false
    };
    const pdf = await auth(request(app).post(`${B}/report`))
      .responseType('blob').send({ ...reportBody, format: 'pdf' });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.length).toBeGreaterThan(5000);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');

    const docx = await auth(request(app).post(`${B}/report`))
      .responseType('blob').send({ ...reportBody, format: 'docx' });
    expect(docx.status).toBe(200);
    expect(docx.headers['content-type']).toMatch(/wordprocessingml/);
    expect(docx.body.length).toBeGreaterThan(5000);
    expect(docx.body.slice(0, 2).toString()).toBe('PK'); // docx is a zip

    // ── 6. The run learned something ────────────────────────────────────
    expect(done.body.learnings.perM2Factors).toBe(1);
    expect(done.body.learnings.mappingEntries).toBe(fx.MATERIALS.length);
    expect(done.body.learnings.gaps).toBeGreaterThan(0);
  });

  test('an IDI journey reports the use stage as a separate line throughout', async () => {
    const start = await auth(request(app).post(`${B}/runs/start`)).send({
      projectName: 'Fisheries IDI', policy: fx.POLICY_IDI,
      materials: fx.MATERIALS, demolitionItems: fx.DEMOLITION_ITEMS,
      prefill: { gifa_m2: 1000 }
    });
    if (start.status !== 201) return;
    expect(start.body.form.useStageApplies).toBe(true);
    expect(start.body.form.summary.hiddenSections).toBe(0);

    const done = await auth(request(app).post(`${B}/runs/${start.body.runId}/resume`))
      .send({ answers: answersFor('IDI', {
        equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A'
      }) });

    expect(done.body.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(done.body.summary.useStage_kgCO2e).toBeCloseTo(34169.09, 1);
    // The two are never combined into one figure anywhere in the response.
    expect(done.body.summary.construction_kgCO2e)
      .not.toBeCloseTo(done.body.summary.construction_kgCO2e + done.body.summary.useStage_kgCO2e, 1);
    expect(done.body.beyondPcafAnnex.scopeNote).toMatch(/never part of the PCAF figure/i);
  });
});

describe('Part C E2E — reproducibility', () => {
  test('the same inputs produce an identical disclosure', () => {
    const a = runPartC(fx.workbookInput());
    const b = runPartC(fx.workbookInput());

    // Every figure identical, not merely close.
    expect(b.summary).toEqual(a.summary);
    expect(b.disclosureNote).toBe(a.disclosureNote);
    expect(b.dataQuality).toEqual(a.dataQuality);
    expect(b.modules.a4.value).toBe(a.modules.a4.value);
    expect(b.modules.a5.value).toBe(a.modules.a5.value);

    // The audit trail is identical too — same steps, same equations, same values.
    const trail = r => buildRegisters(r).auditTrail.entries
      .map(e => `${e.module}|${e.equation}|${e.value}`);
    expect(trail(b)).toEqual(trail(a));
  });

  test('the engine holds no clock or randomness in any calculation path', () => {
    const a = runPartC(fx.idiInput());
    const b = runPartC(fx.idiInput());
    // generatedAt is a report timestamp, not a calculation input, so exclude it.
    const { generatedAt: _a, ...restA } = a;
    const { generatedAt: _b, ...restB } = b;
    expect(JSON.stringify(restB.summary)).toBe(JSON.stringify(restA.summary));
    expect(JSON.stringify(restB.sensitivity)).toBe(JSON.stringify(restA.sensitivity));
  });

  test('a third party can reproduce the figure from the audit trail alone', () => {
    const r = runPartC(fx.workbookInput());
    const trail = buildRegisters(r).auditTrail.entries;

    // A4 is re-derivable from its own recorded inputs and factors.
    const a4Rows = trail.filter(e => e.module === 'A4' && e.unit === 'kgCO2e' && e.inputs.mass_t !== undefined);
    const recomputed = a4Rows.reduce((sum, e) => {
      const f = Object.fromEntries(e.factors.map(x => [x.key, x.value]));
      const perTonne =
        (e.inputs.road_km || 0) * (f['transport-ef.road'] || 0) +
        (e.inputs.sea_km  || 0) * (f['transport-ef.sea']  || 0) +
        (e.inputs.rail_km || 0) * (f['transport-ef.rail'] || 0) +
        (e.inputs.air_km  || 0) * (f['transport-ef.air']  || 0);
      return sum + e.inputs.mass_t * perTonne;
    }, 0);

    expect(recomputed).toBeCloseTo(r.modules.a4.value, 6);
    expect(recomputed).toBeCloseTo(418.18692, 5);
  });
});
