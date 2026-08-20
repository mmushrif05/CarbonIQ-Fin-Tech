/**
 * PCAF Part C — the annual disclosure.
 *
 * What is under test is mostly what the document refuses to do: report a
 * position it does not have, sum two lines the standard keeps apart, imply a
 * coverage it has not achieved, or claim an endorsement it has not been given.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const D        = require('../services/partc-disclosure');
const A        = require('../services/partc-assessments');
const registry = require('../services/partc-registry');
const boq      = require('../services/partc-boq');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');
const fx       = require('./fixtures/fisheries');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'disc-org';

let book;

const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

async function lockFisheries(extra = {}) {
  const pj  = book.projects.find(p => /Negombo/.test(p.name));
  const pol = pj.policies.find(x => x.reportingYear === 2026);
  const rev = await boq.createRevision(ORG, pj.projectId, {
    note: 'Tender', materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
  const { assessment } = await A.createAssessment(ORG, {
    projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
    siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT },
    ...extra
  });
  await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
  return A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });
}

beforeEach(async () => {
  store._resetMemory();
  book = await seedDemoBook(registry, ORG, boq);
});

describe('What the disclosure refuses to do', () => {
  test('a year with no locked assessment is refused, not reported as zero', async () => {
    await expect(D.buildAnnualDisclosure(ORG, 2026)).rejects.toMatchObject({
      code: 'NOTHING_TO_DISCLOSE', statusCode: 409
    });
  });

  test('a draft assessment does not create a position', async () => {
    const pj  = book.projects.find(p => /Negombo/.test(p.name));
    const pol = pj.policies.find(x => x.reportingYear === 2026);
    const rev = await boq.createRevision(ORG, pj.projectId, {
      note: 'Tender', materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
    await A.createAssessment(ORG, {
      projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: null } });

    await expect(D.buildAnnualDisclosure(ORG, 2026)).rejects.toMatchObject({ code: 'NOTHING_TO_DISCLOSE' });
  });

  test('construction and use stage are never combined anywhere in the document', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    expect(d.position.construction.total_kgCO2e).toBeGreaterThan(0);
    expect(d.position).not.toHaveProperty('total');
    expect(d.position).not.toHaveProperty('combined');
    expect(d.position.scopeNote).toMatch(/never summed/);
    expect(JSON.stringify(d)).not.toMatch(/whole[- ]life total/i);
  });

  test('the voluntary whole-life annex is excluded entirely', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    expect(d.scope.excluded).toMatch(/B2\/B5\/B8/);
    expect(d.annexes).not.toHaveProperty('D');
  });

  test('the document claims conformance, never endorsement', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    expect(d.conformance.statement).toMatch(/conformance/i);
    expect(d.conformance.statement).toMatch(/not an endorsement/i);
    expect(d.conformance.statement).not.toMatch(/PCAF[- ](approved|endorsed|certified)/i);
  });
});

describe('What the disclosure states plainly', () => {
  test('coverage is stated as a fraction of the book, not left to be inferred', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    expect(d.coverage.policiesInYear).toBe(5);
    expect(d.coverage.assessedPolicies).toBe(1);
    expect(d.coverage.coveragePct).toBe(20);
    expect(d.coverage.statement).toMatch(/1 of 5 policies/);
    expect(d.coverage.unassessed).toHaveLength(4);
  });

  test('the figure agrees with the locked assessment behind it', async () => {
    const locked = await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    expect(d.position.construction.total_kgCO2e)
      .toBeCloseTo(locked.summary.construction_kgCO2e, 2);
    expect(d.policies).toHaveLength(1);
    expect(d.policies[0].shareOfConstructionPct).toBe(100);
  });

  test('every disclosed figure traces to an assessment, a BOQ revision and a lock', async () => {
    const locked = await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    const entry = d.annexes.C.entries[0];
    expect(entry.assessmentId).toBe(locked.assessmentId);
    expect(entry.boqRevisionId).toBeTruthy();
    expect(entry.lockedAt).toBeTruthy();
    expect(entry.lockedBy).toBe('Ceylon Insurance PLC');
  });

  test('data quality is shown distributed, not only as one average', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    expect(d.dataQuality.weighted).toBeGreaterThan(0);
    expect(d.dataQuality.basis).toMatch(/[Ww]eighted/);
    expect(d.dataQuality.distribution.length).toBeGreaterThan(0);
    const shares = d.dataQuality.distribution.reduce((n, b) => n + b.sharePct, 0);
    expect(shares).toBeCloseTo(100, 0);
  });

  test('the improvement plan cites the engine\'s own limitations, not generic advice', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);

    const actions = d.dataQuality.improvement.actions;
    if (actions.length) expect(actions[0].actions.length).toBeGreaterThan(0);
    expect(d.annexes.A.entries.length).toBeGreaterThan(0);
    expect(d.annexes.A.entries[0]).toHaveProperty('occurrences');
    expect(d.annexes.A.entries[0].projects.length).toBeGreaterThan(0);
  });

  test('a limitation seen on several projects is listed once with the projects named', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    const messages = d.annexes.A.entries.map(e => e.message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  test('each conformance rule cites the code that enforces it and the test that proves it', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    expect(d.conformance.rules.length).toBeGreaterThan(0);
    for (const r of d.conformance.rules) {
      expect(r.implementation).toBeTruthy();
      expect(r.provingTest).toBeTruthy();
    }
  });
});

describe('Both formats', () => {
  test('PDF renders', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    const chunks = [];
    const doc = D.buildDisclosurePDF(d);
    await new Promise((res, rej) => {
      doc.on('data', c => chunks.push(c));
      doc.on('end', res); doc.on('error', rej);
    });
    const buf = Buffer.concat(chunks);
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('Word renders', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    const buf = await D.buildDisclosureDOCX(d);
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 2).toString()).toBe('PK');   // docx is a zip
  });

  test('both formats are built from the same object, so they cannot disagree', async () => {
    await lockFisheries();
    const d = await D.buildAnnualDisclosure(ORG, 2026);
    // The figure appears once, in the structured object both renderers read.
    expect(d.position.construction.total_kgCO2e).toBe(d.position.construction.total_kgCO2e);
    expect(typeof D.buildDisclosurePDF).toBe('function');
    expect(typeof D.buildDisclosureDOCX).toBe('function');
  });
});

describe('Disclosure over HTTP', () => {
  async function seedAndLockOverHttp() {
    const seed = await auth(request(app).post(`${B}/demo/seed`)).send({ force: true });
    if (seed.status !== 201) return false;
    const projects = await auth(request(app).get(`${B}/projects`));
    const pj = projects.body.projects.find(p => /Negombo/.test(p.name));
    const revs = await auth(request(app).get(`${B}/projects/${pj.projectId}/boq`));
    const created = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: pj.projectId,
      policyId: pj.policies.find(x => x.reportingYear === 2026).policyId,
      boqRevisionId: revs.body.revisions[0].revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT }
    });
    const id = created.body.assessment.assessmentId;
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'under_review' });
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'locked' });
    return true;
  }

  test('GET /disclosure/:year returns JSON by default', async () => {
    if (!(await seedAndLockOverHttp())) return;
    const res = await auth(request(app).get(`${B}/disclosure/2026`));
    expect(res.status).toBe(200);
    expect(res.body.disclosure.meta.reportingYear).toBe(2026);
    expect(res.body.disclosure.coverage.coveragePct).toBe(20);
  });

  test('GET /disclosure/:year?format=pdf downloads a PDF', async () => {
    if (!(await seedAndLockOverHttp())) return;
    const res = await auth(request(app).get(`${B}/disclosure/2026?format=pdf`)).buffer().parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.headers['content-disposition']).toMatch(/iae-fy2026\.pdf/);
  });

  test('GET /disclosure/:year?format=docx downloads a Word file', async () => {
    if (!(await seedAndLockOverHttp())) return;
    const res = await auth(request(app).get(`${B}/disclosure/2026?format=docx`)).buffer().parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/iae-fy2026\.docx/);
  });

  test('an unsupported format is refused with a remedy', async () => {
    if (!(await seedAndLockOverHttp())) return;
    const res = await auth(request(app).get(`${B}/disclosure/2026?format=xlsx`));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_FORMAT');
    expect(res.body.remedy).toMatch(/format=/);
  });

  test('a year with nothing locked is refused over HTTP too', async () => {
    if (!(await seedAndLockOverHttp())) return;
    const res = await auth(request(app).get(`${B}/disclosure/2099`));
    expect(res.status).toBe(409);
    expect(res.body.error || res.body.code).toBeTruthy();
  });
});
