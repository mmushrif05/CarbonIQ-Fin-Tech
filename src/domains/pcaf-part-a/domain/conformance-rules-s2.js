// @ts-check
/**
 * PCAF Part A — the conformance rules for the SLFRS S2 half of the
 * consolidated disclosure.
 *
 * SLFRS S2 is IFRS S2 as adopted in Sri Lanka. These rules sit in the Part A
 * matrix rather than a matrix of their own because there is one document: the
 * financed-emissions disclosure answers S2 §29(a)(vi) and B58–B63 as it always
 * has, and what is added here is what S2 asks that an emissions engine cannot
 * compute. A second matrix would invite a second document.
 *
 * The rule that governs the rest: a statement in these sections is the
 * reporting entity's own, illustrative content the tool supplied and marked as
 * such, or absent with the paragraph that asks for it. There is no fourth kind
 * of statement, and each of the three is proved by a test that can fail.
 */

'use strict';

const S2_RULES = [
  {
    id: 'A-S2-01',
    clause: 'SLFRS S2 §5–7, §9–23, §24–26, §27–37',
    rule: 'The four SLFRS S2 pillars — governance, strategy, risk management, and metrics and targets — '
      + 'are sections of the one disclosure a bank files, not a second document. They sit after the '
      + 'financed-emissions sections, which answer §29(a)(vi) and B58–B63 unchanged.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/s2-sections.js — buildS2Sections() composes the seven S2 sections; src/domains/pcaf-part-a/reporting/consolidated/sections.js places them after the Chapter 6 sections and before the limitations',
    test: 'tests/parta-s2-disclosure.test.js › the disclosure carries the four SLFRS S2 pillars as sections, in the standard’s order',
    status: 'implemented',
  },
  {
    id: 'A-S2-02',
    clause: 'SLFRS S2 §5–37; report-integrity',
    rule: 'A statement the reporting entity has not made is printed as not stated, naming the paragraph '
      + 'that asks for it, and is never omitted and never written on the entity’s behalf. The checklist '
      + 'answers No on it, so a document over an entity that has stated nothing says so on its face.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/s2-sections.js — statement() prints the absent form with its paragraph; src/domains/pcaf-part-a/reporting/consolidated/checklist.js — S2-GOV-1, S2-STR-1, S2-RSK-1, S2-TGT-1 and INV-1 read the facts',
    test: 'tests/parta-s2-disclosure.test.js › a statement the entity has not made prints as not stated with the paragraph that asks for it',
    status: 'implemented',
  },
  {
    id: 'A-S2-03',
    clause: 'report-integrity — measured, declared, absent',
    rule: 'Illustrative trial content supplied with the tool is marked wherever it is printed and is '
      + 'never presented as a statement by the reporting entity. Provenance is derived by comparison '
      + 'with the shipped pack rather than stored, so it cannot go stale, and one changed word makes '
      + 'the statement the entity’s.',
    implementation: 'src/domains/pcaf-part-a/domain/climate/facts.js — readiness() compares each item against the pack on a canonical form, so a store that rearranges keys cannot turn our words into the entity’s; src/domains/pcaf-part-a/reporting/consolidated/s2-facts.js carries the state onto every item and s2-sections.js prints it',
    test: 'tests/parta-s2-disclosure.test.js › an illustrative statement is marked wherever it is printed, and one word of difference makes it the entity’s',
    status: 'implemented',
  },
  {
    id: 'A-S2-04',
    clause: 'SLFRS S2 §29(a)(i)–(iv), (vi); B58–B63',
    rule: 'The entity’s own gross scope 1 and location-based scope 2 are printed beside the financed '
      + 'emissions this system measures, each line naming who stated it, and no row sums a figure the '
      + 'entity stated with one this system measured. Category 15 is the document’s own headline, '
      + 'moved and never recomputed.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/s2-facts.js — inventory.category15 reads f.totals.headline; s2-sections.js — inventorySection() prints the five lines with no total row',
    test: 'tests/parta-s2-disclosure.test.js › the entity’s own scope 1 and 2 sit beside Category 15, and no row sums them',
    status: 'implemented',
  },
  {
    id: 'A-S2-05',
    clause: 'SLFRS S2 §29(b)–(d)',
    rule: 'The amount and percentage of assets vulnerable to transition risk, vulnerable to physical risk '
      + 'and aligned with climate-related opportunities are summed by the engine from a classification '
      + 'the reporting entity recorded exposure by exposure. Every share is taken over the outstanding '
      + 'actually assessed and the unassessed amount is stated beside it, so a book nobody has '
      + 'classified reads as unclassified and never as safe.',
    implementation: 'src/domains/pcaf-part-a/domain/climate/exposure.js — band() and position() over the stored projection; src/domains/pcaf-part-a/reporting/consolidated/s2-sections.js — bandBlocks() prints the amount, the not-amount, the unassessed amount and the share',
    test: 'tests/parta-s2-disclosure.test.js › the §29(b)–(d) amounts are the engine’s sums, with the unassessed amount stated beside each share',
    status: 'implemented',
  },
  {
    id: 'A-S2-06',
    clause: 'SLFRS S2 §32; IFRS S2 industry-based guidance for commercial banks',
    rule: 'Gross exposure and financed emissions are disaggregated by industry, and the carbon-related '
      + 'subtotal names the boundary it was taken on — the four non-financial groups of the TCFD 2021 '
      + 'implementing guidance, mapped onto this repository’s sector vocabulary — because the standard '
      + 'leaves the boundary to the entity. A sector recorded as free text sits outside the subtotal '
      + 'rather than being claimed either way.',
    implementation: 'src/domains/pcaf-part-a/domain/climate/exposure.js — CARBON_RELATED_SECTORS, CARBON_RELATED_BASIS and isCarbonRelated() decide from the vocabulary key alone; s2-sections.js — industrySection() prints the table and the subtotal with its basis',
    test: 'tests/parta-s2-disclosure.test.js › the industry table carries the carbon-related subtotal on a stated boundary',
    status: 'implemented',
  },
  {
    id: 'A-S2-07',
    clause: 'SLFRS S2 — the disclosure read as an S2 file',
    rule: 'An index names, for every S2 paragraph, the section of this document that answers it and '
      + 'whether it is answered. The financed-emissions paragraphs point at the sections the document '
      + 'always printed: the file is read as an S2 disclosure without a figure having been rewritten '
      + 'for S2. A row naming a section the model does not build is a broken cross-reference in a filed '
      + 'document, so every row resolves.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/s2-facts.js — indexOf() builds one row per paragraph with its section id and whether the facts answer it; s2-sections.js — s2IndexAnnex() prints it against the numbers the model assigned',
    test: 'tests/parta-s2-disclosure.test.js › the S2 index resolves every paragraph to a section the document builds',
    status: 'implemented',
  },
  {
    id: 'A-S2-08',
    clause: 'report-integrity; PCAF conformance language',
    rule: 'The endorsement-language guard reads the reporting entity’s own statements as well as this '
      + 'document’s prose. A form is otherwise the route by which a claim of endorsement by PCAF '
      + 'returns to a page, and such a claim is as false in a recorded paragraph as in a written one — '
      + 'PCAF sets the method and does not approve, endorse or certify any disclosure.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/model.js — scanLanguage() includes proseOf(f.s2), so buildStandardModel() refuses the document and names the offending phrase',
    test: 'tests/parta-s2-disclosure.test.js › endorsement language in a statement the entity recorded is refused at build',
    status: 'implemented',
  },
  {
    id: 'A-S2-09',
    clause: 'SLFRS S2 §5–37; Part A ch.6 (p.160)',
    rule: 'The S2 checklist items are answered from the facts the document prints, so each can fail; and '
      + 'the entity-inventory item, which used to be No by rule, is answered from the entity’s stated '
      + 'scope 1 and 2 — a caveat removed by collecting the fact rather than by suppressing the item.',
    implementation: 'src/domains/pcaf-part-a/reporting/consolidated/checklist.js — S2-GOV-1 … S2-PRV-1 and INV-1 each read f.s2; no S2 item is a constant',
    test: 'tests/parta-s2-disclosure.test.js › the S2 items pass once the entity has stated its facts, and the document serves in all three formats',
    status: 'implemented',
  },
  {
    id: 'A-S2-10',
    clause: 'SLFRS S2 §5–37 — one registry, one source',
    rule: 'What S2 asks of the reporting entity is declared once. The Joi schema is built from that '
      + 'registry rather than written beside it, the normaliser reads it, the readiness the screen shows '
      + 'reads it, and the document’s sections read it — so a field added in one place is accepted and '
      + 'printed everywhere on the same commit, and an item cannot be collected without a paragraph.',
    implementation: 'src/domains/pcaf-part-a/domain/climate/items.js — ITEMS, PILLARS and ROW_SHAPES; src/domains/pcaf-part-a/interface/schemas/climate.js builds the schema from it; src/domains/pcaf-part-a/domain/climate/facts.js normalises against it',
    test: 'tests/parta-climate-facts.test.js › the schema accepts every path the registry declares, and refuses one it does not',
    status: 'implemented',
  },
  {
    id: 'A-S2-11',
    clause: 'SLFRS S2 §29(b)–(d) — the classification is the bank’s judgement',
    rule: 'The climate classification travels with the exposure and is never an engine input: it is '
      + 'stripped before the engine sees it, feeds no arithmetic and changes no figure the engines '
      + 'compute. It is carried in the stored projection, so the S2 sums are taken from the same read '
      + 'the roll-up already takes rather than by pulling every record back to reach three fields.',
    implementation: 'src/domains/pcaf-part-a/application/register.js records the block outside the engine input; migrations/0012_parta_climate_projection.sql rebuilds the generated column with climate and sectorKey in it; src/domains/pcaf-part-a/application/register-projections.js — climateRows() reads it',
    test: 'tests/parta-climate-exposure.test.js › the classification is recorded, is not an engine input, and reaches the projection',
    status: 'implemented',
  },
];

module.exports = { S2_RULES };
