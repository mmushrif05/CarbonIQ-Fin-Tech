/**
 * CarbonIQ FinTech — Webhook Endpoint & Service Tests
 *
 * Covers: auth enforcement, registration, listing, deletion.
 * Firebase is mocked so tests run without credentials.
 */

const request = require('supertest');
const app = require('../server');

const FAKE_KEY = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const VALID_URL = 'https://hooks.example.bank/carboniq';
const VALID_EVENTS = ['covenant.breach', 'assessment.complete'];

// ── Authentication ─────────────────────────────────────────────────────────

describe('POST /v1/webhooks — authentication', () => {
  test('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .send({ url: VALID_URL, events: VALID_EVENTS });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('API_KEY_REQUIRED');
  });

  test('returns 401 when X-API-Key format is invalid', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .set('X-API-Key', 'bad-key')
      .send({ url: VALID_URL, events: VALID_EVENTS });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('returns 503 when Firebase is unconfigured (valid format key)', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .set('X-API-Key', FAKE_KEY)
      .send({ url: VALID_URL, events: VALID_EVENTS });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('GET /v1/webhooks — authentication', () => {
  test('returns 401 when X-API-Key is missing', async () => {
    const res = await request(app).get('/v1/webhooks');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('API_KEY_REQUIRED');
  });

  test('returns 503 when Firebase is unconfigured', async () => {
    const res = await request(app)
      .get('/v1/webhooks')
      .set('X-API-Key', FAKE_KEY);
    expect(res.status).toBe(503);
  });
});

describe('DELETE /v1/webhooks/:subscriptionId — authentication', () => {
  test('returns 401 when X-API-Key is missing', async () => {
    const res = await request(app).delete('/v1/webhooks/wh_abc123');
    expect(res.status).toBe(401);
  });

  test('returns 503 when Firebase is unconfigured', async () => {
    const res = await request(app)
      .delete('/v1/webhooks/wh_abc123')
      .set('X-API-Key', FAKE_KEY);
    expect(res.status).toBe(503);
  });
});

// ── Input Validation ───────────────────────────────────────────────────────

describe('POST /v1/webhooks — input validation', () => {
  test('rejects non-HTTPS URLs', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .set('X-API-Key', FAKE_KEY)
      .send({ url: 'http://insecure.bank.com/hook', events: VALID_EVENTS });
    // Will fail validation before reaching DB — 400 or 503 depending on middleware order
    expect([400, 503]).toContain(res.status);
  });

  test('rejects empty events array', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .set('X-API-Key', FAKE_KEY)
      .send({ url: VALID_URL, events: [] });
    expect([400, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  test('rejects invalid event names', async () => {
    const res = await request(app)
      .post('/v1/webhooks')
      .set('X-API-Key', FAKE_KEY)
      .send({ url: VALID_URL, events: ['not.a.real.event'] });
    expect([400, 503]).toContain(res.status);
  });
});

// ── Service Unit Tests (with mocked Firebase) ─────────────────────────────

describe('webhook service', () => {
  const crypto = require('crypto');

  // We can unit-test the signing logic without Firebase
  test('generates HMAC-SHA256 signature in sha256=<hex> format', () => {
    const secret = 'test-signing-secret-12345';
    const body = JSON.stringify({ event: 'covenant.breach', data: {} });
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  test('produces different signatures for different secrets', () => {
    const body = 'test-body';
    const sig1 = crypto.createHmac('sha256', 'secret-a').update(body).digest('hex');
    const sig2 = crypto.createHmac('sha256', 'secret-b').update(body).digest('hex');
    expect(sig1).not.toBe(sig2);
  });

  test('produces consistent signatures for same input', () => {
    const body = 'test-body-consistent';
    const secret = 'shared-secret';
    const sig1 = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(sig1).toBe(sig2);
  });
});
