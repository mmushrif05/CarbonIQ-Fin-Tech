// @ts-check
/**
 * `POST /v1/assess` — the top of the product's own API table.
 *
 * The suite that stood here reached the route with a well-formed key that was
 * registered nowhere and asserted the refusal, so nothing ever got past the
 * door: the file sat at 0% function coverage while passing, and its header
 * claimed the AI was mocked when it contained no `jest.mock` at all.
 *
 * It is driven now. The SDK is mocked at the surface the code actually calls
 * (`messages.stream().finalMessage()`), a real credential is issued into
 * whichever store the run is on, and the assertions are about what the route
 * returns.
 */

'use strict';

const { mockAnthropic } = require('./helpers/anthropic');

/* Before the app is required, because the agent constructs its client at call
   time from the module this replaces. */
const ai = mockAnthropic();

const { api, request } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { onPostgres } = require('./helpers/store-mode');

const app = require('../src/server');

const VALID_BODY = {
  content: 'Concrete C30, 850, tonnes\nSteel Rebar, 120, tonnes\nFloat Glass, 45, tonnes',
  format: 'csv',
  projectName: 'Test Tower',
};

/** Well-formed, and registered nowhere. */
const UNREGISTERED = 'ck_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** What the extraction agent returns for the body above. */
const EXTRACTED = JSON.stringify({
  materials: [
    { name: 'Concrete C30', category: 'concrete', quantity: 850, unit: 'tonnes', confidence: 'high' },
    { name: 'Steel Rebar', category: 'steel', quantity: 120, unit: 'tonnes', confidence: 'high' },
    { name: 'Float Glass', category: 'glass', quantity: 45, unit: 'tonnes', confidence: 'medium' },
  ],
  summary: { totalItems: 3, unmatched: 0 },
});

let KEY;

beforeAll(async () => { KEY = (await issueKey({ orgId: 'assess-org' })).key; });
beforeEach(() => { ai.reply(EXTRACTED); });

describe('The door', () => {
  test('no key is 401', async () => {
    const res = await api().post('/v1/assess').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  test('a key that is not shaped like one is 401', async () => {
    const res = await api().post('/v1/assess').set('X-API-Key', 'not-a-valid-key').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_API_KEY');
  });

  test('a well-formed key registered nowhere is refused, and the refusal says which', async () => {
    /* The status differs by store because the *reason* differs, and both are
       the truth: PostgreSQL holds a key table and this key is not in it;
       the in-process store holds no keys at all, so nothing can be checked.
       The old test asserted only the second and called it the behaviour of
       the route. */
    const res = await api().post('/v1/assess').set('X-API-Key', UNREGISTERED).send(VALID_BODY);
    if (onPostgres) {
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_API_KEY');
    } else {
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('SERVICE_UNAVAILABLE');
    }
  });
});

describe('What it validates', () => {
  const bad = body => api().post('/v1/assess').set('X-API-Key', KEY).send(body);

  test('content shorter than the schema allows is 400', async () => {
    const res = await bad({ content: 'short', format: 'text' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('a format the engine does not read is 400', async () => {
    const res = await bad({ content: VALID_BODY.content, format: 'excel' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('no content at all is 400', async () => {
    const res = await bad({ format: 'csv' });
    expect(res.status).toBe(400);
  });
});

describe('What it returns', () => {
  test('an assessment carrying the materials, the totals and the Pareto set', async () => {
    const res = await api().post('/v1/assess').set('X-API-Key', KEY).send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projectName).toBe('Test Tower');
    expect(res.body.assessment.materials).toHaveLength(3);
    expect(res.body.assessment.carbonTotals.totalKgCO2e).toBeGreaterThan(0);
    expect(res.body.assessment.pareto80Pct.count).toBeGreaterThan(0);
    expect(res.body.assessment.pareto80Pct.coverage).toBeGreaterThan(0);
  });

  test('the Pareto set is a subset of the materials, never larger', async () => {
    const res = await api().post('/v1/assess').set('X-API-Key', KEY).send(VALID_BODY);
    const all = res.body.assessment.materials.length;
    expect(res.body.assessment.pareto80Pct.count).toBeLessThanOrEqual(all);
  });

  test('the engine is what multiplies — the model only returns quantities', async () => {
    /* The reply carries no emission factor and no total; every figure in the
       response is the engine's. An LLM must never compute a figure that
       reaches a regulatory disclosure. */
    expect(EXTRACTED).not.toMatch(/emissionFactor|totalKgCO2e/);
    const res = await api().post('/v1/assess').set('X-API-Key', KEY).send(VALID_BODY);
    for (const m of res.body.assessment.materials) {
      expect(typeof m.totalKgCO2e).toBe('number');
    }
  });

  test('the call the route made went through the streaming surface', async () => {
    await api().post('/v1/assess').set('X-API-Key', KEY).send(VALID_BODY);
    expect(ai.calls().length).toBeGreaterThan(0);
    expect(ai.calls()[ai.calls().length - 1]).toHaveProperty('model');
  });
});

/* `request` is re-exported by the helper so a suite needs one import; this
   keeps the linter from calling it unused where a test does not need it. */
void request;
void app;
