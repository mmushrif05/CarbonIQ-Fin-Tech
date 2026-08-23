/**
 * The clock a serverless request runs against.
 *
 * A Netlify function is killed at 26 seconds. Nothing in the request path
 * knew that: the SDK allowed 20 seconds per call with a retry (40s), the
 * agent loop allowed 20 iterations at 32,000 output tokens, and the PDF
 * transcription ran non-streamed at 16,000. The sum could not fit, so the
 * process was killed mid-request — and a killed process returns no body, so
 * the browser fell back to the bare string "Mapping failed".
 *
 * These tests pin the properties that stop that happening again.
 */

'use strict';

const { Deadline, RESPONSE_MARGIN_MS, MIN_USEFUL_MS } = require('../services/agents/deadline');

describe('A deadline never hands out more time than the request has', () => {
  test('a call is capped by what remains, not by what it asks for', () => {
    const d = new Deadline(26000);
    expect(d.timeoutFor(20000)).toBe(20000);          // fits early on
    expect(d.timeoutFor(60000)).toBeLessThanOrEqual(26000 - RESPONSE_MARGIN_MS);
  });

  test('a nearly spent budget yields a small timeout, never a negative one', () => {
    const d = new Deadline(26000);
    d.endsAt = Date.now() + 800;                       // 0.8s left
    expect(d.timeoutFor(20000)).toBeGreaterThan(0);
    expect(d.timeoutFor(20000)).toBeLessThanOrEqual(1000);
  });

  test('an exhausted budget reports nothing remaining', () => {
    const d = new Deadline(26000);
    d.endsAt = Date.now() - 5000;
    expect(d.remaining()).toBe(0);
    expect(d.canStart()).toBe(false);
  });

  test('response time is reserved, so the answer itself can still be sent', () => {
    const d = new Deadline(26000);
    expect(d.remaining()).toBeLessThanOrEqual(26000 - RESPONSE_MARGIN_MS);
  });
});

describe('Retries are off, because a retry doubles a wall clock there is none of', () => {
  test('client options never permit a retry', () => {
    expect(new Deadline(26000).clientOptions().maxRetries).toBe(0);
  });

  test('the configured default is zero retries', () => {
    jest.resetModules();
    const saved = process.env.ANTHROPIC_MAX_RETRIES;
    delete process.env.ANTHROPIC_MAX_RETRIES;
    const config = require('../config');
    expect(config.anthropicMaxRetries).toBe(0);
    if (saved !== undefined) process.env.ANTHROPIC_MAX_RETRIES = saved;
    jest.resetModules();
  });
});

describe('Work that cannot finish is refused before it starts', () => {
  test('assertCanStart throws a 504 that names the cause and the remedy', () => {
    const d = new Deadline(26000);
    d.endsAt = Date.now() + 100;

    let thrown = null;
    try { d.assertCanStart('map the bill of quantities'); } catch (e) { thrown = e; }

    expect(thrown).toBeTruthy();
    expect(thrown.statusCode).toBe(504);
    expect(thrown.code).toBe('DEADLINE_EXCEEDED');
    expect(thrown.message).toMatch(/map the bill of quantities/);
    expect(thrown.remedy).toMatch(/paste/i);
  });

  test('a fresh deadline lets work begin', () => {
    expect(() => new Deadline(26000).assertCanStart('do the thing')).not.toThrow();
    expect(new Deadline(26000).canStart(MIN_USEFUL_MS)).toBe(true);
  });
});

describe('The budget matches the function it protects', () => {
  test('it defaults to the configured function timeout', () => {
    const config = require('../config');
    expect(new Deadline().budgetMs).toBe(config.functionTimeoutMs);
    expect(config.functionTimeoutMs).toBe(26000);   // netlify.toml: timeout = 26
  });
});
