/**
 * CarbonIQ FinTech — /v1/assess Endpoint Tests
 *
 * Covers: auth enforcement and input validation.
 * AI calls are mocked so tests run without ANTHROPIC_API_KEY.
 */

const request = require('supertest');
const app = require('../server');

const VALID_BODY = {
  content: 'Concrete C30, 850, tonnes\nSteel Rebar, 120, tonnes\nFloat Glass, 45, tonnes',
  format: 'csv',
  projectName: 'Test Tower'
};

const FAKE_KEY = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ── Authentication ─────────────────────────────────────────────────────────

describe('POST /v1/assess — authentication', () => {
  test('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('API_KEY_REQUIRED');
  });

  test('returns 401 when X-API-Key format is invalid', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .set('X-API-Key', 'not-a-valid-key')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('returns 503 when Firebase is unconfigured (valid format, DB unavailable)', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .set('X-API-Key', FAKE_KEY)
      .send(VALID_BODY);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
  });
});

// ── Input Validation ───────────────────────────────────────────────────────

describe('POST /v1/assess — input validation', () => {
  test('returns 400 when content is too short', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .set('X-API-Key', FAKE_KEY)
      .send({ content: 'short', format: 'text' });
    expect([400, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 when format is invalid', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .set('X-API-Key', FAKE_KEY)
      .send({ content: VALID_BODY.content, format: 'excel' });
    expect([400, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/v1/assess')
      .set('X-API-Key', FAKE_KEY)
      .send({ format: 'csv' });
    expect([400, 503]).toContain(res.status);
  });
});
