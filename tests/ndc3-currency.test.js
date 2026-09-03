/**
 * The national targets this application cites must be the current ones.
 *
 * Sri Lanka issued NDC 3.0 in September 2025. Until this test existed, seven
 * source files and three test files still carried the 2021 NDC — 4.5%
 * unconditional, 14.5% conditional, both "by 2030", plus a net-zero-2050
 * commitment — and the Green Loan Certificate was printing them onto a
 * document with a SHA-256 audit hash, which is the worst place for a stale
 * number because the hash makes it look verified.
 *
 * Nothing announced the drift. Every test passed, because the tests asserted
 * the same superseded figures the code produced. That is the failure mode this
 * file exists for: a sweep of the source tree rather than a walk down whatever
 * path a feature test happens to take.
 *
 * Three things are checked, and the third is the one that matters most.
 *
 *   The superseded figures appear nowhere.
 *   The current figures appear, and reconcile.
 *   **Reduction and removal are never summed.** NDC 3.0 carries two separate
 *   commitments — 20.09% emission reduction and 4.49% increased net removal.
 *   24.58% is not a number Sri Lanka has committed to, and a project that
 *   removes carbon has not reduced emissions.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* The tree, minus what is generated or vendored. Coverage output is gitignored
   but present on a developer's disk, and it is full of stale copies. */
const SKIP = new Set(['node_modules', '.git', 'coverage', 'assets', '.netlify', 'dist']);
const EXT = new Set(['.js', '.json', '.md', '.html', '.css']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT);
const rel = (f) => path.relative(ROOT, f);

/* This file quotes the superseded figures in order to forbid them, so it is
   the one place they may legitimately appear. */
const SELF = path.join(ROOT, 'tests', 'ndc3-currency.test.js');

describe('The superseded 2021 NDC targets are never asserted', () => {
  /* Line-level, not file-level, and with two deliberate allowances.
   *
   * A line may quote the old figures if it marks them as superseded — the
   * `supersedes` field in the data file, and the comments explaining what
   * changed, are the record of the correction and must survive.
   *
   * The net-zero check is scoped to Sri Lanka. Other jurisdictions in this
   * codebase genuinely do have 2050 net-zero targets (Singapore, Malaysia,
   * Hong Kong in the strategy document) and forbidding the string outright
   * would delete true statements to protect against a false one. */
  const ALLOW = /supersed|superseded|2021 NDC|used to carry|no longer|replaced the/i;

  const patterns = [
    { re: /4\.5\s*%\s*(GHG|reduction|unconditional)/i, what: '4.5% unconditional target' },
    { re: /14\.5\s*%\s*(GHG|reduction|conditional|with international)/i, what: '14.5% conditional target' },
    {
      re: /net[\s-]?zero[^.\n]{0,40}2050/i,
      what: 'Sri Lankan net zero 2050',
      scope: /sri\s*lanka|SLGFT|NDC|CBSL/i,
    },
  ];

  test.each(patterns)('$what is asserted nowhere', ({ re, what, scope }) => {
    const hits = [];
    for (const file of FILES) {
      if (file === SELF) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!re.test(line)) return;
        /* The allowance reads a small window, not just the line: a comment
           that says "supersedes the 2021 NDC" on one line and quotes the
           figures on the next is exactly the record we want to keep. */
        const context = lines.slice(Math.max(0, i - 3), i + 2).join(' ');
        if (ALLOW.test(context)) return;
        /* A scoped pattern also has to be about Sri Lanka — other
           jurisdictions' 2050 targets are true statements. */
        if (scope && !scope.test(context)) return;
        hits.push(`${rel(file)}:${i + 1}`);
      });
    }
    expect({ what, hits }).toEqual({ what, hits: [] });
  });

  test('the allowance is narrow — it does not admit a bare restatement', () => {
    expect(ALLOW.test('- Unconditional: 4.5% GHG reduction by 2030 vs BAU')).toBe(false);
    expect(ALLOW.test('supersedes: 4.5% unconditional / 14.5% conditional')).toBe(true);
  });
});

describe('NDC 3.0 is stated once, and reconciles', () => {
  const ndc = require('../data/gcf/ndc3.json');

  test('the reduction target splits into its two halves exactly', () => {
    expect(ndc.reduction.unconditionalPct + ndc.reduction.conditionalPct)
      .toBeCloseTo(ndc.reduction.totalPct, 2);
    expect(ndc.reduction.totalPct).toBe(20.09);
  });

  test('the removal target splits into its two halves exactly', () => {
    expect(ndc.removal.unconditionalPct + ndc.removal.conditionalPct)
      .toBeCloseTo(ndc.removal.totalPct, 2);
    expect(ndc.removal.totalPct).toBe(4.49);
  });

  test('the period is the ten years NDC 3.0 covers, not a single 2030 date', () => {
    expect(ndc._meta.period).toBe('2026-2035');
    expect(ndc.reduction.basis).toMatch(/2026-2035/);
  });

  test('it records what it supersedes, and where it came from', () => {
    expect(ndc._meta.supersedes).toMatch(/4\.5%/);
    expect(ndc._meta.source).toMatch(/Terms of Reference/);
    expect(ndc._meta.verify).toMatch(/checked against/);
  });

  test('the sector counts are NDC 3.0’s', () => {
    expect(ndc.sectorCounts.mitigation).toBe(6);
    expect(ndc.sectorCounts.adaptation).toBe(9);
    expect(ndc.sectorCounts.crossCutting).toContain('Loss and damage');
  });

  test('every sector target names a stream and a GCF results area', () => {
    for (const t of ndc.sectorTargets) {
      expect(['mitigation', 'adaptation']).toContain(t.stream);
      expect(['EP', 'LT', 'BA', 'FL', 'VC', 'HW', 'IB', 'EE']).toContain(t.gcfResultsArea);
    }
  });

  test('the constants read it rather than restating it', () => {
    const { TAXONOMY_LK } = require('../config/constants');
    expect(TAXONOMY_LK.ndcTargets.reduction.totalPct).toBe(20.09);
    expect(TAXONOMY_LK.ndcTargets).not.toHaveProperty('unconditional');
    expect(TAXONOMY_LK.ndcTargets).not.toHaveProperty('netZeroTarget');
  });
});

describe('Reduction and removal are never summed', () => {
  const ndc = require('../data/gcf/ndc3.json');
  const COMBINED = ndc.reduction.totalPct + ndc.removal.totalPct;   // 24.58

  test('the combined figure is not a number Sri Lanka has committed to', () => {
    expect(COMBINED).toBeCloseTo(24.58, 2);
    const hits = FILES
      .filter(f => f !== SELF)
      .filter(f => /24\.58/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(hits).toEqual([]);
  });

  test('the removal target says on its face that it is reported apart', () => {
    expect(ndc.removal.note).toMatch(/never summed/i);
  });

  test('the file says the two commitments are separate', () => {
    expect(ndc._meta.note).toMatch(/never added together/i);
  });
});

describe('No net-zero year is asserted', () => {
  test('the reports layer reports it absent rather than carrying the old one', () => {
    const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.js'), 'utf8');
    expect(src).toMatch(/netZeroTarget:\s*null/);
    expect(src).toMatch(/states no net-zero year/);
  });

  test('NDC 3.0 as held here carries no net-zero field to read', () => {
    const ndc = require('../data/gcf/ndc3.json');
    expect(ndc).not.toHaveProperty('netZero');
    expect(ndc).not.toHaveProperty('netZeroTarget');
  });
});
