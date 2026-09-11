// @ts-check
/**
 * PCAF Part A §5.2 disclosure — the conformance matrix.
 *
 * Every rule the report must satisfy, mapped to the clause that sets it, the
 * code that enforces it, and the test that proves it still holds. A reviewer
 * can open the named file, run the named test, and see the rule enforced. When
 * a rule stops resolving — a renamed file, a renamed test — the build fails,
 * so the claim cannot rot. This is the model the north star sets: every
 * module carries its own conformance evidence or it is not done.
 */

'use strict';

const RULES = [
  {
    id: 'A-REPORT-1', clause: 'Part A Chapter 6 (pp.160–174)',
    rule: 'The disclosure is built from one content model in the order Chapter 6 reads, '
      + 'rendered to PDF and Word by one renderer shared with Part C.',
    file: 'src/domains/pcaf-part-a/reporting/sections.js',
    test: 'tests/parta-report.test.js › the annual disclosure reads in Chapter 6 order',
  },
  {
    id: 'A-REPORT-2', clause: 'Part A §5.2 (p.56)',
    rule: 'Scope 3 is a separate line from scope 1 and 2 and is never summed with it; '
      + 'removals and credits sit outside the inventory and are netted against nothing (p.126).',
    file: 'src/domains/pcaf-part-a/reporting/sections.js',
    test: 'tests/parta-report.test.js › scope 3 is a separate line and nothing is netted',
  },
  {
    id: 'A-REPORT-3', clause: 'DCL Part A (p.124)',
    rule: 'Coverage is the assessed outstanding over the entity’s stated total loans and '
      + 'investments; where the total is unstated it is reported absent, not assumed.',
    file: 'src/domains/pcaf-part-a/reporting/facts.js',
    test: 'tests/parta-report.test.js › coverage is a percentage of the stated book, or absent',
  },
  {
    id: 'A-REPORT-4', clause: 'Part A Box 6.1-6 (pp.167–168)',
    rule: 'The disclosed data-quality score is weighted by outstanding amount, with scope 3 '
      + 'weighted separately from scope 1 and 2, and is never written as a fraction.',
    file: 'src/domains/pcaf-part-a/reporting/sections.js',
    test: 'tests/parta-report.test.js › the weighted score is a category with the scale stated',
  },
  {
    id: 'A-REPORT-5', clause: 'Part A §5.2 (p.57); factor manifest',
    rule: 'The factor set the figures rest on is named with a version, a status and a '
      + 'checksum; a provisional table says so.',
    file: 'src/domains/pcaf-part-a/reporting/model.js',
    test: 'tests/parta-report.test.js › the factor set is named with a checksum',
  },
  {
    id: 'A-REPORT-6', clause: 'Part A Chapter 6 (p.160); SLFRS S2 §29(a)',
    rule: 'The checklist is answered from the report and covers the §5.2 asset class only, so '
      + 'it can fail and can never reach a hundred per cent — this report is one input to a '
      + 'Chapter 6 disclosure, not the disclosure.',
    file: 'src/domains/pcaf-part-a/reporting/checklist.js',
    test: 'tests/parta-report.test.js › the checklist is answered from the report and cannot reach 100%',
  },
  {
    id: 'A-REPORT-7', clause: 'report-integrity; PCAF conformance language',
    rule: 'The document claims PCAF conformance and never endorsement; a report carrying '
      + 'forbidden language is refused at build.',
    file: 'src/domains/pcaf-part-a/reporting/model.js',
    test: 'tests/parta-report.test.js › a report with endorsement language is refused',
  },
  {
    id: 'A-REPORT-8', clause: 'the engine does every arithmetic operation',
    rule: 'The report reads figures the register already holds and recomputes none of them; '
      + 'no language model computes a figure that reaches the document.',
    file: 'src/domains/pcaf-part-a/application/parta-report.js',
    test: 'tests/parta-report.test.js › every figure is one the register returned',
  },
  {
    id: 'A-REPORT-9', clause: 'pdf-response; delivery',
    rule: 'A document is collected in full and checked to be a well-formed PDF before it is '
      + 'sent; a year with no exposures is a 409, never a document of zeros.',
    file: 'src/domains/pcaf-part-a/interface/routes/register.js',
    test: 'tests/parta-report-api.test.js › a well-formed PDF is delivered and an empty year is a 409',
  },
];

module.exports = { RULES };
