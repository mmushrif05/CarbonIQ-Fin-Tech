/**
 * CarbonIQ FinTech — JWT Auth Middleware Tests
 *
 * Tests middleware/auth.js which verifies Firebase Bearer tokens.
 * Firebase bridge is mocked at module level; per-test behaviour is
 * controlled via the mockVerifyIdToken variable.
 */

const request = require('supertest');
const express = require('express');

// Module-level mock — Jest allows variables prefixed with "mock" in factories
let mockVerifyIdToken;
let mockFirebaseConfigured = true;

jest.mock('../bridge/firebase', () => ({
  getFirebaseAdmin: () => {
    if (!mockFirebaseConfigured) return null;
    return { auth: () => ({ verifyIdToken: (...args) => mockVerifyIdToken(...args) }) };
  }
}));

const auth = require('../middleware/auth');

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.get('/protected', auth, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
};

const app = createTestApp();

describe('JWT Auth Middleware', () => {
  beforeEach(() => {
    mockFirebaseConfigured = true;
    mockVerifyIdToken = async () => ({ uid: 'u1', email: 'a@b.com' });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header has wrong format', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 503 when Firebase is not configured', async () => {
    mockFirebaseConfigured = false;
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer some.valid.token');
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 401 when token verification fails', async () => {
    mockVerifyIdToken = async () => { throw new Error('invalid token'); };
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer bad.token');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 with TOKEN_EXPIRED for expired tokens', async () => {
    mockVerifyIdToken = async () => {
      const err = new Error('Token expired');
      err.code = 'auth/id-token-expired';
      throw err;
    };
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired.token');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('attaches decoded user to request on valid token', async () => {
    mockVerifyIdToken = async () => ({
      uid: 'user-123',
      email: 'analyst@bank.com',
      role: 'bank_analyst',
      organizationId: 'org-abc'
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.token');
    expect(res.statusCode).toBe(200);
    expect(res.body.user.uid).toBe('user-123');
    expect(res.body.user.email).toBe('analyst@bank.com');
    expect(res.body.user.role).toBe('bank_analyst');
  });
});
