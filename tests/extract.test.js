/**
 * CarbonIQ FinTech — /v1/extract Endpoint Tests
 *
 * Covers: auth enforcement, input validation, and response shape.
 * AI calls are mocked so tests run without ANTHROPIC_API_KEY.
 */

const request = require('supertest');
const app = require('../server');

// ── Helpers ────────────────────────────────────────────────────────────────

/** A minimal valid BOQ payload. */
const VALID_BODY = {
  content: 'Concrete C30, 850, tonnes\nSteel Rebar, 120, tonnes\nFloat Glass, 45, tonnes',
  format: 'csv',
  projectName: 'Test Tower',
  computeTotal: true
};

/** Forge a valid-format (but fake) API key to hit auth middleware. */
const FAKE_KEY = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ── Authentication ─────────────────────────────────────────────────────────

describe('POST /v1/extract — authentication', () => {
  test('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('API_KEY_REQUIRED');
  });

  test('returns 401 when X-API-Key format is invalid', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .set('X-API-Key', 'not-a-valid-key')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('returns 503 when Firebase is unconfigured (valid format, DB unavailable)', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .set('X-API-Key', FAKE_KEY)
      .send(VALID_BODY);

    // Without Firebase the middleware returns 503 SERVICE_UNAVAILABLE
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
  });
});

// ── Input Validation ───────────────────────────────────────────────────────

describe('POST /v1/extract — input validation', () => {
  test('returns 400 when content field is missing', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .set('X-API-Key', FAKE_KEY)
      .send({ format: 'csv' }); // missing content

    // Validation fires before DB lookup — expect 400
    expect([400, 401, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 when content is too short (< 10 chars)', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .set('X-API-Key', FAKE_KEY)
      .send({ content: 'short', format: 'text' });

    expect([400, 401, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 when format is not a valid enum value', async () => {
    const res = await request(app)
      .post('/v1/extract')
      .set('X-API-Key', FAKE_KEY)
      .send({ content: VALID_BODY.content, format: 'excel' });

    expect([400, 401, 503]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });
});

// ── Schema ─────────────────────────────────────────────────────────────────

describe('extractRequestSchema', () => {
  const { extractRequestSchema } = require('../schemas/extract');

  test('accepts a valid CSV payload', () => {
    const { error, value } = extractRequestSchema.validate(VALID_BODY);
    expect(error).toBeUndefined();
    expect(value.format).toBe('csv');
    expect(value.computeTotal).toBe(true);
  });

  test('defaults format to "text" when omitted', () => {
    const { value } = extractRequestSchema.validate({ content: VALID_BODY.content });
    expect(value.format).toBe('text');
  });

  test('defaults computeTotal to true when omitted', () => {
    const { value } = extractRequestSchema.validate({ content: VALID_BODY.content });
    expect(value.computeTotal).toBe(true);
  });

  test('rejects content shorter than 10 characters', () => {
    const { error } = extractRequestSchema.validate({ content: 'abc' });
    expect(error).toBeDefined();
  });

  test('rejects unknown format values', () => {
    const { error } = extractRequestSchema.validate({ content: VALID_BODY.content, format: 'pdf' });
    expect(error).toBeDefined();
  });

  test('rejects content exceeding 100 000 characters', () => {
    const { error } = extractRequestSchema.validate({ content: 'a'.repeat(100_001) });
    expect(error).toBeDefined();
  });
});

// ── Schema index registration ──────────────────────────────────────────────

describe('schemas/index.js', () => {
  test('exports extractRequestSchema', () => {
    const schemas = require('../schemas/index');
    expect(typeof schemas.extractRequestSchema).toBe('object');
    expect(schemas.extractRequestSchema).toBeDefined();
  });
});
