'use strict';

/**
 * The lending memo says what its figure is, and what it is not.
 *
 * `src/domains/lending/application/pcaf.js` computes CarbonIQ's own A1–A3
 * embodied-carbon assessment apportioned by the bank's share of project value.
 * That is not a PCAF financed emission: PCAF Part A covers the borrower's own
 * emissions on a per-asset-class method, and this deployment computes those in
 * a different domain entirely.
 *
 * The memos said otherwise, in three ways that a bank would have acted on:
 *
 *   - a section headed "PCAF v3 FINANCED EMISSIONS";
 *   - a row reading "Bank's Financed Emissions", and another labelling
 *     CarbonIQ's own 1–5 factor-provenance band a "PCAF Data Quality Score" —
 *     the fourth 1–5 scale in this repository and the one most likely to be
 *     quoted as PCAF's, which is why `docs/GLOSSARY.md` §1 exists;
 *   - and a row reading "Reporting Class | Scope 3 Category 15 (Financed
 *     Emissions)", which told a bank to book the embodied carbon of
 *     construction materials into the financed-emissions line of a regulatory
 *     inventory.
 *
 * These are agent prompts, so nothing type-checks them and no route test drives
 * them: the words go to a model and come back as a document somebody files.
 * A sweep is the only instrument that reaches them, which is the same reason
 * `tests/ndc3-currency.test.js` exists.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LENDING = path.join(ROOT, 'src', 'domains', 'lending');

function sourceFiles(dir = LENDING, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const rel = f => path.relative(ROOT, f);
const read = f => fs.readFileSync(f, 'utf8');

/** Lines carrying a pattern, with where they are. */
function hits(pattern, files = sourceFiles()) {
  const found = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      if (pattern.test(line)) found.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
}

describe('The output does not claim to be PCAF', () => {
  test('nothing under src/ calls itself "PCAF v3"', () => {
    /* There is no such standard to conform to. The edition is PCAF Part A,
       Third Edition (Dec 2025), it is implemented in another domain, and a
       version string invented here is the shape of a claim rather than a
       citation. Two lines in pcaf.js quote the old heading to record what was
       corrected; a record of a mistake is not the mistake. */
    const offenders = hits(/PCAF v3/, sourceFiles(path.join(ROOT, 'src')))
      .filter(h => !h.includes('lending/application/pcaf.js'));
    expect(offenders).toEqual([]);
  });

  /*
   * The three below match a **table row in a memo template** — `| Label |
   * value |` — rather than any mention of the words.
   *
   * That precision is the point. "PCAF Data Quality Score" appears in these
   * prompts in other places where it means PCAF's own 1–5 scale as something
   * the bank reports, and whether *those* are right is a larger question about
   * what the product claims, not this correction. A sweep that could not tell
   * the two apart would either miss the row or force the wider change by
   * accident.
   */
  test("no memo row calls the figure the bank's financed emissions", () => {
    expect(hits(/\|\s*Bank's Financed Emissions\s*\|/)).toEqual([]);
  });

  test("no memo row labels CarbonIQ's own band a PCAF data quality score", () => {
    /* The band is about the provenance of A1–A3 factors. In the row beneath
       an attributed figure it reads as PCAF's scale, which is set by a
       different rule and is the fourth 1–5 scale in this repository. */
    expect(hits(/\|\s*PCAF Data Quality Score\s*\|/)).toEqual([]);
  });

  test('no memo row tells a bank to book this as Scope 3 Category 15', () => {
    /* The most consequential of the three: Category 15 is the financed
       emissions line. The embodied carbon of construction materials does not
       belong in it, and a bank following the memo would have misstated a
       regulated inventory. Prose saying it must *not* be booked there is the
       correction and is matched by the tests below. */
    expect(hits(/\|\s*Reporting Class\s*\|[^|]*Category 15/)).toEqual([]);
  });

  test('no memo stamps a PCAF standard version on its own face', () => {
    expect(hits(/\|\s*PCAF Standard\s*\|\s*v/)).toEqual([]);
  });
});

describe('And it says what it is instead', () => {
  const memos = ['agents/underwriting.js', 'agents/origination.js']
    .map(f => path.join(LENDING, f));

  test('each memo that states the figure heads it for what the figure is', () => {
    for (const f of memos) {
      expect(read(f)).toMatch(/ATTRIBUTED EMBODIED CARBON \(A1–A3\)/);
    }
  });

  test('and states, beside the figure, what it must not be booked as', () => {
    /* Stating it once in a header comment would not reach the document. This
       has to be in the prompt's own template, where the model will carry it
       into the memo a bank files. */
    for (const f of memos) {
      const text = read(f);
      expect(text).toMatch(/\*\*What this figure is\.\*\*/);
      expect(text).toMatch(/not\*\* a PCAF financed-emissions figure/);
      expect(text).toMatch(/must not be\s*\n?booked as Scope 3 Category 15/);
      expect(text).toMatch(/is not a PCAF\s*\n?data-quality score/);
    }
  });

  test('the module that computes it still says it is not Part A', () => {
    const header = read(path.join(LENDING, 'application', 'pcaf.js')).slice(0, 2000);
    expect(header).toMatch(/\*\*This is not PCAF Part A\.\*\*/);
    expect(header).toMatch(/src\/domains\/pcaf-part-a\//);
  });

  test('the correction did not reach for another domain to make itself true', () => {
    /* Naming Part A in prose is the point — it is where a financed emission
       actually comes from. Importing it would be the merge
       `tests/architecture.test.js` fails the build on, so this checks the
       require, not the sentence. */
    const offenders = hits(/require\(['"][^'"]*pcaf-part-[ac]/);
    expect(offenders).toEqual([]);
  });
});
