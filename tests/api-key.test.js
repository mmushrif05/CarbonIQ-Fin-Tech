/**
 * CarbonIQ FinTech — API Key Middleware Tests
 *
 * Covers apiKeyAuth, requireProjectAccess, and requirePermission.
 * Firebase bridge is mocked; per-test behaviour is controlled via
 * the mockDb / mockSnapshot variables.
 */

const request  = require('supertest');
const express  = require('express');

let mockDb          = null;
let mockSnapshot    = null;
let mockDbSetError  = null;

jest.mock('../bridge/firebase', () => ({
  getDatabase: () => mockDb
}));

const apiKeyAuth = require('../middleware/api-key');
const { requireProjectAccess, requirePermission, hashApiKey } = apiKeyAuth;

// ─── helpers ─────────────────────────────────────────────────────────────────

const VALID_UI_KEY   = 'ck_test_00000000000000000000000000000000';
const VALID_TEST_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
const VALID_LIVE_KEY = 'ck_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';

function buildApp(opts = {}) {
  const app = express();
  app.use(express.json());
  app.use('/secure', apiKeyAuth, (req, res) => {
    res.json({ ok: true, apiKey: req.apiKey });
  });
  if (opts.projectRoute) {
    app.use('/project/:projectId', apiKeyAuth, requireProjectAccess, (req, res) => {
      res.json({ ok: true });
    });
  }
  if (opts.permRoute) {
    app.use('/perm', apiKeyAuth, requirePermission('admin'), (req, res) => {
      res.json({ ok: true });
    });
  }
  return app;
}

function makeFirebaseDb(keyData, setError = null) {
  return {
    ref: () => ({
      once: async () => ({ val: () => keyData }),
      set:  async () => { if (setError) throw setError; }
    })
  };
}

// ─── apiKeyAuth ───────────────────────────────────────────────────────────────

describe('apiKeyAuth middleware', () => {
  beforeEach(() => {
    mockDb         = null;
    mockSnapshot   = null;
    mockDbSetError = null;
    delete process.env.UI_API_KEY;
    delete process.env.DEV_API_KEY;
  });

  it('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(buildApp()).get('/secure');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('API_KEY_REQUIRED');
  });

  it('returns 401 for malformed key (wrong prefix)', async () => {
    const res = await request(buildApp()).get('/secure').set('X-API-Key', 'bad_key_format');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  it('returns 401 for malformed key (too short)', async () => {
    const res = await request(buildApp()).get('/secure').set('X-API-Key', 'ck_test_tooshort');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  it('allows request when key matches UI_API_KEY env var', async () => {
    process.env.UI_API_KEY = VALID_UI_KEY;
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_UI_KEY);
    expect(res.status).toBe(200);
    expect(res.body.apiKey.orgId).toBe('ui');
    expect(res.body.apiKey.permissions).toContain('read');
    expect(res.body.apiKey.permissions).toContain('agent');
    expect(res.body.apiKey.rateLimit).toBe(500);
  });

  it('does NOT bypass via UI_API_KEY when key does not match', async () => {
    process.env.UI_API_KEY = VALID_UI_KEY;
    mockDb = null; // no Firebase
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(503); // falls through to Firebase path, which is unavailable
  });

  it('allows request when key matches DEV_API_KEY and no Firebase', async () => {
    mockDb = null;
    process.env.DEV_API_KEY = VALID_TEST_KEY;
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_TEST_KEY);
    expect(res.status).toBe(200);
    expect(res.body.apiKey.orgId).toBe('dev');
  });

  it('DEV_API_KEY bypass does NOT work when Firebase is configured', async () => {
    process.env.DEV_API_KEY = VALID_TEST_KEY;
    mockDb = makeFirebaseDb(null); // Firebase configured but key not found
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_TEST_KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  it('returns 503 when Firebase is not configured and no bypass key set', async () => {
    mockDb = null;
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 401 when key is not found in Firebase', async () => {
    mockDb = makeFirebaseDb(null);
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  it('returns 401 when key exists in Firebase but is inactive', async () => {
    mockDb = makeFirebaseDb({ active: false, orgId: 'org1', orgName: 'Test' });
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  it('authenticates a valid active key from Firebase', async () => {
    mockDb = makeFirebaseDb({
      active:      true,
      orgId:       'org-abc',
      orgName:     'Test Bank',
      projectIds:  ['proj-1'],
      permissions: ['read', 'write'],
      rateLimit:   200
    });
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(200);
    expect(res.body.apiKey.orgId).toBe('org-abc');
    expect(res.body.apiKey.orgName).toBe('Test Bank');
    expect(res.body.apiKey.rateLimit).toBe(200);
  });

  it('uses default rateLimit when Firebase record has none', async () => {
    mockDb = makeFirebaseDb({ active: true, orgId: 'org1', orgName: 'X' });
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(200);
    expect(res.body.apiKey.rateLimit).toBeGreaterThan(0);
  });

  it('returns 500 when Firebase throws an error', async () => {
    mockDb = {
      ref: () => ({ once: async () => { throw new Error('db down'); } })
    };
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUTH_ERROR');
  });

  it('fire-and-forget lastUsed update does not block response', async () => {
    mockDb = makeFirebaseDb({ active: true, orgId: 'org1', orgName: 'X' }, new Error('set failed'));
    const res = await request(buildApp()).get('/secure').set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(200); // error in set() does not break response
  });
});

// ─── hashApiKey ───────────────────────────────────────────────────────────────

describe('hashApiKey', () => {
  it('returns a hex string', () => {
    const hash = hashApiKey('ck_test_abc123');
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('is deterministic', () => {
    expect(hashApiKey('key')).toBe(hashApiKey('key'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'));
  });
});

// ─── requireProjectAccess ─────────────────────────────────────────────────────

describe('requireProjectAccess middleware', () => {
  beforeEach(() => {
    delete process.env.UI_API_KEY;
    process.env.UI_API_KEY = VALID_UI_KEY;
  });

  it('allows when key has no projectId restriction', async () => {
    const app = buildApp({ projectRoute: true });
    const res = await request(app)
      .get('/project/proj-99')
      .set('X-API-Key', VALID_UI_KEY);
    expect(res.status).toBe(200); // projectIds: [] means unrestricted
  });

  it('allows when key includes the requested projectId', async () => {
    mockDb = makeFirebaseDb({
      active: true, orgId: 'o', orgName: 'N',
      projectIds: ['proj-1', 'proj-2'], permissions: [], rateLimit: 100
    });
    const app = buildApp({ projectRoute: true });
    const res = await request(app)
      .get('/project/proj-1')
      .set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(200);
  });

  it('returns 403 when key does not include the requested projectId', async () => {
    mockDb = makeFirebaseDb({
      active: true, orgId: 'o', orgName: 'N',
      projectIds: ['proj-1'], permissions: [], rateLimit: 100
    });
    const app = buildApp({ projectRoute: true });
    const res = await request(app)
      .get('/project/proj-99')
      .set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

// ─── requirePermission ────────────────────────────────────────────────────────

describe('requirePermission middleware', () => {
  beforeEach(() => {
    delete process.env.UI_API_KEY;
  });

  it('allows when key has the required permission', async () => {
    process.env.UI_API_KEY = VALID_UI_KEY; // UI key has all permissions incl. 'agent' not 'admin'
    // Use Firebase key with admin permission
    mockDb = makeFirebaseDb({
      active: true, orgId: 'o', orgName: 'N',
      projectIds: [], permissions: ['admin'], rateLimit: 100
    });
    const app = buildApp({ permRoute: true });
    const res = await request(app)
      .get('/perm')
      .set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(200);
  });

  it('returns 403 when key lacks the required permission', async () => {
    mockDb = makeFirebaseDb({
      active: true, orgId: 'o', orgName: 'N',
      projectIds: [], permissions: ['read'], rateLimit: 100
    });
    const app = buildApp({ permRoute: true });
    const res = await request(app)
      .get('/perm')
      .set('X-API-Key', VALID_LIVE_KEY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});
