// @ts-check
/**
 * Sweeping the source, with a failure a person can act on.
 *
 * Sixteen suites hold rules about the frontend by matching its source, and the
 * rules are right: `[hidden]` beaten by a class rule covered a page from load,
 * a bar on an inline element rendered as nothing, a `<select>` pushed a page
 * 78px wide, and a control read after the first fetch lost its own state. Each
 * shipped once with a unit test passing, and a sweep is what catches the next.
 *
 * The instrument was the problem. `expect(HTML).toMatch(/…/)` prints the whole
 * module as the received value — one rename produced 702 lines of terminal
 * output with no file, no line and no instruction. A developer who hits three
 * of those in a week starts deleting assertions, and takes the good rules down
 * with the bad.
 *
 * So these say the same things and fail differently: the file, the rule, the
 * line the offending text is on, and what to do about it. Never the module.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * A file of the frontend, read once, carrying its own path.
 * @param {string} rel repo-relative, e.g. `ui/pages/desk.html`
 */
function source(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  /* It carries its path, and still behaves like the string it wraps: a test
     that legitimately needs `indexOf` to prove one thing is wired before
     another should not have to reach through a property to get it. */
  return {
    rel,
    text,
    toString: () => text,
    valueOf: () => text,
    get length() { return text.length; },
    match: (/** @type {any} */ p) => text.match(p),
    matchAll: (/** @type {any} */ p) => text.matchAll(p),
    indexOf: (/** @type {string} */ p, /** @type {number} */ from = 0) => text.indexOf(p, from),
    lastIndexOf: (/** @type {string} */ p) => text.lastIndexOf(p),
    includes: (/** @type {string} */ p) => text.includes(p),
    split: (/** @type {any} */ p) => text.split(p),
    slice: (/** @type {number} */ a = 0, /** @type {number|undefined} */ b = undefined) => text.slice(a, b),
    replace: (/** @type {any} */ a, /** @type {any} */ b) => text.replace(a, b),
    search: (/** @type {any} */ p) => text.search(p),
  };
}

/** The 1-based line an offset falls on. */
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** A few lines around `line`, numbered, for context. */
function excerpt(text, line, span = 2) {
  const lines = text.split('\n');
  const from = Math.max(1, line - span);
  const to = Math.min(lines.length, line + span);
  return lines.slice(from - 1, to)
    .map((l, i) => `${String(from + i).padStart(5)} | ${l.length > 160 ? `${l.slice(0, 160)}…` : l}`)
    .join('\n');
}

const asRegExp = p => (p instanceof RegExp ? p : new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

/**
 * The file must carry this. On failure: the file, the rule, and what to do —
 * not the file's contents.
 *
 * @param {{rel: string, text: string}} src
 * @param {RegExp|string} pattern
 * @param {string} rule what the pattern is for, in words
 * @param {string} [remedy] what to do about it
 */
function must(src, pattern, rule, remedy) {
  const re = asRegExp(pattern);
  if (re.test(src.text)) return;
  throw new Error(
    `${src.rel} does not carry: ${rule}\n`
    + `  expected to match: ${re}\n`
    + (remedy ? `  ${remedy}\n` : ''));
}

/**
 * The file must not carry this. On failure: every place it does, by line.
 *
 * @param {{rel: string, text: string}} src
 * @param {RegExp|string} pattern
 * @param {string} rule
 * @param {string} [remedy]
 */
function mustNot(src, pattern, rule, remedy) {
  const re = new RegExp(asRegExp(pattern).source, `${asRegExp(pattern).flags.replace(/g/, '')}g`);
  const hits = [...src.text.matchAll(re)].slice(0, 5);
  if (!hits.length) return;
  const where = hits.map(m => {
    const line = lineOf(src.text, m.index || 0);
    return `  ${src.rel}:${line}\n${excerpt(src.text, line, 1)}`;
  }).join('\n\n');
  throw new Error(`${src.rel} breaks the rule: ${rule}\n\n${where}\n${remedy ? `\n  ${remedy}\n` : ''}`);
}

/**
 * Sweep many files for one rule.
 * @param {{rel: string, text: string}[]} files
 * @param {RegExp|string} pattern
 * @param {string} rule
 * @param {string} [remedy]
 */
function noneMay(files, pattern, rule, remedy) {
  const broken = [];
  for (const f of files) {
    try { mustNot(f, pattern, rule, remedy); } catch (err) { broken.push(/** @type {Error} */ (err).message); }
  }
  if (broken.length) throw new Error(broken.join('\n\n'));
}

module.exports = { source, must, mustNot, noneMay, excerpt, lineOf, ROOT };
