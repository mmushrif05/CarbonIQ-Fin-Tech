// @ts-check
/**
 * PCAF Part A — the conformance matrix rules for the disclosure documents:
 * what a verifier under ISO 14064-3 / ISAE 3000 reads first, and the
 * consolidated document a bank files.
 *
 * These rules sit beside the §5.2 and §5.9 engine rules in one Part A
 * matrix. Each maps a clause to the code that enforces it and the test that
 * proves it; `tests/pcaf-parta-conformance.test.js` fails the build if a
 * citation does not resolve, and `scripts/conformance-evidence.js` re-proves
 * each one by execution.
 */

'use strict';

const DISCLOSURE_RULES = [
  // ---- The reporting entity and the responsible party ----------------------
  {
    id: 'A-DOC-01',
    clause: 'Part A ch.6 (p.161); GHG Protocol Corporate Standard ch.3',
    rule: 'The reporting entity’s legal name, consolidation approach, organisational boundary, fiscal '
      + 'year-end and GWP basis are the entity’s own statements, printed as stated or as "Not stated"; '
      + 'nothing is defaulted, and the checklist answers No where one is missing.',
    implementation: 'src/domains/pcaf-part-a/application/parta-settings.js — the entity facts on the org-wide settings, every one null by default; src/domains/pcaf-part-a/reporting/entity.js — the entity block with its gaps; src/domains/pcaf-part-a/reporting/common-sections.js — the section that prints it',
    test: 'tests/parta-report-golden.test.js › an entity that has stated nothing answers No on the governance items',
    status: 'implemented',
  },
  {
    id: 'A-DOC-02',
    clause: 'ISAE 3000 §12(a); ISO 14064-3 §5.2',
    rule: 'The responsible party — who prepared and who approved the disclosure, with the approval '
      + 'date — is named on the face of the document, and the checklist answers No where it is not.',
    implementation: 'src/domains/pcaf-part-a/reporting/entity.js — the responsible-party lines; src/platform/reporting/report-standard/theme/pdf-writer.js — drawn on the cover; src/domains/pcaf-part-a/reporting/checklist.js — GOV-2',
    test: 'tests/parta-report-golden.test.js › the cover names the reporting entity, not a re/insurer, and carries the responsible party and the identity',
    status: 'implemented',
  },
  {
    id: 'A-DOC-03',
    clause: 'ISAE 3000 §69; ISO 14064-3 §9',
    rule: 'Every document carries an identity: a reference derived from its content, the build that '
      + 'produced it and a SHA-256 over the canonical facts — so the same position rendered twice is '
      + 'one reference and a changed figure is another, and a filed copy can be matched.',
    implementation: 'src/domains/pcaf-part-a/reporting/identity.js — the content hash, the reference and the build',
    test: 'tests/parta-report-golden.test.js › the reference is derived from the content: the same position twice is one reference, a changed figure another',
    status: 'implemented',
  },
  {
    id: 'A-DOC-04',
    clause: 'Part A ch.6 (p.161)',
    rule: 'A bank’s financed-emissions document names a reporting entity, never a re/insurer; the '
      + 'shared renderer takes the label from the model, and Part C’s documents are unchanged.',
    implementation: 'src/platform/reporting/report-standard/render-docx.js — the entity label from the model, defaulting to the re/insurer wording; src/domains/pcaf-part-a/reporting/facts.js — the Part A label',
    test: 'tests/parta-report-golden.test.js › the cover names the reporting entity, not a re/insurer, and carries the responsible party and the identity',
    status: 'implemented',
  },

  // ---- What the document contains --------------------------------------------
  {
    id: 'A-DOC-05',
    clause: 'ISO 14064-3 §6.1.3; ISAE 3000 §48',
    rule: 'The annual disclosure carries one register row per recorded exposure, from the same '
      + 'stored projection the totals were rolled up from, each resolving to its stored record — '
      + 'the audit trail a verifier samples from.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — rows(); src/domains/pcaf-part-a/reporting/facts.js — registerRows; src/domains/pcaf-part-a/reporting/common-sections.js — the register annex',
    test: 'tests/parta-report-golden.test.js › the exposure register is the audit trail: one row per recorded exposure, each resolving to a stored id',
    status: 'implemented',
  },
  {
    id: 'A-DOC-06',
    clause: 'SLFRS S2 §29(a)(vi); Part A ch.6 (p.163)',
    rule: 'Financed scope 1 and scope 2 are printed apart as well as combined, and the two sum to '
      + 'the combined line; scope 3 stays a separate line.',
    implementation: 'src/domains/pcaf-part-a/reporting/facts.js — lines() carries scope1 and scope2; src/domains/pcaf-part-a/reporting/sections.js — the absolute table',
    test: 'tests/parta-report-golden.test.js › scope 1 and scope 2 are printed apart and sum to the combined line',
    status: 'implemented',
  },
  {
    id: 'A-DOC-07',
    clause: 'DCL p.127',
    rule: 'The annual disclosure prints an economic emission intensity across the class and per '
      + 'sector, computed by the engine in the roll-up and never in the report.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/portfolio.js — economicIntensity_tCO2e_per_M in group(); src/domains/pcaf-part-a/reporting/sections.js — the intensity figure',
    test: 'tests/parta-report-golden.test.js › the disclosure prints a portfolio intensity the engine computed, and every sector carries one',
    status: 'implemented',
  },
  {
    id: 'A-DOC-08',
    clause: 'Part A Box 6.1-5 (p.167)',
    rule: 'The factor annex names every table with its whole SHA-256 and prints every row of the '
      + 'set, so a disclosed tonne can be tied to a factor value; the word "undefined" never reaches a document.',
    implementation: 'src/domains/pcaf-part-a/reporting/facts.js — factorRows; src/domains/pcaf-part-a/reporting/model.js — Annex A',
    test: 'tests/parta-report-golden.test.js › the factor annex carries the whole checksum and every row of the set',
    status: 'implemented',
  },
  {
    id: 'A-DOC-09',
    clause: 'Part A ch.6 (p.164)',
    rule: 'The per-exposure report reads the same entity facts and the same recalculation protocol '
      + 'as the annual disclosure, so two documents from one book cannot contradict each other.',
    implementation: 'src/domains/pcaf-part-a/application/parta-report.js — shared() hands both documents the settings and the assurance declaration',
    test: 'tests/parta-report-golden.test.js › the per-exposure report reads the same entity and the same recalculation protocol as the disclosure',
    status: 'implemented',
  },
  {
    id: 'A-DOC-10',
    clause: 'Part A ch.6 (pp.160–169)',
    rule: 'No checklist item is a constant: every answer is read from a fact the document prints, so '
      + 'the checklist can fail — and the entity-inventory item is No by design on every document.',
    implementation: 'src/domains/pcaf-part-a/reporting/checklist.js — every test reads the facts',
    test: 'tests/parta-report-golden.test.js › no item is a constant: every test reads the facts',
    status: 'implemented',
  },
  {
    id: 'A-DOC-16',
    clause: 'Part A ch.6 (pp.160–169); §5.9',
    rule: 'The sovereign checklist follows the same rule: no item is a constant, every answer is read '
      + 'from a fact the document prints, and the entity-inventory item is No by design.',
    implementation: 'src/domains/pcaf-part-a/reporting/sovereign/checklist.js — every test reads the facts',
    test: 'tests/parta-sovereign-report-golden.test.js › the checklist reads the facts: the governance items are Yes here and INV-1 is No',
    status: 'implemented',
  },

  // ---- The consolidated disclosure -------------------------------------------
  {
    id: 'A-DOC-11',
    clause: 'Part A ch.6 (p.162)',
    rule: 'The consolidated disclosure lists every Part A asset class — recorded, not recorded for the '
      + 'year, engine built but no register, or not built — each with a reason; the entity’s stated '
      + 'reason overrides the system’s and never the reverse.',
    implementation: 'src/domains/pcaf-part-a/application/parta-consolidated.js — position(), the class rows and their reasons',
    test: 'tests/parta-consolidated.test.js › every Part A asset class is a row — recorded, not recorded, engine only, or not built — each with a reason',
    status: 'implemented',
  },
  {
    id: 'A-DOC-12',
    clause: 'Part A §5.2 (p.56); §5.9 (p.141); p.126',
    rule: 'The consolidated headline sums each recorded class on the boundary its section reports — '
      + '§5.2 scope 1 and 2, §5.9 scope 1 excluding LULUCF — and names them; scope 3 is summed apart '
      + 'and never into it.',
    implementation: 'src/domains/pcaf-part-a/application/parta-consolidated.js — totals',
    test: 'tests/parta-consolidated.test.js › the headline sums each class on its own boundary and names them; scope 3 is summed apart',
    status: 'implemented',
  },
  {
    id: 'A-DOC-13',
    clause: 'DCL p.128; Part A Box 6.1-6; Table 5.9-6',
    rule: 'The data-quality score is one per class, weighted within it, and never averaged across '
      + 'classes that score on different tables.',
    implementation: 'src/domains/pcaf-part-a/application/parta-consolidated.js — dataQuality.byClass',
    test: 'tests/parta-consolidated.test.js › the data-quality score is one per class, never averaged across classes',
    status: 'implemented',
  },
  {
    id: 'A-DOC-14',
    clause: 'DCL p.124',
    rule: 'Consolidated coverage sums outstanding only across the classes in the book’s currency and '
      + 'names the class it excludes; nothing converts a currency at a rate the system does not hold.',
    implementation: 'src/domains/pcaf-part-a/application/parta-consolidated.js — coverage',
    test: 'tests/parta-consolidated.test.js › coverage sums only the classes in the book’s currency and names the class it excludes',
    status: 'implemented',
  },
  {
    id: 'A-DOC-15',
    clause: 'Part A ch.6 (p.160)',
    rule: 'The consolidated document is served as JSON, PDF and Word, the register across classes as '
      + 'CSV, and a year with nothing recorded in any class is a 409 on the document.',
    implementation: 'src/domains/pcaf-part-a/interface/routes/consolidated.js — the three routes; src/domains/pcaf-part-a/reporting/consolidated/report.js — the barrel',
    test: 'tests/parta-consolidated.test.js › GET /financed-emissions/:year answers the position; the disclosure answers JSON, PDF and Word; the register answers CSV',
    status: 'implemented',
  },
];

module.exports = { DISCLOSURE_RULES };
