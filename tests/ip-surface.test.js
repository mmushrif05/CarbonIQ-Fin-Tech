/**
 * What the deployed site is allowed to give away.
 *
 * The methodology statement is the whole method: every equation the engine
 * executes, every factor with its tier and named source, the worked example,
 * the declared limits. Published, it is the one artefact from which the
 * product could be rebuilt.
 *
 * It is therefore not on the website — not as a page, not as a script, not as
 * a stylesheet, and not as an endpoint. The engine that builds it stays in the
 * repository and the annual disclosure still renders it, because a disclosure
 * is **issued to a named recipient** rather than published. Removing the
 * surface must not remove the asset, and this suite asserts both halves.
 *
 * A sweep rather than a walk. A page can come back by way of a nav entry
 * somebody re-adds, an orphan file the publish directory still ships, or a
 * route restored in a merge, and each of those is silent.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);

/** Everything Netlify publishes. `publish = "ui"` in netlify.toml. */
function publishedFiles(dir = 'ui', acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) publishedFiles(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

describe('The methodology is not on the website', () => {
  test('no file that serves it is in the publish directory', () => {
    const offenders = publishedFiles().filter(f => /methodology/i.test(f));
    expect(offenders).toEqual([]);
  });

  test('the shell has no nav entry, no container and no script for it', () => {
    const index = read('ui/index.html');
    expect(index).not.toMatch(/data-page="methodology"/);
    expect(index).not.toMatch(/page-methodology/);
    expect(index).not.toMatch(/js\/methodology\.js/);
    expect(index).not.toMatch(/css\/methodology\.css/);
  });

  test('the page registry does not know the id', () => {
    /* Registered but unreachable is still reachable: the router navigates on
       a hash, so a leftover entry restores the page from the address bar. */
    const app_js = read('ui/app.js');
    expect(app_js).not.toMatch(/'methodology'/);
  });

  test('nothing served to a browser mentions it at all', () => {
    const offenders = publishedFiles()
      .filter(f => /\.(html|js|css)$/.test(f))
      .filter(f => /methodology/i.test(read(f)))
      /* Two mentions are not ours to protect: the PCAF attribution formula is
         published in the standard, and "PCAF v3 methodology" is a column
         label naming which standard a figure follows. */
      .filter(f => !/Methodology: Outstanding|PCAF v3 methodology/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('The endpoint is absent, not forbidden', () => {
  /* A 403 announces that something exists to be taken. Absence announces
     nothing, which is the point. */
  test.each([
    '/v1/pcaf/part-c/methodology',
    '/v1/pcaf/part-c/methodology?format=json',
    '/v1/pcaf/part-c/methodology?format=pdf',
    '/v1/pcaf/part-c/methodology?format=docx',
  ])('%s returns 404', async (url) => {
    const res = await auth(request(app).get(url));
    expect(res.status).toBe(404);
  });

  test('and 404 without a key too, so the key is not what is protecting it', async () => {
    const res = await request(app).get('/v1/pcaf/part-c/methodology');
    expect([401, 404]).toContain(res.status);
  });
});

describe('The asset survives the removal', () => {
  test('the engine is still in the repository', () => {
    expect(fs.existsSync(path.join(ROOT, 'services/partc-methodology.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'services/partc-methodology-doc.js'))).toBe(true);
  });

  test('the annual disclosure still builds its methodology section from it', () => {
    /* This is the distinction that matters: a disclosure is issued to a named
       recipient, a website is issued to everyone. */
    expect(read('services/partc-disclosure.js')).toMatch(/partc-methodology/);
  });

  test('and it still produces a complete statement when asked', () => {
    const { buildMethodology } = require('../services/partc-methodology');
    const m = buildMethodology();
    expect(m.calculationChain.length).toBeGreaterThan(0);
    expect(m.factorStore.rowCount).toBeGreaterThan(0);
  });
});
