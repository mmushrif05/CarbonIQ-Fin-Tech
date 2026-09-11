# Conformance evidence — the cited test executes the cited code

<!-- GENERATED FILE. Do not edit by hand.
     Source: src/domains/pcaf-part-a/domain/conformance.js, src/domains/pcaf-part-c/domain/conformance.js, src/domains/gcf/domain/conformance.js
     Regenerate: npm run docs:conformance-evidence -->

A conformance matrix that only proves its citations *resolve* proves nothing
about behaviour: a rule can name a real file and a real test while no path
reaches the code the rule is about. Each row below was produced by running the
rule's own proving test under coverage restricted to the files that rule cites,
and recording how many statements ran.

**Executed** means the proving test reached the cited implementation.
**Out of scope** is a rule that exists to keep something out, so there is no
path to execute. **Proved by absence** is a rule whose claim is that no path
exists — the cited code must *not* run here, so a coverage figure would be the
wrong evidence. **No code path cited** is a rule evidenced by a data table.

Statement counts are evidence of execution, not a coverage target: a rule is
proved or it is not.

| Matrix | Rule | Clause | Proving test | Statements executed | Verdict |
|---|---|---|---|---|---|
| PCAF Part A §5.2 | `A-SCOPE-01` | Part A §5.2 (p.55) | `tests/parta-business-loans.test.js` | 42 | executed |
| PCAF Part A §5.2 | `A-SCOPE-02` | Part A §5.2 (p.56) | `tests/parta-business-loans.test.js` | 3 | executed |
| PCAF Part A §5.2 | `A-SCOPE-03` | Part A p.126 | `tests/parta-business-loans.test.js` | 3 | executed |
| PCAF Part A §5.2 | `A-SCOPE-04` | Three scopes never merge (architecture) | `tests/architecture.test.js` | — | proved by absence |
| PCAF Part A §5.2 | `A-SCOPE-05` | Part A §5.2; GHG Protocol "Built on" mark | `tests/parta-report.test.js` | 37 | executed |
| PCAF Part A §5.2 | `A-CLASS-01` | Part A §5.2, footnote 86 (p.55) | `tests/parta-business-loans.test.js` | 42 | executed |
| PCAF Part A §5.2 | `A-ATTR-01` | Part A §5.2 (p.56) | `tests/parta-business-loans.test.js` | 39 | executed |
| PCAF Part A §5.2 | `A-ATTR-02` | Part A §5.2 — attribution factor | `tests/parta-business-loans.test.js` | 22 | executed |
| PCAF Part A §5.2 | `A-OPT-01` | Part A §5.2, Table 5.2-1 (p.60) | `tests/parta-business-loans.test.js` | 46 | executed |
| PCAF Part A §5.2 | `A-OPT-02` | Part A §5.2 fn 87 (p.61) | `tests/parta-business-loans.test.js` | 41 | executed |
| PCAF Part A §5.2 | `A-OPT-03` | Data-quality rendering (the scale has a direction) | `tests/parta-business-loans.test.js` | 3 | executed |
| PCAF Part A §5.2 | `A-EST-01` | Part A §5.2 (p.62) | `tests/parta-business-loans.test.js` | 46 | executed |
| PCAF Part A §5.2 | `A-EST-02` | Part A §5.2 (p.62) | `tests/parta-business-loans.test.js` | 43 | executed |
| PCAF Part A §5.2 | `A-EST-03` | Part A Box 6.1-5 (p.167) | `tests/parta-business-loans.test.js` | 53 | executed |
| PCAF Part A §5.2 | `A-LINE-01` | Part A §5.2, Tables 5.2-2/5.2-3 (p.63) | `tests/parta-business-loans.test.js` | 19 | executed |
| PCAF Part A §5.2 | `A-FIND-01` | CarbonIQ — the engine blocks a claim, not a number | `tests/parta-business-loans.test.js` | 14 | executed |
| PCAF Part A §5.2 | `A-FIND-02` | Part A footnote 71 (year-end balance) | `tests/parta-business-loans.test.js` | 53 | executed |
| PCAF Part A §5.2 | `A-FIND-03` | CarbonIQ — a check that had nothing to check does not pass | `tests/parta-business-loans.test.js` | 53 | executed |
| PCAF Part A §5.2 | `A-FIND-04` | CarbonIQ thresholds (stated on the finding, settable per request) | `tests/parta-business-loans.test.js` | 53 | executed |
| PCAF Part A §5.2 | `A-REG-01` | Register (migration 0008) — both halves kept | `tests/parta-register.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-REG-02` | Register (migration 0009) — one loan, once | `tests/parta-register.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-REG-03` | Register — a recomputation is a decision, not a read | `tests/parta-register.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-REG-04` | DCL Part A (p.124) — coverage over the whole book | `tests/parta-register.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-REG-05` | Register — the roll-up reads a projection | `tests/parta-register.test.js` | 141 | executed |
| PCAF Part A §5.2 | `A-REG-06` | Register — the band is resolved at call time | `tests/parta-register.test.js` | 19 | executed |
| PCAF Part A §5.2 | `A-REG-07` | Register — a half-built lifecycle is worse than none | `tests/parta-register.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-REG-08` | Chapter 6 — recalculation and significance | `tests/parta-register.test.js` | 146 | executed |
| PCAF Part A §5.2 | `A-RECALC-01` | Chapter 6 — recalculation and significance | `tests/parta-register.test.js` | 32 | executed |
| PCAF Part A §5.2 | `A-DQ-01` | Part A Box 6.1-6 (pp.167–168), p.128 | `tests/parta-business-loans.test.js` | 73 | executed |
| PCAF Part A §5.2 | `A-DQ-02` | Part A (p.56) | `tests/parta-business-loans.test.js` | 73 | executed |
| PCAF Part A §5.2 | `A-DQ-03` | CarbonIQ — a score is a measurement, a plan is a task list | `tests/parta-business-loans.test.js` | 73 | executed |
| PCAF Part A §5.2 | `A-DQ-04` | Comparability — a position of zero is a different claim | `tests/parta-business-loans.test.js` | 73 | executed |
| PCAF Part A §5.2 | `A-REPORT-01` | Part A Chapter 6 (pp.160–174) | `tests/parta-report.test.js` | 39 | executed |
| PCAF Part A §5.2 | `A-REPORT-02` | Part A §5.2 (p.56); p.126 | `tests/parta-report.test.js` | 39 | executed |
| PCAF Part A §5.2 | `A-REPORT-03` | DCL Part A (p.124) | `tests/parta-report.test.js` | 37 | executed |
| PCAF Part A §5.2 | `A-REPORT-04` | Part A Box 6.1-6 (pp.167–168) | `tests/parta-report.test.js` | 39 | executed |
| PCAF Part A §5.2 | `A-REPORT-05` | Part A §5.2 (p.57); factor manifest | `tests/parta-report.test.js` | 43 | executed |
| PCAF Part A §5.2 | `A-REPORT-06` | Part A Chapter 6 (p.160); SLFRS S2 §29(a) | `tests/parta-report.test.js` | 44 | executed |
| PCAF Part A §5.2 | `A-REPORT-07` | report-integrity; PCAF conformance language | `tests/parta-report.test.js` | 35 | executed |
| PCAF Part A §5.2 | `A-REPORT-08` | The engine does every arithmetic operation | `tests/parta-report.test.js` | 19 | executed |
| PCAF Part A §5.2 | `A-REPORT-09` | pdf-response; delivery | `tests/parta-report-api.test.js` | 76 | executed |
| PCAF Part A §5.2 | `A-REPORT-10` | Chapter 6 — recalculation and significance | `tests/parta-report.test.js` | 39 | executed |
| PCAF Part C | `C-SCOPE-01` | Part C v2 §5.3 | `tests/pcaf-partc-engine.test.js` | 16 | executed |
| PCAF Part C | `C-SCOPE-02` | Part C v2 §5.3 | `tests/pcaf-partc-engine.test.js` | 16 | executed |
| PCAF Part C | `C-SCOPE-03` | Part C v2 §5.3 | `tests/pcaf-partc-registers.test.js` | — | out of scope |
| PCAF Part C | `C-SCOPE-04` | Part C v2 §5.3, Fig 5.3-1 | `tests/pcaf-partc-engine.test.js` | 22 | executed |
| PCAF Part C | `C-SCOPE-05` | Part C v2 §5.3 | `tests/pcaf-partc-engine.test.js` | 87 | executed |
| PCAF Part C | `C-SCOPE-06` | RICS WLCA 2nd ed / EN 15978 (beyond PCAF) | `tests/pcaf-partc-engine.test.js` | 22 | executed |
| PCAF Part C | `C-ATTR-01` | Part C v2 — attribution | `tests/pcaf-partc-engine.test.js` | 23 | executed |
| PCAF Part C | `C-ATTR-02` | Part C v2 — double counting | `tests/pcaf-partc-engine.test.js` | 23 | executed |
| PCAF Part C | `C-ATTR-03` | Part C v2 — aggregation | `tests/pcaf-partc-lifecycle.test.js` | 52 | executed |
| PCAF Part C | `C-METH-01` | RICS WLCA 2nd ed — A4 | `tests/pcaf-partc-engine.test.js` | 52 | executed |
| PCAF Part C | `C-METH-02` | RICS WLCA 2nd ed — A5 | `tests/pcaf-partc-engine.test.js` | 61 | executed |
| PCAF Part C | `C-METH-03` | RICS WLCA 2nd ed, Table 18 | `tests/pcaf-partc-engine.test.js` | — | no code path cited |
| PCAF Part C | `C-METH-04` | IPCC 2019 Refinement Table 7.9; IPCC AR5 | `tests/pcaf-partc-engine.test.js` | 32 | executed |
| PCAF Part C | `C-METH-05` | CIBSE TM65 | `tests/pcaf-partc-engine.test.js` | 32 | executed |
| PCAF Part C | `C-METH-06` | RICS WLCA 2nd ed §5.2.4 | `tests/pcaf-partc-engine.test.js` | 22 | executed |
| PCAF Part C | `C-METH-07` | Part C v2 — operational water | `tests/pcaf-partc-engine.test.js` | 33 | executed |
| PCAF Part C | `C-METH-08` | GHG Protocol / US EPA | `tests/pcaf-partc-engine.test.js` | 32 | executed |
| PCAF Part C | `C-DQ-01` | PCAF data quality scoring | `tests/pcaf-partc-api.test.js` | 29 | executed |
| PCAF Part C | `C-DQ-02` | PCAF — factor transparency | `tests/pcaf-partc-registers.test.js` | 71 | executed |
| PCAF Part C | `C-DQ-03` | PCAF — limitations | `tests/pcaf-partc-registers.test.js` | 41 | executed |
| PCAF Part C | `C-DQ-04` | PCAF — conformance language | `tests/pcaf-partc-registers.test.js` | 48 | executed |
| PCAF Part C | `C-DQ-05` | Audit and assurance | `tests/pcaf-partc-registers.test.js` | 33 | executed |
| PCAF Part C | `C-DQ-07` | Part C Table 5.3-2 (p.58) | `tests/pcaf-partc-dq-scoring.test.js` | 131 | executed |
| PCAF Part C | `C-DQ-08` | Part C Table 5.3-2 (p.58); Chapter 6 (p.106) | `tests/pcaf-partc-dq-scoring.test.js` | 93 | executed |
| PCAF Part C | `C-DQ-09` | PCAF — the disclosure statement is generated, not written | `tests/pcaf-partc-dq-scoring.test.js` | 93 | executed |
| PCAF Part C | `C-DQ-06` | Reproducibility | `tests/pcaf-partc-e2e.test.js` | — | no code path cited |
| PCAF Part C | `C-RPT-01` | Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105) | `tests/partc-report-standard.test.js` | 35 | executed |
| PCAF Part C | `C-RPT-02` | Part C ch.6, DATA AND DATA QUALITY (p.106) | `tests/partc-portfolio.test.js` | 138 | executed |
| PCAF Part C | `C-RPT-03` | Part C ch.6, RECALCULATION (p.99) | `tests/partc-report-output.test.js` | 17 | executed |
| PCAF Part C | `C-RPT-04` | Part C ch.6 | `tests/partc-report-standard.test.js` | 56 | executed |
| PCAF Part C | `C-RPT-05` | Part C ch.6, GASES AND UNITS (pp.103, 61) | `tests/partc-report-output.test.js` | 7 | executed |
| PCAF Part C | `C-RPT-06` | Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105) | `tests/partc-report-standard.test.js` | — | proved by absence |
| PCAF Part C | `C-DISC-01` | Part C v2 §6 — reporting | `tests/partc-disclosure.test.js` | 67 | executed |
| PCAF Part C | `C-DISC-02` | Part C v2 §6 — reporting | `tests/partc-disclosure.test.js` | 67 | executed |
| PCAF Part C | `C-DISC-03` | Part C v2 §6 — reporting | `tests/partc-disclosure.test.js` | 67 | executed |
| PCAF Part C | `C-REST-01` | Part C v2 §6 — restatement | `tests/partc-comparatives.test.js` | 36 | executed |
| PCAF Part C | `C-REST-02` | Part C v2 §6 — restatement | `tests/partc-comparatives.test.js` | 36 | executed |
| PCAF Part C | `C-REST-03` | Comparability | `tests/partc-comparatives.test.js` | 36 | executed |
| GCF pipeline | `G-DATA-01` | ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data for sustainable reporting" | `tests/gcf-pipeline.test.js` | 58 | executed |
| GCF pipeline | `G-DATA-02` | ToR Lot 1, Milestone 4 — data systems for carbon accounting | `tests/gcf-pipeline.test.js` | 58 | executed |
| GCF pipeline | `G-DATA-03` | ToR Lot 1, Milestone 4 — data "should be stored and can be transferred and assessed" | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-DATA-04` | ToR Lot 1, Milestone 4 — durable capture | `tests/gcf-pipeline.test.js` | 36 | executed |
| GCF pipeline | `G-CARBON-01` | ToR Lot 1, Milestone 4 — emissions | `tests/gcf-emissions.test.js` | 108 | executed |
| GCF pipeline | `G-CARBON-02` | PCAF Part A p.126, applied to project appraisal | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-CARBON-03` | GCF Mitigation Core Indicator 1 (IRMF, decision B.29/01) | `tests/gcf-pipeline.test.js` | 58 | executed |
| GCF pipeline | `G-CARBON-04` | Engine discipline — no LLM computes a regulatory figure | `tests/gcf-emissions.test.js` | 108 | executed |
| GCF pipeline | `G-NDC-01` | Sri Lanka NDC 3.0 (September 2025), ToR section 1.2 | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-02` | Sri Lanka NDC 3.0 — cumulative over 2026-2035 | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-03` | Sri Lanka NDC 3.0 — targets are percentages against a BAU scenario | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-04` | Sri Lanka NDC 3.0 — no net-zero year is stated | `tests/ndc3-currency.test.js` | 14 | executed |
| GCF pipeline | `G-ACCR-01` | ToR section 1.1 — Board decision B.36/10, E&S category B/I-2 | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-ACCR-02` | ToR section 1.1 — medium size (USD 50-250m) | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-ACCR-03` | ToR section 1.1 — modalities: basic, project management, on-lending and blending. The grant box is not ticked. | `tests/gcf-screening.test.js` | 237 | executed |
| GCF pipeline | `G-ACCR-04` | ToR section 1.1 — three open accreditation conditions | `tests/gcf-cn-package.test.js` | 100 | executed |
| GCF pipeline | `G-LOT2-01` | ToR Lot 2 — screening candidates and recommending Concept Notes | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-LOT2-02` | GCF investment framework — six investment criteria | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-LOT2-03` | ToR Lot 2 — at least two high-potential concepts, up to two Concept Notes | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-LOT2-04` | ToR Lot 2 — five to seven innovative instruments evaluated | `tests/gcf-screening.test.js` | 86 | executed |
| GCF pipeline | `G-LOT2-05` | ToR Lot 2 — viability with and without concessional support; GCF minimum concessionality | `tests/gcf-screening.test.js` | 86 | executed |
| GCF pipeline | `G-LOT2-06` | GCF investment policy — no minimum co-financing requirement | `tests/gcf-reporting.test.js` | 85 | executed |
| GCF pipeline | `G-REPORT-01` | SLFRS S2 §29(a); GRI 305-1/2/3 | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-REPORT-02` | GRI 305-5 | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-REPORT-03` | SLFRS S1 §27; SLFRS S2 §6, §25, §33 | `tests/gcf-reporting.test.js` | 92 | executed |
| GCF pipeline | `G-REPORT-04` | Report honesty — a checklist answered from the report | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-CN-01` | GCF Concept Note / Funding Proposal structure, sections A-H | `tests/gcf-cn-package.test.js` | 100 | executed |
| GCF pipeline | `G-CN-02` | GCF policies — NDA no-objection, gender assessment, ESIA/ESMP, FPIC | `tests/gcf-cn-package.test.js` | 100 | executed |
| GCF pipeline | `G-CN-03` | Scope limit stated in the gap analysis | `tests/gcf-cn-package.test.js` | 128 | executed |
| GCF pipeline | `G-CN-04` | Document delivery | `tests/gcf-cn-package.test.js` | 128 | executed |
| GCF pipeline | `G-EXCL-01` | ToR Lot 1, Milestones 1-3 and 5 | — | — | out of scope |
| GCF pipeline | `G-EXCL-02` | GCF Funding Proposal preparation | — | — | out of scope |

## Summary

- 112 rules across the conformance matrices
- **105 proved by execution**
- 3 deliberately out of scope
- 2 proved by the absence of a path
- 2 evidenced by a data table rather than a code path
- **0 unproven**
