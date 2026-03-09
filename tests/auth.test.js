const request = require('supertest');
const express = require('express');
const { authenticate, hashApiKey, clearKeyCache } = require('../middleware/auth');

// Build a tiny Express app with auth middleware for isolated testing
const createTestApp = (mockDb) => {
  const app = express();
  app.use(express.json());
  app.use(authenticate(mockDb));
  app.get('/protected', (req, res) => {
    res.json({ ok: true, client: req.client });
  });
  return app;
};

describe('Auth Middleware', () => {
  beforeEach(() => clearKeyCache());

  const VALID_KEY = 'test-api-key-1234567890';
  const hashedValid = hashApiKey(VALID_KEY);

  const mockRecord = {
    name: 'Test Bank',
    active: true,
    permissions: ['score', 'pcaf'],
    rateLimit: 200,
    tier: 'premium',
  };

  const createMockDb = (records = {}) => ({
    ref: (path) => ({
      once: async () => ({
        val: () => {
          // Extract hashed key from path like "fintech/apiKeys/<hash>"
          const key = path.split('/').pop();
          return records[key] || null;
        },
      }),
    }),
  });

  it('rejects requests without X-API-Key', async () => {
    const app = createTestApp(createMockDb());
    const res = await request(app).get('/protected');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects keys shorter than 16 characters', async () => {
    const app = createTestApp(createMockDb());
    const res = await request(app)
      .get('/protected')
      .set('X-API-Key', 'short');
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown API keys', async () => {
    const app = createTestApp(createMockDb());
    const res = await request(app)
      .get('/protected')
      .set('X-API-Key', 'unknown-key-that-is-long-enough');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('rejects inactive API keys', async () => {
    const db = createMockDb({ [hashedValid]: { ...mockRecord, active: false } });
    const app = createTestApp(db);
    const res = await request(app)
      .get('/protected')
      .set('X-API-Key', VALID_KEY);
    expect(res.statusCode).toBe(403);
  });

  it('accepts valid API keys and attaches client info', async () => {
    const db = createMockDb({ [hashedValid]: mockRecord });
    const app = createTestApp(db);
    const res = await request(app)
      .get('/protected')
      .set('X-API-Key', VALID_KEY);
    expect(res.statusCode).toBe(200);
    expect(res.body.client.name).toBe('Test Bank');
    expect(res.body.client.permissions).toContain('score');
    expect(res.body.client.tier).toBe('premium');
  });

  it('caches API key lookups', async () => {
    let lookupCount = 0;
    const db = {
      ref: () => ({
        once: async () => {
          lookupCount++;
          return { val: () => mockRecord };
        },
      }),
    };
    const app = createTestApp(db);

    // First request — cache miss
    await request(app).get('/protected').set('X-API-Key', VALID_KEY);
    // Second request — cache hit
    await request(app).get('/protected').set('X-API-Key', VALID_KEY);

    expect(lookupCount).toBe(1);
  });
});

describe('hashApiKey', () => {
  it('produces consistent hashes', () => {
    const h1 = hashApiKey('my-key-12345678');
    const h2 = hashApiKey('my-key-12345678');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different keys', () => {
    const h1 = hashApiKey('key-aaaa-12345678');
    const h2 = hashApiKey('key-bbbb-12345678');
    expect(h1).not.toBe(h2);
  });
});
