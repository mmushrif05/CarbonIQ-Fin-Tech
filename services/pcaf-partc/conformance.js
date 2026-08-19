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
    id: 'C-DQ-06',
    clause: 'Reproducibility',
    rule: 'The same inputs produce the same disclosure.',
    implementation: 'services/pcaf-partc/ is pure and deterministic: no network, no clock in any calculation, no LLM in any arithmetic path. Claude classifies, extracts and writes; the engine computes.',
    test: 'tests/pcaf-partc-e2e.test.js › reproducibility › the same inputs produce an identical disclosure',
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
