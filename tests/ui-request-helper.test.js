'use strict';

/**
 * The browser's request helper, and the one sentence the browser gives for
 * a request that never got an answer.
 *
 * "Failed to fetch" names nothing: not the request, not the base it was sent
 * to, not whether it was asked again. Two screens in a row showed it over an
 * empty page, and the only way to learn which of five reads had failed was
 * the developer tools. The helper now names the request, base included, asks
 * a read once more before giving up, and never asks a write twice.
 */

const vm = require('vm');

const { source } = require('./helpers/ui-source');

/* Through the located helper, as every suite that reads the frontend does —
   this one executes the file rather than sweeping it, and the instrument
   holds the two the same way. */
const SRC = source('ui/config.js').text;

function boot(fetchImpl, stored) {
  const store = new Map(stored ? [['carboniq_config', JSON.stringify(stored)]] : []);
  const sandbox = {
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    fetch: fetchImpl,
    setTimeout: (fn) => fn(),
    document: { getElementById: () => null },
    requestAnimationFrame: fn => fn(),
    JSON,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'ui/config.js' });
  return sandbox;
}

const networkError = () => Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });

describe('A request that got no answer', () => {
  test('names the request, base included, and says the server sent nothing', async () => {
    const calls = [];
    const w = boot(async url => { calls.push(url); throw networkError(); }, { apiBase: 'https://old-host.example' });
    await expect(w.CARBONIQ_fetch('/v1/gcf/report')).rejects.toMatchObject({
      code: 'NO_RESPONSE',
      url: 'https://old-host.example/v1/gcf/report',
      message: expect.stringContaining('The request to https://old-host.example/v1/gcf/report did not complete (Failed to fetch)'),
    });
    expect(calls).toEqual(['https://old-host.example/v1/gcf/report', 'https://old-host.example/v1/gcf/report']);
  });

  test('a read is asked once more, and the second answer is the answer', async () => {
    let n = 0;
    const w = boot(async () => { n += 1; if (n === 1) throw networkError(); return { ok: true, status: 200 }; });
    const res = await w.CARBONIQ_fetch('/v1/gcf/portfolio');
    expect(res.status).toBe(200);
    expect(n).toBe(2);
  });

  test('a write is never asked twice, because it may already have gone through', async () => {
    let n = 0;
    const w = boot(async () => { n += 1; throw networkError(); });
    await expect(w.CARBONIQ_fetch('/v1/gcf/pipeline', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'NO_RESPONSE' });
    expect(n).toBe(1);
  });

  test('an answer that arrived is returned as it was, whatever its status', async () => {
    const w = boot(async () => ({ ok: false, status: 429 }));
    const res = await w.CARBONIQ_fetch('/v1/gcf/gaps');
    expect(res.status).toBe(429);
  });
});
