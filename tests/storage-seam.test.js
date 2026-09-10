/**
 * H2 — the exit criterion, and the rule that produces it.
 *
 * The rule: **every record this application keeps goes through
 * `src/platform/database/store.js`.** Not most of them, not the ones written
 * after the seam was built — every one.
 *
 * Five record types did not. Lending projects, their annual monitoring
 * entries, agent runs, supervisor pipeline runs and webhook subscriptions
 * were written straight to Firebase through `platform/bridge/firebase`, and
 * each of those writers opened with `const db = getDatabase(); if (!db)
 * return;`. On a deployment holding its records in PostgreSQL — which is
 * every deployment of this application — that returned without writing.
 * `POST /v1/projects` answered **201 Created** and kept nothing.
 *
 * The exit criterion is that the same call, on a deployment that cannot
 * persist, is a **503 that names DATABASE_URL**. A refusal is a true answer;
 * 201 was not.
 */

'use strict';


const fs = require('fs');
const path = require('path');
const request = require('supertest');

/* Firebase is not reachable from a test run, and one test below needs a store
   that is durable and cannot hold a transaction — which is exactly what
   Firebase is. The stand-in answers only when a test switches it on, so
   nothing else in this file sees a configured Firebase. */
let mockFirebaseDb = null;
jest.mock('../src/platform/bridge/firebase', () => {
  const real = jest.requireActual('../src/platform/bridge/firebase');
  return { ...real, getDatabase: () => mockFirebaseDb };
});

const app = require('../src/server');
const store = require('../src/platform/database/store');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);

const ROOT = path.join(__dirname, '..', 'src');
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

/** Run `fn` on a deployment that has been asked for a store it cannot reach. */
async function withNoStore(fn) {
  const saved = { backend: process.env.STORAGE_BACKEND, url: process.env.DATABASE_URL };
  process.env.STORAGE_BACKEND = 'postgres';
  delete process.env.DATABASE_URL;
  try {
    expect(store.capability().writable).toBe(false);
    return await fn();
  } finally {
    if (saved.backend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = saved.backend;
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
  }
}

describe('The exit criterion — a write that cannot be kept is refused, not confirmed', () => {
  test('POST /v1/projects answers 503 naming DATABASE_URL, and never 201', async () => {
    const res = await withNoStore(() => auth(request(app).post('/v1/projects'))
      .send({ name: 'Harbour Terminal', region: 'LK', type: 'Industrial' }));

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(201);
    expect(JSON.stringify(res.body)).toMatch(/DATABASE_URL/);
  });

  test('the monitoring entry behind a financed-emissions figure is refused the same way', async () => {
    const res = await withNoStore(() => auth(request(app).post('/v1/projects/p-any/monitoring'))
      .send({ year: 2026, outstanding: 1e6, equity: 2e6, debt: 3e6, emissions: 4000 }));

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toMatch(/DATABASE_URL/);
  });

  test('a webhook subscription is refused rather than registered and dropped', async () => {
    const res = await withNoStore(() => auth(request(app).post('/v1/webhooks'))
      .send({ url: 'https://bank.example/hooks/carboniq', events: ['covenant.breach'] }));

    expect(res.status).toBe(503);
  });

  test('and with a store, the same call is created and readable back', async () => {
    await store._resetMemory();
    const created = await auth(request(app).post('/v1/projects'))
      .send({ name: 'Harbour Terminal', projectId: 'seam-1', region: 'LK', type: 'Industrial' });
    expect(created.status).toBe(201);

    const listed = await auth(request(app).get('/v1/projects'));
    expect(listed.status).toBe(200);
    expect(listed.body.projects.map(p => p.projectId)).toContain('seam-1');
  });
});

describe('Nothing writes past the seam', () => {
  /* The bridge is two things and no more: the CarbonIQ core engine, read-only,
     and the driver behind the seam's own Firebase adapter. Anything else
     reaching for it is a sixth record type about to be written past the store,
     which is how the first five got there. */
  const ALLOWED = new Set([
    'platform/bridge/firebase.js',              // itself
    'platform/database/store.js',               // asks whether Firebase is reachable
    'platform/database/adapters/firebase.js',   // the adapter it drives
    'platform/auth/api-key.js',                 // the API key lookup
    'platform/auth/auth.js',                    // JWT verification through the admin SDK
    'domains/lending/interface/routes/projects.js', // reads a core-engine project
  ]);

  test('only the seam, the two auth paths and the core-engine read require the bridge', () => {
    const offenders = walk(ROOT)
      .filter(f => /require\([^)]*bridge\/firebase['"]\)/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(ROOT, f).split(path.sep).join('/'))
      .filter(f => !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  test('the bridge writes nothing outside the seam adapter', () => {
    const src = fs.readFileSync(path.join(ROOT, 'platform/bridge/firebase.js'), 'utf8');
    /* Every remaining write is one of the four record verbs the adapter calls.
       A `.set(` or `.update(` anywhere else is a record going past the store. */
    const writes = [...src.matchAll(/^async function (\w+)\([^)]*\) \{[\s\S]*?^\}/gm)]
      .filter(m => /\.(set|update|remove)\(/.test(m[0]))
      .map(m => m[1]);
    expect(writes.sort()).toEqual(['deletePartCRecord', 'savePartCRecord']);
  });

  test('no module keeps a private store of its own beside the seam', () => {
    /* Two did: the Part C run store and the learning store each chose between
       PostgreSQL, Firebase and a `Map` of their own, so the same decision was
       made in three places and two of them could be wrong. */
    for (const f of ['domains/pcaf-part-c/application/partc-run-store.js',
      'domains/pcaf-part-c/application/learning-store.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect({ file: f, bridge: /bridge\/firebase/.test(src) }).toEqual({ file: f, bridge: false });
    }
  });
});

describe('A transaction that is required is not quietly downgraded', () => {
  test('the three call sites that need atomicity ask for it by name', () => {
    const sites = {
      'domains/capital/desk/adopt.js': 'desk.adopt',
      'domains/pcaf-part-c/application/partc-assessments.js': 'partc.assessments.lock',
      'domains/pcaf-part-c/application/partc-boq.js': 'partc.boq.createRevision',
    };
    for (const [file, name] of Object.entries(sites)) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect({ file, asks: src.includes(`{ name: '${name}', required: true }`) })
        .toEqual({ file, asks: true });
    }
  });

  test('a durable store that cannot commit a group refuses rather than applying half', async () => {
    /* Firebase and Blobs are durable and have no transaction. A
       lock-and-supersede that applied one of its two writes on a real book is
       a position nobody can reconcile, so the seam does not start it. */
    const saved = process.env.STORAGE_BACKEND;
    process.env.STORAGE_BACKEND = 'firebase';
    mockFirebaseDb = { ref: () => ({ once: async () => ({ val: () => null }), set: async () => {}, update: async () => {} }) };
    try {
      const cap = store.capability();
      expect({ mode: cap.mode, durable: cap.durable, transactional: cap.transactional })
        .toEqual({ mode: 'firebase', durable: true, transactional: false });

      await expect(store.transaction(async () => 'applied', { name: 'partc.assessments.lock', required: true }))
        .rejects.toMatchObject({ code: 'NOT_TRANSACTIONAL', statusCode: 503 });
    } finally {
      mockFirebaseDb = null;
      if (saved === undefined) delete process.env.STORAGE_BACKEND; else process.env.STORAGE_BACKEND = saved;
    }
  });

  test('the in-process store runs it, because development is where that is acceptable', async () => {
    await expect(store.transaction(async () => 'applied', { name: 'test.only', required: true }))
      .resolves.toBe('applied');
  });
});
