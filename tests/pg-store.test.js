/**
 * The data layer against a real PostgreSQL.
 *
 * Runs when TEST_DATABASE_URL is set (npm run test:postgres; CI's
 * test-postgres job). Without it the suite is skipped and says so, because a
 * suite that passes by not running is the kind of green nobody should trust.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
if (!URL) console.log('tests/pg-store.test.js: TEST_DATABASE_URL not set — PostgreSQL integration tests skipped.');

const app = require('../server');
const db = require('../platform/database');
const store = require('../services/partc-store');
const registry = require('../services/partc-registry');
const boq = require('../services/partc-boq');
const A = require('../services/partc-assessments');
const book = require('../services/capital-book');
const { adoptCandidate } = require('../services/desk/adopt');
const { seedDemoBook } = require('../services/partc-demo-data');
const fx = require('./fixtures/fisheries');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const ORG = 'pg-org';
const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

const sleep = ms => new Promise(r => setTimeout(r, ms));

suite('PostgreSQL — the seam', () => {
  beforeEach(() => store._resetMemory());

  test('it is the live store, chosen by DATABASE_URL, and /health says it is reachable with a current schema', async () => {
    expect(store.capability().mode).toBe('postgres');
    const res = await request(app).get('/health').expect(200);
    expect(res.body.storage).toMatchObject({ mode: 'postgres', reachable: true, transactional: true, writable: true, durable: true });
    expect(res.body.storage.schema).toEqual({ applied: 1, pending: 0, drifted: 0 });
  });

  test('a record round-trips whole, and the row version counts every write', async () => {
    const c = await registry.createClient(ORG, { name: 'Department of Fisheries', country: 'Sri Lanka', contact: { email: 'x@y.lk' } });
    const back = await registry.getClient(ORG, c.clientId);
    expect(back).toEqual(c);
    expect(back._row.version).toBe(1);
    const patched = await registry.updateClient(ORG, c.clientId, { name: 'Dept of Fisheries' });
    expect(patched.name).toBe('Dept of Fisheries');
    expect(patched.contact).toEqual({ email: 'x@y.lk' });
    expect(patched._row.version).toBe(2);
    expect(JSON.stringify(patched)).not.toMatch(/_row/);
  });

  test('a project cannot refer to a client that does not exist — from the database, not only the service', async () => {
    await expect(store.put('projects', ORG, 'pj_x', { projectId: 'pj_x', clientId: 'nobody', name: 'Orphan' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'REFERENCE_VIOLATION' });
  });

  test('a project with a bill of quantities cannot be deleted, and the refusal names what is attached', async () => {
    const c = await registry.createClient(ORG, { name: 'C', country: 'LK' });
    const p = await registry.createProject(ORG, { clientId: c.clientId, name: 'P', projectType: 'building', gifa_m2: 100, projectCost: 1000 });
    await boq.createRevision(ORG, p.projectId, { materials: fx.MATERIALS });
    const err = await registry.deleteProject(ORG, p.projectId).catch(e => e);
    expect(err).toMatchObject({ statusCode: 409, code: 'REFERENCE_VIOLATION' });
    expect(err.message).toMatch(/BOQ revision/);
    expect(await registry.getProject(ORG, p.projectId)).not.toBeNull();
  });

  test('an unregistered collection is refused before any SQL runs', async () => {
    await expect(store.put('ledger', ORG, '1', {})).rejects.toMatchObject({ code: 'UNKNOWN_COLLECTION' });
  });
});

suite('PostgreSQL — transactions', () => {
  beforeEach(() => store._resetMemory());

  test('work in a transaction that throws leaves nothing behind, across modules', async () => {
    await expect(store.transaction(async () => {
      await registry.createClient(ORG, { name: 'Ghost', country: 'LK' });
      await book.createPortfolio(ORG, { name: 'Ghost fund', allocatedBudget: 1 });
      throw new Error('abandon');
    })).rejects.toThrow('abandon');
    expect(await registry.listClients(ORG)).toEqual([]);
    expect(await book.listPortfolios(ORG)).toEqual([]);
  });

  test('two revisions created at the same moment become R1 and R2, never two R1s', async () => {
    const c = await registry.createClient(ORG, { name: 'C', country: 'LK' });
    const p = await registry.createProject(ORG, { clientId: c.clientId, name: 'P', projectType: 'building', gifa_m2: 100, projectCost: 1000 });
    const [r1, r2] = await Promise.all([
      boq.createRevision(ORG, p.projectId, { note: 'A', materials: fx.MATERIALS }),
      boq.createRevision(ORG, p.projectId, { note: 'B', materials: fx.MATERIALS }),
    ]);
    expect([r1.label, r2.label].sort()).toEqual(['R1', 'R2']);
    const later = r1.label === 'R2' ? r1 : r2;
    const earlier = r1.label === 'R1' ? r1 : r2;
    expect(later.supersedes).toBe(earlier.revisionId);
  });

  test('a policy-year never ends up with two locked assessments, whichever way a race falls', async () => {
    const seeded = await seedDemoBook(registry, ORG, boq);
    const pj = seeded.projects.find(p => /Negombo/.test(p.name));
    const pol = pj.policies.find(x => x.reportingYear === 2026);
    const rev = (await boq.listRevisions(ORG, pj.projectId))[0]
      || await boq.createRevision(ORG, pj.projectId, { materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
    const mk = async () => {
      const { assessment } = await A.createAssessment(ORG, { projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId, siteInputs: { demolitionKm: 100, wasteDisposalKm: 40 } });
      await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
      return assessment.assessmentId;
    };
    const a = await mk();
    const b = await mk();
    const results = await Promise.allSettled([
      A.changeStatus(ORG, a, 'locked', { actor: 'x' }),
      A.changeStatus(ORG, b, 'locked', { actor: 'x' }),
    ]);
    const locked = await A.listAssessments(ORG, { policyId: pol.policyId, reportingYear: 2026, status: 'locked' });
    expect(locked).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ statusCode: 409, code: 'LOCK_RACE' });
    }
    expect(results.some(r => r.status === 'fulfilled')).toBe(true);
  });

  test('a locked assessment cannot be duplicated even by a direct write', async () => {
    const seeded = await seedDemoBook(registry, ORG, boq);
    const pj = seeded.projects[0];
    const rev = await boq.createRevision(ORG, pj.projectId, { materials: fx.MATERIALS });
    const base = { projectId: pj.projectId, boqRevisionId: rev.revisionId, policyId: 'pol_1', reportingYear: 2026, status: 'locked' };
    await store.put('assessments', ORG, 'as_1', { ...base, assessmentId: 'as_1' });
    await expect(store.put('assessments', ORG, 'as_2', { ...base, assessmentId: 'as_2' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE' });
  });

  test('two adoptions of one pipeline record leave exactly one investment', async () => {
    const pf = await book.createPortfolio(ORG, { name: 'Fund', allocatedBudget: 500e6 });
    const results = await Promise.allSettled([
      adoptCandidate(ORG, { recordId: 'gcf_p1_jaffna_solar', portfolioId: pf.id }),
      adoptCandidate(ORG, { recordId: 'gcf_p1_jaffna_solar', portfolioId: pf.id }),
    ]);
    const ok = results.filter(r => r.status === 'fulfilled');
    const no = results.filter(r => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(no).toHaveLength(1);
    expect(no[0].reason).toMatchObject({ statusCode: 409, code: 'ALREADY_ADOPTED' });
    const inv = (await book.listInvestments(ORG)).filter(i => i.origin && i.origin.recordId === 'gcf_p1_jaffna_solar');
    expect(inv).toHaveLength(1);
  });
});

suite('PostgreSQL — query and pagination', () => {
  beforeEach(() => store._resetMemory());

  test('an indexed query answers without reading the book, and a page survives an insert mid-walk', async () => {
    const c = await registry.createClient(ORG, { name: 'C', country: 'LK' });
    const mk = i => registry.createProject(ORG, { clientId: c.clientId, name: `P${i}`, projectType: 'building', gifa_m2: 10, projectCost: 1 });
    for (let i = 0; i < 7; i++) await mk(i);
    const first = await store.page('projects', ORG, { limit: 3, where: { clientId: c.clientId } });
    expect(first.items).toHaveLength(3);
    await mk(7); // arrives after the walk began
    const seen = [...first.items.map(p => p.name)];
    let cursor = first.nextCursor;
    while (cursor) {
      const pg = await store.page('projects', ORG, { limit: 3, cursor, where: { clientId: c.clientId } });
      seen.push(...pg.items.map(p => p.name));
      cursor = pg.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(8);
    expect(await store.count('projects', ORG, { clientId: c.clientId })).toBe(8);
    expect(await store.count('projects', ORG, { clientId: 'other' })).toBe(0);
  });

  test('GET /v1/partc/projects?limit= pages over HTTP, and without limit returns the whole list as before', async () => {
    const c = await auth(request(app).post('/v1/partc/clients')).send({ name: 'Harbour', country: 'LK' });
    if (c.status !== 201) return;
    for (let i = 0; i < 5; i++) {
      await auth(request(app).post('/v1/partc/projects')).send({ clientId: c.body.client.clientId, name: `H${i}`, projectType: 'building', gifa_m2: 10, projectCost: 1 }).expect(201);
    }
    const p1 = await auth(request(app).get('/v1/partc/projects?limit=2')).expect(200);
    expect(p1.body.projects).toHaveLength(2);
    expect(p1.body.page.nextCursor).toBeTruthy();
    const p2 = await auth(request(app).get(`/v1/partc/projects?limit=2&cursor=${p1.body.page.nextCursor}`)).expect(200);
    expect(p2.body.projects.map(p => p.name)).not.toEqual(p1.body.projects.map(p => p.name));
    const all = await auth(request(app).get('/v1/partc/projects')).expect(200);
    expect(all.body.projects.length).toBeGreaterThanOrEqual(5);
    expect(all.body.page).toBeUndefined();
    await auth(request(app).get('/v1/partc/projects?limit=2&cursor=garbage')).expect(400);
  });
});

suite('PostgreSQL — the audit chain', () => {
  beforeEach(() => store._resetMemory());

  test('a mutating request is appended, the chain verifies, and an edit is detected', async () => {
    const res = await auth(request(app).post('/v1/partc/clients')).send({ name: 'Audited', country: 'LK' });
    if (res.status !== 201) return;
    let tail = [];
    for (let i = 0; i < 20 && !tail.length; i++) { await sleep(50); tail = await db.auditChain.tail({ limit: 5 }); }
    expect(tail.length).toBeGreaterThanOrEqual(1);
    expect(tail[0].action).toBe('POST /clients');
    expect(tail[0].detail.status).toBe(201);
    expect(tail[0].request_id).toBeTruthy();
    await db.auditChain.append({ orgId: 'ui', actor: 'test', action: 'DELETE /x' });
    expect(await db.auditChain.verify()).toMatchObject({ ok: true, checked: 2 });

    await expect(db.client.query('DELETE FROM audit_events')).rejects.toMatchObject({ code: '55000' });
    await expect(db.client.query("UPDATE audit_events SET actor = 'mallory'")).rejects.toMatchObject({ code: '55000' });

    /* Someone with the table's privileges edits a row anyway. */
    await db.client.query('ALTER TABLE audit_events DISABLE TRIGGER ALL');
    const { rows } = await db.client.query('SELECT min(seq) AS s FROM audit_events');
    await db.client.query("UPDATE audit_events SET actor = 'mallory' WHERE seq = $1", [rows[0].s]);
    await db.client.query('ALTER TABLE audit_events ENABLE TRIGGER ALL');
    const v = await db.auditChain.verify();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(Number(rows[0].s));
    expect(v.reason).toMatch(/edited/);
  });
});

suite('PostgreSQL — migrations', () => {
  const SCRATCH = `scratch_${process.env.JEST_WORKER_ID || 1}`;
  const original = process.env.DATABASE_SCHEMA;

  afterAll(async () => {
    if (original === undefined) delete process.env.DATABASE_SCHEMA; else process.env.DATABASE_SCHEMA = original;
    await db.client._reset();
    await db.client.query(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);
  });

  test('up applies once, down rolls back, drift is refused', async () => {
    process.env.DATABASE_SCHEMA = SCRATCH;
    await db.client._reset();
    await db.client.query(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE`);

    const first = await db.migrate.up();
    expect(first.applied.map(m => m.name)).toEqual(['0001_initial']);
    expect((await db.migrate.status()).pending).toEqual([]);
    expect((await db.migrate.up()).applied).toEqual([]);
    const { rows } = await db.client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = '${SCRATCH}' AND table_name = 'partc_assessments'`);
    expect(rows[0].n).toBe(1);

    const down = await db.migrate.down();
    expect(down.rolledBack.name).toBe('0001_initial');
    expect((await db.migrate.status()).pending.map(m => m.name)).toEqual(['0001_initial']);
    await db.migrate.up();

    await db.client.query("UPDATE schema_migrations SET checksum = repeat('f', 64) WHERE version = 1");
    const s = await db.migrate.status();
    expect(s.drifted.map(m => m.name)).toEqual(['0001_initial']);
    await expect(db.migrate.up()).rejects.toMatchObject({ code: 'MIGRATION_DRIFT' });
  });
});
