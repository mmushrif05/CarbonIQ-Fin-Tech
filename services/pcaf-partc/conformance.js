/**
 * CarbonIQ FinTech — PCAF Part C: Conformance Matrix
 *
 * A machine-readable statement of what this engine claims to implement, where
 * each rule lives in code, and which test proves it still holds.
 *
 * This exists because "conformant" is a claim, and a claim a reviewer cannot
 * check is worth little. Anyone assessing this engine — an insurer's auditor,
 * an assurance provider, a standards body — can take any row below, open the
 * named file, run the named test, and see the rule enforced. When a rule stops
 * being enforced, its test fails and the matrix is wrong in a way CI catches.
 *
 * What this is NOT: PCAF does not approve, endorse or certify software, and
 * nothing here should be read as saying otherwise. This is a self-declaration
 * of conformance with the method as published, offered with the evidence
 * needed to check it.
 *
 * `status` values:
 *   implemented — the rule is enforced in code and covered by a test
 *   partial     — enforced for the scope stated in `limitation`
 *   excluded    — deliberately out of scope, with the reason given
 */

'use strict';

const STANDARD = 'PCAF Global GHG Accounting and Reporting Standard — Part C (insurance-associated emissions), v2';

const RULES = [
  // ---- Scope ------------------------------------------------------------
  {
    id: 'C-SCOPE-01',
    clause: 'Part C v2 §5.3',
    rule: 'A4 and A5 (construction, scope 1 and 2) shall be reported for all project-insurance lines. This is the core figure.',
    implementation: 'services/pcaf-partc/rollup.js — construction = A4 + A5, reported as the PCAF figure',
    test: 'tests/pcaf-partc-engine.test.js › end-to-end roll-up › workbook path reproduces the reference construction figure and IAE',
    status: 'implemented'
  },
  {
    id: 'C-SCOPE-02',
    clause: 'Part C v2 §5.3',
    rule: 'B1, B4 and B7 (use stage) are optional. Where computed they shall be reported separately and never merged into the A4+A5 figure.',
    implementation: 'services/pcaf-partc/rollup.js — useStage is a distinct traced value; no code path sums it with construction',
    test: 'tests/pcaf-partc-engine.test.js › IDI policy runs the use stage and reports it separately',
    status: 'implemented'
  },
  {
    id: 'C-SCOPE-03',
    clause: 'Part C v2 §5.3',
    rule: 'A1-A3 embodied emissions are out of scope for project insurance.',
    implementation: 'Not computed. services/pcaf.js handles A1-A3 for lending and is a separate service with no import path into the Part C engine.',
    test: 'tests/pcaf-partc-registers.test.js › separation from the lending PCAF service › the Part C engine does not import the lending PCAF service',
    status: 'excluded',
    limitation: 'Reserved for a future release (PCAF proposal PR-02b). Kept as an absent capability rather than a disabled one, so it cannot leak into the figure.'
  },
  {
    id: 'C-SCOPE-04',
    clause: 'Part C v2 §5.3, Fig 5.3-1',
    rule: 'Policy type determines the life-cycle stage: CAR and EAR map to construction; IDI/Decennial and Property map to the use stage.',
    implementation: 'services/pcaf-partc/policy-gate.js — useStageYears() returns 0 for CAR/EAR and the cover period for IDI/Property; an unrecognised type fails closed to construction-only',
    test: 'tests/pcaf-partc-engine.test.js › policy gate (4 tests)',
    status: 'implemented'
  },
  {
    id: 'C-SCOPE-05',
    clause: 'Part C v2 §5.3',
    rule: 'Where the policy carries no use stage, the use-stage modules are zero by scope rule rather than by omission, and the distinction is disclosed.',
    implementation: 'services/pcaf-partc/{b1-refrigerant,b4-replacement,b7-water}.js — each returns an explicitly traced zero carrying a GATED assumption naming the policy type',
    test: 'tests/pcaf-partc-engine.test.js › CAR policy zeroes every use-stage module',
    status: 'implemented'
  },
  {
    id: 'C-SCOPE-06',
    clause: 'RICS WLCA 2nd ed / EN 15978 (beyond PCAF)',
    rule: 'Voluntary whole-life modules (B2, B5, B8) are outside PCAF scope and shall never enter the PCAF figure.',
    implementation: 'services/pcaf-partc/beyond-pcaf.js is not imported by rollup.js — the constraint is enforced by the module graph, not by convention. Results surface only under result.beyondPcafAnnex.',
    test: 'tests/pcaf-partc-engine.test.js › scope wall › the roll-up module does not import the Beyond-PCAF module; and › the Beyond-PCAF annex never enters the PCAF figure',
    status: 'implemented'
  },

  // ---- Attribution ------------------------------------------------------
  {
    id: 'C-ATTR-01',
    clause: 'Part C v2 — attribution',
    rule: 'The insurer attributes emissions by premium over the relevant denominator: project cost for project-specific cover, revenue for annual cover, ceded over gross for treaty.',
    implementation: 'services/pcaf-partc/attribution.js — one basis per policy type, each recording its equation and both operands',
    test: 'tests/pcaf-partc-engine.test.js › attribution (4 tests)',
    status: 'implemented'
  },
  {
    id: 'C-ATTR-02',
    clause: 'Part C v2 — double counting',
    rule: 'Reinsurance ceded may be deducted so the same exposure is not counted twice along the insurance chain.',
    implementation: 'services/pcaf-partc/attribution.js — net-premium mode deducts ceded premium and records an ATTR_NET_PREMIUM assumption naming the amount',
    test: 'tests/pcaf-partc-engine.test.js › attribution › net-premium mode deducts reinsurance ceded',
    status: 'implemented'
  },
  {
    id: 'C-ATTR-03',
    clause: 'Part C v2 — aggregation',
    rule: 'Attribution is applied per project and the results summed. Premiums, costs and emissions are never pooled before attribution.',
    implementation: 'services/pcaf-partc/index.js — runPartC() computes a single policy against a single project; no cross-project pooling exists in the engine',
    test: 'tests/pcaf-partc-lifecycle.test.js › run store › runs are scoped per organisation',
    status: 'partial',
    limitation: 'Portfolio aggregation across a book of policies is not yet built. The per-project rule it must respect is established and enforced; the aggregation layer is a later release.'
  },

  // ---- Method -----------------------------------------------------------
  {
    id: 'C-METH-01',
    clause: 'RICS WLCA 2nd ed — A4',
    rule: 'Transport emissions are mass times distance times a mode-specific emission factor, summed across materials.',
    implementation: 'services/pcaf-partc/a4-transport.js — a4Material() and a4Total()',
    test: 'tests/pcaf-partc-engine.test.js › A4 transport (5 tests) — reproduces the reference workbook to 5 decimal places',
    status: 'implemented'
  },
  {
    id: 'C-METH-02',
    clause: 'RICS WLCA 2nd ed — A5',
    rule: 'Construction-stage emissions comprise A5.1 pre-construction demolition, A5.2 site energy and A5.3 waste.',
    implementation: 'services/pcaf-partc/a5-construction.js — the three sub-modules, summed by a5Total()',
    test: 'tests/pcaf-partc-engine.test.js › A5 construction (6 tests)',
    status: 'partial',
    limitation: 'A5.4 worker transport is excluded, and the exclusion is stated in the module and in every report.'
  },
  {
    id: 'C-METH-03',
    clause: 'RICS WLCA 2nd ed, Table 18',
    rule: 'Waste rates follow RICS Table 18 by product category, with a documented default where a product is unlisted.',
    implementation: 'data/factors/waste-rates-rics-t18.json — all 28 categories; an unlisted product takes the 5% default and is flagged as a fallback',
    test: 'tests/pcaf-partc-engine.test.js › A5 construction › PVC falls back to the RICS 5% default and says so',
    status: 'implemented'
  },
  {
    id: 'C-METH-04',
    clause: 'IPCC 2019 Refinement Table 7.9; IPCC AR5',
    rule: 'Refrigerant emissions are charge times annual leak rate times GWP times years, with leak rate by equipment type and GWP on a stated basis.',
    implementation: 'services/pcaf-partc/b1-refrigerant.js; factors in data/factors/refrigerant-{leak,gwp}.json. GWP basis is AR5 100-year and is stated in the factor table.',
    test: 'tests/pcaf-partc-engine.test.js › use-stage modules › B1 reproduces the workbook',
    status: 'implemented'
  },
  {
    id: 'C-METH-05',
    clause: 'CIBSE TM65',
    rule: 'Refrigerant charge is taken from the actual charge where known, then cooling capacity, then a floor-area screen.',
    implementation: 'services/pcaf-partc/b1-refrigerant.js — three-step priority; each fallback records its basis, and the per-m2 screen is marked a literature assumption rather than a standard',
    test: 'tests/pcaf-partc-engine.test.js › use-stage modules › B1 prefers an actual charge over the per-m2 benchmark',
    status: 'implemented'
  },
  {
    id: 'C-METH-06',
    clause: 'RICS WLCA 2nd ed §5.2.4',
    rule: 'Replacements are counted like-for-like within the cover window, excluding the original installation.',
    implementation: "services/pcaf-partc/b4-replacement.js — replacementCount() = max(ceil(years / life) − 1, 0)",
    test: 'tests/pcaf-partc-engine.test.js › use-stage modules › replacement counting excludes the original install',
    status: 'partial',
    limitation: 'B4 covers HVAC refrigerant re-release (B4.2) only. Component-by-component replacement (B4.1) is not included, and every report states the restriction.'
  },
  {
    id: 'C-METH-07',
    clause: 'Part C v2 — operational water',
    rule: 'Operational water covers supply and wastewater treatment. Water heating belongs to B6 and is excluded.',
    implementation: 'services/pcaf-partc/b7-water.js — supply and wastewater factors held separately and summed, so either may be localised independently; the B6 exclusion is stated in the module output',
    test: 'tests/pcaf-partc-engine.test.js › use-stage modules › B7 reproduces the workbook',
    status: 'implemented'
  },
  {
    id: 'C-METH-08',
    clause: 'GHG Protocol / US EPA',
    rule: 'A de-minimis threshold may be reported, but nothing is excluded on that basis without disclosure.',
    implementation: 'services/pcaf-partc/b1-refrigerant.js — deMinimisCheck() reports the ratio and always returns excluded: false',
    test: 'tests/pcaf-partc-engine.test.js › end-to-end roll-up › de-minimis is reported for information and excludes nothing',
    status: 'implemented'
  },

  // ---- Data quality and disclosure --------------------------------------
  {
    id: 'C-DQ-01',
    clause: 'PCAF data quality scoring',
    rule: 'Every assessment discloses a data quality option and score on the 1 (best) to 5 (worst) scale.',
    implementation: 'services/pcaf-partc/data-quality.js — option-to-score map; the MVP reports Option 2b (physical activity data with secondary factors) = score 3',
    test: 'tests/pcaf-partc-api.test.js › assessment › the response carries all three registers',
    status: 'implemented'
  },
  {
    id: 'C-DQ-02',
    clause: 'PCAF — factor transparency',
    rule: 'Every emission factor carries a data-quality tier and a named source.',
    implementation: 'data/factors/*.json — every row carries tier and reference; services/pcaf-partc/factors.js refuses to return an anonymous value, and GET /v1/pcaf/part-c/factors publishes the whole store',
    test: 'tests/pcaf-partc-registers.test.js › factor store › every factor row carries a tier and a reference',
    status: 'implemented'
  },
  {
    id: 'C-DQ-03',
    clause: 'PCAF — limitations',
    rule: 'Assumptions and limitations are disclosed rather than buried.',
    implementation: 'services/partc-registers.js — the Assumptions and Limitations Register is derived from the traced-value tree, so it cannot disagree with the arithmetic. Reported as Annex A in both PDF and Word.',
    test: 'tests/pcaf-partc-registers.test.js › registers (5 tests)',
    status: 'implemented'
  },
  {
    id: 'C-DQ-04',
    clause: 'PCAF — conformance language',
    rule: 'An assessment may claim conformance with the method. It may not claim PCAF approval, endorsement or certification.',
    implementation: 'services/pcaf-partc/data-quality.js — containsForbiddenLanguage(); services/partc-reports.js refuses to build a report containing endorsement language',
    test: 'tests/pcaf-partc-registers.test.js › disclosure language guard (3 tests)',
    status: 'implemented'
  },
  {
    id: 'C-DQ-05',
    clause: 'Audit and assurance',
    rule: 'Every figure traces to its equation, its inputs and the factors it consulted.',
    implementation: 'services/pcaf-partc/provenance.js — every engine function returns a traced value; the audit trail in Annex C is generated by walking that tree rather than narrated after the fact',
    test: 'tests/pcaf-partc-registers.test.js › registers › every audit trail entry carries an equation',
    status: 'implemented'
  },
  {
    id: 'C-DQ-07',
    clause: 'PCAF — a figure is disclosed with its score',
    rule: 'Each reported scope carries an emission-weighted data quality score built from the evidence behind each input, and the construction and use-stage scores are reported separately and never blended.',
    implementation: 'services/pcaf-partc/dq-scoring.js — per-input scores follow the evidence the run actually used, module_score is the mean of its inputs, and each scope score is sum(module emissions x module score) / sum(module emissions). The scoring reads a finished result and computes no figure of its own.',
    test: 'tests/pcaf-partc-dq-scoring.test.js \u203a emission-weighted roll-up \u203a the weighted score is \u03a3(emissions \u00d7 score) \u00f7 \u03a3(emissions), not a flat average',
    status: 'implemented'
  },
  {
    id: 'C-DQ-08',
    clause: 'PCAF — the scope rule reaches the score',
    rule: 'Where the policy gate closes the use stage, the use-stage score reports as not applicable by scope rule rather than as a score of zero or a measurement of nothing.',
    implementation: 'services/pcaf-partc/dq-scoring.js — useStage.applies follows policy.useStageYears; gated inputs are marked not evaluated and cite the gate rather than reporting a zero-valued basis',
    test: 'tests/pcaf-partc-dq-scoring.test.js \u203a the scope rule reaches the score \u203a a gated use-stage input says it was not evaluated, not that it measured zero',
    status: 'implemented'
  },
  {
    id: 'C-DQ-09',
    clause: 'PCAF — the disclosure statement is generated, not written',
    rule: 'The disclosure statement is produced from the execution: standard, section, both figures, the PCAF option, both scores and the limitations the run actually carries.',
    implementation: 'services/pcaf-partc/dq-scoring.js disclosureStatement() — every clause is read from the result, and limitations are named from the inputs that scored 4 or worse, so a supplied actual removes its own limitation',
    test: 'tests/pcaf-partc-dq-scoring.test.js \u203a the generated disclosure statement \u203a a supplied actual removes its limitation from the statement',
    status: 'implemented'
  },
  {
    id: 'C-DQ-06',
    clause: 'Reproducibility',
    rule: 'The same inputs produce the same disclosure.',
    implementation: 'services/pcaf-partc/ is pure and deterministic: no network, no clock in any calculation, no LLM in any arithmetic path. Claude classifies, extracts and writes; the engine computes.',
    test: 'tests/pcaf-partc-e2e.test.js › reproducibility › the same inputs produce an identical disclosure',
    status: 'implemented'
  },

  // ---- Reporting requirements (Part C ch.6) ------------------------------
  {
    id: 'C-RPT-01',
    clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)',
    rule: 'The insured\u2019s scope 1 and 2 are reported combined as the absolute figure, with the insured\u2019s scope 3 reported separately from them.',
    implementation: 'services/pcaf-partc/ghg-scopes.js maps each lifecycle stage to a GHG scope once; the emissions split and the data-quality split both read that map, so the two cuts cannot disagree. The report renders both in section 4.',
    test: 'tests/partc-report-standard.test.js \u203a The insured GHG scope split \u203a reconciles exactly to the construction figure it is split from',
    status: 'implemented'
  },
  {
    id: 'C-RPT-02',
    clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)',
    rule: 'The disclosed data-quality score is weighted by outstanding premium, and the emission-weighted score is never presented as the disclosed figure.',
    implementation: 'services/partc-portfolio.js _premiumWeighted() produces the disclosed score; the emission-weighted score survives beside it carrying the label "internal diagnostic, not the disclosed score". A policy with no score is excluded from the weighting rather than counted as zero.',
    test: 'tests/partc-portfolio.test.js \u203a Portfolio \u2014 the disclosed data-quality score \u203a the disclosed score is premium-weighted and says so',
    status: 'implemented'
  },
  {
    id: 'C-RPT-03',
    clause: 'Part C ch.6, RECALCULATION (p.99)',
    rule: 'A base-year recalculation protocol and a significance threshold are stated by the reporting entity and printed in every report.',
    implementation: 'schemas/partc-registry.js holds baseYear, significanceThresholdPct and recalculationTriggers on the entity\u2019s settings, defaulted to the GHG Protocol Scope 3 triggers; section 7 of every report prints them, and says plainly when no base year has been set rather than implying one.',
    test: 'tests/partc-report-output.test.js \u203a Part C report \u2014 the PDF is readable \u203a the recalculation protocol and the significance threshold are present',
    status: 'implemented'
  },
  {
    id: 'C-RPT-04',
    clause: 'Part C ch.6',
    rule: 'The report answers every disclosure requirement of Chapter 6, or states a justification for each it does not.',
    implementation: 'services/partc-checklist.js completes the checklist from the same facts the sections render, so an item cannot answer Yes to something the document does not contain; anything but Yes carries its reason, and the completed checklist is the final annex of both documents.',
    test: 'tests/partc-report-standard.test.js \u203a The completed disclosure checklist \u203a it cannot claim what the report does not contain',
    status: 'implemented'
  },
  {
    id: 'C-RPT-05',
    clause: 'Part C ch.6, GASES AND UNITS (pp.103, 61)',
    rule: 'The seven Kyoto Protocol gases are accounted for, and the GWP basis names its time horizon and IPCC assessment report.',
    implementation: 'services/partc-report-standard.js KYOTO_GASES names all seven with where each arises in a construction value chain; section 3 states the 100-year horizon and IPCC AR5, and discloses the AR4/AR5 difference for R-410A rather than reconciling it silently.',
    test: 'tests/partc-report-output.test.js \u203a Part C report \u2014 the PDF is readable \u203a the seven Kyoto gases and the GWP basis are named',
    status: 'implemented'
  },
  {
    id: 'C-RPT-06',
    clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)',
    rule: 'Financed emissions and insurance-associated emissions are reported separately and never combined.',
    implementation: 'No code path sums the two: financed emissions are produced by services/pcaf.js for lending and have no import path into the Part C engine. Section 4 of every report states the separation explicitly.',
    test: 'tests/partc-report-standard.test.js \u203a The section model \u203a states that financed emissions are never combined with these',
    status: 'implemented'
  },

  // ---- Annual disclosure -------------------------------------------------
  {
    id: 'C-DISC-01',
    clause: 'Part C v2 §6 — reporting',
    rule: 'The reported position shall state the coverage it rests on. A total drawn from part of the book shall not be presented as the whole book.',
    implementation: 'services/partc-disclosure.js — coverage.statement names assessed and in-force policy counts in section 3, and every unassessed policy is listed by name',
    test: 'tests/partc-disclosure.test.js › What the disclosure states plainly › coverage is stated as a fraction of the book, not left to be inferred',
    status: 'implemented'
  },
  {
    id: 'C-DISC-02',
    clause: 'Part C v2 §6 — reporting',
    rule: 'A disclosure shall report a position it holds. A reporting year with no locked assessment is not a position of zero.',
    implementation: 'services/partc-disclosure.js — buildAnnualDisclosure throws NOTHING_TO_DISCLOSE (409) when the year holds no locked assessment',
    test: 'tests/partc-disclosure.test.js › What the disclosure refuses to do › a year with no locked assessment is refused, not reported as zero',
    status: 'implemented'
  },
  {
    id: 'C-DISC-03',
    clause: 'Part C v2 §6 — reporting',
    rule: 'Every disclosed figure shall be traceable to the assessment, bill of quantities and lock behind it.',
    implementation: 'services/partc-disclosure.js — Annex C records assessment id, version, BOQ revision, lock time and locking organisation for every row in section 5',
    test: 'tests/partc-disclosure.test.js › What the disclosure states plainly › every disclosed figure traces to an assessment, a BOQ revision and a lock',
    status: 'implemented'
  },
  {
    id: 'C-REST-01',
    clause: 'Part C v2 §6 — restatement',
    rule: 'Where a previously reported figure has changed, both the figure as previously reported and the figure as restated shall be disclosed, with the reason.',
    implementation: 'services/partc-comparatives.js — restatementsFor() reports asPreviouslyReported/asRestated per policy with the reason recorded at lock time; compare() carries both bases into the following year',
    test: 'tests/partc-comparatives.test.js › Restatement register › a locked version that moves the figure materially is disclosed on both bases',
    status: 'implemented'
  },
  {
    id: 'C-REST-02',
    clause: 'Part C v2 §6 — restatement',
    rule: 'Only a figure that has entered a disclosure can be restated. An unapproved calculation does not change a reported position.',
    implementation: 'services/partc-comparatives.js — the register reads locked assessments only, so a draft that would move the figure has not moved it',
    test: 'tests/partc-comparatives.test.js › Restatement register › a draft that would move the figure has not moved it',
    status: 'implemented'
  },
  {
    id: 'C-REST-03',
    clause: 'Comparability',
    rule: 'A movement between annual totals shall not be presented as a change in performance where the underwritten book itself changed.',
    implementation: 'services/partc-comparatives.js — a policy is reported in its inception year, so each year covers different policies; compare() states this with the movement and reports intensity (kgCO2e/m² insured) and emissions-weighted data quality as the comparable measures',
    test: 'tests/partc-comparatives.test.js › Prior-year comparison › a movement in the total is never described as a performance change',
    status: 'implemented'
  }
];

/** Summary counts by status. */
function summarise(rules = RULES) {
  return rules.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, {});
}

/** The full matrix, with the standing disclaimer attached. */
function conformanceMatrix() {
  return {
    standard: STANDARD,
    statement: 'Self-declaration of conformance with the published method, offered with the evidence needed to verify it. Every rule names the code that enforces it and the test that proves it.',
    disclaimer: 'PCAF does not approve, endorse or certify software or service providers. Nothing in this matrix should be read as claiming that it does.',
    summary: summarise(),
    rules: RULES,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { conformanceMatrix, summarise, RULES, STANDARD };
