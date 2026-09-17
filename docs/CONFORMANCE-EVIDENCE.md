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
| PCAF Part A §5.2 | `A-SCOPE-05` | Part A §5.2; GHG Protocol "Built on" mark | `tests/parta-report.test.js` | 99 | executed |
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
| PCAF Part A §5.2 | `A-REG-01` | Register (migration 0008) — both halves kept | `tests/parta-register.test.js` | 128 | executed |
| PCAF Part A §5.2 | `A-REG-02` | Register (migration 0009) — one loan, once | `tests/parta-register.test.js` | 128 | executed |
| PCAF Part A §5.2 | `A-REG-03` | Register — a recomputation is a decision, not a read | `tests/parta-register.test.js` | 128 | executed |
| PCAF Part A §5.2 | `A-REG-04` | DCL Part A (p.124) — coverage over the whole book | `tests/parta-register.test.js` | 128 | executed |
| PCAF Part A §5.2 | `A-REG-05` | Register — the roll-up reads a projection | `tests/parta-register.test.js` | 133 | executed |
| PCAF Part A §5.2 | `A-REG-06` | Register — the band is resolved at call time | `tests/parta-register.test.js` | 19 | executed |
| PCAF Part A §5.2 | `A-REG-07` | Register — one version of an approved row, never two | `tests/parta-approval.test.js` | 113 | executed |
| PCAF Part A §5.2 | `A-REG-08` | Chapter 6 — recalculation and significance | `tests/parta-register.test.js` | 138 | executed |
| PCAF Part A §5.2 | `A-REG-09` | Chapter 6 — one position per asset class (DCL p.128; §5.1–§5.5 tables) | `tests/parta-register-classes.test.js` | 290 | executed |
| PCAF Part A §5.2 | `A-REG-10` | §5.4 (p.79) / §5.5 — energy statistics per square metre of floor area | `tests/parta-register-classes.test.js` | 111 | executed |
| PCAF Part A §5.2 | `A-REG-11` | Chapter 6 — a document states the class it reports | `tests/parta-register-classes.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-REG-12` | ISAE 3000 §12(a); ISO 14064-3 §5.2 — the responsible party stands behind the figures | `tests/parta-approval.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-REG-13` | ISAE 3000 §12(a) — a figure the entity has stood behind does not move underneath the disclosure | `tests/parta-approval.test.js` | 345 | executed |
| PCAF Part A §5.2 | `A-REG-14` | Table 5.2-1 (p.60) — the option earned decides the score; Options 1 and 2 are preferred over Option 3 | `tests/parta-preview.test.js` | 38 | executed |
| PCAF Part A §5.2 | `A-FAC-01` | §5.2 p.56 (outstanding amount: disbursed debt minus repayments, adjusted annually to 0 at maturity); p.33 (a fixed point in time) | `tests/parta-facility.test.js` | 143 | executed |
| PCAF Part A §5.2 | `A-FAC-02` | §6.2 pp.169–173 (undrawn loan commitments: total loan commitment − drawn amount, the same denominator; unweighted shall, weighted may; never aggregated with drawn, p.170) | `tests/parta-facility.test.js` | 76 | executed |
| PCAF Part A §5.2 | `A-FAC-03` | §5.2 p.56 (the attribution declines to 0 when the loan is fully repaid); ch.6 — a disclosed figure is the reporting year’s | `tests/parta-facility.test.js` | 23 | executed |
| PCAF Part A §5.2 | `A-FAC-04` | §5.3 pp.68–69; §5.4 fn 124; §5.5; §5.6 p.91 — the same outstanding-amount rule in every loan class | `tests/parta-facility.test.js` | 83 | executed |
| PCAF Part A §5.2 | `A-MV-01` | §5.6 Table 5.6-1 (p.94); Annex Table 10.1-6 | `tests/parta-motor-vehicles.test.js` | 166 | executed |
| PCAF Part A §5.2 | `A-MV-02` | §5.6 fn 146 (p.94) | `tests/parta-motor-vehicles.test.js` | 160 | executed |
| PCAF Part A §5.2 | `A-MV-03` | §5.6 (p.93) — combination of options | `tests/parta-motor-vehicles.test.js` | 135 | executed |
| PCAF Part A §5.2 | `A-MV-04` | §5.6 (p.91) — attribution; (p.96) — hybrids and electric vehicles | `tests/parta-motor-vehicles.test.js` | 135 | executed |
| PCAF Part A §5.2 | `A-RECALC-01` | Chapter 6 — recalculation and significance | `tests/parta-register.test.js` | 48 | executed |
| PCAF Part A §5.2 | `A-DQ-01` | Part A Box 6.1-6 (pp.167–168), p.128 | `tests/parta-business-loans.test.js` | 88 | executed |
| PCAF Part A §5.2 | `A-DQ-02` | Part A (p.56) | `tests/parta-business-loans.test.js` | 88 | executed |
| PCAF Part A §5.2 | `A-DQ-03` | CarbonIQ — a score is a measurement, a plan is a task list | `tests/parta-business-loans.test.js` | 88 | executed |
| PCAF Part A §5.2 | `A-DQ-04` | Comparability — a position of zero is a different claim | `tests/parta-business-loans.test.js` | 88 | executed |
| PCAF Part A §5.2 | `A-REPORT-01` | Part A Chapter 6 (pp.160–174) | `tests/parta-report.test.js` | 50 | executed |
| PCAF Part A §5.2 | `A-REPORT-02` | Part A §5.2 (p.56); p.126 | `tests/parta-report.test.js` | 50 | executed |
| PCAF Part A §5.2 | `A-REPORT-03` | DCL Part A (p.124) | `tests/parta-report.test.js` | 99 | executed |
| PCAF Part A §5.2 | `A-REPORT-04` | Part A Box 6.1-6 (pp.167–168) | `tests/parta-report.test.js` | 50 | executed |
| PCAF Part A §5.2 | `A-REPORT-05` | Part A §5.2 (p.57); factor manifest | `tests/parta-report.test.js` | 58 | executed |
| PCAF Part A §5.2 | `A-REPORT-06` | Part A Chapter 6 (p.160); SLFRS S2 §29(a) | `tests/parta-report.test.js` | 62 | executed |
| PCAF Part A §5.2 | `A-REPORT-07` | report-integrity; PCAF conformance language | `tests/parta-report.test.js` | 47 | executed |
| PCAF Part A §5.2 | `A-REPORT-08` | The engine does every arithmetic operation | `tests/parta-report.test.js` | 22 | executed |
| PCAF Part A §5.2 | `A-REPORT-09` | pdf-response; delivery | `tests/parta-report-api.test.js` | 97 | executed |
| PCAF Part A §5.2 | `A-REPORT-10` | Chapter 6 — recalculation and significance | `tests/parta-report.test.js` | 50 | executed |
| PCAF Part A §5.2 | `SOV-ATTR-01` | Part A §5.9 (p.144); Annex 10.3 (pp.201–204) | `tests/parta-sovereign.test.js` | 14 | executed |
| PCAF Part A §5.2 | `SOV-ATTR-02` | Part A §5.9; Table 10.3-2 (p.202) | `tests/parta-sovereign.test.js` | 55 | executed |
| PCAF Part A §5.2 | `SOV-LULUCF` | Part A §5.9 (p.141) | `tests/parta-sovereign-register.test.js` | 93 | executed |
| PCAF Part A §5.2 | `SOV-SCOPE23` | Part A §5.9 (p.141) | `tests/parta-sovereign-report-golden.test.js` | 34 | executed |
| PCAF Part A §5.2 | `SOV-DQ-TABLE` | Part A Table 5.9-6 (p.147) | `tests/parta-sovereign-data.test.js` | 3 | executed |
| PCAF Part A §5.2 | `SOV-DQ-WEIGHT` | PCAF Disclosure Checklist Part A (p.128) | `tests/parta-sovereign-register.test.js` | 71 | executed |
| PCAF Part A §5.2 | `SOV-COVERAGE` | PCAF Disclosure Checklist Part A (p.124) | `tests/parta-sovereign-register.test.js` | 139 | executed |
| PCAF Part A §5.2 | `SOV-CHECK-PROXY` | Part A Table 5.9-6 (p.147); CarbonIQ | `tests/parta-sovereign-checks.test.js` | 43 | executed |
| PCAF Part A §5.2 | `SOV-CHECK-LAG` | Part A ch.4 (p.31); Table 10.3-4 (pp.205–206); CarbonIQ threshold | `tests/parta-sovereign-checks.test.js` | 43 | executed |
| PCAF Part A §5.2 | `SOV-CHECK-INTENSITY` | Part A Annex 10.3 (pp.201–204); CarbonIQ threshold | `tests/parta-sovereign-checks.test.js` | 43 | executed |
| PCAF Part A §5.2 | `SOV-CHECK-INDEP` | CarbonIQ (the GCF independent-path rule) | `tests/parta-sovereign-checks.test.js` | 43 | executed |
| PCAF Part A §5.2 | `SOV-REGISTER` | CarbonIQ; the §5.2 register (migrations 0008/0009) | `tests/parta-sovereign-register.test.js` | 87 | executed |
| PCAF Part A §5.2 | `SOV-PROJECTION` | CarbonIQ (the partc_assessments.rollup discipline) | `tests/parta-sovereign-register.test.js` | 139 | executed |
| PCAF Part A §5.2 | `SOV-EMPTY` | PCAF Disclosure Checklist Part A (p.124) | `tests/parta-sovereign-register.test.js` | 87 | executed |
| PCAF Part A §5.2 | `SOV-REPORT` | Part A Chapter 6 (pp.160–174); Annex 10.2 (pp.199–200) | `tests/parta-sovereign-report-golden.test.js` | 244 | executed |
| PCAF Part A §5.2 | `SOV-REPORT-INV` | Part A ch.6 (p.160); SLFRS S2 §29(a) | `tests/parta-sovereign-report-golden.test.js` | 58 | executed |
| PCAF Part A §5.2 | `SOV-SCALE` | Part A Table 5.9-6 (p.147); docs/GLOSSARY.md §1 | `tests/parta-sovereign-data.test.js` | 6 | executed |
| PCAF Part A §5.2 | `A-DOC-01` | Part A ch.6 (p.161); GHG Protocol Corporate Standard ch.3 | `tests/parta-report-golden.test.js` | 102 | executed |
| PCAF Part A §5.2 | `A-DOC-02` | ISAE 3000 §12(a); ISO 14064-3 §5.2 | `tests/parta-report-golden.test.js` | 98 | executed |
| PCAF Part A §5.2 | `A-DOC-03` | ISAE 3000 §69; ISO 14064-3 §9 | `tests/parta-report-golden.test.js` | 20 | executed |
| PCAF Part A §5.2 | `A-DOC-04` | Part A ch.6 (p.161) | `tests/parta-report-golden.test.js` | 103 | executed |
| PCAF Part A §5.2 | `A-DOC-05` | ISO 14064-3 §6.1.3; ISAE 3000 §48 | `tests/parta-report-golden.test.js` | 171 | executed |
| PCAF Part A §5.2 | `A-DOC-06` | SLFRS S2 §29(a)(vi); Part A ch.6 (p.163) | `tests/parta-report-golden.test.js` | 151 | executed |
| PCAF Part A §5.2 | `A-DOC-07` | DCL p.127 | `tests/parta-report-golden.test.js` | 136 | executed |
| PCAF Part A §5.2 | `A-DOC-08` | Part A Box 6.1-5 (p.167) | `tests/parta-report-golden.test.js` | 135 | executed |
| PCAF Part A §5.2 | `A-DOC-09` | Part A ch.6 (p.164) | `tests/parta-report-golden.test.js` | 22 | executed |
| PCAF Part A §5.2 | `A-DOC-10` | Part A ch.6 (pp.160–169) | `tests/parta-report-golden.test.js` | 62 | executed |
| PCAF Part A §5.2 | `A-DOC-16` | Part A ch.6 (pp.160–169); §5.9 | `tests/parta-sovereign-report-golden.test.js` | 58 | executed |
| PCAF Part A §5.2 | `A-DOC-11` | Part A ch.6 (p.162) | `tests/parta-consolidated.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-DOC-12` | Part A §5.2 (p.56); §5.9 (p.141); p.126 | `tests/parta-consolidated.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-DOC-13` | DCL p.128; Part A Box 6.1-6; Table 5.9-6 | `tests/parta-consolidated.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-DOC-14` | DCL p.124 | `tests/parta-consolidated.test.js` | 156 | executed |
| PCAF Part A §5.2 | `A-DOC-15` | Part A ch.6 (p.160) | `tests/parta-consolidated.test.js` | 36 | executed |
| PCAF Part A §5.2 | `A-S2-01` | SLFRS S2 §5–7, §9–23, §24–26, §27–37 | `tests/parta-s2-disclosure.test.js` | 151 | executed |
| PCAF Part A §5.2 | `A-S2-02` | SLFRS S2 §5–37; report-integrity | `tests/parta-s2-disclosure.test.js` | 157 | executed |
| PCAF Part A §5.2 | `A-S2-03` | report-integrity — measured, declared, absent | `tests/parta-s2-disclosure.test.js` | 202 | executed |
| PCAF Part A §5.2 | `A-S2-04` | SLFRS S2 §29(a)(i)–(iv), (vi); B58–B63 | `tests/parta-s2-disclosure.test.js` | 94 | executed |
| PCAF Part A §5.2 | `A-S2-05` | SLFRS S2 §29(b)–(d) | `tests/parta-s2-disclosure.test.js` | 142 | executed |
| PCAF Part A §5.2 | `A-S2-06` | SLFRS S2 §32; IFRS S2 industry-based guidance for commercial banks | `tests/parta-s2-disclosure.test.js` | 82 | executed |
| PCAF Part A §5.2 | `A-S2-07` | SLFRS S2 — the disclosure read as an S2 file | `tests/parta-s2-disclosure.test.js` | 94 | executed |
| PCAF Part A §5.2 | `A-S2-08` | report-integrity; PCAF conformance language | `tests/parta-s2-disclosure.test.js` | 40 | executed |
| PCAF Part A §5.2 | `A-S2-09` | SLFRS S2 §5–37; Part A ch.6 (p.160) | `tests/parta-s2-disclosure.test.js` | 97 | executed |
| PCAF Part A §5.2 | `A-S2-10` | SLFRS S2 §5–37 — one registry, one source | `tests/parta-climate-facts.test.js` | 154 | executed |
| PCAF Part A §5.2 | `A-S2-11` | SLFRS S2 §29(b)–(d) — the classification is the bank’s judgement | `tests/parta-climate-exposure.test.js` | 91 | executed |
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
| GCF pipeline | `G-DATA-01` | ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data for sustainable reporting" | `tests/gcf-pipeline.test.js` | 65 | executed |
| GCF pipeline | `G-DATA-02` | ToR Lot 1, Milestone 4 — data systems for carbon accounting | `tests/gcf-pipeline.test.js` | 65 | executed |
| GCF pipeline | `G-DATA-03` | ToR Lot 1, Milestone 4 — data "should be stored and can be transferred and assessed" | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-DATA-04` | ToR Lot 1, Milestone 4 — durable capture | `tests/gcf-pipeline.test.js` | 44 | executed |
| GCF pipeline | `G-CARBON-01` | ToR Lot 1, Milestone 4 — emissions | `tests/gcf-emissions.test.js` | 108 | executed |
| GCF pipeline | `G-CARBON-02` | PCAF Part A p.126, applied to project appraisal | `tests/gcf-reporting.test.js` | 72 | executed |
| GCF pipeline | `G-CARBON-03` | GCF Mitigation Core Indicator 1 (IRMF, decision B.29/01) | `tests/gcf-pipeline.test.js` | 65 | executed |
| GCF pipeline | `G-CARBON-04` | Engine discipline — no LLM computes a regulatory figure | `tests/gcf-emissions.test.js` | 108 | executed |
| GCF pipeline | `G-NDC-01` | Sri Lanka NDC 3.0 (September 2025), ToR section 1.2 | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-02` | Sri Lanka NDC 3.0 — cumulative over 2026-2035 | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-03` | Sri Lanka NDC 3.0 — targets are percentages against a BAU scenario | `tests/gcf-emissions.test.js` | 71 | executed |
| GCF pipeline | `G-NDC-04` | Sri Lanka NDC 3.0 — no net-zero year is stated | `tests/ndc3-currency.test.js` | 14 | executed |
| GCF pipeline | `G-ACCR-01` | ToR section 1.1 — Board decision B.36/10, E&S category B/I-2 | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-ACCR-02` | ToR section 1.1 — medium size (USD 50-250m) | `tests/gcf-screening.test.js` | 151 | executed |
| GCF pipeline | `G-ACCR-03` | ToR section 1.1 — modalities: basic, project management, on-lending and blending. The grant box is not ticked. | `tests/gcf-screening.test.js` | 237 | executed |
| GCF pipeline | `G-ACCR-04` | ToR section 1.1 — three open accreditation conditions | `tests/gcf-cn-package.test.js` | 139 | executed |
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
| GCF pipeline | `G-CN-01` | GCF Concept Note / Funding Proposal structure, sections A-H | `tests/gcf-cn-package.test.js` | 139 | executed |
| GCF pipeline | `G-CN-02` | GCF policies — NDA no-objection, gender assessment, ESIA/ESMP, FPIC | `tests/gcf-cn-package.test.js` | 139 | executed |
| GCF pipeline | `G-CN-03` | Scope limit stated in the gap analysis | `tests/gcf-cn-package.test.js` | 167 | executed |
| GCF pipeline | `G-CN-04` | Document delivery | `tests/gcf-cn-package.test.js` | 167 | executed |
| GCF pipeline | `G-CYCLE-01` | GCF project activity cycle — ten stages from programming to closure | `tests/gcf-cycle.test.js` | 46 | executed |
| GCF pipeline | `G-CYCLE-02` | ToR Lot 1, Milestone 4 — systems and procedures to capture data; a pipeline has a time axis | `tests/gcf-cycle.test.js` | 84 | executed |
| GCF pipeline | `G-CYCLE-03` | GCF-2 service standards — six weeks for concept-note feedback, nine months to approval, eleven months to first disbursement | `tests/gcf-cycle.test.js` | 46 | executed |
| GCF pipeline | `G-CYCLE-04` | Concept note template v2.2 and funding proposal template — what each stage must contain; Sri Lanka NDA Operation Manual | `tests/gcf-cycle.test.js` | 85 | executed |
| GCF pipeline | `G-CYCLE-05` | Board decision B.32/05 — Simplified Approval Process; Project Preparation Facility guidelines | `tests/gcf-cycle.test.js` | 85 | executed |
| GCF pipeline | `G-CYCLE-06` | GCF investment framework — six investment criteria and their sub-criteria | `tests/gcf-cycle.test.js` | 52 | executed |
| GCF pipeline | `G-CYCLE-07` | ToR Lot 2 — the pipeline as a whole, read by the bank and the Fund | `tests/gcf-cycle.test.js` | 92 | executed |
| GCF pipeline | `G-CYCLE-08` | ToR Lot 1, Milestone 4 — illustrative data replaced by the entity’s own, never mixed with it | `tests/gcf-cycle.test.js` | 84 | executed |
| GCF pipeline | `G-ACCR-05` | Board decision B.36/10 — DFCC’s accreditation envelope; the entity’s own where recorded | `tests/gcf-cycle.test.js` | 84 | executed |
| GCF pipeline | `G-VAL-01` | ToR Lot 2 — an accredited entity appraises and signs off a candidate before it is carried forward | `tests/gcf-validation.test.js` | 47 | executed |
| GCF pipeline | `G-VAL-02` | GCF investment framework — a judgement, not a computed score | `tests/gcf-validation.test.js` | 47 | executed |
| GCF pipeline | `G-VAL-03` | Separation of duties — the person who prepares a submission does not validate it | `tests/gcf-validation.test.js` | 44 | executed |
| GCF pipeline | `G-RPT-01` | ToR Lot 2 — the appraisal a committee reads and the assessor signs | `tests/gcf-assessment-report.test.js` | 57 | executed |
| GCF pipeline | `G-RET-01` | ToR Lot 2 — the sponsor is told what to address, and the resubmission is compared against what was returned | `tests/gcf-return-loop.test.js` | 37 | executed |
| GCF pipeline | `G-RET-02` | A return is a fact about a validated assessment, not a gesture | `tests/gcf-return-loop.test.js` | 48 | executed |
| GCF pipeline | `G-EXCL-01` | ToR Lot 1, Milestones 1-3 and 5 | — | — | out of scope |
| GCF pipeline | `G-EXCL-02` | GCF Funding Proposal preparation | — | — | out of scope |

## Summary

- 185 rules across the conformance matrices
- **178 proved by execution**
- 3 deliberately out of scope
- 2 proved by the absence of a path
- 2 evidenced by a data table rather than a code path
- **0 unproven**
