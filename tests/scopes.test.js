/**
 * Scopes — the exit criterion of E2: a read-only key is refused when it
 * tries to lock an assessment, and the refusal is tested. Plus: every route
 * carries a scope, legacy keys keep working and say so, expiry is enforced,
 * the dashboard key cannot administer, the person is named, and the
 * document a reviewer reads is the table the code runs.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');

let mockDb = null;
let keyRecord = null;
jest.mock('../src/platform/bridge/firebase', () => ({
  getDatabase: () => mockDb,
  getFirebaseAdmin: () => null,
  savePartCRecord: async () => {}, getPartCRecord: async () => null, listPartCRecords: async () => [], deletePartCRecord: async () => {},
  savePartCRun: async () => {}, updatePartCRun: async () => {}, getPartCRun: async () => null, listPartCRuns: async () => [],
  savePartCLearnings: async () => {}, listPartCLearnings: async () => [], listPartCBenchmarks: async () => [],
}));

const app = require('../src/server');
const scopes = require('../src/platform/auth/scopes');
const { routeTable, renderScopesDoc } = require('../src/platform/auth/scopes-doc');
const store = require('../src/platform/database/store');
const registry = require('../src/domains/pcaf-part-c/application/partc-registry');
const boq = require('../src/domains/pcaf-part-c/application/partc-boq');
const A = require('../src/domains/pcaf-part-c/application/partc-assessments');
const { seedDemoBook } = require('../src/domains/pcaf-part-c/application/partc-demo-data');
const fx = require('./fixtures/fisheries');

const UI_KEY = process.env.UI_API_KEY;
const KEY = 'ck_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const ORG = 'scope-org';
const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

/** A Firebase that answers one key record and accepts the lastUsed write. */
function firebaseWith(record) {
  keyRecord = record;
  mockDb = { ref: () => ({ once: async () => ({ val: () => keyRecord }), set: async () => {}, update: async () => {} }) };
}
afterEach(() => { mockDb = null; keyRecord = null; });

async function draftAssessment() {
  await store._resetMemory();
  const book = await seedDemoBook(registry, ORG, boq);
  const pj = book.projects.find(p => /Negombo/.test(p.name));
  const pol = pj.policies.find(x => x.reportingYear === 2026);
  const rev = (await boq.listRevisions(ORG, pj.projectId))[0]
    || await boq.createRevision(ORG, pj.projectId, { materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
  const { assessment } = await A.createAssessment(ORG, {
    projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
    siteInputs: { demolitionKm: 100, wasteDisposalKm: 40 },
  });
  await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
  return assessment.assessmentId;
}

const key = (rec) => ({ orgId: ORG, orgName: 'Scope Org', keyName: 'los', active: true, permissions: ['read', 'write'], ...rec });

describe('The exit criterion — a read-only key cannot lock', () => {
  test('locking with a read-only key is refused, naming the scope needed and the scopes held', async () => {
    const id = await draftAssessment();
    firebaseWith(key({ scopes: ['read'] }));
    const res = await request(app).post(`/v1/partc/assessments/${id}/status`).set('x-api-key', KEY).send({ status: 'locked' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SCOPE_REQUIRED');
    expect(res.body.required).toBe('lock');
    expect(res.body.held).toEqual(['read']);
    expect(res.body.remedy).toMatch(/key:scope/);
    expect((await A.getAssessment(ORG, id)).status).toBe('under_review');
  });

  test('the same key may read the assessment it may not lock', async () => {
    const id = await draftAssessment();
    firebaseWith(key({ scopes: ['read'] }));
    const res = await request(app).get(`/v1/partc/assessments/${id}`).set('x-api-key', KEY);
    expect(res.status).toBe(200);
    expect(res.headers['x-key-scopes']).toBeUndefined();
  });

  test('a write key may move the status but not lock; a lock key may lock, and the lock records the person', async () => {
    const id = await draftAssessment();
    firebaseWith(key({ scopes: ['read', 'write'] }));
    const back = await request(app).post(`/v1/partc/assessments/${id}/status`).set('x-api-key', KEY).send({ status: 'draft' });
    expect(back.status).toBe(200);
    const refused = await request(app).post(`/v1/partc/assessments/${id}/status`).set('x-api-key', KEY).send({ status: 'under_review' })
      .then(() => request(app).post(`/v1/partc/assessments/${id}/status`).set('x-api-key', KEY).send({ status: 'locked' }));
    expect(refused.status).toBe(403);
    expect(refused.body.required).toBe('lock');

    firebaseWith(key({ scopes: ['read', 'write', 'lock'] }));
    const locked = await request(app).post(`/v1/partc/assessments/${id}/status`).set('x-api-key', KEY).set('x-actor', 'n.perera@bank.lk').send({ status: 'locked' });
    expect(locked.status).toBe(200);
    expect(locked.body.assessment.status).toBe('locked');
    expect(locked.body.assessment.lockedBy).toBe('n.perera@bank.lk');
  });
});

describe('Keys issued before scopes existed', () => {
  test('keep working, and every response says they are unscoped', async () => {
    firebaseWith(key({ scopes: undefined }));
    const res = await request(app).get('/v1/partc/clients').set('x-api-key', KEY);
    expect(res.status).toBe(200);
    expect(res.headers['x-key-scopes']).toBe('unscoped');
  });

  test('are held to scopes the moment scopes are recorded', async () => {
    firebaseWith(key({ scopes: ['read'] }));
    const res = await request(app).post('/v1/partc/clients').set('x-api-key', KEY).send({ name: 'X', country: 'LK' });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe('write');
  });
});

describe('Expiry', () => {
  test('an expired key is refused with the date, and points at its replacement when rotated', async () => {
    firebaseWith(key({ scopes: ['read'], expiresAt: '2020-01-01T00:00:00.000Z', supersededBy: 'abc' }));
    const res = await request(app).get('/v1/partc/clients').set('x-api-key', KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('KEY_EXPIRED');
    expect(res.body.message).toMatch(/2020-01-01/);
    expect(res.body.remedy).toMatch(/replacement/);
  });

  test('a key with a future expiry works', async () => {
    firebaseWith(key({ scopes: ['read'], expiresAt: '2999-01-01T00:00:00.000Z' }));
    expect((await request(app).get('/v1/partc/clients').set('x-api-key', KEY)).status).toBe(200);
  });
});

describe('The dashboard key and the person behind it', () => {
  test('the dashboard key holds read, write, lock and assess — not admin', () => {
    expect(scopes.UI_KEY_SCOPES).toEqual(['read', 'write', 'lock', 'assess']);
    expect(scopes.UI_KEY_SCOPES).not.toContain('admin');
  });

  test('the dashboard key can read and write, and X-Actor names the person on the request', async () => {
    const probe = require('express')();
    probe.get('/probe', require('../src/platform/auth/api-key'), (req, res) => res.json(req.actor));
    const res = await request(probe).get('/probe').set('x-api-key', UI_KEY).set('x-actor', 'analyst@bank.lk');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'analyst@bank.lk', via: 'header' });
    const noHeader = await request(probe).get('/probe').set('x-api-key', UI_KEY);
    expect(noHeader.body).toMatchObject({ id: 'dashboard', via: 'key' });
  });

  test('a user\'s scopes follow the role level', () => {
    expect(scopes.scopesForRoleLevel(100)).toEqual(['read', 'write', 'lock', 'assess', 'admin']);
    expect(scopes.scopesForRoleLevel(80)).toEqual(['read', 'write', 'lock', 'assess']);
    expect(scopes.scopesForRoleLevel(40)).toEqual(['read', 'write', 'assess']);
    expect(scopes.scopesForRoleLevel(30)).toEqual(['read']);
  });
});

describe('Every route carries a scope, and the document says which', () => {
  const rows = routeTable(app);

  test('the router registers the routes the product documents, and each resolves to a known scope', () => {
    expect(rows.length).toBeGreaterThan(120);
    for (const r of rows) expect(scopes.SCOPES).toContain(r.scope);
    const pick = (m, p) => rows.find(r => r.method === m && r.path === p);
    expect(pick('GET', '/v1/partc/clients').scope).toBe('read');
    expect(pick('POST', '/v1/partc/clients').scope).toBe('write');
    expect(pick('DELETE', '/v1/partc/clients/:clientId').scope).toBe('write');
    expect(pick('POST', '/v1/partc/assessments/:assessmentId/status')).toMatchObject({ scope: 'write', lockVariant: 'lock' });
    expect(pick('GET', '/v1/projects/:projectId/score').scope).toBe('read');
    expect(pick('POST', '/v1/desk/scenario').scope).toBe('read');
    expect(pick('POST', '/v1/capital/compute').scope).toBe('read');
    expect(pick('POST', '/v1/pcaf/part-c/dq-preview').scope).toBe('read');
    expect(pick('POST', '/v1/pcaf/part-c/assess').scope).toBe('assess');
    expect(pick('POST', '/v1/assess').scope).toBe('assess');
    expect(pick('POST', '/v1/desk/adopt').scope).toBe('write');
  });

  test('every /v1 route is authenticated except the four reference reads that are public on purpose', () => {
    const open = rows.filter(r => r.path.startsWith('/v1') && !r.authenticated).map(r => `${r.method} ${r.path}`);
    expect(open.sort()).toEqual(['GET /v1', 'GET /v1/carbon-pricing/rates', 'GET /v1/reports/types', 'GET /v1/ui-config.js']);
  });

  test('docs/API-SCOPES.md is what the code runs', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'API-SCOPES.md'), 'utf8');
    expect(doc).toBe(renderScopesDoc(rows));
  });

  test('normaliseScopes canonicalises and refuses the unknown', () => {
    expect(scopes.normaliseScopes('write, read,read')).toEqual(['read', 'write']);
    expect(() => scopes.normaliseScopes(['read', 'delete'])).toThrow(/Unknown scope/);
  });
});

describe('The platform reads its environment in one place', () => {
  test("no file outside src/platform/config reads process.env", () => {
    const ROOT = path.join(__dirname, '..', 'src');
    const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; };
    const offenders = walk(ROOT).filter(f => !f.includes(`${path.sep}platform${path.sep}config${path.sep}`))
      .filter(f => /process\.env\b/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  test('validation names a problem by variable and never by value', () => {
    const config = require('../src/platform/config');
    const saved = { salt: process.env.API_KEY_SALT, ui: process.env.UI_API_KEY, url: process.env.DATABASE_URL, dev: process.env.DEV_API_KEY };
    try {
      delete process.env.DEV_API_KEY;
      process.env.API_KEY_SALT = 'default-dev-salt-change-in-production';
      process.env.UI_API_KEY = 'not-a-key-secret-value';
      process.env.DATABASE_URL = 'mysql://nope';
      const v = config.validate({ env: 'production' });
      expect(v.ok).toBe(false);
      expect(v.problems.map(p => p.variable).sort()).toEqual(['API_KEY_SALT', 'DATABASE_URL', 'UI_API_KEY']);
      expect(JSON.stringify(v)).not.toMatch(/not-a-key-secret-value|mysql:\/\/nope/);
      process.env.API_KEY_SALT = 'a'.repeat(64);
      process.env.UI_API_KEY = 'ck_test_00000000000000000000000000000000';
      process.env.DATABASE_URL = 'postgresql://u@h/db';
      expect(config.validate({ env: 'production' }).ok).toBe(true);
    } finally {
      for (const [k, v] of [['API_KEY_SALT', saved.salt], ['UI_API_KEY', saved.ui], ['DATABASE_URL', saved.url], ['DEV_API_KEY', saved.dev]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  test('/health lists the offending variable names when validation fails, and nothing else', async () => {
    const saved = process.env.UI_API_KEY;
    process.env.UI_API_KEY = 'bad-value-do-not-print';
    try {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.configured.problems).toEqual(['UI_API_KEY']);
      expect(JSON.stringify(res.body)).not.toMatch(/bad-value-do-not-print/);
    } finally { process.env.UI_API_KEY = saved; }
  });
});
