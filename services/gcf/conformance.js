/**
 * CarbonIQ FinTech — GCF pipeline conformance matrix
 *
 * What this module claims to do for DFCC's post-accreditation work, where each
 * commitment lives in code, and which test proves it still holds.
 *
 * The same discipline as the PCAF Part C matrix and for the same reason:
 * "aligned with the ToR" is a claim, and a claim a reviewer cannot check is
 * worth little. Any row below can be taken to the named file and the named
 * test. When a rule stops being enforced its test fails, and when a citation
 * rots the matrix test fails — so the claim cannot quietly become untrue.
 *
 * What this is NOT: nothing here is endorsed by the Green Climate Fund, and
 * this system does not score a proposal on GCF's behalf. It is a
 * self-declaration of what has been built against a published Terms of
 * Reference, offered with the evidence to check it.
 *
 * `status`:
 *   implemented — enforced in code and covered by a test
 *   partial     — enforced for the scope stated in `limitation`
 *   excluded    — deliberately out of scope, with the reason
 */

'use strict';

const SOURCE = 'DFCC Bank PLC DAE Readiness Pre-Qualified Delivery Partner Terms of Reference, '
  + 'version 21 November 2025';

const RULES = [
  // ---- Lot 1 Milestone 4 — data capture -----------------------------------
  {
    id: 'G-DATA-01',
    clause: 'ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data for sustainable reporting"',
    rule: 'Every figure entered is stored with its evidence tier, so a benchmark default cannot become a measured fact downstream.',
    implementation: 'services/gcf/record.js — the traced() schema refuses a figure with no tier',
    test: 'tests/gcf-pipeline.test.js › Every figure carries its provenance › a figure with no evidence tier is refused',
    status: 'implemented',
  },
  {
    id: 'G-DATA-02',
    clause: 'ToR Lot 1, Milestone 4 — data systems for carbon accounting',
    rule: 'Evidence tiers are GCF appraisal classes and are never PCAF data-quality scores.',
    implementation: 'services/gcf/record.js — TIERS from data/gcf/irmf.json, four named classes',
    test: "tests/gcf-pipeline.test.js › Every figure carries its provenance › the tiers are deliberately not PCAF’s 1-5 scale",
    status: 'implemented',
  },
  {
    id: 'G-DATA-03',
    clause: 'ToR Lot 1, Milestone 4 — data "should be stored and can be transferred and assessed"',
    rule: 'A period exports whole with a checksum over its canonical form, and an import is verified before anything is written and refused whole on failure.',
    implementation: 'services/gcf/reporting.js — exportPeriod / importPeriod / canonical',
    test: 'tests/gcf-reporting.test.js › A period package survives a transfer, or is refused › a truncated package is refused whole, not imported in part',
    status: 'implemented',
  },
  {
    id: 'G-DATA-04',
    clause: 'ToR Lot 1, Milestone 4 — durable capture',
    rule: 'A deployment that cannot persist refuses a write with 503 rather than accepting data it will lose.',
    implementation: 'services/gcf/store.js — assertWritable() before every put and remove',
    test: 'tests/gcf-pipeline.test.js › The register over HTTP › every response says what the deployment can persist',
    status: 'implemented',
  },

  // ---- Carbon accounting boundaries ---------------------------------------
  {
    id: 'G-CARBON-01',
    clause: 'ToR Lot 1, Milestone 4 — emissions',
    rule: 'Project mitigation, embodied carbon and financed emissions are three boundaries and no function returns a figure combining two.',
    implementation: 'services/gcf/emissions.js — separate keys throughout; financedEmissions names the capital book',
    test: 'tests/gcf-emissions.test.js › Three boundaries, and nothing can merge them › no number anywhere in the roll-up equals mitigation minus embodied',
    status: 'implemented',
  },
  {
    id: 'G-CARBON-02',
    clause: 'PCAF Part A p.126, applied to project appraisal',
    rule: 'Avoided and reduced emissions are stated apart from any inventory and never netted against it.',
    implementation: 'services/gcf/reporting.js — avoidedAndReduced sits outside the inventory block',
    test: 'tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › avoided emissions are stated apart and never netted',
    status: 'implemented',
  },
  {
    id: 'G-CARBON-03',
    clause: 'GCF Mitigation Core Indicator 1 (IRMF, decision B.29/01)',
    rule: 'A tCO2e figure without a baseline is refused; reduced, avoided and removal are distinguished by the counterfactual.',
    implementation: 'services/gcf/record.js — baselineSchema required on every mitigation block',
    test: 'tests/gcf-pipeline.test.js › A tCO2e figure without a baseline means nothing › a mitigation block with no baseline is refused',
    status: 'implemented',
  },
  {
    id: 'G-CARBON-04',
    clause: 'Engine discipline — no LLM computes a regulatory figure',
    rule: 'Where an independent path exists the recorded figure is recomputed and any divergence reported; where none exists the check reports unverifiable rather than passing.',
    implementation: 'services/gcf/emissions.js — checkMitigation()',
    test: 'tests/gcf-emissions.test.js › A figure that cannot be checked says so › a figure with no independent path is unverifiable, not passing',
    status: 'implemented',
  },

  // ---- NDC 3.0 ------------------------------------------------------------
  {
    id: 'G-NDC-01',
    clause: 'Sri Lanka NDC 3.0 (September 2025), ToR section 1.2',
    rule: 'The reduction and removal commitments are carried in two ledgers and no key anywhere holds their sum.',
    implementation: 'services/gcf/ndc-contribution.js — separate reduction and removal blocks, split again on the co-benefit line',
    test: 'tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › nothing in the output holds their sum',
    status: 'implemented',
  },
  {
    id: 'G-NDC-02',
    clause: 'Sri Lanka NDC 3.0 — cumulative over 2026-2035',
    rule: 'Only the years falling inside the NDC period count against it, and the operating-start assumption is stated.',
    implementation: 'services/gcf/ndc-contribution.js — withinPeriod()',
    test: 'tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › only the years inside 2026-2035 count against a 2026-2035 commitment',
    status: 'implemented',
  },
  {
    id: 'G-NDC-03',
    clause: 'Sri Lanka NDC 3.0 — targets are percentages against a BAU scenario',
    rule: 'A project\'s share of the national target is reported absent unless the BAU tonnage is supplied, and is then carried at the tier of that declared input.',
    implementation: 'services/gcf/ndc-contribution.js — shareOfCommitment()',
    test: 'tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › the share of the national target is absent, with what it needs',
    status: 'implemented',
  },
  {
    id: 'G-NDC-04',
    clause: 'Sri Lanka NDC 3.0 — no net-zero year is stated',
    rule: 'No net-zero commitment is asserted, and the superseded 2021 targets appear only where marked superseded.',
    implementation: 'data/gcf/ndc3.json — _meta.supersedes; config/constants.js reads this file',
    test: 'tests/ndc3-currency.test.js › Reduction and removal are never summed › the combined figure is not a number Sri Lanka has committed to',
    status: 'implemented',
  },

  // ---- Accreditation ------------------------------------------------------
  {
    id: 'G-ACCR-01',
    clause: 'ToR section 1.1 — Board decision B.36/10, E&S category B/I-2',
    rule: 'A project outside the accredited E&S category is excluded, not down-ranked.',
    implementation: 'services/gcf/screening.js — screenOne() ess_category exclusion',
    test: 'tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a category A project is excluded, with the reason',
    status: 'implemented',
  },
  {
    id: 'G-ACCR-02',
    clause: 'ToR section 1.1 — medium size (USD 50-250m)',
    rule: 'The accredited size is a ceiling, not a band. A smaller project is not flagged, because GCF size categories nest.',
    implementation: 'services/gcf/screening.js — screenOne() applies the ceiling only',
    test: 'tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a project below the band is NOT flagged — size categories are ceilings',
    status: 'implemented',
  },
  {
    id: 'G-ACCR-03',
    clause: 'ToR section 1.1 — modalities: basic, project management, on-lending and blending. The grant box is not ticked.',
    rule: 'A grant-dependent design is flagged with what to verify, not struck out on this system\'s reading of a checkbox.',
    implementation: 'services/gcf/screening.js — modality_gap flag; services/gcf/instruments.js — deliverableByDfcc',
    test: 'tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a grant-dependent design is flagged to verify, not struck out',
    status: 'implemented',
  },
  {
    id: 'G-ACCR-04',
    clause: 'ToR section 1.1 — three open accreditation conditions',
    rule: 'The grievance redress mechanism and procurement disclosure conditions appear as outstanding external inputs on every Concept Note package.',
    implementation: 'services/gcf/cn-package.js — Section G and Section H external inputs',
    test: "tests/gcf-cn-package.test.js › DFCC's own accreditation conditions travel with the package › the two open accreditation conditions appear as external inputs",
    status: 'partial',
    limitation: 'Two of the three conditions are surfaced. The ESMS audit condition is a DFCC '
      + 'institutional obligation with no per-project input, so it is not carried on a project package.',
  },

  // ---- Lot 2 --------------------------------------------------------------
  {
    id: 'G-LOT2-01',
    clause: 'ToR Lot 2 — screening candidates and recommending Concept Notes',
    rule: 'Mitigation and adaptation are ranked in two lists that are never merged, and adaptation is never ranked on carbon.',
    implementation: 'services/gcf/screening.js — rankStream(), metricsFor() picks the impact metric by stream',
    test: 'tests/gcf-screening.test.js › Two ranked lists, and adaptation never touches carbon › the adaptation impact metric is people, not tonnes',
    status: 'implemented',
  },
  {
    id: 'G-LOT2-02',
    clause: 'GCF investment framework — six investment criteria',
    rule: 'Three criteria cannot be computed from a project record and are named unscored with reasons rather than filled in.',
    implementation: 'services/gcf/screening.js — GCF_CRITERIA, criteria.notScored',
    test: 'tests/gcf-screening.test.js › The ranking says what it could not weigh › three of the six GCF criteria are named unscored, each with a reason',
    status: 'implemented',
  },
  {
    id: 'G-LOT2-03',
    clause: 'ToR Lot 2 — at least two high-potential concepts, up to two Concept Notes',
    rule: 'The recommendation names which projects, on what basis, what would move the runners-up, and where it disagrees with the recorded selection.',
    implementation: 'services/gcf/screening.js — recommend(), divergence',
    test: 'tests/gcf-screening.test.js › The answer: which two, and why › where the recorded selection and the ranking disagree, it says so',
    status: 'implemented',
  },
  {
    id: 'G-LOT2-04',
    clause: 'ToR Lot 2 — five to seven innovative instruments evaluated',
    rule: 'Seven structures are evaluated, each matched to barriers the project has recorded, with what the structure leaves standing named beside what it covers.',
    implementation: 'services/gcf/instruments.js — fitOne(), structureFor(); data/gcf/instruments.json',
    test: 'tests/gcf-screening.test.js › An instrument answers a barrier, or it answers nothing › coverage is reported with what it leaves standing',
    status: 'implemented',
  },
  {
    id: 'G-LOT2-05',
    clause: 'ToR Lot 2 — viability with and without concessional support; GCF minimum concessionality',
    rule: 'The engine can return "does not need GCF support", and an unassessed project cannot be put forward.',
    implementation: 'services/gcf/instruments.js — concessionality()',
    test: 'tests/gcf-screening.test.js › Minimum concessionality — the appraisal can say no › a project viable without GCF is told not to take concessional money',
    status: 'implemented',
  },
  {
    id: 'G-LOT2-06',
    clause: 'GCF investment policy — no minimum co-financing requirement',
    rule: 'Co-financing is reported as a fact and used as a ranking input, never as a gate or a threshold met.',
    implementation: 'services/gcf/reporting.js — capitalDeployment.note; services/gcf/screening.js — efficiency metric',
    test: 'tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › the pipeline is disclosed where it belongs, on three §29 lines',
    status: 'implemented',
  },

  // ---- Statutory reporting ------------------------------------------------
  {
    id: 'G-REPORT-01',
    clause: 'SLFRS S2 §29(a); GRI 305-1/2/3',
    rule: "A pipeline of financed projects is not the entity's inventory. Inventory lines are reported absent with the clause and where the figure comes from.",
    implementation: 'services/gcf/reporting.js — metricsAndTargets.inventory, griMapping()',
    test: 'tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › scope 1, 2 and 3 are reported absent, not filled from the pipeline',
    status: 'implemented',
  },
  {
    id: 'G-REPORT-02',
    clause: 'GRI 305-5',
    rule: "Financed project mitigation is not the organisation's own reduction and is reported as supplementary information.",
    implementation: 'services/gcf/reporting.js — griMapping() 305-5 and supplementary',
    test: 'tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › GRI 305-1 through 305-5 are all answered absent, each with its reason',
    status: 'implemented',
  },
  {
    id: 'G-REPORT-03',
    clause: 'SLFRS S1 §27; SLFRS S2 §6, §25, §33',
    rule: 'Entity-level facts are supplied by the entity or reported absent with the clause that requires them. Nothing is invented.',
    implementation: 'services/gcf/reporting.js via services/report-integrity.js declared()',
    test: 'tests/gcf-reporting.test.js › Entity facts are declared or absent, never invented › nothing resembling a board meeting or an FTE count is manufactured',
    status: 'implemented',
  },
  {
    id: 'G-REPORT-04',
    clause: 'Report honesty — a checklist answered from the report',
    rule: 'The checklist can fail, and the inventory item stays unmet even with every entity fact recorded, because this is one input to an SLFRS S2 disclosure rather than the disclosure.',
    implementation: 'services/gcf/reporting.js — checklist(), basis.covers',
    test: 'tests/gcf-reporting.test.js › The checklist is answered from the report, so it can fail › the inventory item stays unmet even with every entity fact recorded',
    status: 'implemented',
  },

  // ---- Concept Note package ----------------------------------------------
  {
    id: 'G-CN-01',
    clause: 'GCF Concept Note / Funding Proposal structure, sections A-H',
    rule: 'Every input is laid out in GCF order and marked held, partial or external.',
    implementation: 'services/gcf/cn-package.js — buildPackage()',
    test: 'tests/gcf-cn-package.test.js › Eight sections, in the order a Concept Note reads › sections A through H are present and in order',
    status: 'implemented',
  },
  {
    id: 'G-CN-02',
    clause: 'GCF policies — NDA no-objection, gender assessment, ESIA/ESMP, FPIC',
    rule: 'Documents and legal instruments no model can produce are named as external, with what is needed and from whom.',
    implementation: 'services/gcf/cn-package.js — external() entries in sections D and G',
    test: 'tests/gcf-cn-package.test.js › External is the useful state › the legal instruments no model can produce are named as external',
    status: 'implemented',
  },
  {
    id: 'G-CN-03',
    clause: 'Scope limit stated in the gap analysis',
    rule: 'This system does not write the Concept Note, score a proposal on GCF\'s behalf, substitute for an ESIA or FPIC consultation, produce the no-objection letter, or confirm co-financing.',
    implementation: 'services/gcf/cn-package.js — limits; services/gcf/screening.js — recommend().limits',
    test: 'tests/gcf-cn-package.test.js › External is the useful state › it says plainly that it does not write the Concept Note',
    status: 'implemented',
  },
  {
    id: 'G-CN-04',
    clause: 'Document delivery',
    rule: 'A document is collected in full, checked to be well formed, and declares a version covering every feature it draws.',
    implementation: 'services/gcf/cn-package.js — buildPackagePDF with pdfVersion 1.4; services/pdf-response.js',
    test: 'tests/gcf-cn-package.test.js › Documents › the PDF is well formed and declares a version covering what it draws',
    status: 'implemented',
  },

  // ---- Deliberately out of scope -----------------------------------------
  {
    id: 'G-EXCL-01',
    clause: 'ToR Lot 1, Milestones 1-3 and 5',
    rule: 'Institutional readiness assessment, governance and procurement policy drafting, and staff training design.',
    implementation: null,
    test: null,
    status: 'excluded',
    limitation: 'These are consultancy deliverables carried out by people. This system addresses '
      + 'Milestone 4 (sustainability reporting and carbon accounting data) and Lot 2 (pipeline '
      + 'screening and instrument structuring).',
  },
  {
    id: 'G-EXCL-02',
    clause: 'GCF Funding Proposal preparation',
    rule: 'Full Funding Proposal drafting, the appraisal GCF itself performs, and the Secretariat review process.',
    implementation: null,
    test: null,
    status: 'excluded',
    limitation: 'A Funding Proposal is an argument made by an accredited entity and assessed by '
      + 'GCF. This system prepares inputs to a Concept Note and states what it cannot supply.',
  },
];

const VALID_STATUS = ['implemented', 'partial', 'excluded'];

function summarise(rules = RULES) {
  const by = {};
  for (const s of VALID_STATUS) by[s] = rules.filter(r => r.status === s).length;
  return { total: rules.length, ...by };
}

function conformanceMatrix() {
  return {
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    summary: summarise(),
    disclaimer: 'Nothing here is endorsed by the Green Climate Fund, and this system does not '
      + 'score a proposal on GCF\'s behalf. This is a self-declaration of what has been built '
      + 'against a published Terms of Reference, offered with the evidence needed to check it.',
    rules: RULES,
  };
}

module.exports = { conformanceMatrix, summarise, RULES, SOURCE, VALID_STATUS };
