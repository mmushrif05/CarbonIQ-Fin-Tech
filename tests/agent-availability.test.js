/**
 * Are the agents actually wired, and does a broken AI layer say so?
 *
 * A user reported that uploading a BOQ PDF "does nothing — the agent is
 * static". Two separate defects produced that impression, and neither was
 * the agent code:
 *
 *   the gate checked only that ANTHROPIC_API_KEY was *set*, so a placeholder
 *   passed it and the failure surfaced from inside the SDK as
 *   `{"error":"ERROR","message":"401 terminated"}`, which names neither
 *   cause nor fix;
 *
 *   a failed mapping left the previously loaded worked-example rows in the
 *   table, so the screen showed a result that had nothing to do with the
 *   uploaded document.
 *
 * These tests hold both fixes, and prove the agent plumbing end to end
 * against a stubbed API — everything except the network call itself.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const { describe: describeAi, diagnose, AGENTS, KEY_SHAPE } = require('../services/agents/ai-status');

describe('Recognising a key that cannot work', () => {
  test('an Anthropic key is sk-ant- and long; a placeholder is neither', () => {
    expect(KEY_SHAPE.test('sk-ant-api03-' + 'x'.repeat(90))).toBe(true);
    expect(KEY_SHAPE.test('PASTE_YOUR_KEY_HERE')).toBe(false);
    expect(KEY_SHAPE.test('')).toBe(false);
    expect(KEY_SHAPE.test('sk-ant-')).toBe(false);
  });

  test('a malformed key is reported before any call is attempted', () => {
    const state = describeAi();
    if (!state.configured) return;                 // nothing to assert here
    if (state.keyWellFormed) expect(state.shapeWarning).toBeNull();
    else expect(state.shapeWarning).toMatch(/does not look like an Anthropic key/i);
  });

  test('every agent in the product is named, so "are they all live" has one answer', () => {
    expect(AGENTS.length).toBeGreaterThanOrEqual(9);
    for (const a of AGENTS) {
      expect(a.id).toBeTruthy();
      expect(a.endpoint).toMatch(/^(POST|GET) \/v1\//);
      expect(a.purpose.length).toBeGreaterThan(10);
    }
  });
});

describe('An SDK failure is translated into cause and remedy', () => {
  const cases = [
    [{ status: 401, message: '401 terminated' },                    'key_rejected',      /rejected the key/i],
    [{ status: 403, message: '403' },                               'forbidden',         /not permitted/i],
    [{ status: 404, message: 'model not found' },                   'model_unavailable', /not available to this key/i],
    [{ status: 429, message: '429' },                               'rate_limited',      /rate limited/i],
    [{ status: 529, message: '529' },                               'overloaded',        /overloaded/i],
    [{ message: 'Request timed out' },                              'timeout',           /did not complete in time/i],
    [{ message: 'fetch failed ENOTFOUND api.anthropic.com' },       'network_blocked',   /could not reach/i]
  ];

  test.each(cases)('%o becomes a named cause', (err, status, messagePattern) => {
    const d = diagnose(err);
    expect(d.status).toBe(status);
    expect(d.message).toMatch(messagePattern);
    expect(d.remedy).toBeTruthy();
  });

  test('the opaque SDK message is never what reaches the caller', () => {
    const d = diagnose({ status: 401, message: '401 terminated' });
    expect(d.message).not.toBe('401 terminated');
    expect(d.message).toMatch(/401/);            // the code survives
    expect(d.remedy).toMatch(/console\.anthropic\.com/);
  });
});

describe('The gate refuses early, and says what still works', () => {
  const request = require('supertest');
  const app = require('../server');
  const KEY = process.env.UI_API_KEY;

  test('GET /v1/agent/health reports every agent and never throws', async () => {
    const res = await request(app).get('/v1/agent/health').set('x-api-key', KEY);
    expect([200, 503]).toContain(res.status);
    expect(res.body.agents.length).toBeGreaterThanOrEqual(9);
    expect(res.body.deterministic.endpoints.length).toBeGreaterThan(0);
    expect(typeof res.body.ai.usable).toBe('boolean');
    if (!res.body.ai.usable) {
      expect(res.body.ai.detail).toBeTruthy();
      expect(res.body.ai.remedy).toBeTruthy();
      for (const a of res.body.agents) expect(a.status).toBe('unavailable');
    }
  });

  test('an agent endpoint with an unusable key fails fast, not deep', async () => {
    const started = Date.now();
    const res = await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', KEY)
      .send({ boqContent: 'Concrete 18.65 m3', boqFormat: 'text' });

    if (res.status === 200) return;               // a real key is configured
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_UNAVAILABLE');
    expect(res.body.message).toBeTruthy();
    expect(res.body.remedy).toBeTruthy();
    expect(res.body.diagnose).toBe('GET /v1/agent/health');
    expect(res.body.unaffected.join(' ')).toMatch(/calculation engine/i);
    // Refused on shape, so it never waited on a network round trip.
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('the deterministic half is genuinely unaffected by a dead AI layer', async () => {
    const fx = require('./fixtures/fisheries');
    const res = await request(app).post('/v1/pcaf/part-c/assess').set('x-api-key', KEY)
      .send({
        projectName: 'No-AI run', policy: fx.POLICY_CAR,
        materials: fx.MATERIALS, distances: fx.DISTANCES,
        siteInputs: {
          gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
          demolitionItems: fx.DEMOLITION_ITEMS, previousProject: fx.PREVIOUS_PROJECT
        },
        persist: false
      });
    expect(res.status).toBe(200);
    expect(Math.round(res.body.summary.construction_kgCO2e * 100) / 100).toBe(15928.59);
  });
});

describe('The agents are wired correctly — proven against a stubbed API', () => {
  /* Everything but the network call: the route, the document reader, the
     agent loop, the tool definitions and the response shaping. */
  const MAPPED = {
    materials: [
      { id: 'm0', name: 'Concrete (all grades)', quantity: 18.65, unit: 'm3',
        densityKey: 'concrete_normal', confidence: 'high' }
    ],
    demolitionItems: [],
    summary: { lowConfidenceCount: 0 }
  };

  let app, request, calls;

  beforeAll(() => {
    jest.resetModules();
    /* Every model round-trip this request makes, in order. The PDF path used
       to make two — transcribe, then map — and that pair could not fit inside
       a 26-second function. Recording them is how the regression is caught. */
    calls = [];
    jest.doMock('@anthropic-ai/sdk', () => {
      const create = jest.fn().mockResolvedValue({
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(MAPPED) }],
        usage: { input_tokens: 100, output_tokens: 50 }
      });
      const Mock = jest.fn().mockImplementation(() => ({
        messages: {
          create,
          stream: jest.fn().mockImplementation(params => {
            calls.push(params);
            return {
            finalMessage: () => Promise.resolve({
              model: 'claude-sonnet-4-6',
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: JSON.stringify(MAPPED) }],
              usage: { input_tokens: 100, output_tokens: 50 }
            }),
            on: () => {}
            };
          })
        },
        beta: { messages: { create } }
      }));
      Mock.AnthropicError = class AnthropicError extends Error {};
      Mock.APIError = class APIError extends Mock.AnthropicError {};
      return Mock;
    });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-' + 'x'.repeat(90);
    request = require('supertest');
    app = require('../server');
  });

  afterAll(() => { jest.dontMock('@anthropic-ai/sdk'); jest.resetModules(); });

  test('a pasted BOQ reaches the mapping agent and comes back mapped', async () => {
    const res = await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ boqContent: 'Providing and laying 1:2:4 cement concrete .... 18.65 m3', boqFormat: 'text' });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.match(/\{[\s\S]*\}/)[0]);
    expect(parsed.materials[0].name).toMatch(/Concrete/);
    expect(res.body.documentSource).toBe('text');
  });

  test('an uploaded PDF goes to the mapping agent as a document, in ONE call', async () => {
    /* This used to transcribe the PDF and then map the transcript: two
       sequential model calls, the first non-streamed at 16,000 output tokens,
       inside a function killed at 26 seconds. It did not fit, the process was
       killed mid-request, and because a killed process returns no body the
       browser showed the bare fallback string "Mapping failed".
       Claude reads PDFs natively, so the transcription round-trip is gone. */
    calls.length = 0;
    const pdf = Buffer.from('%PDF-1.4 fake').toString('base64');

    const res = await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ pdfBase64: pdf, projectName: 'Fisheries' });

    expect(res.status).toBe(200);
    expect(res.body.documentSource).toBe('pdf');

    // One round-trip, not two. This is the assertion that guards the fix.
    expect(calls).toHaveLength(1);

    // The PDF itself reached the model, rather than a transcript of it.
    const content = calls[0].messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const doc = content.find(b => b.type === 'document');
    expect(doc).toBeDefined();
    expect(doc.source).toEqual({ type: 'base64', media_type: 'application/pdf', data: pdf });
  });

  test('a pasted BOQ still travels as plain text, not as a document block', async () => {
    calls.length = 0;
    const res = await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ boqContent: 'Rubble masonry in 1:5 cement mortar .... 6 m3', boqFormat: 'text' });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);

    /* The cache breakpoint wraps the last user message in blocks to attach
       cache_control, so even a plain string arrives as an array. What matters
       is that no document was attached and the text is carried through. */
    const content = calls[0].messages[0].content;
    expect(content.some(b => b.type === 'document')).toBe(false);
    expect(JSON.stringify(content)).toContain('Rubble masonry');
  });

  test('the health probe reports the layer live when the API answers', async () => {
    const res = await request(app).get('/v1/agent/health?probe=1')
      .set('x-api-key', process.env.UI_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.ai.usable).toBe(true);
    for (const a of res.body.agents) expect(a.status).toBe('live');
  });
});
