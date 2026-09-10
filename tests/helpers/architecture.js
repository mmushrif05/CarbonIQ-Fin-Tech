// @ts-check
/**
 * The dependency-direction checker, as a function.
 *
 * It lived inside `tests/architecture.test.js`, which meant the one test that
 * proves it actually catches a violation had to write a probe module into
 * `src/domains/gcf/domain/` and shell out to a nested Jest run — leaving a
 * stray file in the source tree on any interrupt, and costing two minutes to
 * establish what a function call establishes in a millisecond.
 *
 * It is here so both the suite and that proof can call it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

/* src/jobs.js registers the domain engines as job handlers on the platform's queue — a fourth root. */
const COMPOSITION_ROOTS = new Set(['src/server.js', 'src/platform/http/router.js', 'src/platform/http/schemas.js', 'src/jobs.js']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function classify(rel) {
  let m = rel.match(/^src\/domains\/([^/]+)\/([^/]+)\//);
  if (m) return { kind: 'domain', domain: m[1], layer: m[2] };
  m = rel.match(/^src\/platform\/([^/]+)\//);
  if (m) return { kind: 'platform', area: m[1] };
  if (rel.startsWith('src/shared/')) return { kind: 'shared' };
  if (rel.startsWith('src/')) return { kind: 'root' };
  if (rel.startsWith('data/')) return { kind: 'data' };
  return { kind: 'outside' };
}

/** Every relative require in a file, resolved to a repo-relative path. */
function edges(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(/require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) {
    let target;
    try { target = require.resolve(path.resolve(path.dirname(file), m[1])); } catch (_) { continue; }
    out.push(path.relative(ROOT, target).split(path.sep).join('/'));
  }
  return out;
}

const files = walk(SRC).map(f => path.relative(ROOT, f).split(path.sep).join('/'));

/**
 * Every edge in the tree that breaks `rule`.
 *
 * `extra` adds edges the tree does not have — a `{ rel, to }` pair the checker
 * treats exactly like one it read from disk. It exists so the exit criterion
 * below can prove the checker catches a violation without writing a probe file
 * into `src/` and shelling out to a nested Jest run: that test left a stray
 * module in the source tree on any Ctrl-C, and took two minutes.
 *
 * @param {(rel: string, from: any, to: string, dest: any) => (string|null)} rule
 * @param {Array<{rel: string, to: string}>} [extra]
 */
function violations(rule, extra = []) {
  const found = [];
  const all = [
    ...files.map(rel => ({ rel, to: null })),
    ...extra,
  ];
  for (const entry of all) {
    const from = classify(entry.rel);
    const outgoing = entry.to ? [entry.to] : edges(path.join(ROOT, entry.rel));
    for (const to of outgoing) {
      const reason = rule(entry.rel, from, to, classify(to));
      if (reason) found.push(`${entry.rel} -> ${to}  (${reason})`);
    }
  }
  return found;
}

/** The rule the exit criterion probes: a domain engine reaching outside itself. */
const DOMAIN_ISOLATION = (rel, from, to, dest) => {
  if (!(from.kind === 'domain' && from.layer === 'domain')) return null;
  if (dest.kind === 'domain' && dest.domain !== from.domain) return 'domain layer reaching outside its own domain';
  return null;
};

module.exports = { ROOT, SRC, COMPOSITION_ROOTS, walk, classify, edges, files, violations, DOMAIN_ISOLATION };
