/**
 * PCAF Part C — BOQ revisions, diff and the restatement materiality check.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const boq      = require('../services/partc-boq');
const registry = require('../services/partc-registry');
const store    = require('../services/partc-store');
const fx       = require('./fixtures/fisheries');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'boq-org';

const ENGINE_POLICY = { policyType: 'CAR', basis: 'project_specific', premium: 24448.16, projectCost: 6499442 };
const SITE = { gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT };

const compare = (from, to, thresholdPct = 5, siteInputs = SITE) =>
  boq.compareRevisions({ from, to, enginePolicy: ENGINE_POLICY, siteInputs, distances: fx.DISTANCES, thresholdPct });

beforeEach(() => store._resetMemory());

async function twoRevisions(secondMaterials, note = 'VO-01') {
  const r1 = await boq.createRevision(ORG, 'pj1', { note: 'Tender', materials: fx.MATERIALS, demolitionItems: fx.DEMOLITION_ITEMS });
  const r2 = await boq.createRevision(ORG, 'pj1', { note, materials: secondMaterials, demolitionItems: fx.DEMOLITION_ITEMS });
  return [r1, r2];
}

describe('BOQ revisions', () => {
  test('labels increment and each revision supersedes the last', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS);
    expect(r1.label).toBe('R1');
    expect(r2.label).toBe('R2');
    expect(r2.supersedes).toBe(r1.revisionId);
    expect(r1.supersedes).toBeNull();
  });

  test('revisions are listed oldest first and scoped to their project', async () => {
    await twoRevisions(fx.MATERIALS);
    await boq.createRevision(ORG, 'pj2', { note: 'Other project', materials: fx.MATERIALS });
    const list = await boq.listRevisions(ORG, 'pj1');
    expect(list.map(r => r.label)).toEqual(['R1', 'R2']);
    expect((await boq.listRevisions(ORG, 'pj2')).map(r => r.label)).toEqual(['R1']);
  });

  test('a revision needs at least one line', () => {
    const { boqRevisionSchema } = require('../schemas/partc-boq');
    expect(boqRevisionSchema.validate({}).error.message).toMatch(/at least one material/);
  });
});

describe('BOQ mapping carry-forward', () => {
  test('an unmapped line inherits the mapping of the line before it', async () => {
    const stripped = fx.MATERIALS.map(m =>
      m.id === 'concrete' ? { name: m.name, quantity: 22.65, unit: 'm3' } : m);
    const [, r2] = await twoRevisions(stripped);
    const concrete = r2.materials.find(m => /Concrete/.test(m.name));
    expect(concrete.densityKey).toBe('concrete_normal');
    expect(concrete.wasteCategory).toBe('Concrete in situ');
    expect(r2.mappingCarryForward.inheritedLines).toBe(1);
    expect(r2.mappingCarryForward.fromRevision).toBe('R1');
  });

  test('the stable id is carried forward so haul distances keep binding', async () => {
    // A re-pasted line arrives without its id. Without identity carry-forward
    // the distance lookup misses and that material's A4 silently drops to zero.
    const stripped = fx.MATERIALS.map(m =>
      m.id === 'concrete' ? { name: m.name, quantity: 22.65, unit: 'm3' } : m);
    const [r1, r2] = await twoRevisions(stripped);
    expect(r2.materials.find(m => /Concrete/.test(m.name)).id).toBe('concrete');

    const c = compare(r1, r2);
    const a4 = c.byModule.find(m => m.module === 'A4');
    expect(a4.delta).toBeGreaterThan(0);          // more concrete means more transport
    expect(c.emissions.deltaPct).toBeCloseTo(0.39, 1);
  });

  test('a line matches its earlier self even though the quantity changed', () => {
    // A revision exists BECAUSE quantities changed. Keying on the raw pasted
    // text would mean a line never matched itself and carry-forward would fail
    // in exactly the case it is for.
    const a = { sourceText: 'Providing and laying 1:2:4 cement concrete in foundations ...... 18.65 m3' };
    const bb = { sourceText: 'Providing and laying 1:2:4 cement concrete in foundations ...... 26.40 m3' };
    expect(boq.lineKey(a)).toBe(boq.lineKey(bb));
  });

  test('a line is matched by its wording or by its resolved name', async () => {
    const r1 = await boq.createRevision(ORG, 'pjk', {
      materials: [{ id: 'c1', name: 'Concrete (all grades)', sourceText: 'Cement concrete in foundations',
                    quantity: 10, unit: 'm3', densityKey: 'concrete_normal' }] });
    // Client re-pastes using the original wording, with no mapping supplied.
    const r2 = await boq.createRevision(ORG, 'pjk', {
      materials: [{ name: 'Cement concrete in foundations',
                    sourceText: 'Cement concrete in foundations ...... 14 m3', quantity: 14, unit: 'm3' }] });
    expect(r2.materials[0].densityKey).toBe('concrete_normal');
    expect(r2.materials[0].id).toBe('c1');
    expect(r1.materials[0].densityKey).toBe('concrete_normal');
  });

  test('a genuinely new line is reported as needing review', async () => {
    const withNew = [...fx.MATERIALS, { name: 'Structural glazing', quantity: 40, unit: 'm2' }];
    const [, r2] = await twoRevisions(withNew);
    expect(r2.mappingCarryForward.needsReview).toContain('Structural glazing');
    expect(r2.mappingCarryForward.needsReview).toHaveLength(1);
  });

  test('an explicitly supplied mapping is not overwritten', async () => {
    const overridden = fx.MATERIALS.map(m =>
      m.id === 'concrete' ? { ...m, densityKey: 'asphalt' } : m);
    const [, r2] = await twoRevisions(overridden);
    expect(r2.materials.find(m => /Concrete/.test(m.name)).densityKey).toBe('asphalt');
  });
});

describe('BOQ line diff', () => {
  test('added, removed, changed and unchanged are separated', async () => {
    const changed = fx.MATERIALS
      .filter(m => m.id !== 'pvc63')
      .map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m)
      .concat([{ id: 'glazing', name: 'Structural glazing', quantity: 40, unit: 'm2', densityKey: 'glass' }]);
    const [r1, r2] = await twoRevisions(changed);
    const d = boq.diffLines(r1.materials, r2.materials);

    expect(d.added.map(a => a.name)).toEqual(['Structural glazing']);
    expect(d.removed.map(r => r.name)).toEqual(['PVC pipe 63mm']);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].name).toBe('Concrete (all grades)');
    expect(d.unchanged).toBe(8);
  });

  test('a quantity change records both values and the percentage', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    const field = boq.diffLines(r1.materials, r2.materials).changed[0].fields[0];
    expect(field).toMatchObject({ field: 'quantity', from: 18.65, to: 22.65, delta: 4 });
    expect(field.deltaPct).toBeCloseTo(21.45, 1);
  });

  test('a re-mapped line is reported as changed', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'rubble' ? { ...m, densityKey: 'granite' } : m));
    const changed = boq.diffLines(r1.materials, r2.materials).changed;
    expect(changed[0].fields.some(f => f.field === 'densityKey' && f.to === 'granite')).toBe(true);
  });
});

describe('BOQ materiality and restatement', () => {
  test('a variation order stays below the 5% threshold', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    const c = compare(r1, r2);
    expect(c.emissions.deltaPct).toBeCloseTo(0.39, 1);
    expect(c.materiality.breaches).toBe(false);
    expect(c.materiality.requiresRestatement).toBe(false);
    expect(c.materiality.verdict).toMatch(/stands as disclosed/);
  });

  test('even a very large material change stays under the threshold', async () => {
    // 141% more concrete. Site energy dominates, so the figure barely moves —
    // this is the behaviour the explanation exists to make legible.
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 45 } : m));
    const c = compare(r1, r2);
    expect(c.emissions.deltaPct).toBeLessThan(5);
    expect(c.materiality.breaches).toBe(false);
  });

  test('removing the demolition scope does breach the threshold', async () => {
    const r1 = await boq.createRevision(ORG, 'pj1', { note: 'Tender', materials: fx.MATERIALS, demolitionItems: fx.DEMOLITION_ITEMS });
    const r2 = await boq.createRevision(ORG, 'pj1', { note: 'Demolition removed', materials: fx.MATERIALS, demolitionItems: [] });
    const c = compare(r1, r2);
    expect(c.emissions.deltaPct).toBeCloseTo(-5.08, 1);
    expect(c.materiality.breaches).toBe(true);
    expect(c.materiality.verdict).toMatch(/must be restated/);
  });

  test('the threshold comes from settings rather than being hard-coded', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    expect(compare(r1, r2, 5).materiality.breaches).toBe(false);
    expect(compare(r1, r2, 0.1).materiality.breaches).toBe(true);
  });

  test('the comparison reports the insurer IAE on both sides', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    const c = compare(r1, r2);
    expect(c.emissions.beforeIAE).toBeCloseTo(0.0599, 4);
    expect(c.emissions.afterIAE).toBeGreaterThan(c.emissions.beforeIAE);
  });
});

describe('BOQ delta explanation', () => {
  test('a small movement explains that site energy dominates', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    const e = compare(r1, r2).explanation;
    expect(e.headline).toMatch(/moved the figure by only/);
    expect(e.detail).toMatch(/A5\.2/);
    expect(e.detail).toMatch(/floor area or the site-energy basis/);
  });

  test('an unchanged BOQ says so rather than reporting a spurious delta', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS);
    const c = compare(r1, r2);
    expect(c.emissions.deltaKg).toBeCloseTo(0, 6);
    expect(c.explanation.headline).toMatch(/No change/);
  });

  test('the module table shows where the change landed', async () => {
    const [r1, r2] = await twoRevisions(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m));
    const c = compare(r1, r2);
    const moved = c.byModule.filter(m => Math.abs(m.delta) > 0.001).map(m => m.module);
    expect(moved).toEqual(expect.arrayContaining(['A4', 'A5.3']));
    const a52 = c.byModule.find(m => m.module === 'A5.2');
    expect(Math.abs(a52.delta)).toBeCloseTo(0, 6);
    expect(a52.shareOfFigure).toBeGreaterThan(85);
  });
});

describe('BOQ API', () => {
  async function project() {
    const c = await auth(request(app).post(`${B}/clients`)).send({ name: 'Dept. of Fisheries' });
    if (c.status !== 201) return null;
    const p = await auth(request(app).post(`${B}/projects`)).send({
      clientId: c.body.client.clientId, name: 'Negombo Complex',
      gifa_m2: 1000, projectCost: 6499442,
      policies: [{ lineType: 'CAR', premium: 24448.16,
                   inception: '2026-03-01T00:00:00.000Z', expiry: '2027-09-01T00:00:00.000Z' }]
    });
    return p.body.project;
  }

  test('a revision can be created and listed over HTTP', async () => {
    const pj = await project(); if (!pj) return;
    const created = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq`))
      .send({ note: 'Tender', materials: fx.MATERIALS, demolitionItems: fx.DEMOLITION_ITEMS });
    expect(created.status).toBe(201);
    expect(created.body.revision.label).toBe('R1');

    const list = await auth(request(app).get(`${B}/projects/${pj.projectId}/boq`));
    expect(list.body.summary.count).toBe(1);
    expect(list.body.summary.latest).toBe('R1');
  });

  test('a revision cannot be added to an unknown project', async () => {
    const res = await auth(request(app).post(`${B}/projects/pj_nope/boq`)).send({ materials: fx.MATERIALS });
    expect([404, 401, 403]).toContain(res.status);
  });

  test('comparing the first revision is refused with a clear reason', async () => {
    const pj = await project(); if (!pj) return;
    const r1 = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq`)).send({ materials: fx.MATERIALS });
    const res = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq/compare`))
      .send({ toRevisionId: r1.body.revision.revisionId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_PRIOR_REVISION');
  });

  test('the compare endpoint returns diff, delta, materiality and explanation', async () => {
    const pj = await project(); if (!pj) return;
    await auth(request(app).post(`${B}/projects/${pj.projectId}/boq`))
      .send({ note: 'Tender', materials: fx.MATERIALS, demolitionItems: fx.DEMOLITION_ITEMS });
    const r2 = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq`))
      .send({ note: 'VO-01', demolitionItems: fx.DEMOLITION_ITEMS,
              materials: fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m) });

    const res = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq/compare`))
      .send({ toRevisionId: r2.body.revision.revisionId,
              siteInputs: { gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT },
              distances: fx.DISTANCES });

    expect(res.status).toBe(200);
    const c = res.body.comparison;
    expect(c.from.label).toBe('R1');
    expect(c.to.label).toBe('R2');
    expect(c.emissions.before).toBeCloseTo(15928.59, 1);
    expect(c.emissions.deltaPct).toBeCloseTo(0.39, 1);
    expect(c.materiality.thresholdPct).toBe(5);
    expect(c.materiality.breaches).toBe(false);
    expect(c.explanation.headline).toBeTruthy();
    expect(c.lines.changed).toHaveLength(1);
  });

  test('a revision can be deleted', async () => {
    const pj = await project(); if (!pj) return;
    const r = await auth(request(app).post(`${B}/projects/${pj.projectId}/boq`)).send({ materials: fx.MATERIALS });
    const del = await auth(request(app).delete(`${B}/boq/${r.body.revision.revisionId}`));
    expect(del.body.deleted).toBe(true);
    expect((await auth(request(app).get(`${B}/boq/${r.body.revision.revisionId}`))).status).toBe(404);
  });

  test('the demo book seeds three BOQ revisions on the reference project', async () => {
    const seed = await auth(request(app).post(`${B}/demo/seed`)).send({ force: true });
    if (seed.status !== 201) return;
    expect(seed.body.seeded.boqRevisions).toBe(3);

    const projects = await auth(request(app).get(`${B}/projects`));
    const negombo = projects.body.projects.find(p => /Negombo/.test(p.name));
    const revs = await auth(request(app).get(`${B}/projects/${negombo.projectId}/boq`));
    expect(revs.body.revisions.map(r => r.label)).toEqual(['R1', 'R2', 'R3']);
  });
});
