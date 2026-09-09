/**
 * The dependency direction — the rule that makes the layout enterprise rather
 * than tidy.
 *
 *   src/domains/<name>/domain/        pure engines. Import only their own domain,
 *                                     src/shared, and data/. No I/O, no HTTP, no
 *                                     database, no other domain.
 *   src/domains/<name>/application/   use cases; may import domain, shared, platform,
 *   … agents/ reporting/ desk/         and other domains' non-interface layers.
 *   … infrastructure/
 *   src/domains/<name>/interface/     routes and schemas. Nothing imports these except
 *                                     the same domain's interface and the composition
 *                                     roots.
 *   src/platform/                     never imports a domain. The composition roots —
 *                                     src/server.js, platform/http/router.js and
 *                                     platform/http/schemas.js — are the exception,
 *                                     because mounting the domains is their job.
 *   src/shared/                       imports only src/shared.
 *
 * A convention holds until the first Friday afternoon; this holds until someone
 * edits the test, which is a reviewable event.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const COMPOSITION_ROOTS = new Set(['src/server.js', 'src/platform/http/router.js', 'src/platform/http/schemas.js']);

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

function violations(rule) {
  const found = [];
  for (const rel of files) {
    const from = classify(rel);
    for (const to of edges(path.join(ROOT, rel))) {
      const reason = rule(rel, from, to, classify(to));
      if (reason) found.push(`${rel} -> ${to}  (${reason})`);
    }
  }
  return found;
}

describe('The layout is the one the readiness plan named', () => {
  test('every domain has a domain/ layer, and the platform has its areas', () => {
    const domains = fs.readdirSync(path.join(SRC, 'domains'));
    expect(domains.sort()).toEqual(['capital', 'gcf', 'lending', 'pcaf-part-a', 'pcaf-part-c', 'taxonomy']);
    for (const d of domains) expect(fs.existsSync(path.join(SRC, 'domains', d, 'domain'))).toBe(true);
    for (const a of ['ai', 'auth', 'bridge', 'config', 'database', 'http', 'observability', 'reporting']) {
      expect(fs.existsSync(path.join(SRC, 'platform', a))).toBe(true);
    }
    for (const gone of ['services', 'routes', 'middleware', 'config', 'bridge', 'db', 'models', 'schemas', 'platform', 'server.js']) {
      expect(fs.existsSync(path.join(ROOT, gone))).toBe(false);
    }
  });

  test('PCAF Part A, Part C and the GCF pipeline are three domains that never import one another\'s engines', () => {
    const three = ['pcaf-part-a', 'pcaf-part-c', 'gcf'];
    const found = violations((rel, from, to, dest) =>
      from.kind === 'domain' && from.layer === 'domain' && three.includes(from.domain)
      && dest.kind === 'domain' && dest.domain !== from.domain && three.includes(dest.domain)
        ? 'two scopes that must never merge' : null);
    expect(found).toEqual([]);
  });
});

describe('Dependencies point inward', () => {
  test('a domain/ layer imports only its own domain, src/shared and data/', () => {
    const found = violations((rel, from, to, dest) => {
      if (from.kind !== 'domain' || from.layer !== 'domain') return null;
      if (dest.kind === 'shared' || dest.kind === 'data') return null;
      if (dest.kind === 'domain' && dest.domain === from.domain && dest.layer === 'domain') return null;
      return 'domain layer reaching outside';
    });
    expect(found).toEqual([]);
  });

  test('nothing imports an interface/ except the same domain\'s interface and the composition roots', () => {
    const found = violations((rel, from, to, dest) => {
      if (dest.kind !== 'domain' || dest.layer !== 'interface') return null;
      if (COMPOSITION_ROOTS.has(rel)) return null;
      if (from.kind === 'domain' && from.domain === dest.domain && from.layer === 'interface') return null;
      return 'interface imported from outside';
    });
    expect(found).toEqual([]);
  });

  test('the platform never imports a domain', () => {
    const found = violations((rel, from, to, dest) =>
      from.kind === 'platform' && dest.kind === 'domain' && !COMPOSITION_ROOTS.has(rel) ? 'platform depends on a domain' : null);
    expect(found).toEqual([]);
  });

  test('src/shared imports only src/shared and data/', () => {
    const found = violations((rel, from, to, dest) =>
      from.kind === 'shared' && dest.kind !== 'shared' && dest.kind !== 'data' ? 'shared depends outward' : null);
    expect(found).toEqual([]);
  });

  test('the engines require no database, no HTTP and no AI client', () => {
    const banned = /require\(\s*['"](pg|express|@anthropic-ai\/sdk|firebase-admin|@netlify\/blobs)['"]\s*\)/;
    const offenders = files
      .filter(rel => classify(rel).kind === 'domain' && classify(rel).layer === 'domain')
      .filter(rel => banned.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
