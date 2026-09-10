/**
 * CarbonIQ FinTech — UI runtime configuration
 *
 * This endpoint used to hand every browser an API key. First it was a literal
 * in ui/config.js, which drifted from the deployment and 401'd every screen;
 * then it was served from the environment, which fixed the drift and left a
 * write-and-lock credential reachable by anyone who could load the page.
 *
 * Since H1 the browser signs in and holds a session token, so there is no
 * credential to serve. What these tests pin now is that there is none — and
 * that everything the endpoint still exists for, the build stamp and the
 * stale-shell reload, survived losing it.
 */

'use strict';

const request = require('supertest');
const express = require('express');

const uiConfigRouter = require('../src/platform/http/ui-config');
const { source, must, mustNot } = require('./helpers/ui-source');

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

  test('serves no credential, even when the deployment holds one', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    expect(res.text).not.toContain('ck_test_abcdefghijklmnopqrstuvwxyz123456');
    expect(res.text).not.toMatch(/API_KEY/);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  test('needs no credential itself, because it carries nothing worth guarding', async () => {
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

  test('an emitted value cannot become executable script', async () => {
    /* Executing it is the proof, not the shape of the escaping. The build
       stamp is the only value left, and a stray character in it must stay
       inside its string literal rather than run. */
    process.env.COMMIT_REF = 'abc";window.pwned=1;//';
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);

    const win = {};
    const store = { getItem: () => null, setItem: () => undefined };
    new Function('window', 'localStorage', 'sessionStorage', res.text)(win, store, store);

    expect(win.pwned).toBeUndefined();
    delete process.env.COMMIT_REF;
  });
});

describe('the repository no longer carries the deployment key', () => {
  const fs = require('fs');
  const path = require('path');

  test('ui/config.js ships no ck_live_ literal', () => {
    const src = source('ui/config.js');
    mustNot(src, /ck_live_[a-zA-Z0-9]{32}/, "ui/config.js ships no ck_live_ literal");
  });

  test('index.html loads the served config after the static one', () => {
    const html = source('ui/index.html');
    const staticAt = html.indexOf('src="config.js"');
    const servedAt = html.indexOf('src="/v1/ui-config.js"');

    expect(staticAt).toBeGreaterThan(-1);
    expect(servedAt).toBeGreaterThan(staticAt);
  });
});

describe('GET /health reports whether the deployment is configured', () => {
  // "The dashboard shows 401" and "the fix is not deployed" look identical
  // from a browser. These booleans settle it in one request, without ever
  // putting a value on the wire.
  const app = require('../src/server');
  const originalUi = process.env.UI_API_KEY;

  afterEach(() => {
    if (originalUi === undefined) delete process.env.UI_API_KEY;
    else process.env.UI_API_KEY = originalUi;
  });

  test('says the UI key is present when it is', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(app).get('/health').expect(200);

    expect(res.body.configured.uiKey).toBe(true);
  });

  test('says the UI key is absent when it is', async () => {
    delete process.env.UI_API_KEY;
    const res = await request(app).get('/health').expect(200);

    expect(res.body.configured.uiKey).toBe(false);
  });

  test('never puts a value on the wire', async () => {
    process.env.UI_API_KEY = 'ck_test_abcdefghijklmnopqrstuvwxyz123456';
    const res = await request(app).get('/health').expect(200);

    expect(JSON.stringify(res.body)).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    Object.values(res.body.configured).forEach(v => expect(typeof v).toBe('boolean'));
  });
});

/*
 * The build stamp. A deploy went out and the screen kept showing the figure it
 * had replaced, which reads as "the fix did not work" rather than "the browser
 * is still on the previous build" — the same confusion /health reports the
 * commit to settle, one layer up. The stamp rides on this response because
 * this response is generated per request, so it can never be the stale copy.
 */
describe('The build stamp', () => {
  test('the served script declares the running build', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    expect(res.text).toMatch(/window\.CARBONIQ_BUILD\s*=/);
  });

  test('it is a string literal, so a stray character cannot become script', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    const m = /var build = ("[^"]*");/.exec(res.text);
    expect(m).not.toBeNull();
    expect(() => JSON.parse(m[1])).not.toThrow();
  });

  test('it is short, and never a whole commit', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    const m = /var build = "([^"]*)";/.exec(res.text);
    expect(m[1].length).toBeLessThanOrEqual(7);
  });

  test('the footer prints it, and prints nothing where there is no build', () => {
    const fs = require('fs');
    const path = require('path');
    const brand = source('ui/js/brand.js');
    must(brand, /window\.CARBONIQ_BUILD\s*\?/, "the footer prints it, and prints nothing where there is no build");
    must(brand, /build \$\{esc\(window\.CARBONIQ_BUILD\)\}/, "the footer prints it, and prints nothing where there is no build");
  });
});

/*
 * Breaking a stale shell.
 *
 * index.html is fetched by path with no hash in its name, so a copy the
 * browser took before the no-cache headers existed is one it is entitled to
 * keep serving. A header only applies to a response the browser actually goes
 * and asks for, so a deploy could be live and still show the previous screen.
 * The signature was unmistakable once seen: the two surfaces that went missing
 * lived in the shell, and the one that appeared was a page fragment, which is
 * refetched on every navigation.
 *
 * The check lives in this script because this script can never itself be the
 * stale copy.
 */
describe('A stale shell reloads itself, once', () => {
  test('the served script compares the build against what the shell recorded', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    expect(res.text).toMatch(/sessionStorage\.getItem\('carboniq_build'\)/);
    expect(res.text).toMatch(/seen !== build/);
  });

  test('it reloads to a URL the cache has no entry for', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    // A plain reload can be answered from the same cached entry.
    expect(res.text).toMatch(/location\.replace\(/);
    expect(res.text).toMatch(/\?b=' \+ encodeURIComponent\(build\)/);
    // The hash is the current screen, so a reload does not also navigate away.
    expect(res.text).toMatch(/\+ location\.hash/);
  });

  test('it cannot loop', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    // One reload per build, marked before the reload is issued.
    expect(res.text).toMatch(/carboniq_reloaded_' \+ build/);
    expect(res.text).toMatch(/setItem\('carboniq_reloaded_' \+ build, '1'\)[\s\S]{0,200}location\.replace/);
    // A browser that cannot store anything skips the check rather than
    // reloading on every load for ever.
    expect(res.text).toMatch(/catch \(e\) \{ \/\* no storage/);
  });

  test('a first visit never reloads, because there is nothing to compare', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    // `seen` must be truthy before a mismatch counts.
    expect(res.text).toMatch(/if \(seen && seen !== build/);
  });

  test('the whole check is skipped where there is no build', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    expect(res.text).toMatch(/if \(build\) \{/);
  });

  test('the build is recorded on a page that is not reloading', async () => {
    const res = await request(buildApp()).get('/v1/ui-config.js').expect(200);
    expect(res.text).toContain('location.replace(');
    expect(res.text).toContain('window.CARBONIQ_BUILD');
  });
});
