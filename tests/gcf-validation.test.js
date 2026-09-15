/**
 * The assessor's validation lifecycle — Phase 1 Stage 4.
 *
 * A different act from recording the project. The assessor rates each of the
 * six investment criteria in words, records a recommendation, and signs the
 * assessment off. Separation of duties is the point, so it is the `validate`
 * scope — the assessor's, and the administrator's through the ladder — and
 * the person who prepares a submission does not hold it.
 *
 * What is pinned:
 *   • the state machine: draft → under_review → validated, reopened back;
 *   • ratings are words (strong/adequate/weak) and an unknown one is refused;
 *   • a validated assessment cannot be validated without a recommendation, and
 *     its ratings are frozen until it is reopened;
 *   • every change is a dated, attributed history entry;
 *   • the shipped sample is refused, and the store round-trips the validation;
 *   • the POST route needs the `validate` scope — the dashboard key, which
 *     holds read/write/lock/assess and not validate, is refused;
 *   • an assessor-scoped key drives the lifecycle over the route (PostgreSQL).
 */

'use strict';

const app = require('../src/server');
const request = require('supertest');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const validation = require('../src/domains/gcf/domain/validation');
const { api, auth } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { testOnPostgres } = require('./helpers/store-mode');

const base = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects[0]));
const sampleId = () => require('../data/gcf/pipeline.seed.json').projects[0].id;

beforeEach(() => platformStore._resetMemory());

/* ── The state machine (pure) ─────────────────────────────────────────────── */

describe('the validation state machine', () => {
  test('a project with no validation reads as an empty draft', () => {
    const v = validation.current({});
    expect(v.state).toBe('draft');
    expect(v.ratings).toEqual({});
    expect(v.recommendation).toBeNull();
    expect(v.history).toEqual([]);
  });

  test('draft → under_review appends an attributed, dated history entry', () => {
    const v = validation.apply({}, { to: 'under_review' }, { by: 'Assessor A', at: '2026-09-15T10:00:00Z' });
    expect(v.state).toBe('under_review');
    expect(v.history).toHaveLength(1);
    expect(v.history[0]).toMatchObject({ from: 'draft', to: 'under_review', by: 'Assessor A', at: '2026-09-15T10:00:00Z' });
  });

  test('a rating is recorded in words', () => {
    let v = validation.apply({}, { to: 'under_review' }, { by: 'A' });
    v = validation.apply({ validation: v }, { ratings: { impactPotential: { rating: 'strong', note: 'clear MCI-1' } } }, { by: 'A' });
    expect(v.ratings.impactPotential.rating).toBe('strong');
    expect(v.ratings.impactPotential.note).toBe('clear MCI-1');
  });

  test('an unknown criterion and a bad rating are both refused', () => {
    expect(() => validation.apply({}, { ratings: { notACriterion: { rating: 'strong' } } })).toThrow(/UNKNOWN_CRITERION|criteria/i);
    expect(() => validation.apply({}, { ratings: { impactPotential: { rating: 'excellent' } } })).toThrow(/INVALID_RATING|strong|adequate|weak/i);
  });

  test('validating without a recommendation is refused', () => {
    const v = validation.apply({}, { to: 'under_review' }, { by: 'A' });
    expect(() => validation.apply({ validation: v }, { to: 'validated' }, { by: 'A' })).toThrow(/RECOMMENDATION_REQUIRED|recommendation/i);
  });

  test('validating with a recommendation records the sign-off', () => {
    let v = validation.apply({}, { to: 'under_review' }, { by: 'A' });
    v = validation.apply({ validation: v }, { to: 'validated', recommendation: 'recommend' }, { by: 'Assessor A', at: '2026-09-15T11:00:00Z' });
    expect(v.state).toBe('validated');
    expect(v.recommendation).toBe('recommend');
    expect(v.validatedBy).toBe('Assessor A');
    expect(v.validatedAt).toBe('2026-09-15T11:00:00Z');
  });

  test('a validated assessment has frozen ratings until it is reopened', () => {
    let v = validation.apply({}, { to: 'under_review' }, { by: 'A' });
    v = validation.apply({ validation: v }, { to: 'validated', recommendation: 'recommend' }, { by: 'A' });
    expect(() => validation.apply({ validation: v }, { ratings: { impactPotential: { rating: 'weak' } } }, { by: 'A' }))
      .toThrow(/cannot be edited in place/i);
    /* Reopening clears the current sign-off — a reopened assessment is not validated. */
    const re = validation.apply({ validation: v }, { to: 'under_review', note: 'new BOQ' }, { by: 'A' });
    expect(re.state).toBe('under_review');
    expect(re.validatedBy).toBeNull();
    expect(re.validatedAt).toBeNull();
  });

  test('an illegal transition is refused with the moves that are legal', () => {
    expect(() => validation.apply({}, { to: 'validated', recommendation: 'recommend' }, { by: 'A' }))
      .toThrow(/INVALID_VALIDATION_TRANSITION|cannot move/i);
  });
});

/* ── The store ────────────────────────────────────────────────────────────── */

describe('the validation store', () => {
  test('a recorded project round-trips its validation, attributed', async () => {
    const p = { ...base(), id: 'gcf_val_store' };
    await gcf.put('ui', p, { by: 'Analyst' });
    await gcf.setValidation('ui', 'gcf_val_store', { to: 'under_review' }, { by: 'Assessor A' });
    const got = await gcf.get('ui', 'gcf_val_store');
    expect(got.project.validation.state).toBe('under_review');
    expect(got.project.validation.history[0].by).toBe('Assessor A');
    expect(got.project.validation.updatedBy).toBe('Assessor A');
  });

  test('the shipped illustrative sample is refused', async () => {
    await expect(gcf.setValidation('ui', sampleId(), { to: 'under_review' }, { by: 'A' }))
      .rejects.toMatchObject({ code: 'SAMPLE_NOT_EDITABLE' });
  });
});

/* ── The routes ───────────────────────────────────────────────────────────── */

describe('the validation route', () => {
  test('GET returns the validation beside the six-criteria evidence', async () => {
    await gcf.put('ui', { ...base(), id: 'gcf_val_get' }, { by: 'Analyst' });
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_val_get/validation')).expect(200)).body;
    expect(r.validation.state).toBe('draft');
    expect(Array.isArray(r.criteria.criteria)).toBe(true);
    expect(r.criteria.criteria).toHaveLength(6);
  });

  test('the dashboard key holds no validate scope, so POST is refused naming it', async () => {
    await gcf.put('ui', { ...base(), id: 'gcf_val_scope' }, { by: 'Analyst' });
    const res = await auth(api().post('/v1/gcf/pipeline/gcf_val_scope/validation'))
      .send({ to: 'under_review' }).expect(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
    expect(res.body.required).toBe('validate');
  });

  testOnPostgres('an assessor-scoped key drives the lifecycle to a signed-off validation', async () => {
    const orgId = `gcfval-${Date.now()}`;
    const { key } = await issueKey({ orgId, keyName: 'assessor key', scopes: ['read', 'validate'] });
    // Record the project with a write-capable key first — the assessor does not write the book.
    const writer = await issueKey({ orgId, keyName: 'analyst key', scopes: ['read', 'write'] });
    await request(app).post('/v1/gcf/pipeline').set('x-api-key', writer.key)
      .send({ ...base(), id: 'gcf_val_pg' }).expect(201);

    const start = await request(app).post('/v1/gcf/pipeline/gcf_val_pg/validation')
      .set('x-api-key', key).send({ to: 'under_review' }).expect(200);
    expect(start.body.validation.state).toBe('under_review');

    const done = await request(app).post('/v1/gcf/pipeline/gcf_val_pg/validation')
      .set('x-api-key', key)
      .send({ to: 'validated', ratings: { impactPotential: { rating: 'strong' } }, recommendation: 'recommend_with_conditions' })
      .expect(200);
    expect(done.body.validation.state).toBe('validated');
    expect(done.body.validation.recommendation).toBe('recommend_with_conditions');
    expect(done.body.validation.ratings.impactPotential.rating).toBe('strong');
  });

  testOnPostgres('an assessor key cannot write the book — the record stays the analyst\'s', async () => {
    const orgId = `gcfval2-${Date.now()}`;
    const { key } = await issueKey({ orgId, keyName: 'assessor key', scopes: ['read', 'validate'] });
    const res = await request(app).post('/v1/gcf/pipeline').set('x-api-key', key)
      .send({ ...base(), id: 'gcf_val_nowrite' }).expect(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
    expect(res.body.required).toBe('write');
  });
});
