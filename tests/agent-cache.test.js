/**
 * Unit tests for the prompt-caching helpers in bridge/agent.js.
 *
 * The three helpers are pure functions — no API calls, no Firebase.
 * They are exported (underscore-prefixed) specifically to enable testing.
 */

'use strict';

const { _withCachedLastTool, _withCachedLastUserMessage, _accumulateTokens } = require('../bridge/agent');
const { createRunRecord } = require('../models/agent-run');

// ---------------------------------------------------------------------------
// models/agent-run.js — tokensUsed shape includes cache fields
// ---------------------------------------------------------------------------

describe('createRunRecord — tokensUsed shape', () => {
  const run = createRunRecord({
    runId: 'run_test_001', agentType: 'underwriting',
    orgId: 'org_test', userMessage: 'Assess this project'
  });

  test('includes input and output counters initialised to zero', () => {
    expect(run.tokensUsed).toHaveProperty('input', 0);
    expect(run.tokensUsed).toHaveProperty('output', 0);
  });

  test('includes cacheRead counter initialised to zero', () => {
    expect(run.tokensUsed).toHaveProperty('cacheRead', 0);
  });

  test('includes cacheCreated counter initialised to zero', () => {
    expect(run.tokensUsed).toHaveProperty('cacheCreated', 0);
  });
});

// ---------------------------------------------------------------------------
// _withCachedLastTool
// ---------------------------------------------------------------------------

describe('_withCachedLastTool', () => {
  const tools = [
    { name: 'tool_a', description: 'Tool A', input_schema: {} },
    { name: 'tool_b', description: 'Tool B', input_schema: {} },
    { name: 'tool_c', description: 'Tool C', input_schema: {} }
  ];

  test('adds cache_control to the last tool only', () => {
    const result = _withCachedLastTool(tools);
    expect(result[2]).toHaveProperty('cache_control', { type: 'ephemeral' });
    expect(result[0]).not.toHaveProperty('cache_control');
    expect(result[1]).not.toHaveProperty('cache_control');
  });

  test('does not mutate the original array', () => {
    const snapshot = tools.map(t => ({ ...t }));
    _withCachedLastTool(tools);
    expect(tools).toEqual(snapshot);
  });

  test('returns the same reference for empty array', () => {
    expect(_withCachedLastTool([])).toEqual([]);
  });

  test('works with a single-tool array', () => {
    const result = _withCachedLastTool([{ name: 'only', description: 'x', input_schema: {} }]);
    expect(result[0]).toHaveProperty('cache_control');
  });

  test('preserves all other tool properties', () => {
    const result = _withCachedLastTool(tools);
    expect(result[2].name).toBe('tool_c');
    expect(result[2].description).toBe('Tool C');
  });
});

// ---------------------------------------------------------------------------
// _withCachedLastUserMessage
// ---------------------------------------------------------------------------

describe('_withCachedLastUserMessage', () => {
  test('converts string content to block array with cache_control', () => {
    const messages = [{ role: 'user', content: 'Assess this project' }];
    const result   = _withCachedLastUserMessage(messages);
    expect(Array.isArray(result[0].content)).toBe(true);
    expect(result[0].content[0]).toEqual({
      type: 'text', text: 'Assess this project',
      cache_control: { type: 'ephemeral' }
    });
  });

  test('adds cache_control to last block of an array content message', () => {
    const messages = [{
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: '{"score":78}' },
        { type: 'tool_result', tool_use_id: 'tu_2', content: '{"aligned":true}' }
      ]
    }];
    const result = _withCachedLastUserMessage(messages);
    expect(result[0].content[1]).toHaveProperty('cache_control', { type: 'ephemeral' });
    expect(result[0].content[0]).not.toHaveProperty('cache_control');
  });

  test('targets the last user message in a multi-turn history', () => {
    const messages = [
      { role: 'user',      content: 'initial request' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'foo', input: {} }] },
      { role: 'user',      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{}' }] }
    ];
    const result = _withCachedLastUserMessage(messages);
    // First user message must remain a plain string (not touched)
    expect(typeof result[0].content).toBe('string');
    // Last user message gets cache_control on its last block
    expect(result[2].content[0]).toHaveProperty('cache_control', { type: 'ephemeral' });
  });

  test('does not mutate the original messages array', () => {
    const messages = [{ role: 'user', content: 'original' }];
    _withCachedLastUserMessage(messages);
    expect(messages[0].content).toBe('original');
  });

  test('returns same reference when no user message is present', () => {
    const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] }];
    expect(_withCachedLastUserMessage(messages)).toBe(messages);
  });

  test('returns same reference for empty array', () => {
    const messages = [];
    expect(_withCachedLastUserMessage(messages)).toBe(messages);
  });
});

// ---------------------------------------------------------------------------
// _accumulateTokens
// ---------------------------------------------------------------------------

describe('_accumulateTokens', () => {
  test('accumulates all four counters across multiple iterations', () => {
    const run = createRunRecord({ runId: 'r1', agentType: 'screening', orgId: 'o1', userMessage: 'x' });

    _accumulateTokens(run, {
      input_tokens: 500, output_tokens: 200,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 900
    });
    _accumulateTokens(run, {
      input_tokens: 50,  output_tokens: 180,
      cache_read_input_tokens: 900, cache_creation_input_tokens: 100
    });
    _accumulateTokens(run, {
      input_tokens: 50,  output_tokens: 350,
      cache_read_input_tokens: 1000, cache_creation_input_tokens: 0
    });

    expect(run.tokensUsed.input).toBe(600);
    expect(run.tokensUsed.output).toBe(730);
    expect(run.tokensUsed.cacheRead).toBe(1900);
    expect(run.tokensUsed.cacheCreated).toBe(1000);
  });

  test('handles missing cache fields gracefully (older API response shape)', () => {
    const run = createRunRecord({ runId: 'r2', agentType: 'screening', orgId: 'o1', userMessage: 'x' });
    _accumulateTokens(run, { input_tokens: 100, output_tokens: 50 });
    expect(run.tokensUsed.cacheRead).toBe(0);
    expect(run.tokensUsed.cacheCreated).toBe(0);
  });

  test('does not go negative when cache fields are zero', () => {
    const run = createRunRecord({ runId: 'r3', agentType: 'screening', orgId: 'o1', userMessage: 'x' });
    _accumulateTokens(run, { input_tokens: 0, output_tokens: 0,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    expect(run.tokensUsed.input).toBe(0);
    expect(run.tokensUsed.cacheRead).toBe(0);
  });
});
