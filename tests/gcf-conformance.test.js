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


const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/server');
const { conformanceMatrix, RULES, VALID_STATUS } = require('../src/domains/gcf/domain/conformance');

const ROOT = path.join(__dirname, '..');
const auth = r => r.set('x-api-key', process.env.UI_API_KEY);
const api = () => request(app);

/**
 * The file paths a rule's implementation text references.
 *
 * The alternation used to list the top-level directories the tree had before
 * the domains split — `services|data|tests|config|models|routes|schemas|ui` —
 * and by then every implementation but three lived under `src/`. So this
 * resolved 3 of the matrix's 38 citations and passed green on the other 35,
 * which is the exact failure the file's own header says it exists to prevent:
 * a claim that rots without saying so. `src` is first in the list now, and a
 * test below asserts the count so a future move cannot quietly shrink it again.
 */
function referencedFiles(text) {
  const out = new Set();
  // Plain paths: src/domains/gcf/domain/record.js
  for (const m of String(text).matchAll(
    /(?<![\w/])((?:src|services|data|tests|config|models|routes|schemas|ui)\/[\w./-]*\.\w+)/g)) {
    out.add(m[1]);
  }
  // Brace expansion: src/domains/gcf/domain/{record,emissions}.js
  for (const m of String(text).matchAll(
    /(?<![\w/])((?:src|services|data|tests|ui)\/[\w./-]*)\{([^}]+)\}(\.\w+)/g)) {
    for (const part of m[2].split(',')) out.add(`${m[1]}${part.trim()}${m[3]}`);
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
  test('the sweep actually resolves a citation for every rule that names one', () => {
    /* A check that passes because it had nothing to check is worse than no
       check. This is the assertion that would have failed on the regex this
       file shipped with: it resolved three paths out of thirty-eight and
       reported nothing wrong. */
    const unresolved = RULES
      .filter(r => r.implementation && referencedFiles(r.implementation).length === 0)
      .map(r => `${r.id} → ${r.implementation}`);
    expect(unresolved).toEqual([]);

    /* Rules legitimately share a file, so the floor is the number of citations
       rather than the number of distinct files behind them. */
    const citations = RULES.flatMap(r => referencedFiles(r.implementation || ''));
    expect(citations.length).toBeGreaterThanOrEqual(RULES.filter(r => r.implementation).length);
  });

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

describe('The generated document cannot drift from its source', () => {
  const DOC = path.join(ROOT, 'docs/GCF-CONFORMANCE.md');

  test('it exists and marks itself generated', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    const md = fs.readFileSync(DOC, 'utf8');
    expect(md).toMatch(/GENERATED FILE\. Do not edit by hand/);
    expect(md).toMatch(/npm run docs:gcf-conformance/);
  });

  test('every rule in the matrix appears in the document', () => {
    /* A doc regenerated from a stale checkout is worse than no doc: it reads
       as current. Regenerating is one command, and this is what makes anyone
       run it. */
    const md = fs.readFileSync(DOC, 'utf8');
    const missing = RULES.filter(r => !md.includes(r.id)).map(r => r.id);
    expect(missing).toEqual([]);
  });

  test('the counts in the document match the matrix', () => {
    const md = fs.readFileSync(DOC, 'utf8');
    const { summarise } = require('../src/domains/gcf/domain/conformance');
    const s = summarise();
    expect(md).toContain(`${s.implemented} implemented`);
    expect(md).toContain(`${s.total} rules`);
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
