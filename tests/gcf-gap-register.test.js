/**
 * The gap register — what is blocking each project, and who holds the key.
 *
 * What is pinned:
 *   • every item is one an engine raised, with its source, clause, remedy and
 *     an owner from the closed vocabulary — nothing is judged afresh;
 *   • every readiness requirement names an owner, so a gap can always be
 *     grouped by who closes it;
 *   • an owner outside the vocabulary is refused at construction;
 *   • a fact recorded on the project closes its gap on the next read;
 *   • an unsigned assessment is the assessor's gap; a criterion the assessor
 *     rated weak is the sponsor's;
 *   • the two horizons — now and next — are counted apart, and the owner view
 *     partitions the now items;
 *   • the register is served over HTTP and needs a key.
 */

'use strict';

const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const gaps = require('../src/domains/gcf/domain/gaps');
const readiness = require('../src/domains/gcf/domain/readiness');
const validation = require('../src/domains/gcf/domain/validation');
const { api, auth } = require('./helpers/api');

const NOW = '2026-09-14T00:00:00.000Z';
const starter = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects));
const seed = () => gcf.seedProjects();

/** A project whose assessment an assessor has signed off, optionally rating one criterion weak. */
function signed(p, { weak = null, recommendation = 'recommend' } = {}) {
  let v = validation.apply(p, { to: 'under_review' }, { by: 'Assessor A', at: '2026-09-15T10:00:00Z' });
  const ratings = { impactPotential: { rating: 'strong' } };
  if (weak) ratings[weak] = { rating: 'weak', note: 'Thin evidence.' };
  v = validation.apply({ validation: v }, { to: 'validated', ratings, recommendation }, { by: 'Assessor A', at: '2026-09-15T11:00:00Z' });
  return { ...p, validation: v };
}

beforeEach(() => platformStore._resetMemory());

describe('The register is composed, never judged', () => {
  test('every item names its source, its clause, its remedy and an owner from the vocabulary', () => {
    const reg = gaps.register(seed(), { now: NOW });
    const all = reg.byProject.flatMap(p => p.items);
    expect(all.length).toBeGreaterThan(0);
    for (const i of all) {
      expect(gaps.SOURCES).toContain(i.source);
      expect(gaps.HORIZONS).toContain(i.horizon);
      expect(gaps.OWNER_IDS).toContain(i.owner);
      expect(i.ownerLabel).toBe(gaps.OWNERS[i.owner].label);
      expect(typeof i.clause).toBe('string');
      expect(i.clause.length).toBeGreaterThan(0);
      expect(i.remedy.length).toBeGreaterThan(0);
      expect(['missing', 'partial', 'absent']).toContain(i.status);
    }
  });

  test('every readiness item on the register is one readiness itself raised', () => {
    for (const p of seed()) {
      const mine = gaps.projectGaps(p, { now: NOW }).items.filter(i => i.source === 'readiness' && i.horizon === 'now');
      const raised = readiness.assess(p, { now: NOW }).blockers.map(b => b.id);
      expect(mine.map(i => i.id).sort()).toEqual(raised.sort());
    }
  });

  test('every readiness requirement names an owner from the vocabulary', () => {
    for (const r of readiness.REQUIREMENTS) expect(gaps.OWNER_IDS).toContain(r.owner);
  });

  test('an owner outside the vocabulary is refused at construction', () => {
    expect(() => gaps.item({ source: 'readiness', horizon: 'now', id: 'x', what: 'x', clause: 'x', remedy: 'x', status: 'missing', owner: 'somebody' }))
      .toThrow(/outside the vocabulary/);
    expect(() => gaps.item({ source: 'guess', horizon: 'now', id: 'x', what: 'x', clause: 'x', remedy: 'x', status: 'missing', owner: 'dfcc' }))
      .toThrow(/source/);
    expect(() => gaps.item({ source: 'readiness', horizon: 'now', id: 'x', what: 'x', clause: 'x', remedy: '', status: 'missing', owner: 'dfcc' }))
      .toThrow(/remedy/);
  });

  test('a fact recorded on the project closes its gap on the next read', () => {
    const p = starter()[0];
    const before = gaps.projectGaps(p, { now: NOW });
    expect(before.items.some(i => i.id === 'ndc_alignment')).toBe(true);
    const after = gaps.projectGaps({ ...p, ndcSectorTargets: ['energy'] }, { now: NOW });
    expect(after.items.some(i => i.id === 'ndc_alignment')).toBe(false);
    expect(after.now).toBe(before.now - 1);
  });

  test('an unsigned assessment is the assessor’s gap, and a signed one is not', () => {
    const p = starter()[0];
    const draft = gaps.projectGaps(p, { now: NOW }).items.find(i => i.source === 'assessment');
    expect(draft).toMatchObject({ owner: 'assessor', horizon: 'now', id: 'assessment_unsigned' });
    expect(draft.what).toMatch(/draft/i);
    const done = gaps.projectGaps(signed(p), { now: NOW }).items.filter(i => i.source === 'assessment');
    expect(done).toEqual([]);
  });

  test('a criterion the assessor rated weak returns to the sponsor', () => {
    const p = signed(starter()[0], { weak: 'paradigmShift', recommendation: 'recommend_with_conditions' });
    const items = gaps.projectGaps(p, { now: NOW }).items.filter(i => i.source === 'return');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ owner: 'sponsor', id: 'rating.paradigmShift' });
    expect(items[0].what).toMatch(/weak/);
  });

  test('the criteria the register reads are only those no stage requirement asks for', () => {
    const asked = new Set(readiness.REQUIREMENTS.map(r => r.id));
    for (const sub of Object.keys(gaps.CRITERIA_OWNER)) expect(asked.has(sub)).toBe(false);
  });

  test('now and next are counted apart, and next never enters the headline', () => {
    const reg = gaps.register(seed(), { now: NOW });
    for (const p of reg.byProject) {
      expect(p.now).toBe(p.items.filter(i => i.horizon === 'now').length);
      expect(p.next).toBe(p.items.filter(i => i.horizon === 'next').length);
    }
    expect(reg.totals.project).toBe(reg.byProject.reduce((s, p) => s + p.now, 0));
    expect(reg.totals.next).toBe(reg.byProject.reduce((s, p) => s + p.next, 0));
    expect(reg.totals.now).toBe(reg.totals.project + reg.totals.entity);
  });

  test('the owner view partitions the now items', () => {
    const reg = gaps.register(seed(), { now: NOW, entityGaps: [{ path: 'governance.oversight', what: 'Board oversight', standardRef: 'SLFRS S2 §6(a)' }] });
    expect(reg.byOwner.reduce((s, o) => s + o.now, 0)).toBe(reg.totals.now);
    expect(reg.byOwner.map(o => o.owner).sort()).toEqual([...gaps.OWNER_IDS].sort());
    expect(reg.byOwner[0].now).toBeGreaterThanOrEqual(reg.byOwner[reg.byOwner.length - 1].now);
  });

  test('projects are ordered furthest along first', () => {
    const reg = gaps.register(seed(), { now: NOW });
    const cycles = reg.byProject.map(p => p.cycle);
    expect(cycles).toEqual([...cycles].sort((a, b) => b - a));
  });

  test('the entity’s own absences are the bank’s, counted apart from the projects', () => {
    const reg = gaps.register(seed(), { now: NOW, entityGaps: [
      { path: 'governance.oversight', what: 'Board oversight', standardRef: 'SLFRS S2 §6(a)' },
      { path: 'basis.entity', what: 'The reporting entity', standardRef: null },
    ] });
    expect(reg.entity.count).toBe(2);
    const withInventory = gaps.register(seed(), { now: NOW, entityGaps: [
      { path: 'governance.oversight', status: 'not_provided', what: 'Board oversight', standardRef: 'SLFRS S2 §6(a)' },
      { path: 'metricsAndTargets.inventory.scope1', status: 'not_measured', what: 'Absolute gross scope 1 emissions', standardRef: 'SLFRS S2 §29(a)(i)' },
    ] });
    expect(withInventory.entity.count).toBe(1);
    expect(withInventory.entity.items[0].id).toBe('governance.oversight');
    expect(reg.entity.items.every(i => i.owner === 'dfcc' && i.source === 'disclosure')).toBe(true);
    expect(reg.entity.items[1].clause).toBe('SLFRS S2');
    expect(reg.byOwner.find(o => o.owner === 'dfcc').entity).toBe(2);
  });
});

describe('Over HTTP', () => {
  test('the register is served with its source, and an entity fact closes its gap', async () => {
    const before = (await auth(api().get('/v1/gcf/gaps')).expect(200)).body;
    expect(before.source).toBe('seed');
    expect(before.sample).toBe(true);
    expect(before.register.byOwner.length).toBe(gaps.OWNER_IDS.length);
    expect(before.register.entity.count).toBeGreaterThan(0);
    expect(before.register.entity.items.some(i => i.id === 'governance.oversight')).toBe(true);

    await auth(api().put('/v1/gcf/entity')).send({
      entityName: 'DFCC Bank PLC',
      climateGovernance: 'The Board Integrated Risk Management Committee reviews climate matters quarterly.',
    }).expect(200);
    const after = (await auth(api().get('/v1/gcf/gaps')).expect(200)).body;
    expect(after.register.entity.items.some(i => i.id === 'governance.oversight')).toBe(false);
    expect(after.register.entity.count).toBe(before.register.entity.count - 2);
  });

  test('a recorded book replaces the sample in the register entirely', async () => {
    await gcf.installStarter('ui', { by: 'Analyst' });
    const r = (await auth(api().get('/v1/gcf/gaps')).expect(200)).body;
    expect(r.source).toBe('recorded');
    expect(r.register.byProject.map(p => p.id).sort()).toEqual(starter().map(p => p.id).sort());
  });

  test('the register needs a key', async () => {
    await api().get('/v1/gcf/gaps').expect(401);
  });
});
