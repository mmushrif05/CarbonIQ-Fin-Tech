/**
 * GCF conformance matrix — integrity.
 *
 * A conformance claim is only worth what a reviewer can verify, so these tests
 * check that the matrix does not lie about its own evidence: every file it
 * names exists, every test it cites is a real test with that exact name, and
 * the standing disclaimer stays in place.
 *
 * This is the mechanism that stops the claim rotting. A rule can go stale in
 * two ways — the code moves, or the test is renamed — and both are silent
 * without this.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const { conformanceMatrix, RULES, VALID_STATUS } = require('../services/gcf/conformance');

const ROOT = path.join(__dirname, '..');
const auth = r => r.set('x-api-key', process.env.UI_API_KEY);
const api = () => request(app);

/** The file paths a rule's implementation text references. */
function referencedFiles(text) {
  const out = new Set();
  for (const m of String(text).matchAll(
    /\b((?:services|data|tests|config|models|routes|schemas|ui)\/[\w./-]*\.\w+)/g)) {
    out.add(m[1]);
  }
  return [...out];
}

describe('Every rule is well formed', () => {
  test('there are enough rules to be a matrix, with unique ids', () => {
    expect(RULES.length).toBeGreaterThan(20);
    const ids = RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each rule carries a clause, a rule statement and a valid status', () => {
    for (const r of RULES) {
      /* A clause reference can legitimately be short — "GRI 305-5" is nine
         characters and is a complete citation. The rule statement cannot be. */
      expect(r.clause.length).toBeGreaterThan(7);
      expect(r.rule.length).toBeGreaterThan(30);
      expect(VALID_STATUS).toContain(r.status);
    }
  });

  test('anything not fully implemented explains itself', () => {
    for (const r of RULES.filter(x => x.status !== 'implemented')) {
      expect(r.limitation).toBeTruthy();
      expect(r.limitation.length).toBeGreaterThan(40);
    }
  });

  test('an implemented rule names both an implementation and a test', () => {
    for (const r of RULES.filter(x => x.status !== 'excluded')) {
      expect(r.implementation).toBeTruthy();
      expect(r.test).toBeTruthy();
    }
  });
});

describe('The citations resolve — this is what stops the claim rotting', () => {
  test('every file a rule names exists on disk', () => {
    const missing = [];
    for (const r of RULES) {
      if (!r.implementation) continue;
      for (const f of referencedFiles(r.implementation)) {
        if (!fs.existsSync(path.join(ROOT, f))) missing.push(`${r.id} → ${f}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every test file a rule cites exists', () => {
    const missing = [];
    for (const r of RULES) {
      if (!r.test) continue;
      const file = r.test.split('›')[0].trim();
      if (!fs.existsSync(path.join(ROOT, file))) missing.push(`${r.id} → ${file}`);
    }
    expect(missing).toEqual([]);
  });

  test('every cited test name is actually present in its file', () => {
    /* The half that catches a rename. A file that still exists while the test
       inside it has been renamed is exactly how a matrix goes quietly wrong. */
    const missing = [];
    for (const r of RULES) {
      if (!r.test) continue;
      const parts = r.test.split('›').map(s => s.trim());
      const file = parts[0];
      const leaf = parts[parts.length - 1];
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (!src.includes(leaf)) missing.push(`${r.id} → "${leaf}" not found in ${file}`);
    }
    expect(missing).toEqual([]);
  });

  test('every describe block a rule cites is present too', () => {
    const missing = [];
    for (const r of RULES) {
      if (!r.test) continue;
      const parts = r.test.split('›').map(s => s.trim());
      if (parts.length < 3) continue;
      const src = fs.readFileSync(path.join(ROOT, parts[0]), 'utf8');
      for (const block of parts.slice(1, -1)) {
        if (!src.includes(block)) missing.push(`${r.id} → describe "${block}" not in ${parts[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('The claim is bounded', () => {
  test('the matrix disclaims GCF endorsement on its face', () => {
    const m = conformanceMatrix();
    expect(m.disclaimer).toMatch(/Nothing here is endorsed by the Green Climate Fund/);
    expect(m.disclaimer).toMatch(/does not score a proposal on GCF's behalf/);
    expect(m.disclaimer).toMatch(/self-declaration/);
  });

  test('nothing anywhere claims GCF approval, endorsement or certification', () => {
    const flat = JSON.stringify(conformanceMatrix());
    expect(flat).not.toMatch(/GCF[- ](approved|endorsed|certified)/i);
    expect(flat).not.toMatch(/(approved|endorsed|certified) by (the )?GCF/i);
  });

  test('what is out of scope is stated rather than left to be inferred', () => {
    const excluded = RULES.filter(r => r.status === 'excluded');
    expect(excluded.length).toBeGreaterThan(1);
    const flat = excluded.map(r => r.limitation).join(' ');
    expect(flat).toMatch(/Funding Proposal/);
    expect(flat).toMatch(/Milestone 4/);
  });

  test('it cites the real Terms of Reference, by version', () => {
    expect(conformanceMatrix().source).toMatch(/21 November 2025/);
    expect(conformanceMatrix().source).toMatch(/DFCC Bank PLC/);
  });
});

describe('Over HTTP', () => {
  test('the matrix is served with its summary', async () => {
    const res = await auth(api().get('/v1/gcf/conformance')).expect(200);
    expect(res.body.summary.total).toBe(RULES.length);
    expect(res.body.summary.implemented).toBeGreaterThan(20);
    expect(res.body.rules).toHaveLength(RULES.length);
  });

  test('it needs a key', async () => {
    await api().get('/v1/gcf/conformance').expect(401);
  });
});
