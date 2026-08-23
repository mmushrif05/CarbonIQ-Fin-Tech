/**
 * What one request is allowed to spend, and against whose clock.
 *
 * "Mapping failed" survived two rounds of fixes because each round treated a
 * symptom. The request was killed by the platform, and a killed process
 * returns no body, so nothing downstream could say why.
 *
 * Three causes, all of them structural:
 *
 *   1. The mapping prompt ORDERED a round-trip. list_factor_keys takes no
 *      arguments and returns the same 1,851 bytes every time, and both the
 *      system prompt and the user message opened by telling the model to call
 *      it. Two model calls minimum before any answer — and on the PDF path
 *      the second carried the whole document in history again.
 *
 *   2. Every turn ran with adaptive thinking and a 32,000-token ceiling,
 *      including the turn whose entire content was "here are your keys".
 *
 *   3. The deadline started when the route handler ran, but the platform's
 *      clock started at invocation. Cold start, Firebase init and parsing an
 *      80KB base64 body are spent before the handler sees anything, so the
 *      budget over-promised by exactly that much and the SDK was handed a
 *      timeout longer than the time that actually remained.
 *
 * These tests hold all three shut.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const mappingAgent = require('../services/agents/partc/mapping');

describe('The keys are given, not fetched', () => {
  test('the mapping agent no longer offers list_factor_keys', () => {
    const names = mappingAgent.TOOL_DEFINITIONS.map(t => t.name);

    expect(names).not.toContain('list_factor_keys');
    expect(Object.keys(mappingAgent.TOOL_FUNCTIONS)).not.toContain('list_factor_keys');
  });

  test('lookup_factor survives, for a genuine tie-break', () => {
    expect(mappingAgent.TOOL_DEFINITIONS.map(t => t.name)).toContain('lookup_factor');
  });

  test('the catalogue is in the prompt instead — every key, not a sample', () => {
    const { TOOL_FUNCTIONS } = require('../services/agents/partc/tools');
    const catalogue = TOOL_FUNCTIONS.list_factor_keys();

    // Spot-check across all three families the mapping actually resolves.
    expect(mappingAgent.SYSTEM_PROMPT).toContain('concrete_normal');
    expect(mappingAgent.SYSTEM_PROMPT).toContain('timber_door');
    expect(mappingAgent.SYSTEM_PROMPT).toContain('Steel reinforcement');

    // And exhaustively: no density key may be missing from the prompt.
    for (const key of catalogue.densities) {
      expect(mappingAgent.SYSTEM_PROMPT).toContain(key);
    }
  });

  test('neither prompt still orders a call to it', () => {
    expect(mappingAgent.SYSTEM_PROMPT).not.toMatch(/Call list_factor_keys/i);
    expect(mappingAgent.buildUserMessage({ boqContent: 'x' })).not.toMatch(/list_factor_keys/i);
  });
});

describe('An agent declares what a turn costs it', () => {
  test('mapping classifies, so it does not pay for thinking', () => {
    expect(mappingAgent.CALL_PROFILE.thinking).toBeNull();
    expect(mappingAgent.CALL_PROFILE.maxTokens).toBeLessThan(32000);
  });
});

describe('The request params that actually go to the model', () => {
  let app, request, calls;

  beforeAll(() => {
    jest.resetModules();
    calls = [];
    jest.doMock('@anthropic-ai/sdk', () => {
      const reply = {
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"materials":[],"demolitionItems":[],"excluded":[],"summary":{}}' }],
        usage: { input_tokens: 10, output_tokens: 5 }
      };
      const create = jest.fn().mockResolvedValue(reply);
      const Mock = jest.fn().mockImplementation(() => ({
        messages: {
          create,
          stream: jest.fn().mockImplementation(params => {
            calls.push(params);
            return { finalMessage: () => Promise.resolve(reply), on: () => {} };
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

  test('mapping sends no thinking block and a modest ceiling', async () => {
    calls.length = 0;
    const res = await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ boqContent: 'Providing and laying 1:2:4 cement concrete .... 18.65 m3', boqFormat: 'text' });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].thinking).toBeUndefined();
    expect(calls[0].max_tokens).toBe(8000);
  });

  test('mapping is never offered the tool whose answer it already has', async () => {
    calls.length = 0;
    await request(app).post('/v1/pcaf/part-c/agent/map')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ boqContent: 'Rubble masonry in 1:5 cement mortar .... 6 m3', boqFormat: 'text' });

    const toolNames = calls[0].tools.map(t => t.name);
    expect(toolNames).not.toContain('list_factor_keys');
  });

  test('an agent that reasons keeps adaptive thinking and its full ceiling', async () => {
    calls.length = 0;
    const res = await request(app).post('/v1/pcaf/part-c/agent/intake')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ documentText: 'Contractors All Risks policy for the Department of Fisheries.' });

    expect(res.status).toBe(200);
    expect(calls[0].thinking).toEqual({ type: 'adaptive' });
    expect(calls[0].max_tokens).toBe(32000);
  });
});

describe('The clock is the platform\'s, not one that starts late', () => {
  const { forRequest, Deadline, RESPONSE_MARGIN_MS } = require('../services/agents/deadline');
  const config = require('../config');

  test('Lambda\'s remaining time wins over the configured budget', () => {
    const req = { lambdaContext: { getRemainingTimeInMillis: () => 9000 } };
    const clock = forRequest(req);

    expect(clock.budgetMs).toBe(9000);
    // Under the configured 26s, which is the whole point.
    expect(clock.budgetMs).toBeLessThan(config.functionTimeoutMs);
    expect(clock.remaining()).toBeLessThanOrEqual(9000 - RESPONSE_MARGIN_MS);
  });

  test('a request already carrying a deadline keeps it', () => {
    const mine = new Deadline(5000);
    expect(forRequest({ deadline: mine })).toBe(mine);
  });

  test('outside a function it falls back to the configured budget', () => {
    expect(forRequest({}).budgetMs).toBe(config.functionTimeoutMs);
    expect(forRequest(undefined).budgetMs).toBe(config.functionTimeoutMs);
  });

  test('a nonsense value from the platform is ignored rather than trusted', () => {
    for (const bad of [0, -1, NaN, undefined, 'soon']) {
      const req = { lambdaContext: { getRemainingTimeInMillis: () => bad } };
      expect(forRequest(req).budgetMs).toBe(config.functionTimeoutMs);
    }
  });

  test('a nearly-exhausted budget refuses to start work, with a 504', () => {
    const clock = forRequest({ lambdaContext: { getRemainingTimeInMillis: () => 2600 } });

    expect(clock.canStart()).toBe(false);
    let thrown;
    try { clock.assertCanStart('map the bill of quantities'); } catch (e) { thrown = e; }
    expect(thrown.statusCode).toBe(504);
    expect(thrown.remedy).toMatch(/paste/i);
  });
});

describe('The adapter carries the platform clock through', () => {
  const fs = require('fs');
  const path = require('path');

  test('the Netlify handler attaches the Lambda context to the request', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'netlify', 'functions', 'fintech-api.js'), 'utf8');

    expect(src).toMatch(/request\s*\(\s*req\s*,\s*_?event\s*,\s*context\s*\)/);
    expect(src).toContain('req.lambdaContext = context');
  });
});

describe('A run that stops for a reason says the reason', () => {
  const fs = require('fs');
  const path = require('path');

  /* The agent loop breaks between turns when the budget runs out and answers
     200 with what it has plus why it stopped. The screen used to ignore that
     and fail on a JSON parse of a result that was never produced — the same
     class of bug as the original: the diagnosis exists and is discarded. */
  test('every agent screen reads data.error before parsing a result', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'ui', 'js', 'pcaf-partc.js'), 'utf8');

    /* Both the intake and the mapping handler parse an agent result, and both
       must check first — this assertion originally caught the intake handler
       still doing it the old way. Counting rather than indexOf, so a third
       handler added later cannot slip through unguarded. */
    const guards = (src.match(/if \(data\.error\)/g) || []).length;
    const parses = (src.match(/extractJson\(data\.result\)/g) || []).length;

    expect(parses).toBeGreaterThan(0);
    expect(guards).toBe(parses);

    // And each guard precedes the parse it protects.
    let from = 0;
    for (let i = 0; i < parses; i++) {
      const guardAt = src.indexOf('if (data.error)', from);
      const parseAt = src.indexOf('extractJson(data.result)', from);
      expect(guardAt).toBeGreaterThan(-1);
      expect(guardAt).toBeLessThan(parseAt);
      from = parseAt + 1;
    }
  });

  test('the error handler forwards a remedy instead of dropping it', () => {
    const errorHandler = require('../middleware/error-handler');

    const err = new Error('Not enough time left to map the bill of quantities.');
    err.statusCode = 504;
    err.code = 'DEADLINE_EXCEEDED';
    err.remedy = 'Paste the document text instead of uploading a PDF.';

    let payload = null;
    const res = {
      status: () => res,
      json: body => { payload = body; return res; },
      setHeader: () => {}, headersSent: false
    };
    errorHandler(err, { requestId: 'r1', path: '/x', method: 'POST' }, res, () => {});

    expect(payload.code || payload.error).toBe('DEADLINE_EXCEEDED');
    expect(payload.remedy).toBe('Paste the document text instead of uploading a PDF.');
  });

  test('a 500 never carries a remedy, whose message is deliberately generic', () => {
    const errorHandler = require('../middleware/error-handler');

    const err = new Error('boom');
    err.remedy = 'should not be shown';

    let payload = null;
    const res = {
      status: () => res,
      json: body => { payload = body; return res; },
      setHeader: () => {}, headersSent: false
    };
    errorHandler(err, { requestId: 'r2', path: '/x', method: 'POST' }, res, () => {});

    expect(payload.remedy).toBeUndefined();
  });
});
