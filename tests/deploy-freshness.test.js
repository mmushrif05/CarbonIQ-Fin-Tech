/**
 * A deploy has to reach the browser.
 *
 * The attribution hero shipped, the deploy went green, and the screen still
 * showed the figure the change had replaced. That reads as "the fix did not
 * work", which is the wrong conclusion and an expensive one — it is the same
 * confusion `/health` reports the running commit to settle, one layer up.
 *
 * The cause is structural rather than a mistake. This application is a static
 * shell that fetches its page fragments and its modules by path, and no
 * filename carries a content hash. There is therefore nothing in any URL to
 * tell a cache that a file has changed, so every one of them must be
 * revalidated on load. `no-cache` is the right instruction and not `no-store`:
 * the file is still kept and still answered with a 304 when it has not moved.
 *
 * These tests read netlify.toml rather than the live site, because the rule
 * they protect is a deployment rule and a test that needs the network is a
 * test that gets skipped.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

/** The `for = "..."` globs that carry a Cache-Control, and what each says. */
function headerRules() {
  const rules = [];
  const re = /\[\[headers\]\]\s*\n\s*for\s*=\s*"([^"]+)"\s*\n\s*\[headers\.values\]\s*\n\s*Cache-Control\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(toml)) !== null) rules.push({ glob: m[1], value: m[2] });
  return rules;
}

describe('Every file the shell fetches by a stable name is revalidated', () => {
  const rules = headerRules();

  test('the config declares cache headers at all', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  /*
   * The four kinds of file that make up a build. A page fragment and a page
   * module are the two that actually went stale; the shell and the stylesheets
   * would have gone the same way on the next change to either.
   */
  test.each([
    ['the shell',        '/*.html'],
    ['page fragments',   '/pages/*'],
    ['page modules',     '/js/*'],
    ['stylesheets',      '/css/*'],
    ['bundled data',     '/data/*'],
  ])('%s are never served without asking (%s)', (_label, glob) => {
    const rule = rules.find(r => r.glob === glob);
    expect(rule).toBeTruthy();
    expect(rule.value).toMatch(/no-cache|no-store|max-age=0/);
  });

  test('no rule tells a browser to hold one of them', () => {
    for (const r of rules) {
      const age = /max-age=(\d+)/.exec(r.value);
      if (age) expect(Number(age[1])).toBe(0);
    }
  });

  /*
   * `no-store` would forbid keeping the file at all, so every navigation would
   * re-download the whole shell instead of taking a 304. Correct, and slower
   * than it needs to be.
   */
  test('the instruction is revalidate, not refuse to store', () => {
    const shell = rules.find(r => r.glob === '/*.html');
    expect(shell.value).toBe('no-cache');
  });
});

describe('The build says which build it is', () => {
  test('the deployment stamps the commit into a file the function can read', () => {
    expect(toml).toMatch(/npm run build:info/);
    expect(toml).toMatch(/build-info\.json/);
  });

  test('the served config carries it to the browser', () => {
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'v1', 'ui-config.js'), 'utf8');
    expect(src).toMatch(/window\.CARBONIQ_BUILD/);
  });
});
