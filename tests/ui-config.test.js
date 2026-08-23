/**
 * CarbonIQ FinTech — UI runtime configuration
 *
 * The dashboard used to ship the key it authenticates with as a literal in
 * ui/config.js. Changing UI_API_KEY in Netlify then broke every screen with a
 * 401, because nothing kept the two in step. These tests pin the properties
 * that stop that recurring: the key comes from the environment, the endpoint
 * that supplies it needs no key itself, and a value is never interpolated
 * into the page as executable script.
 */

const request = require('supertest');
const express = require('express');

const uiConfigRouter = require('../routes/v1/ui-config');

function buildApp() {
  const app = express();
  app.use('/v1', uiConfigRouter);
  return app;
}

describe('GET /v1/ui-config.js', () => {
  const original = process.env.UI_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.UI_API_KEY;
    else process.env.UI_API_KEY = original;
  });

  test('serves the key held by the deployment, not one committed to the repo', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    expect(res.text).toContain('ck_test_abcdefghijklmnopqrstuvwxyz123456');
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  test('requires no API key — it is what supplies one', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    // No x-api-key header at all.
    await request(buildApp()).get('/v1/ui-config.js').expect(200);
  });

  test('is never cached — a rotated key must not be served from a CDN copy', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('an unset variable yields a parseable script, not a broken page', async () => {
    delete process.env.UI_API_KEY;
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    expect(res.text).toContain('""');
    expect(() => new Function(res.text)).not.toThrow();
  });

  test('a mis-pasted value cannot become executable script', async () => {
    process.env.UI_API_KEY = 'ck_test_x";window.pwned=1;//';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    // Executing it is the proof, not the shape of the escaping: the payload
    // must stay inside the string literal rather than run.
    const win = {};
    const store = { getItem: () => null };
    new Function('window', 'localStorage', res.text)(win, store);

    expect(win.pwned).toBeUndefined();
    expect(win.CARBONIQ_API_KEY).toBe('ck_test_x";window.pwned=1;//');
  });

  test('a stored key set by an operator wins over the served one', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    expect(res.text).toContain('if (stored.apiKey) return;');
  });
});

describe('the repository no longer carries the deployment key', () => {
  const fs = require('fs');
  const path = require('path');

  test('ui/config.js ships no ck_live_ literal', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'config.js'), 'utf8');
    expect(src).not.toMatch(/ck_live_[a-zA-Z0-9]{32}/);
  });

  test('index.html loads the served config after the static one', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
    const staticAt = html.indexOf('src="config.js"');
    const servedAt = html.indexOf('src="/v1/ui-config.js"');

    expect(staticAt).toBeGreaterThan(-1);
    expect(servedAt).toBeGreaterThan(staticAt);
  });
});
