// @ts-check
/**
 * A mock of the Anthropic SDK shaped like the one the code actually calls.
 *
 * Three suites mocked `messages.create`. The production loop uses
 * `client.messages.stream(params).finalMessage()` — so those mocks stood in
 * for a method the agent never reaches, the real client was constructed, and
 * the tests asserted 401s from the door rather than anything past it. That is
 * also why `platform/ai/agent.js` sat at 75% with the multi-turn tool loop and
 * `pause_turn` resumption uncovered.
 *
 * This mocks both surfaces from one script of replies, so a test can drive a
 * single answer, a tool call and its follow-up, or a `pause_turn` resumption,
 * and a suite cannot pass by mocking a path the code does not take.
 *
 * Usage, at the top of a suite:
 *
 *     const { mockAnthropic } = require('./helpers/anthropic');
 *     const ai = mockAnthropic();          // hoisted jest.mock inside
 *     ai.reply({ text: '{"materials": []}' });
 */

'use strict';

/** A `messages.create`/`finalMessage` response with a text block. */
function textMessage(text, extra = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 },
    ...extra,
  };
}

/** A response asking for one tool call. */
function toolUseMessage(name, input, id = 'toolu_test') {
  return textMessage('', {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
  });
}

/** A response that ran out of server-side tool iterations. */
function pauseTurnMessage() {
  return textMessage('', { stop_reason: 'pause_turn', content: [{ type: 'text', text: '' }] });
}

/**
 * Install the mock. Call at module scope, before requiring anything that
 * constructs a client.
 *
 * @returns {{reply: (m: any) => void, script: (ms: any[]) => void, calls: () => any[], reset: () => void}}
 */
function mockAnthropic() {
  /** @type {any[]} */
  const queue = [];
  /** @type {any[]} */
  const calls = [];

  const next = params => {
    calls.push(params);
    return queue.length > 1 ? queue.shift() : (queue[0] || textMessage('{}'));
  };

  jest.mock('@anthropic-ai/sdk', () => {
    class MockAnthropic {
      constructor() {
        this.messages = {
          create: async params => next(params),
          /* The shape the agent loop uses. `.stream()` is synchronous and
             returns an object carrying `finalMessage()`. */
          stream: params => ({
            finalMessage: async () => next(params),
            on: () => undefined,
            abort: () => undefined,
          }),
        };
        this.beta = { files: { upload: async () => ({ id: 'file_test' }) } };
      }
    }
    /* The module object is the constructor. `extract.js` does
       `const Anthropic = require('@anthropic-ai/sdk')` and `new Anthropic(...)`,
       while `agent.js` reaches the same class through the interop default — so
       a mock that only exports `default` breaks the first with "Anthropic is
       not a constructor", which is exactly what the SDK's own shape avoids. */
    MockAnthropic.default = MockAnthropic;
    MockAnthropic.Anthropic = MockAnthropic;
    return MockAnthropic;
  });

  return {
    reply(m) { queue.length = 0; queue.push(typeof m === 'string' ? textMessage(m) : m); },
    script(ms) { queue.length = 0; queue.push(...ms); },
    calls: () => calls,
    reset() { queue.length = 0; calls.length = 0; },
  };
}

module.exports = { mockAnthropic, textMessage, toolUseMessage, pauseTurnMessage };
