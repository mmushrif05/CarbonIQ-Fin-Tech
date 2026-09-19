// @ts-check
/**
 * The conformance rules for the pipeline read as a dashboard — the gap
 * register, the assessment state on the portfolio and the disclosure as a
 * document. Part of the one GCF matrix in `conformance.js`, held in a sibling
 * file only for length; the same vocabulary, the same proof by execution.
 */

'use strict';

module.exports = [
  // ---- The gap register ----------------------------------------------------
  {
    id: 'G-GAP-01',
    clause: 'ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data"; the worklist between a pipeline entry and a submission',
    rule: 'Every item on the gap register is one an engine raised — the stage requirements, the six criteria, the assessor’s validation, the return loop or the disclosure — carried with its clause and the fact that clears it; nothing is judged afresh.',
    implementation: 'src/domains/gcf/domain/gaps.js — projectGaps() and register() compose readiness, criteria, validation, return-loop and the disclosure’s own gaps',
    test: 'tests/gcf-gap-register.test.js › The register is composed, never judged › every item names its source, its clause, its remedy and an owner from the vocabulary',
    status: 'implemented',
  },
  {
    id: 'G-GAP-02',
    clause: 'CarbonIQ — a register a committee can act on names who holds the key',
    rule: 'Who closes a gap is one of a closed vocabulary — the bank, the sponsor, the NDA, the Fund, the co-financiers, a gender specialist, the affected communities, the assessor — never free text, and an item naming anyone else is refused at construction.',
    implementation: 'src/domains/gcf/domain/gaps.js — OWNERS and item(); src/domains/gcf/domain/readiness.js — every requirement names its owner',
    test: 'tests/gcf-gap-register.test.js › The register is composed, never judged › an owner outside the vocabulary is refused at construction',
    status: 'implemented',
  },
  // ---- The disclosure as a document ----------------------------------------
  {
    id: 'G-RPT-02',
    clause: 'ToR Lot 1, Milestone 4 — sustainability reporting; SLFRS S2 §29(a), (d), (e); GRI 305; PCAF Part A p.126',
    rule: 'The pipeline disclosure renders to PDF and Word through the platform report standard with the inventory lines absent and their source named, avoided-and-reduced stated apart and never netted, the two NDC 3.0 ledgers unsummed, every entity statement the entity’s own or marked not stated, a checklist answered from the document, and one reference for one position.',
    implementation: 'src/domains/gcf/application/disclosure-document.js — disclosureFacts(), buildModel(), disclosurePDF(), disclosureDOCX()',
    test: 'tests/gcf-disclosure-document.test.js › The document says what the report says, and no more › the inventory lines are absent with their source, the avoided line is apart, and the two ledgers are never summed',
    status: 'implemented',
  },
  // ---- The assessment on the portfolio -------------------------------------
  {
    id: 'G-VAL-04',
    clause: 'GCF assessment lifecycle — separation of duties, visible at pipeline level',
    rule: 'The portfolio carries each project’s assessment state — draft, under review or validated, with who signed and when — read off the record and counted, so an unsigned assessment is a fact the pipeline shows rather than one a project page hides; the ratings behind it never reach the portfolio as a number.',
    implementation: 'src/domains/gcf/domain/portfolio.js — assessmentOf() per row and the assessment count',
    test: 'tests/gcf-cycle.test.js › The assessor’s sign-off is visible at pipeline level › every row carries its assessment state, read off the record, and the unsigned are named',
    status: 'implemented',
  },
  // ---- The sections held as structured facts (Phase C) -----------------
  {
    id: 'G-SEC-01',
    clause: 'ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data"; GCF concept note B, funding proposal B.4, B.6, C.2–C.3, F and annexes',
    rule: 'The risk register, implementation arrangements and timetable, sustainability and exit, stakeholder consultations, adaptation climate rationale, financial terms, monitoring and evaluation, and post-approval reporting are held as structured facts on the record, each in a closed vocabulary and refused outside it; a record recorded before they existed is unaffected.',
    implementation: 'src/domains/gcf/domain/sections.js — SCHEMAS; src/domains/gcf/domain/record.js — the eight optional blocks',
    test: 'tests/gcf-sections.test.js › The eight sections are blocks on the record, each in a closed vocabulary › a stakeholder group, a hazard, a repayment profile, a frequency and a report status are each held to their list',
    status: 'implemented',
  },
  {
    id: 'G-SEC-02',
    clause: 'GCF funding proposal template — what each section must contain; project cycle stages 3 to 8',
    rule: 'Readiness reads each section as held, partial or missing from the record alone, asks the climate rationale of an adaptation project only, and a document of the same kind still counts — nothing that was held by a document becomes missing.',
    implementation: 'src/domains/gcf/domain/readiness.js — the section() check and the applies predicate; src/domains/gcf/domain/sections.js — status(), best()',
    test: 'tests/gcf-sections.test.js › Readiness reads the sections, and a document of the same kind still counts › the same project with the sections recorded holds them, and a risk register document alone still holds the register',
    status: 'implemented',
  },
  {
    id: 'G-SEC-03',
    clause: 'ToR Lot 2 — the Concept Note inputs; GCF concept note sections B to G',
    rule: 'The Concept Note package resolves its inputs from the sections — held with what is recorded, partial with what is missing, and external only where nothing is recorded — so the external worklist shrinks as the facts are recorded rather than as documents are named.',
    implementation: 'src/domains/gcf/application/cn-package.js — sectionLine()',
    test: 'tests/gcf-sections.test.js › The Concept Note package resolves its inputs from the sections › the served example holds six inputs from its blocks, each with what is recorded',
    status: 'implemented',
  },
];
