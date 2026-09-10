// @ts-check
/**
 * `POST /v1/extract` — the BOQ extraction route.
 *
 * As with `/v1/assess`, this suite reached the route with a key registered
 * nowhere, so every "validation" test passed on a 503 from the door and the
 * route itself was never executed. The SDK is mocked at the surface the code
 * calls, a real credential is issued into whichever store the run is on, and
 * the schema tests below — which were always sound — stay as they are.
 */

'use strict';

const { mockAnthropic } = require('./helpers/anthropic');

const ai = mockAnthropic();

const { api } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { onPostgres } = require('./helpers/store-mode');

/** A minimal valid BOQ payload. */
const VALID_BODY = {
  content: 'Concrete C30, 850, tonnes\nSteel Rebar, 120, tonnes\nFloat Glass, 45, tonnes',
  format: 'csv',
  projectName: 'Test Tower',
  computeTotal: true
};

/** Well-formed, and registered nowhere. */
const UNREGISTERED = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** What the extraction agent returns for the body above. */
const EXTRACTED = JSON.stringify({
  materials: [
    { name: 'Concrete C30', category: 'concrete', quantity: 850, unit: 'tonnes', confidence: 'high' },
    { name: 'Steel Rebar', category: 'steel', quantity: 120, unit: 'tonnes', confidence: 'high' },
  ],
  summary: { totalItems: 2 },
});

let KEY;

beforeAll(async () => { KEY = (await issueKey({ orgId: 'extract-org' })).key; });
beforeEach(() => { ai.reply(EXTRACTED); });

// ── Authentication ─────────────────────────────────────────────────────────

describe('POST /v1/extract — the door', () => {
  test('no key is 401', async () => {
    const res = await api().post('/v1/extract').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  test('a key that is not shaped like one is 401', async () => {
    const res = await api().post('/v1/extract').set('X-API-Key', 'not-a-valid-key').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('a well-formed key registered nowhere is refused, and the refusal says which', async () => {
    const res = await api().post('/v1/extract').set('X-API-Key', UNREGISTERED).send(VALID_BODY);
    if (onPostgres) {
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_API_KEY');
    } else {
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
    }
  });
});

// ── What it returns ────────────────────────────────────────────────────────

describe('POST /v1/extract — what it returns', () => {
  test('the materials the model read, with the factor the engine applied', async () => {
    const res = await api().post('/v1/extract').set('X-API-Key', KEY).send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.extraction.materials).toHaveLength(2);
    for (const m of res.body.extraction.materials) {
      expect(typeof m.emissionFactor).toBe('number');
      expect(typeof m.totalKgCO2e).toBe('number');
    }
  });

  test('the model returned no factor and no total — the engine supplied both', async () => {
    expect(EXTRACTED).not.toMatch(/emissionFactor|totalKgCO2e/);
    const res = await api().post('/v1/extract').set('X-API-Key', KEY).send(VALID_BODY);
    expect(res.body.extraction.materials[0].emissionFactor).toBeGreaterThan(0);
  });

  test('a reply the engine will not compute from is refused, not carried', async () => {
    /* A material with a factor in it would mean the model had done arithmetic
       that reaches a disclosure. The schema is `unknown(false)` for exactly
       this, and the refusal is a 502 rather than a silent pass-through. */
    ai.reply(JSON.stringify({ materials: [{ name: 'X', quantity: 1, totalKgCO2e: 999 }] }));
    const res = await api().post('/v1/extract').set('X-API-Key', KEY).send(VALID_BODY);
    expect(res.status).toBe(502);
  });
});

// ── Input Validation ───────────────────────────────────────────────────────

describe('POST /v1/extract — input validation', () => {
  test('returns 400 when content field is missing', async () => {
    const res = await api()
      .post('/v1/extract')
      .set('X-API-Key', KEY)
      .send({ format: 'csv' }); // missing content

    // Validation fires before DB lookup — expect 400
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when content is too short (< 10 chars)', async () => {
    const res = await api()
      .post('/v1/extract')
      .set('X-API-Key', KEY)
      .send({ content: 'short', format: 'text' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when format is not a valid enum value', async () => {
    const res = await api()
      .post('/v1/extract')
      .set('X-API-Key', KEY)
      .send({ content: VALID_BODY.content, format: 'excel' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── Schema ─────────────────────────────────────────────────────────────────

describe('extractRequestSchema', () => {
  const { extractRequestSchema } = require('../src/domains/lending/interface/schemas/extract');

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
    const { error } = extractRequestSchema.validate({ content: VALID_BODY.content, format: 'docx' });
    expect(error).toBeDefined();
  });

  test('accepts pdf as a valid format', () => {
    const { error } = extractRequestSchema.validate({ pdfBase64: 'dGVzdA==', format: 'pdf' });
    expect(error).toBeUndefined();
  });

  test('accepts fileId without content', () => {
    const { error } = extractRequestSchema.validate({ fileId: 'file_abc123' });
    expect(error).toBeUndefined();
  });

  test('rejects request with no content, pdfBase64, or fileId', () => {
    const { error } = extractRequestSchema.validate({ format: 'text', projectName: 'Test' });
    expect(error).toBeDefined();
  });

  test('rejects content exceeding 100 000 characters', () => {
    const { error } = extractRequestSchema.validate({ content: 'a'.repeat(100_001) });
    expect(error).toBeDefined();
  });
});

// ── Schema index registration ──────────────────────────────────────────────

describe('src/platform/http/schemas.js', () => {
  test('exports extractRequestSchema', () => {
    const schemas = require('../src/platform/http/schemas');
    expect(typeof schemas.extractRequestSchema).toBe('object');
    expect(schemas.extractRequestSchema).toBeDefined();
  });
});
