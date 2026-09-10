// @ts-check
/**
 * The static require graph of a CommonJS entry point.
 *
 * Used to answer one question a conformance matrix cannot answer for itself:
 * is the code a rule cites on a path the running application actually reaches?
 * A rule naming a module nothing requires is a claim about dead code, and it
 * reads exactly like a claim about live code.
 *
 * Relative requires only — a package is not this repository's path to prove.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Every file reachable from `entry` by a relative `require`, absolute paths.
 * @param {string} entry
 * @returns {Set<string>}
 */
function requireGraph(entry) {
  const seen = new Set();
  const stack = [path.resolve(entry)];
  while (stack.length) {
    const file = /** @type {string} */ (stack.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    let src = '';
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const resolved = resolveRelative(file, m[1]);
      if (resolved) stack.push(resolved);
    }
  }
  return seen;
}

module.exports = { requireGraph };
