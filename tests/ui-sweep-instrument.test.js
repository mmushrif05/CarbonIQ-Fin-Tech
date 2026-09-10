// @ts-check
/**
 * The instrument, not the rules.
 *
 * Sixteen suites hold the frontend to rules by matching its source, and the
 * rules are worth keeping — each of the four mechanical ones has already cost
 * this codebase a defect that reached a browser with a unit test passing.
 * The instrument was the problem: `expect(HTML).toMatch(/…/)` prints the whole
 * module as the received value, and one rename produced 702 lines of terminal
 * output with no file, no line and no instruction. A developer who meets three
 * of those in a week starts deleting assertions, and takes the good rules down
 * with the bad.
 *
 * `tests/helpers/ui-source.js` says the same things and fails differently.
 * This is what stops the old shape coming back.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { source, must, mustNot } = require('./helpers/ui-source');

/** Every suite that reads the frontend's source. */
const UI_SUITES = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .map(f => ({ name: f, text: fs.readFileSync(path.join(__dirname, f), 'utf8') }))
  /* This file is not one of them: it holds the instrument, so it necessarily
     contains the patterns it forbids — the trap this repository has fallen
     into twice, where a sweep matched its own source. */
  .filter(s => s.name !== path.basename(__filename))
  /* A suite is one of these when it reads a file under `ui/` into a variable.
     A suite that asserts on an HTTP response body, or sweeps a server file,
     is not — it never had the failure this is about. */
  .filter(s => /require\(['"]\.\/helpers\/ui-source['"]\)/.test(s.text)
    || /readFileSync\(path\.join\([^)]*['"]ui[/'"]/.test(s.text));

describe('The frontend sweeps are readable when they fail', () => {
  test('there are sweeps to hold', () => {
    expect(UI_SUITES.length).toBeGreaterThan(5);
  });

  test('every one of them goes through the located helper', () => {
    const without = UI_SUITES.filter(s => !/helpers\/ui-source/.test(s.text)).map(s => s.name);
    expect(without).toEqual([]);
  });

  test('none of them matches a whole file with a bare expect()', () => {
    /* This is the shape that prints the module. A test may still call
       `expect` on anything it derived — a count, a match result, an index —
       but not on the file itself. */
    const offenders = [];
    for (const s of UI_SUITES) {
      const names = [...s.text.matchAll(/^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:source|read)\(/gm)].map(m => m[1]);
      for (const name of names) {
        const re = new RegExp(`expect\\(\\s*${name}\\s*\\)\\s*\\.(?:not\\.)?(?:toMatch|toContain)\\(`, 'g');
        for (const m of s.text.matchAll(re)) {
          const line = s.text.slice(0, m.index).split('\n').length;
          offenders.push(`${s.name}:${line} — expect(${name}).toMatch(…) prints the whole file; use must()/mustNot()`);
        }
      }
      for (const m of s.text.matchAll(/expect\(\s*read\([^)]*\)\s*\)\s*\.(?:not\.)?(?:toMatch|toContain)\(/g)) {
        const line = s.text.slice(0, m.index).split('\n').length;
        offenders.push(`${s.name}:${line} — expect(read(…)).toMatch(…) prints the whole file; use must()/mustNot()`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('A failure names the file, the rule and the line', () => {
  const html = source('ui/pages/desk.html');

  test('a rule the file does not carry names the file and the rule, and stops there', () => {
    let message = '';
    try {
      must(html, /__not_in_this_file__/, 'the thing this rule is for', 'add it to the page');
    } catch (err) { message = /** @type {Error} */ (err).message; }

    expect(message).toContain('ui/pages/desk.html');
    expect(message).toContain('the thing this rule is for');
    expect(message).toContain('add it to the page');
    /* The point of the exercise: the module is not in the message. */
    expect(message.split('\n').length).toBeLessThan(8);
    expect(message).not.toContain('<!doctype');
  });

  test('a rule the file breaks names every line it breaks it on, and no more', () => {
    let message = '';
    try {
      mustNot(html, /display:\s*block/, 'no bar may be a block', 'make it inline');
    } catch (err) { message = /** @type {Error} */ (err).message; }

    expect(message).toMatch(/ui\/pages\/desk\.html:\d+/);
    expect(message).toContain('no bar may be a block');
    expect(message).toContain('make it inline');
    /* Five sites at most, three lines of context each — never the module. */
    expect(message.length).toBeLessThan(4000);
  });

  test('a source still behaves like the string it wraps', () => {
    /* A test that legitimately needs `indexOf` to prove one thing is wired
       before another should not have to reach through a property. */
    expect(html.indexOf('<')).toBeGreaterThanOrEqual(0);
    expect(typeof html.match(/\.dk\s*\{/)).toBe('object');
    expect(html.length).toBeGreaterThan(1000);
    expect(html.rel).toBe('ui/pages/desk.html');
  });
});

void ROOT;
