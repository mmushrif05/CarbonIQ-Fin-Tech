/**
 * PCAF Part A §5.2 — conformance matrix integrity.
 *
 * A conformance claim is only worth what a reviewer can verify. These tests
 * check that the matrix does not lie about its own evidence: every file it
 * names exists, every test it cites is a real test, the standing disclaimer
 * about PCAF not endorsing software stays in place, and the endorsement guard
 * catches the matrix itself. Whether the cited test actually *executes* the
 * cited code is a separate, stronger check — docs/CONFORMANCE-EVIDENCE.md and
 * tests/conformance-evidence.test.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/server');
const { conformanceMatrix, RULES, VALID_EVIDENCE } = require('../src/domains/pcaf-part-a/domain/conformance');
const { containsForbiddenLanguage } = require('../src/shared/report-integrity');

const ROOT = path.join(__dirname, '..');
const VALID_STATUS = ['implemented', 'partial', 'excluded'];

/** Pull the file paths a rule references out of its implementation text. */
function referencedFiles(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?<![\w/])((?:src|data)\/[\w./-]*\.\w+)/g)) out.add(m[1]);
  for (const m of text.matchAll(/(?<![\w/])((?:src|data)\/[\w./-]*)\{([^}]+)\}(\.\w+)/g)) {
    for (const part of m[2].split(',')) out.add(`${m[1]}${part.trim()}${m[3]}`);
  }
  return [...out];
}

describe('Conformance matrix — shape', () => {
  test('every rule is complete and well-formed', () => {
    expect(RULES.length).toBeGreaterThan(20);
    const ids = new Set();
    for (const r of RULES) {
      expect(typeof r.id).toBe('string');
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(typeof r.clause).toBe('string');
      expect(r.clause.length).toBeGreaterThan(5);
      for (const field of ['rule', 'implementation', 'test']) {
        expect(typeof r[field]).toBe('string');
        expect(r[field].length).toBeGreaterThan(20);
      }
      expect(VALID_STATUS).toContain(r.status);
      if (r.evidence) expect(VALID_EVIDENCE).toContain(r.evidence);
    }
  });

  test('anything not fully implemented states its limitation', () => {
    for (const r of RULES.filter(x => x.status !== 'implemented')) {
      expect(typeof r.limitation).toBe('string');
      expect(r.limitation.length).toBeGreaterThan(20);
    }
  });

  test('the summary adds up', () => {
    const s = conformanceMatrix().summary;
    const counted = VALID_STATUS.reduce((n, k) => n + (s[k] || 0), 0);
    expect(counted).toBe(s.total);
    expect(s.total).toBe(RULES.length);
  });
});

describe('Conformance matrix — evidence is real', () => {
  test('every file a rule names actually exists', () => {
    const missing = [];
    for (const r of RULES) {
      for (const f of referencedFiles(r.implementation)) {
        if (!fs.existsSync(path.join(ROOT, f))) missing.push(`${r.id} -> ${f}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every rule cites a test file that exists', () => {
    const missing = [];
    for (const r of RULES) {
      const file = (r.test.match(/(tests\/[\w.-]+\.test\.js)/) || [])[1];
      if (!file) { missing.push(`${r.id} -> no test file cited`); continue; }
      if (!fs.existsSync(path.join(ROOT, file))) missing.push(`${r.id} -> ${file}`);
    }
    expect(missing).toEqual([]);
  });

  test('every cited test name is a real describe or test in that file', () => {
    const missing = [];
    for (const r of RULES) {
      const file = (r.test.match(/(tests\/[\w.-]+\.test\.js)/) || [])[1];
      if (!file) continue;
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const parts = r.test.split('›').map(p => p.trim()).filter(Boolean);
      const leaf = parts[parts.length - 1]
        .replace(/\s*\(\d+ tests?\)/, '')
        .split('—')[0]
        .trim();
      if (leaf.startsWith('tests/')) continue;
      if (!src.includes(leaf)) missing.push(`${r.id} -> "${leaf}" not found in ${file}`);
    }
    expect(missing).toEqual([]);
  });

  test('a rule proved by absence still cites the test that asserts the absence', () => {
    for (const r of RULES.filter(x => x.evidence === 'absence')) {
      expect(r.test).toBeTruthy();
      const file = (String(r.test).match(/(tests\/[\w.-]+\.test\.js)/) || [])[1];
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });
});

describe('Conformance matrix — honesty', () => {
  test('the disclaimer that PCAF does not endorse software is present', () => {
    const m = conformanceMatrix();
    expect(m.disclaimer).toMatch(/does not approve, endorse or certify/i);
    expect(m.statement).toMatch(/self-declaration/i);
  });

  test('it does not blur the GHG Protocol review of the Third Edition additions', () => {
    expect(conformanceMatrix().disclaimer).toMatch(/GHG Protocol/i);
  });

  test('the matrix itself claims no endorsement', () => {
    const text = JSON.stringify(conformanceMatrix());
    expect(containsForbiddenLanguage(text)).toEqual([]);
  });

  test('the scope wall and the language guard are both declared', () => {
    const ids = RULES.map(r => r.id);
    expect(ids).toContain('A-SCOPE-04'); // three scopes never merge
    expect(ids).toContain('A-SCOPE-05'); // PCAF-conformant, never endorsement
  });
});

describe('Conformance matrix — API', () => {
  test('GET /conformance publishes the matrix', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/conformance')
      .set('x-api-key', process.env.UI_API_KEY);
    if (res.status !== 200) return;
    expect(res.body.rules.length).toBe(RULES.length);
    expect(res.body.disclaimer).toMatch(/does not approve, endorse or certify/i);
    expect(res.body.summary.total).toBe(RULES.length);
  });
});
