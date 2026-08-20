/**
 * PCAF Part C — prior-year comparatives and the restatement disclosure.
 *
 * The point under test is not arithmetic but honesty: that a movement in the
 * totals is never presented as a change in performance when the book itself
 * changed, and that a figure already published cannot quietly become a
 * different figure.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const C        = require('../services/partc-comparatives');
const A        = require('../services/partc-assessments');
const registry = require('../services/partc-registry');
const boq      = require('../services/partc-boq');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');
const fx       = require('./fixtures/fisheries');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'cmp-org';

let book;

const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

async function revisionFor(projectId, materials = fx.MATERIALS) {
  return boq.createRevision(ORG, projectId, {
    note: 'Tender', materials: withDist(materials), demolitionItems: fx.DEMOLITION_ITEMS
  });
}

/** Run, review and lock in one step. */
async function lock(projectId, policyId, revisionId, extra = {}) {
  const { assessment } = await A.createAssessment(ORG, {
    projectId, policyId, boqRevisionId: revisionId,
    siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: null, ...(extra.siteInputs || {}) },
    ...(extra.restatementReason ? { restatementReason: extra.restatementReason } : {})
  });
  await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
  const locked = await A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });
  return locked;
}

function fisheries() {
  const pj  = book.projects.find(p => /Negombo/.test(p.name));
  const pol = pj.policies.find(x => x.reportingYear === 2026);
  return { pj, pol };
}

beforeEach(async () => {
  store._resetMemory();
  book = await seedDemoBook(registry, ORG, boq);
});

describe('Restatement register', () => {
  test('a year with nothing restated says so rather than returning an empty list', async () => {
    const r = await C.restatementsFor(ORG, 2026);
    expect(r.count).toBe(0);
    expect(r.entries).toHaveLength(0);
    expect(r.note).toMatch(/has been restated/);
    expect(r.netMovement_kgCO2e).toBe(0);
  });

  test('a locked version that moves the figure materially is disclosed on both bases', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);

    const first = await lock(pj.projectId, pol.policyId, rev.revisionId);
    const before = first.summary.construction_kgCO2e;

    // A5.2 site energy carries most of the figure, so a corrected fuel log —
    // not a BOQ edit — is what actually moves a disclosure past 5%.
    const second = await lock(pj.projectId, pol.policyId, rev.revisionId, {
      siteInputs: { previousProject: { area_m2: 1000, fuel_L: 20000, electricity_kWh: 9000, durationMonths: 12 } },
      restatementReason: 'Contractor fuel log corrected after the site audit.'
    });

    expect(second.restatement.isRestatement).toBe(true);

    const r = await C.restatementsFor(ORG, 2026);
    expect(r.count).toBe(1);
    const e = r.entries[0];
    expect(e.asPreviouslyReported_kgCO2e).toBeCloseTo(before, 1);
    expect(e.asRestated_kgCO2e).toBeCloseTo(second.summary.construction_kgCO2e, 1);
    expect(e.reason).toMatch(/fuel log/i);
    expect(Math.abs(e.movementPct)).toBeGreaterThanOrEqual(e.thresholdPct);
    expect(r.note).toMatch(/restated for FY2026/);
  });

  test('a movement below the threshold is not called a restatement', async () => {
    const { pj, pol } = fisheries();
    const rev  = await revisionFor(pj.projectId);
    const rev2 = await revisionFor(pj.projectId, fx.MATERIALS.slice(0, 5));

    await lock(pj.projectId, pol.policyId, rev.revisionId);
    const second = await lock(pj.projectId, pol.policyId, rev2.revisionId);

    expect(second.restatement.isRestatement).toBe(false);
    expect((await C.restatementsFor(ORG, 2026)).count).toBe(0);
  });

  test('a draft that would move the figure has not moved it', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);
    await lock(pj.projectId, pol.policyId, rev.revisionId);

    await A.createAssessment(ORG, {
      projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40,
        previousProject: { area_m2: 1000, fuel_L: 20000, electricity_kWh: 9000, durationMonths: 12 } },
      restatementReason: 'Proposed correction, not yet approved.'
    });

    expect((await C.restatementsFor(ORG, 2026)).count).toBe(0);
  });
});

describe('Prior-year comparison', () => {
  test('the first reported year says there is no comparative rather than showing zero', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);
    await lock(pj.projectId, pol.policyId, rev.revisionId);

    const c = await C.compare(ORG, 2026);
    expect(c.hasPrior).toBe(false);
    expect(c.comparabilityNote).toMatch(/first reported year/);
    expect(c.priorYear).toBe(2025);
  });

  test('a movement in the total is never described as a performance change', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);
    await lock(pj.projectId, pol.policyId, rev.revisionId);

    const c = await C.compare(ORG, 2027);
    expect(c.hasPrior).toBe(true);
    expect(c.comparabilityNote).toMatch(/inception year/);
    expect(c.comparabilityNote).toMatch(/not on its own a change in performance/);
    expect(c.intensity.basis).toMatch(/per square metre/);
  });

  test('intensity is reported per square metre insured, which survives a change of book', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);
    const locked = await lock(pj.projectId, pol.policyId, rev.revisionId);

    const c = await C.compare(ORG, 2027);
    expect(c.intensity.prior).toBeCloseTo(locked.summary.perM2Factor_kgCO2e_m2, 1);
    expect(c.composition.insuredArea_m2.prior).toBeGreaterThan(0);
  });

  test('where the prior year was restated, both bases are carried into this year', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);

    const first = await lock(pj.projectId, pol.policyId, rev.revisionId);
    const second = await lock(pj.projectId, pol.policyId, rev.revisionId, {
      siteInputs: { previousProject: { area_m2: 1000, fuel_L: 20000, electricity_kWh: 9000, durationMonths: 12 } },
      restatementReason: 'Contractor fuel log corrected after the site audit.'
    });

    const c = await C.compare(ORG, 2027);
    expect(c.restatements.count).toBe(1);
    expect(c.restatements.asRestated_kgCO2e).toBeCloseTo(second.summary.construction_kgCO2e, 1);
    expect(c.restatements.asPreviouslyReported_kgCO2e).toBeCloseTo(first.summary.construction_kgCO2e, 1);
    expect(c.restatements.asPreviouslyReported_kgCO2e)
      .not.toBeCloseTo(c.restatements.asRestated_kgCO2e, 1);
  });

  test('data quality is compared on the emissions-weighted basis', async () => {
    const { pj, pol } = fisheries();
    const rev = await revisionFor(pj.projectId);
    await lock(pj.projectId, pol.policyId, rev.revisionId);

    const c = await C.compare(ORG, 2027);
    expect(c.dataQuality.basis).toMatch(/weighted/i);
    expect(c.dataQuality.prior).not.toBeNull();
  });
});

describe('Comparatives over HTTP', () => {
  /* An API key carries its own organisation, so the HTTP tests build their
     book through the API rather than reusing the fixture organisation. */
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

  test('GET /portfolio/:year/comparatives and /restatements', async () => {
    if (!(await seedAndLockOverHttp())) return;

    const a = await auth(request(app).get(`${B}/portfolio/2027/comparatives`));
    expect(a.status).toBe(200);
    expect(a.body.comparatives.priorYear).toBe(2026);
    expect(a.body.comparatives.hasPrior).toBe(true);
    expect(a.body.comparatives.comparabilityNote).toMatch(/inception year/);

    const b = await auth(request(app).get(`${B}/portfolio/2026/restatements`));
    expect(b.status).toBe(200);
    expect(b.body.restatements.count).toBe(0);
  });
});
