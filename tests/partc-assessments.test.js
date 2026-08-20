/**
 * PCAF Part C — assessment binding, lock lifecycle and restatement.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const A        = require('../services/partc-assessments');
const registry = require('../services/partc-registry');
const boq      = require('../services/partc-boq');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');
const fx       = require('./fixtures/fisheries');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'assess-org';
const SITE = { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT };

let book, negombo, carPolicy, R1, R2, R3;

beforeEach(async () => {
  store._resetMemory();
  book = await seedDemoBook(registry, ORG, boq);
  negombo = book.projects.find(p => /Negombo/.test(p.name));
  carPolicy = negombo.policies[0];
  [R1, R2, R3] = book.boqRevisions;
});

const run = (revisionId, extra = {}) => A.createAssessment(ORG, {
  projectId: negombo.projectId, policyId: carPolicy.policyId,
  boqRevisionId: revisionId, siteInputs: SITE, ...extra
});

describe('Assessment binding', () => {
  test('an assessment is bound to its policy, BOQ revision and reporting year', async () => {
    const { assessment } = await run(R1.revisionId);
    expect(assessment.policyId).toBe(carPolicy.policyId);
    expect(assessment.boqRevisionId).toBe(R1.revisionId);
    expect(assessment.boqRevisionLabel).toBe('R1');
    expect(assessment.reportingYear).toBe(2026);
    expect(assessment.lineType).toBe('CAR');
    expect(assessment.projectName).toMatch(/Negombo/);
    expect(assessment.clientName).toMatch(/Fisheries/);
  });

  test('the figure comes from the book without re-asking for what it knows', async () => {
    const { assessment } = await run(R1.revisionId);
    // GIFA, premium and project cost all come from the registry.
    expect(assessment.inputs.siteInputs.gifa_m2).toBe(1000);
    expect(assessment.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(assessment.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
  });

  test('a CAR policy produces no use-stage line', async () => {
    const { assessment } = await run(R1.revisionId);
    expect(assessment.summary.useStage_kgCO2e).toBe(0);
    expect(assessment.moduleValues.b1).toBe(0);
  });

  test('an IDI policy on the same project does produce one', async () => {
    const idi = negombo.policies[1];
    const { assessment } = await A.createAssessment(ORG, {
      projectId: negombo.projectId, policyId: idi.policyId, boqRevisionId: R1.revisionId,
      siteInputs: SITE, useStage: { equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A' }
    });
    expect(assessment.reportingYear).toBe(2027);
    expect(assessment.moduleValues.b1).toBe(28860);
    expect(assessment.summary.useStage_kgCO2e).toBeGreaterThan(0);
    expect(assessment.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
  });

  test('a revision from another project is refused', async () => {
    const other = book.projects.find(p => /Galle/.test(p.name));
    const rev = await boq.createRevision(ORG, other.projectId, { materials: fx.MATERIALS });
    await expect(run(rev.revisionId)).rejects.toThrow(/different project/);
  });

  test('an unknown policy is refused', async () => {
    await expect(A.createAssessment(ORG, {
      projectId: negombo.projectId, policyId: 'pol_nope', boqRevisionId: R1.revisionId, siteInputs: SITE
    })).rejects.toThrow(/No such project or policy/);
  });

  test('versions increment within a policy-year', async () => {
    expect((await run(R1.revisionId)).assessment.version).toBe(1);
    expect((await run(R2.revisionId)).assessment.version).toBe(2);
    expect((await run(R3.revisionId)).assessment.version).toBe(3);
  });
});

describe('Assessment lifecycle', () => {
  test('a new assessment starts as a draft', async () => {
    expect((await run(R1.revisionId)).assessment.status).toBe('draft');
  });

  test('draft moves to under review and back', async () => {
    const { assessment } = await run(R1.revisionId);
    expect((await A.changeStatus(ORG, assessment.assessmentId, 'under_review')).status).toBe('under_review');
    expect((await A.changeStatus(ORG, assessment.assessmentId, 'draft')).status).toBe('draft');
  });

  test('a draft cannot be locked without review', async () => {
    const { assessment } = await run(R1.revisionId);
    await expect(A.changeStatus(ORG, assessment.assessmentId, 'locked')).rejects.toThrow(/Cannot move from "draft"/);
  });

  test('locking records who did it', async () => {
    const { assessment } = await run(R1.revisionId);
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    const locked = await A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });
    expect(locked.status).toBe('locked');
    expect(locked.lockedBy).toBe('Ceylon Insurance PLC');
    expect(locked.lockedAt).toBeTruthy();
  });

  test('a locked assessment cannot be edited, only superseded', async () => {
    const { assessment } = await run(R1.revisionId);
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    await A.changeStatus(ORG, assessment.assessmentId, 'locked');
    await expect(A.changeStatus(ORG, assessment.assessmentId, 'draft'))
      .rejects.toThrow(/cannot be changed. Create a new version/);
  });

  test('a locked assessment cannot be deleted', async () => {
    const { assessment } = await run(R1.revisionId);
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    await A.changeStatus(ORG, assessment.assessmentId, 'locked');
    await expect(A.deleteAssessment(ORG, assessment.assessmentId)).rejects.toThrow(/disclosure record/);
  });

  test('a draft can be deleted', async () => {
    const { assessment } = await run(R1.revisionId);
    expect((await A.deleteAssessment(ORG, assessment.assessmentId)).deleted).toBe(true);
    expect(await A.getAssessment(ORG, assessment.assessmentId)).toBeNull();
  });

  test('locking a new version supersedes the previously locked one', async () => {
    const a1 = (await run(R1.revisionId)).assessment;
    await A.changeStatus(ORG, a1.assessmentId, 'under_review');
    await A.changeStatus(ORG, a1.assessmentId, 'locked');

    const a2 = (await run(R2.revisionId)).assessment;
    await A.changeStatus(ORG, a2.assessmentId, 'under_review');
    await A.changeStatus(ORG, a2.assessmentId, 'locked');

    const old = await A.getAssessment(ORG, a1.assessmentId);
    expect(old.status).toBe('superseded');
    expect(old.supersededBy).toBe(a2.assessmentId);
    // Only one locked assessment per policy-year.
    expect((await A.lockedFor(ORG, carPolicy.policyId, 2026)).assessmentId).toBe(a2.assessmentId);
  });

  test('re-submitting the same status is refused rather than silently accepted', async () => {
    const { assessment } = await run(R1.revisionId);
    await expect(A.changeStatus(ORG, assessment.assessmentId, 'draft')).rejects.toThrow(/already draft/);
  });
});

describe('Restatement', () => {
  async function lockedBaseline() {
    const a = (await run(R1.revisionId)).assessment;
    await A.changeStatus(ORG, a.assessmentId, 'under_review');
    await A.changeStatus(ORG, a.assessmentId, 'locked');
    return a;
  }

  test('a small movement against a locked figure is not a restatement', async () => {
    await lockedBaseline();
    const { assessment } = await run(R2.revisionId);
    expect(assessment.restatement.isRestatement).toBe(false);
    expect(Math.abs(assessment.restatement.deltaPct)).toBeLessThan(5);
    expect(assessment.restatement.note).toMatch(/below the 5% threshold/);
  });

  test('a material movement without a reason is refused', async () => {
    await lockedBaseline();
    // Dropping the whole BOQ moves the figure far enough to matter.
    const gutted = await boq.createRevision(ORG, negombo.projectId, {
      note: 'Scope corrected', materials: [fx.MATERIALS[0]], demolitionItems: [] });
    await expect(run(gutted.revisionId)).rejects.toThrow(/restatement reason is required/i);
  });

  test('a material movement with a reason is recorded as a restatement', async () => {
    const baseline = await lockedBaseline();
    const gutted = await boq.createRevision(ORG, negombo.projectId, {
      note: 'Scope corrected', materials: [fx.MATERIALS[0]], demolitionItems: [] });
    const { assessment } = await run(gutted.revisionId, {
      restatementReason: 'Demolition and fit-out were not in the insured contract.' });

    expect(assessment.restatement.isRestatement).toBe(true);
    expect(assessment.restatement.reason).toMatch(/not in the insured contract/);
    expect(assessment.restatement.supersedesAssessmentId).toBe(baseline.assessmentId);
    expect(assessment.restatement.previousValue).toBeCloseTo(15928.59, 1);
    expect(Math.abs(assessment.restatement.deltaPct)).toBeGreaterThanOrEqual(5);
  });

  test('the threshold comes from settings', async () => {
    await registry.saveSettings(ORG, { insurerName: 'X', reportingYear: 2026, restatementThresholdPct: 0.1 });
    await lockedBaseline();
    await expect(run(R2.revisionId)).rejects.toThrow(/restatement reason is required/i);
  });

  test('the first assessment for a policy-year has no restatement to make', async () => {
    expect((await run(R1.revisionId)).assessment.restatement).toBeNull();
  });
});

describe('Reporting year summary', () => {
  test('only locked assessments count toward the year', async () => {
    await run(R1.revisionId);                    // left as a draft
    let period = await A.yearSummary(ORG, 2026);
    expect(period.assessments.locked).toBe(0);
    expect(period.construction_kgCO2e).toBe(0);
    expect(period.coveragePct).toBe(0);

    const list = await A.listAssessments(ORG, { reportingYear: 2026 });
    await A.changeStatus(ORG, list[0].assessmentId, 'under_review');
    await A.changeStatus(ORG, list[0].assessmentId, 'locked');

    period = await A.yearSummary(ORG, 2026);
    expect(period.assessments.locked).toBe(1);
    expect(period.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(period.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
  });

  test('coverage reports how much of the book is assessed', async () => {
    const a = (await run(R1.revisionId)).assessment;
    await A.changeStatus(ORG, a.assessmentId, 'under_review');
    await A.changeStatus(ORG, a.assessmentId, 'locked');
    const period = await A.yearSummary(ORG, 2026);
    expect(period.policies).toBe(5);
    expect(period.coveragePct).toBeCloseTo(20, 0);
    expect(period.unassessedPolicies).toHaveLength(4);
  });

  test('data quality is weighted by emissions, not averaged', async () => {
    const a = (await run(R1.revisionId)).assessment;
    await A.changeStatus(ORG, a.assessmentId, 'under_review');
    await A.changeStatus(ORG, a.assessmentId, 'locked');
    const period = await A.yearSummary(ORG, 2026);
    // One locked assessment, so the weighted score is simply its own, and it
    // is reported at disclosure precision rather than raw floating point.
    expect(period.weightedDataQuality).toBe(a.dataQuality.score);
    expect(String(period.weightedDataQuality)).not.toMatch(/\d{6,}/);
    expect(period.note).toMatch(/never pooled before attribution/);
  });
});

describe('Assessment API', () => {
  async function seededProject() {
    const seed = await auth(request(app).post(`${B}/demo/seed`)).send({ force: true });
    if (seed.status !== 201) return null;
    const projects = await auth(request(app).get(`${B}/projects`));
    const pj = projects.body.projects.find(p => /Negombo/.test(p.name));
    const revs = await auth(request(app).get(`${B}/projects/${pj.projectId}/boq`));
    return { pj, revs: revs.body.revisions };
  }

  test('an assessment can be created, listed and fetched over HTTP', async () => {
    const s = await seededProject(); if (!s) return;
    const created = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: s.pj.projectId, policyId: s.pj.policies[0].policyId,
      boqRevisionId: s.revs[0].revisionId, siteInputs: SITE });
    expect(created.status).toBe(201);
    expect(created.body.assessment.status).toBe('draft');
    expect(created.body.assessment.boqRevisionLabel).toBe('R1');

    const list = await auth(request(app).get(`${B}/assessments?projectId=${s.pj.projectId}`));
    expect(list.body.summary.byStatus.draft).toBe(1);

    const one = await auth(request(app).get(`${B}/assessments/${created.body.assessment.assessmentId}`));
    expect(one.body.assessment.assessmentId).toBe(created.body.assessment.assessmentId);
  });

  test('the lifecycle is driven over HTTP and an illegal move is a 409', async () => {
    const s = await seededProject(); if (!s) return;
    const created = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: s.pj.projectId, policyId: s.pj.policies[0].policyId,
      boqRevisionId: s.revs[0].revisionId, siteInputs: SITE });
    const id = created.body.assessment.assessmentId;

    const bad = await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'locked' });
    expect(bad.status).toBe(409);
    expect(bad.body.error).toBe('ILLEGAL_TRANSITION');

    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'under_review' });
    const locked = await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'locked' });
    expect(locked.status).toBe(200);
    expect(locked.body.assessment.status).toBe('locked');
    expect(locked.body.assessment.lockedBy).toBeTruthy();
  });

  test('the period endpoint reports totals, coverage and weighted data quality', async () => {
    const s = await seededProject(); if (!s) return;
    const created = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: s.pj.projectId, policyId: s.pj.policies[0].policyId,
      boqRevisionId: s.revs[0].revisionId, siteInputs: SITE });
    const id = created.body.assessment.assessmentId;
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'under_review' });
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'locked' });

    const res = await auth(request(app).get(`${B}/periods/2026`));
    expect(res.status).toBe(200);
    expect(res.body.period.assessments.locked).toBe(1);
    expect(res.body.period.weightedDataQuality).toBeGreaterThan(0);
    expect(res.body.period.unassessedPolicies.length).toBeGreaterThan(0);
  });

  test('a missing BOQ revision is a 404', async () => {
    const s = await seededProject(); if (!s) return;
    const res = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: s.pj.projectId, policyId: s.pj.policies[0].policyId,
      boqRevisionId: 'boq_nope', siteInputs: SITE });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('REVISION_NOT_FOUND');
  });
});
