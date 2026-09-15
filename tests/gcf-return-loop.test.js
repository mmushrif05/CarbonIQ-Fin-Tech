/**
 * The return-to-sponsor loop — Phase 1 Stage 6.
 *
 * When an assessor signs off with conditions, or against a project, the sponsor
 * gets it back with a gap list, a return letter and — after resubmitting — a
 * comparison against the version that was returned.
 *
 * What is pinned:
 *   • the gap list is drawn from the assessment (unheld evidence + weak
 *     ratings), each gap with a remedy;
 *   • a return cannot be made on a clean recommendation or an unvalidated one;
 *   • recording a return snapshots the gaps, and the comparison then sorts
 *     today's gaps into resolved / outstanding / newly-raised;
 *   • the POST return needs the validate scope; the sample is refused;
 *   • the return letter is a well-formed PDF and serves in every format.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const v = require('../src/domains/gcf/domain/validation');
const rl = require('../src/domains/gcf/domain/return-loop');
const letter = require('../src/domains/gcf/application/return-letter');
const { api, auth } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { testOnPostgres } = require('./helpers/store-mode');

const base = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects[1]));

/** A project validated with conditions and one weak rating. */
function returnable(id) {
  const p = { ...base(), id };
  let val = v.apply(p, { to: 'under_review' }, { by: 'Assessor A' });
  val = v.apply({ validation: val }, {
    to: 'validated', ratings: { paradigmShift: { rating: 'weak', note: 'no M&E plan' } },
    recommendation: 'recommend_with_conditions',
  }, { by: 'Assessor A', at: '2026-09-15T11:00:00Z' });
  p.validation = val;
  return p;
}

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

beforeEach(() => platformStore._resetMemory());

describe('the gap list and comparison', () => {
  test('gaps are drawn from the assessment, each with a remedy', () => {
    const g = rl.gaps(returnable('gcf_rl_gaps'));
    expect(g.count).toBeGreaterThan(0);
    expect(g.returnable).toBe(true);
    const weak = g.items.find(x => x.kind === 'rating' && x.criterionId === 'paradigmShift');
    expect(weak).toBeTruthy();
    expect(weak.remedy).toMatch(/strengthen/i);
    expect(g.items.every(x => x.remedy && x.remedy.length > 0)).toBe(true);
  });

  test('a clean recommendation is not returnable', () => {
    const p = { ...base(), id: 'gcf_rl_clean' };
    let val = v.apply(p, { to: 'under_review' }, { by: 'A' });
    val = v.apply({ validation: val }, { to: 'validated', recommendation: 'recommend' }, { by: 'A' });
    p.validation = val;
    expect(rl.gaps(p).returnable).toBe(false);
  });

  test('with no return there is nothing to compare', () => {
    const c = rl.comparison(returnable('gcf_rl_nocmp'));
    expect(c.hasReturn).toBe(false);
    expect(c.resolved).toEqual([]);
  });

  test('after a return, a resolved gap moves out of outstanding', () => {
    const p = returnable('gcf_rl_cmp');
    p.validation.returns = [rl.snapshot(p, { by: 'Assessor A' })];
    const before = rl.comparison(p);
    expect(before.hasReturn).toBe(true);
    expect(before.outstanding.length).toBe(rl.gaps(p).count);
    expect(before.resolved).toEqual([]);

    /* The sponsor strengthens the weak criterion — that gap should resolve. */
    p.validation.ratings.paradigmShift = { rating: 'strong' };
    const after = rl.comparison(p);
    expect(after.resolved.some(x => x.criterionId === 'paradigmShift' && x.kind === 'rating')).toBe(true);
    expect(after.outstanding.some(x => x.criterionId === 'paradigmShift' && x.kind === 'rating')).toBe(false);
  });
});

describe('the return store', () => {
  test('a returnable assessment records a return snapshot', async () => {
    await gcf.put('ui', returnable('gcf_rl_store'), { by: 'Analyst' });
    const saved = await gcf.returnToSponsor('ui', 'gcf_rl_store', { by: 'Assessor A' });
    expect(saved.validation.returns).toHaveLength(1);
    expect(saved.validation.returns[0].by).toBe('Assessor A');
    expect(saved.validation.returns[0].gaps.length).toBeGreaterThan(0);
  });

  test('a clean recommendation cannot be returned', async () => {
    const p = { ...base(), id: 'gcf_rl_clean_store' };
    let val = v.apply(p, { to: 'under_review' }, { by: 'A' });
    val = v.apply({ validation: val }, { to: 'validated', recommendation: 'recommend' }, { by: 'A' });
    p.validation = val;
    await gcf.put('ui', p, { by: 'Analyst' });
    await expect(gcf.returnToSponsor('ui', 'gcf_rl_clean_store', { by: 'A' }))
      .rejects.toMatchObject({ code: 'NOTHING_TO_RETURN' });
  });

  test('the shipped sample is refused', async () => {
    const sampleId = require('../data/gcf/pipeline.seed.json').projects[0].id;
    await expect(gcf.returnToSponsor('ui', sampleId, { by: 'A' }))
      .rejects.toMatchObject({ code: 'SAMPLE_NOT_EDITABLE' });
  });
});

describe('the return routes', () => {
  test('GET return carries the gaps and the comparison', async () => {
    await gcf.put('ui', returnable('gcf_rl_get'), { by: 'Analyst' });
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_rl_get/return')).expect(200)).body;
    expect(r.gaps.returnable).toBe(true);
    expect(r.comparison.hasReturn).toBe(false);
  });

  test('the dashboard key cannot POST a return — it holds no validate scope', async () => {
    await gcf.put('ui', returnable('gcf_rl_scope'), { by: 'Analyst' });
    const res = await auth(api().post('/v1/gcf/pipeline/gcf_rl_scope/return')).send({}).expect(403);
    expect(res.body.required).toBe('validate');
  });

  test('the return letter is a well-formed PDF and serves in every format', async () => {
    await gcf.put('ui', returnable('gcf_rl_letter'), { by: 'Analyst' });
    const json = (await auth(api().get('/v1/gcf/pipeline/gcf_rl_letter/return-letter')).expect(200)).body;
    expect(json.letter.gapCount).toBeGreaterThan(0);
    expect(json.letter.recommendationLabel).toBe('Recommend with conditions');
    const buf = await collect(letter.letterPDF(returnable('gcf_rl_letter')));
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  testOnPostgres('an assessor-scoped key records a return over the route', async () => {
    const orgId = `gcfret-${Date.now()}`;
    const assessor = await issueKey({ orgId, keyName: 'assessor', scopes: ['read', 'validate'] });
    const writer = await issueKey({ orgId, keyName: 'analyst', scopes: ['read', 'write'] });
    await request(app).post('/v1/gcf/pipeline').set('x-api-key', writer.key).send(returnable('gcf_rl_pg')).expect(201);
    const res = await request(app).post('/v1/gcf/pipeline/gcf_rl_pg/return').set('x-api-key', assessor.key).send({}).expect(200);
    expect(res.body.project.validation.returns).toHaveLength(1);
    expect(res.body.gaps.count).toBeGreaterThan(0);
  });
});
