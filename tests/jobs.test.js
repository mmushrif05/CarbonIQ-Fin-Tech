/**
 * E4 — the job queue.
 *
 * In memory the queue is inline: a job runs inside the request that
 * enqueued it, and the response says so. On PostgreSQL it is the `jobs`
 * table: enqueue answers 202 with a queued job, a worker claims it with
 * SKIP LOCKED, and the outcome — a result or a document — is read back by
 * id. Both suites run this file; the PostgreSQL half is skipped in memory.
 */

'use strict';

if (!process.env.TEST_DATABASE_URL) process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = 'ck_test_' + 'j'.repeat(32);

const request = require('supertest');
const app = require('../src/server');
const queue = require('../src/platform/jobs/queue');
const worker = require('../src/platform/jobs/worker');
const registry = require('../src/platform/jobs/registry');
const { requiredScopeFor } = require('../src/platform/auth/scopes');

const KEY = process.env.UI_API_KEY;
const PG = queue.mode() === 'postgres';

/** Wait for a job to reach an outcome — running a worker where the queue needs one. */
async function settle(jobId) {
  if (PG) await worker.drain({ workerId: 'test-drain', untilMs: Date.now() + 30_000 });
  const res = await request(app).get(`/v1/jobs/${jobId}`).set('x-api-key', KEY).expect(200);
  return res.body.job;
}

const bytesOf = () => (res, cb) => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };

beforeAll(async () => { if (PG) await worker.drain({ workerId: 'test-clear', untilMs: Date.now() + 30_000 }); });

describe('The queue and its routes', () => {
  test('the types this deployment runs are the handlers the composition root registered', async () => {
    const res = await request(app).get('/v1/jobs/types').set('x-api-key', KEY).expect(200);
    const types = res.body.types.map(t => t.type);
    expect(types).toEqual(expect.arrayContaining(['partc.report', 'partc.disclosure', 'lending.report', 'extract.document', 'portfolio.aggregate']));
    expect(res.body.mode).toBe(PG ? 'postgres' : 'inline');
    expect(() => registry.register('bad', 'not a function')).toThrow(TypeError);
  });

  test('enqueueing needs the assess scope; a type nobody registered is refused with the list', async () => {
    expect(requiredScopeFor('POST', '/v1/jobs').scope).toBe('assess');
    const res = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'nothing.here' }).expect(400);
    expect(res.body).toMatchObject({ error: 'UNKNOWN_JOB_TYPE' });
    expect(res.body.remedy).toMatch(/partc\.report/);
    await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ payload: {} }).expect(400);
    await request(app).post('/v1/jobs').send({ type: 'lending.report' }).expect(401);
  });

  test('a JSON job: enqueued, run, read back with its result, no artifact', async () => {
    const res = await request(app).post('/v1/jobs').set('x-api-key', KEY).set('x-actor', 'ana@bank.lk')
      .send({ type: 'lending.report', payload: { type: 'pcaf', period: '2025', format: 'json', orgName: 'Queue Bank' } }).expect(202);
    expect(res.body.mode).toBe(PG ? 'postgres' : 'inline');
    expect(res.body.job.status).toBe(PG ? 'queued' : 'succeeded');
    expect(res.body.job.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.job.actor).toBe('ana@bank.lk');
    expect(res.body.job.orgId).toBeUndefined();
    const job = await settle(res.body.job.jobId);
    expect(job.status).toBe('succeeded');
    expect(job.attempts).toBe(1);
    expect(job.result.report).toBeDefined();
    expect(job.artifact).toBeNull();
    expect(job.finishedAt).toBeTruthy();
    const art = await request(app).get(`/v1/jobs/${job.jobId}/artifact`).set('x-api-key', KEY).expect(404);
    expect(art.body.error).toBe('NO_ARTIFACT');
    const list = await request(app).get('/v1/jobs?type=lending.report').set('x-api-key', KEY).expect(200);
    expect(list.body.jobs.map(j => j.jobId)).toContain(job.jobId);
    const page = await request(app).get('/v1/jobs?limit=1').set('x-api-key', KEY).expect(200);
    expect(page.body.jobs).toHaveLength(1);
    expect(page.body.page.limit).toBe(1);
  });

  test('a document job: the artifact is the same PDF the synchronous route produces, downloadable by id', async () => {
    const res = await request(app).post('/v1/jobs').set('x-api-key', KEY)
      .send({ type: 'lending.report', payload: { type: 'pcaf', period: '2025', format: 'pdf', orgName: 'Queue Bank' } }).expect(202);
    const job = await settle(res.body.job.jobId);
    expect(job.status).toBe('succeeded');
    expect(job.result).toBeNull();
    expect(job.artifact).toMatchObject({ contentType: 'application/pdf', filename: 'CarbonIQ-PCAF-2025.pdf', url: `/v1/jobs/${job.jobId}/artifact` });
    expect(job.artifact.bytes).toBeGreaterThan(1000);
    const dl = await request(app).get(job.artifact.url).set('x-api-key', KEY).buffer(true).parse(bytesOf()).expect(200);
    expect(dl.headers['content-type']).toMatch(/application\/pdf/);
    expect(dl.headers['content-disposition']).toMatch(/CarbonIQ-PCAF-2025\.pdf/);
    expect(dl.body.length).toBe(job.artifact.bytes);
    expect(dl.body.slice(0, 5).toString()).toBe('%PDF-');
    const sync = await request(app).post('/v1/reports/generate').set('x-api-key', KEY)
      .send({ type: 'pcaf', period: '2025', format: 'pdf', orgName: 'Queue Bank' }).buffer(true).parse(bytesOf()).expect(200);
    /* pdfkit stamps a creation date; the size and the header are the comparison. */
    expect(Math.abs(sync.body.length - dl.body.length)).toBeLessThan(64);
  });

  test('a job that cannot succeed fails with the reason, and an invalid payload is not retried', async () => {
    const bad = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'lending.report', payload: { type: 'nonsense' } }).expect(202);
    const job = await settle(bad.body.job.jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toMatchObject({ kind: 'invalid', attempts: 1 });
    expect(job.error.message).toMatch(/type/);
    const art = await request(app).get(`/v1/jobs/${job.jobId}/artifact`).set('x-api-key', KEY).expect(404);
    expect(art.body.remedy).toMatch(/job\.error/);

    const empty = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'partc.disclosure', payload: { year: 2031, format: 'json' } }).expect(202);
    const d = await settle(empty.body.job.jobId);
    expect(d.status).toBe('failed');
    expect(d.error.kind).toBe('conflict');
  });

  test('an unknown job answers 404, and another organisation\'s job is invisible', async () => {
    await request(app).get('/v1/jobs/job_0000000000000000').set('x-api-key', KEY).expect(404);
    expect(await queue.get('org_someone_else', 'job_0000000000000000')).toBeNull();
  });

  test('/health says the mode and the depth', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.jobs.mode).toBe(PG ? 'postgres' : 'inline');
    expect(typeof res.body.jobs.queued).toBe('number');
    expect(res.body.contract.openapi).toBe('/v1/openapi.json');
  });
});

(PG ? describe : describe.skip)('On PostgreSQL: claiming is exclusive, a dead worker\'s job comes back, the drain reports', () => {
  const db = require('../src/platform/database');

  test('two workers claim two different jobs, and a third finds none', async () => {
    const a = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'lending.report', payload: { type: 'pcaf', period: '2024', format: 'json', orgName: 'Alpha Bank' } }).expect(202);
    const b = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'lending.report', payload: { type: 'pcaf', period: '2024', format: 'json', orgName: 'Beta Bank' } }).expect(202);
    const c1 = await queue.claim('w1');
    const c2 = await queue.claim('w2');
    expect([c1.jobId, c2.jobId].sort()).toEqual([a.body.job.jobId, b.body.job.jobId].sort());
    expect(c1.status).toBe('running');
    expect(await queue.claim('w3')).toBeNull();
    await queue.execute(c1, { workerId: 'w1' });
    await queue.execute(c2, { workerId: 'w2' });
    expect((await queue.get(c1.orgId, c1.jobId)).status).toBe('succeeded');
  });

  test('a job whose worker died is returned to the queue by the sweep, and then runs', async () => {
    const r = await request(app).post('/v1/jobs').set('x-api-key', KEY).send({ type: 'lending.report', payload: { type: 'pcaf', period: '2023', format: 'json', orgName: 'Stale Bank' } }).expect(202);
    const claimed = await queue.claim('dying-worker');
    expect(claimed.jobId).toBe(r.body.job.jobId);
    await db.client.query(`UPDATE jobs SET locked_at = now() - interval '1 hour' WHERE id = $1`, [claimed.jobId]);
    expect(await queue.requeueStale()).toBe(1);
    const back = await queue.get(claimed.orgId, claimed.jobId);
    expect(back.status).toBe('queued');
    expect(back.error.stale).toBe(true);
    const out = await worker.drain({ workerId: 'test', untilMs: Date.now() + 30_000 });
    expect(out.processed).toBeGreaterThanOrEqual(1);
    expect((await queue.get(claimed.orgId, claimed.jobId)).status).toBe('succeeded');
  });

  test('a failure that may be transient is retried with backoff, up to maxAttempts', async () => {
    let calls = 0;
    registry.register('test.flaky', async () => { calls += 1; const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; });
    const job = await queue.enqueue({ orgId: 'org_flaky', type: 'test.flaky', maxAttempts: 2 });
    const first = await queue.execute(await queue.claim('w'), { workerId: 'w' });
    expect(first.status).toBe('queued');
    const after = await queue.get('org_flaky', job.jobId);
    expect(after.error).toMatchObject({ kind: 'unreachable', attempts: 1 });
    expect(new Date(after.runAfter).getTime()).toBeGreaterThan(Date.now());
    await db.client.query(`UPDATE jobs SET run_after = now() WHERE id = $1`, [job.jobId]);
    const second = await queue.execute(await queue.claim('w'), { workerId: 'w' });
    expect(second.status).toBe('failed');
    expect(calls).toBe(2);
  });
});
