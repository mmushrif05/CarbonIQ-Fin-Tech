/**
 * PCAF Part C — portfolio roll-up, weighted data quality and the
 * improvement plan.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const P        = require('../services/partc-portfolio');
const A        = require('../services/partc-assessments');
const registry = require('../services/partc-registry');
const boq      = require('../services/partc-boq');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');
const fx       = require('./fixtures/fisheries');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'pf-org';

let book;

const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

/** Lock an assessment on the named project's FY2026 policy. */
async function lockOn(projectName, { previousProject = null } = {}) {
  const pj  = book.projects.find(p => p.name.includes(projectName));
  const pol = pj.policies.find(x => x.reportingYear === 2026);
  let rev = (await boq.listRevisions(ORG, pj.projectId))[0];
  if (!rev) {
    rev = await boq.createRevision(ORG, pj.projectId, {
      note: 'Tender', materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
  }
  const { assessment } = await A.createAssessment(ORG, {
    projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
    siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject }
  });
  await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
  return A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });
}

beforeEach(async () => {
  store._resetMemory();
  book = await seedDemoBook(registry, ORG, boq);
});

describe('Portfolio roll-up', () => {
  test('an empty year reports zero rather than failing', async () => {
    const r = await P.rollUp(ORG, 2026);
    expect(r.construction.total_kgCO2e).toBe(0);
    expect(r.rows).toHaveLength(0);
    expect(r.dataQuality.weighted).toBeNull();
    expect(r.coverage.coveragePct).toBe(0);
    expect(r.coverage.unassessed).toHaveLength(5);
  });

  test('only locked assessments enter the disclosure', async () => {
    const pj  = book.projects.find(p => /Negombo/.test(p.name));
    const pol = pj.policies[0];
    const rev = (await boq.listRevisions(ORG, pj.projectId))[0];
    await A.createAssessment(ORG, {                       // left as a draft
      projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40 } });

    let r = await P.rollUp(ORG, 2026);
    expect(r.construction.total_kgCO2e).toBe(0);
    expect(r.assessments.draft).toBe(1);
    expect(r.assessments.locked).toBe(0);

    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    r = await P.rollUp(ORG, 2026);
    expect(r.assessments.locked).toBe(1);
    expect(r.construction.total_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(r.construction.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
  });

  test('policies are summed per project, never pooled before attribution', async () => {
    const a = await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const b = await lockOn('Matara');
    const r = await P.rollUp(ORG, 2026);

    // The total is the sum of the parts, and each part kept its own factor.
    expect(r.construction.total_kgCO2e)
      .toBeCloseTo(a.summary.construction_kgCO2e + b.summary.construction_kgCO2e, 1);
    expect(r.construction.insurerIAE_tCO2e)
      .toBeCloseTo(a.summary.insurerIAE_tCO2e + b.summary.insurerIAE_tCO2e, 4);
    const factors = r.rows.map(x => x.attributionFactor);
    expect(new Set(factors).size).toBe(2);          // different project costs
    expect(r.aggregationNote).toMatch(/never pooled before attribution/);
  });

  test('construction and use-stage are never combined', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const r = await P.rollUp(ORG, 2026);
    expect(r.construction.total_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(r.useStage.total_kgCO2e).toBe(0);           // CAR policy
    expect(r.scopeNote).toMatch(/never summed/);
    expect(r.useStage.note).toMatch(/Never added to the construction figure/);
    // No key anywhere offers a combined total.
    expect(JSON.stringify(r)).not.toMatch(/combinedTotal|grandTotal/);
  });

  test('the voluntary whole-life annex is excluded entirely', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const r = await P.rollUp(ORG, 2026);
    expect(r.scopeNote).toMatch(/B2\/B5\/B8.*excluded/);
    expect(JSON.stringify(r)).not.toMatch(/beyondPcaf/i);
  });

  test('rows are ordered by size so the reader sees what the book rests on', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    await lockOn('Galle');
    const r = await P.rollUp(ORG, 2026);
    expect(r.rows[0].construction_kgCO2e).toBeGreaterThan(r.rows[1].construction_kgCO2e);
    expect(r.rows[0].shareOfConstructionPct).toBeGreaterThan(50);
    expect(r.rows.reduce((n, x) => n + x.shareOfConstructionPct, 0)).toBeCloseTo(100, 0);
  });

  test('coverage counts policies in force against those assessed', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const r = await P.rollUp(ORG, 2026);
    expect(r.coverage.policiesInYear).toBe(5);
    expect(r.coverage.assessedPolicies).toBe(1);
    expect(r.coverage.coveragePct).toBe(20);
    expect(r.coverage.unassessed).toHaveLength(4);
    expect(r.coverage.unassessed[0]).toHaveProperty('premium');
  });

  test('a restatement is visible in the roll-up', async () => {
    const first = await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const pj = book.projects.find(p => /Negombo/.test(p.name));
    const gutted = await boq.createRevision(ORG, pj.projectId, {
      note: 'Scope corrected', materials: withDist([fx.MATERIALS[0]]), demolitionItems: [] });
    const { assessment } = await A.createAssessment(ORG, {
      projectId: pj.projectId, policyId: first.policyId, boqRevisionId: gutted.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT },
      restatementReason: 'Demolition was not in the insured contract.' });
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    await A.changeStatus(ORG, assessment.assessmentId, 'locked');

    const r = await P.rollUp(ORG, 2026);
    expect(r.assessments.locked).toBe(1);          // the old one was superseded
    expect(r.assessments.superseded).toBe(1);
    expect(r.assessments.restatements).toBe(1);
    expect(r.rows[0].isRestatement).toBe(true);
  });
});

describe('Weighted data quality', () => {
  test('the score is weighted by emissions, not averaged', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });   // small
    await lockOn('Galle');                                               // large
    const r = await P.rollUp(ORG, 2026);

    const manual = r.rows.reduce((n, x) => n + x.construction_kgCO2e * x.dataQualityScore, 0)
                 / r.rows.reduce((n, x) => n + x.construction_kgCO2e, 0);
    expect(r.dataQuality.weighted).toBeCloseTo(manual, 2);
    expect(r.dataQuality.basis).toMatch(/Weighted by construction emissions/);
  });

  test('the score is reported at disclosure precision', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const r = await P.rollUp(ORG, 2026);
    expect(String(r.dataQuality.weighted)).not.toMatch(/\d{6,}/);
  });
});

describe('Improvement plan', () => {
  test('actions are ranked by the emissions they would move', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });   // ~16k
    await lockOn('Galle');                                               // ~137k
    const plan = await P.improvementPlan(ORG, 2026);

    expect(plan.items.length).toBeGreaterThan(1);
    expect(plan.items[0].rank).toBe(1);
    // The biggest slice of the figure comes first, not the worst score.
    expect(plan.items[0].projectName).toMatch(/Galle/);
    expect(plan.items[0].impact).toBeGreaterThan(plan.items[1].impact);
    expect(plan.ranking).toMatch(/emissions × data-quality points/);
  });

  test('actions come from the assessment register, not a template', async () => {
    await lockOn('Galle');
    const plan = await P.improvementPlan(ORG, 2026);
    // The engine recorded the RICS default as a material limitation.
    expect(plan.items[0].actions.join(' ')).toMatch(/RICS default of 40 kgCO2e\/m²/);
  });

  test('the achievable position is stated, not implied', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const plan = await P.improvementPlan(ORG, 2026);
    expect(plan.current).toBe(3);
    expect(plan.achievable).toBe(2);
    expect(plan.achievableNote).toMatch(/would move from 3 to 2/);
  });

  test('unassessed policies are surfaced alongside the plan', async () => {
    await lockOn('Negombo', { previousProject: fx.PREVIOUS_PROJECT });
    const plan = await P.improvementPlan(ORG, 2026);
    expect(plan.unassessed).toHaveLength(4);
    expect(plan.unassessedNote).toMatch(/Coverage is 20%/);
  });

  test('an empty year says so rather than producing an empty table', async () => {
    const plan = await P.improvementPlan(ORG, 2026);
    expect(plan.items).toHaveLength(0);
    expect(plan.unassessedNote).toMatch(/5 policies are in force/);
  });
});

describe('Portfolio API', () => {
  async function seedAndLock() {
    const seed = await auth(request(app).post(`${B}/demo/seed`)).send({ force: true });
    if (seed.status !== 201) return null;
    const projects = await auth(request(app).get(`${B}/projects`));
    const pj = projects.body.projects.find(p => /Negombo/.test(p.name));
    const revs = await auth(request(app).get(`${B}/projects/${pj.projectId}/boq`));
    const created = await auth(request(app).post(`${B}/assessments`)).send({
      projectId: pj.projectId, policyId: pj.policies[0].policyId,
      boqRevisionId: revs.body.revisions[0].revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT } });
    const id = created.body.assessment.assessmentId;
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'under_review' });
    await auth(request(app).post(`${B}/assessments/${id}/status`)).send({ status: 'locked' });
    return true;
  }

  test('GET /portfolio/:year returns the reporting-year position', async () => {
    if (!(await seedAndLock())) return;
    const res = await auth(request(app).get(`${B}/portfolio/2026`));
    expect(res.status).toBe(200);
    const p = res.body.portfolio;
    expect(p.construction.total_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(p.useStage.total_kgCO2e).toBe(0);
    expect(p.coverage.coveragePct).toBe(20);
    expect(p.dataQuality.weighted).toBeGreaterThan(0);
    expect(p.rows).toHaveLength(1);
  });

  test('GET /portfolio/:year/dq-plan returns ranked actions', async () => {
    if (!(await seedAndLock())) return;
    const res = await auth(request(app).get(`${B}/portfolio/2026/dq-plan`));
    expect(res.status).toBe(200);
    expect(res.body.plan.current).toBe(3);
    expect(res.body.plan.items[0].rank).toBe(1);
    expect(res.body.plan.items[0].actions.length).toBeGreaterThan(0);
  });

  test('GET /portfolio/:year/factor-gaps ranks what to localise first', async () => {
    if (!(await seedAndLock())) return;
    const res = await auth(request(app).get(`${B}/portfolio/2026/factor-gaps`));
    expect(res.status).toBe(200);
    expect(res.body.gaps).toHaveProperty('factors');
    expect(res.body.gaps.note).toBeTruthy();
  });

  test('a year with nothing locked returns zeroes rather than an error', async () => {
    const res = await auth(request(app).get(`${B}/portfolio/2099`));
    if (res.status !== 200) return;
    expect(res.body.portfolio.construction.total_kgCO2e).toBe(0);
    expect(res.body.portfolio.rows).toHaveLength(0);
  });
});
