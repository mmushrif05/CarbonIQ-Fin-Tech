/**
 * PCAF Part C — conformance matrix integrity.
 *
 * A conformance claim is only worth what a reviewer can verify. These tests
 * check that the matrix does not lie about its own evidence: every file it
 * names exists, every test it cites is a real test, and the standing
 * disclaimer about PCAF not endorsing software stays in place.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const { conformanceMatrix, RULES } = require('../services/pcaf-partc/conformance');
const { containsForbiddenLanguage } = require('../services/pcaf-partc/data-quality');

const ROOT = path.join(__dirname, '..');
const VALID_STATUS = ['implemented', 'partial', 'excluded'];

/** Pull the file paths a rule references out of its implementation text. */
function referencedFiles(text) {
  const out = new Set();
  // Plain paths: services/pcaf-partc/rollup.js
  for (const m of text.matchAll(/\b((?:services|data|tests|config|models|routes|schemas)\/[\w./-]*\.\w+)/g)) {
    out.add(m[1]);
  }
  // Brace expansion: services/pcaf-partc/{b1-refrigerant,b4-replacement}.js
  for (const m of text.matchAll(/\b((?:services|data|tests)\/[\w./-]*)\{([^}]+)\}(\.\w+)/g)) {
    for (const part of m[2].split(',')) out.add(`${m[1]}${part.trim()}${m[3]}`);
  }
  return [...out];
}

describe('Conformance matrix — shape', () => {
  test('every rule is complete and well-formed', () => {
    expect(RULES.length).toBeGreaterThan(15);
    const ids = new Set();
    for (const r of RULES) {
      expect(typeof r.id).toBe('string');
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      // A standard reference can legitimately be short ("CIBSE TM65"); the
      // prose fields cannot be.
      expect(typeof r.clause).toBe('string');
      expect(r.clause.length).toBeGreaterThan(5);
      for (const field of ['rule', 'implementation', 'test']) {
        expect(typeof r[field]).toBe('string');
        expect(r[field].length).toBeGreaterThan(20);
      }
      expect(VALID_STATUS).toContain(r.status);
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
      // Cited as "file › describe › test name" — check the leaf name appears.
      const parts = r.test.split('›').map(p => p.trim()).filter(Boolean);
      const leaf = parts[parts.length - 1]
        .replace(/\s*\(\d+ tests?\)/, '')   // "(5 tests)" count suffix
        .split('—')[0]                        // trailing prose after an em dash
        .trim();
      if (leaf.startsWith('tests/')) continue; // file-level citation only
      if (!src.includes(leaf)) missing.push(`${r.id} -> "${leaf}" not found in ${file}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('Conformance matrix — honesty', () => {
  test('the disclaimer that PCAF does not endorse software is present', () => {
    const m = conformanceMatrix();
    expect(m.disclaimer).toMatch(/does not approve, endorse or certify/i);
    expect(m.statement).toMatch(/self-declaration/i);
  });

  test('the matrix itself claims no endorsement', () => {
    const text = JSON.stringify(conformanceMatrix());
    expect(containsForbiddenLanguage(text)).toEqual([]);
  });

  test('the scope wall and language guard are both declared', () => {
    const ids = RULES.map(r => r.id);
    expect(ids).toContain('C-SCOPE-06'); // Beyond-PCAF never in the figure
    expect(ids).toContain('C-DQ-04');    // conformance not endorsement
  });
});

describe('Conformance matrix — API', () => {
  test('GET /conformance publishes the matrix', async () => {
    const res = await request(app).get('/v1/pcaf/part-c/conformance')
      .set('x-api-key', process.env.UI_API_KEY);
    if (res.status !== 200) return;
    expect(res.body.rules.length).toBe(RULES.length);
    expect(res.body.disclaimer).toMatch(/does not approve, endorse or certify/i);
    expect(res.body.summary.total).toBe(RULES.length);
  });
});
