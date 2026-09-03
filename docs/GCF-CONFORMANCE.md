# GCF pipeline — conformance matrix

<!-- GENERATED FILE. Do not edit by hand.
     Source: services/gcf/conformance.js
     Regenerate: npm run docs:gcf-conformance -->

**Source of requirements:** DFCC Bank PLC DAE Readiness Pre-Qualified Delivery Partner Terms of Reference, version 21 November 2025

**Status:** 29 implemented · 1 partial · 2 deliberately excluded
(32 rules).

> Nothing here is endorsed by the Green Climate Fund, and this system does not score a
> proposal on GCF's behalf. This is a self-declaration of what has been built against a
> published Terms of Reference, offered with the evidence needed to check it.

Every row names the file that enforces the rule and the test that proves it.
`tests/gcf-conformance.test.js` fails the build if either citation stops
resolving — including a test renamed inside a file that still exists, which is
exactly how a matrix goes quietly wrong.


## Lot 1 Milestone 4 — data capture

### G-DATA-01 — Every figure entered is stored with its evidence tier, so a benchmark default cannot become a measured fact downstream.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 1, Milestone 4 — "lack of proper systems and procedures to capture data for sustainable reporting" |
| **Implementation** | `services/gcf/record.js — the traced() schema refuses a figure with no tier` |
| **Proving test** | `tests/gcf-pipeline.test.js › Every figure carries its provenance › a figure with no evidence tier is refused` |

### G-DATA-02 — Evidence tiers are GCF appraisal classes and are never PCAF data-quality scores.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 1, Milestone 4 — data systems for carbon accounting |
| **Implementation** | `services/gcf/record.js — TIERS from data/gcf/irmf.json, four named classes` |
| **Proving test** | `tests/gcf-pipeline.test.js › Every figure carries its provenance › the tiers are deliberately not PCAF’s 1-5 scale` |

### G-DATA-03 — A period exports whole with a checksum over its canonical form, and an import is verified before anything is written and refused whole on failure.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 1, Milestone 4 — data "should be stored and can be transferred and assessed" |
| **Implementation** | `services/gcf/reporting.js — exportPeriod / importPeriod / canonical` |
| **Proving test** | `tests/gcf-reporting.test.js › A period package survives a transfer, or is refused › a truncated package is refused whole, not imported in part` |

### G-DATA-04 — A deployment that cannot persist refuses a write with 503 rather than accepting data it will lose.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 1, Milestone 4 — durable capture |
| **Implementation** | `services/gcf/store.js — assertWritable() before every put and remove` |
| **Proving test** | `tests/gcf-pipeline.test.js › The register over HTTP › every response says what the deployment can persist` |


## Carbon accounting boundaries

### G-CARBON-01 — Project mitigation, embodied carbon and financed emissions are three boundaries and no function returns a figure combining two.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 1, Milestone 4 — emissions |
| **Implementation** | `services/gcf/emissions.js — separate keys throughout; financedEmissions names the capital book` |
| **Proving test** | `tests/gcf-emissions.test.js › Three boundaries, and nothing can merge them › no number anywhere in the roll-up equals mitigation minus embodied` |

### G-CARBON-02 — Avoided and reduced emissions are stated apart from any inventory and never netted against it.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | PCAF Part A p.126, applied to project appraisal |
| **Implementation** | `services/gcf/reporting.js — avoidedAndReduced sits outside the inventory block` |
| **Proving test** | `tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › avoided emissions are stated apart and never netted` |

### G-CARBON-03 — A tCO2e figure without a baseline is refused; reduced, avoided and removal are distinguished by the counterfactual.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GCF Mitigation Core Indicator 1 (IRMF, decision B.29/01) |
| **Implementation** | `services/gcf/record.js — baselineSchema required on every mitigation block` |
| **Proving test** | `tests/gcf-pipeline.test.js › A tCO2e figure without a baseline means nothing › a mitigation block with no baseline is refused` |

### G-CARBON-04 — Where an independent path exists the recorded figure is recomputed and any divergence reported; where none exists the check reports unverifiable rather than passing.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Engine discipline — no LLM computes a regulatory figure |
| **Implementation** | `services/gcf/emissions.js — checkMitigation()` |
| **Proving test** | `tests/gcf-emissions.test.js › A figure that cannot be checked says so › a figure with no independent path is unverifiable, not passing` |


## Sri Lanka NDC 3.0

### G-NDC-01 — The reduction and removal commitments are carried in two ledgers and no key anywhere holds their sum.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Sri Lanka NDC 3.0 (September 2025), ToR section 1.2 |
| **Implementation** | `services/gcf/ndc-contribution.js — separate reduction and removal blocks, split again on the co-benefit line` |
| **Proving test** | `tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › nothing in the output holds their sum` |

### G-NDC-02 — Only the years falling inside the NDC period count against it, and the operating-start assumption is stated.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Sri Lanka NDC 3.0 — cumulative over 2026-2035 |
| **Implementation** | `services/gcf/ndc-contribution.js — withinPeriod()` |
| **Proving test** | `tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › only the years inside 2026-2035 count against a 2026-2035 commitment` |

### G-NDC-03 — A project's share of the national target is reported absent unless the BAU tonnage is supplied, and is then carried at the tier of that declared input.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Sri Lanka NDC 3.0 — targets are percentages against a BAU scenario |
| **Implementation** | `services/gcf/ndc-contribution.js — shareOfCommitment()` |
| **Proving test** | `tests/gcf-emissions.test.js › NDC 3.0 — two commitments, never one › the share of the national target is absent, with what it needs` |

### G-NDC-04 — No net-zero commitment is asserted, and the superseded 2021 targets appear only where marked superseded.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Sri Lanka NDC 3.0 — no net-zero year is stated |
| **Implementation** | `data/gcf/ndc3.json — _meta.supersedes; config/constants.js reads this file` |
| **Proving test** | `tests/ndc3-currency.test.js › Reduction and removal are never summed › the combined figure is not a number Sri Lanka has committed to` |


## Accreditation

### G-ACCR-01 — A project outside the accredited E&S category is excluded, not down-ranked.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR section 1.1 — Board decision B.36/10, E&S category B/I-2 |
| **Implementation** | `services/gcf/screening.js — screenOne() ess_category exclusion` |
| **Proving test** | `tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a category A project is excluded, with the reason` |

### G-ACCR-02 — The accredited size is a ceiling, not a band. A smaller project is not flagged, because GCF size categories nest.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR section 1.1 — medium size (USD 50-250m) |
| **Implementation** | `services/gcf/screening.js — screenOne() applies the ceiling only` |
| **Proving test** | `tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a project below the band is NOT flagged — size categories are ceilings` |

### G-ACCR-03 — A grant-dependent design is flagged with what to verify, not struck out on this system's reading of a checkbox.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR section 1.1 — modalities: basic, project management, on-lending and blending. The grant box is not ticked. |
| **Implementation** | `services/gcf/screening.js — modality_gap flag; services/gcf/instruments.js — deliverableByDfcc` |
| **Proving test** | `tests/gcf-screening.test.js › The accreditation gate excludes, it does not down-rank › a grant-dependent design is flagged to verify, not struck out` |

### G-ACCR-04 — The grievance redress mechanism and procurement disclosure conditions appear as outstanding external inputs on every Concept Note package.

| | |
|---|---|
| **Status** | partial |
| **Requirement** | ToR section 1.1 — three open accreditation conditions |
| **Implementation** | `services/gcf/cn-package.js — Section G and Section H external inputs` |
| **Proving test** | `tests/gcf-cn-package.test.js › DFCC's own accreditation conditions travel with the package › the two open accreditation conditions appear as external inputs` |
| **Limitation** | Two of the three conditions are surfaced. The ESMS audit condition is a DFCC institutional obligation with no per-project input, so it is not carried on a project package. |


## Lot 2 — screening, instruments, the answer

### G-LOT2-01 — Mitigation and adaptation are ranked in two lists that are never merged, and adaptation is never ranked on carbon.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 2 — screening candidates and recommending Concept Notes |
| **Implementation** | `services/gcf/screening.js — rankStream(), metricsFor() picks the impact metric by stream` |
| **Proving test** | `tests/gcf-screening.test.js › Two ranked lists, and adaptation never touches carbon › the adaptation impact metric is people, not tonnes` |

### G-LOT2-02 — Three criteria cannot be computed from a project record and are named unscored with reasons rather than filled in.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GCF investment framework — six investment criteria |
| **Implementation** | `services/gcf/screening.js — GCF_CRITERIA, criteria.notScored` |
| **Proving test** | `tests/gcf-screening.test.js › The ranking says what it could not weigh › three of the six GCF criteria are named unscored, each with a reason` |

### G-LOT2-03 — The recommendation names which projects, on what basis, what would move the runners-up, and where it disagrees with the recorded selection.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 2 — at least two high-potential concepts, up to two Concept Notes |
| **Implementation** | `services/gcf/screening.js — recommend(), divergence` |
| **Proving test** | `tests/gcf-screening.test.js › The answer: which two, and why › where the recorded selection and the ranking disagree, it says so` |

### G-LOT2-04 — Seven structures are evaluated, each matched to barriers the project has recorded, with what the structure leaves standing named beside what it covers.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 2 — five to seven innovative instruments evaluated |
| **Implementation** | `services/gcf/instruments.js — fitOne(), structureFor(); data/gcf/instruments.json` |
| **Proving test** | `tests/gcf-screening.test.js › An instrument answers a barrier, or it answers nothing › coverage is reported with what it leaves standing` |

### G-LOT2-05 — The engine can return "does not need GCF support", and an unassessed project cannot be put forward.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | ToR Lot 2 — viability with and without concessional support; GCF minimum concessionality |
| **Implementation** | `services/gcf/instruments.js — concessionality()` |
| **Proving test** | `tests/gcf-screening.test.js › Minimum concessionality — the appraisal can say no › a project viable without GCF is told not to take concessional money` |

### G-LOT2-06 — Co-financing is reported as a fact and used as a ranking input, never as a gate or a threshold met.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GCF investment policy — no minimum co-financing requirement |
| **Implementation** | `services/gcf/reporting.js — capitalDeployment.note; services/gcf/screening.js — efficiency metric` |
| **Proving test** | `tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › the pipeline is disclosed where it belongs, on three §29 lines` |


## Statutory reporting

### G-REPORT-01 — A pipeline of financed projects is not the entity's inventory. Inventory lines are reported absent with the clause and where the figure comes from.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | SLFRS S2 §29(a); GRI 305-1/2/3 |
| **Implementation** | `services/gcf/reporting.js — metricsAndTargets.inventory, griMapping()` |
| **Proving test** | `tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › scope 1, 2 and 3 are reported absent, not filled from the pipeline` |

### G-REPORT-02 — Financed project mitigation is not the organisation's own reduction and is reported as supplementary information.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GRI 305-5 |
| **Implementation** | `services/gcf/reporting.js — griMapping() 305-5 and supplementary` |
| **Proving test** | `tests/gcf-reporting.test.js › The pipeline is not the entity inventory, and the report says so › GRI 305-1 through 305-5 are all answered absent, each with its reason` |

### G-REPORT-03 — Entity-level facts are supplied by the entity or reported absent with the clause that requires them. Nothing is invented.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | SLFRS S1 §27; SLFRS S2 §6, §25, §33 |
| **Implementation** | `services/gcf/reporting.js via services/report-integrity.js declared()` |
| **Proving test** | `tests/gcf-reporting.test.js › Entity facts are declared or absent, never invented › nothing resembling a board meeting or an FTE count is manufactured` |

### G-REPORT-04 — The checklist can fail, and the inventory item stays unmet even with every entity fact recorded, because this is one input to an SLFRS S2 disclosure rather than the disclosure.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Report honesty — a checklist answered from the report |
| **Implementation** | `services/gcf/reporting.js — checklist(), basis.covers` |
| **Proving test** | `tests/gcf-reporting.test.js › The checklist is answered from the report, so it can fail › the inventory item stays unmet even with every entity fact recorded` |


## Concept Note package

### G-CN-01 — Every input is laid out in GCF order and marked held, partial or external.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GCF Concept Note / Funding Proposal structure, sections A-H |
| **Implementation** | `services/gcf/cn-package.js — buildPackage()` |
| **Proving test** | `tests/gcf-cn-package.test.js › Eight sections, in the order a Concept Note reads › sections A through H are present and in order` |

### G-CN-02 — Documents and legal instruments no model can produce are named as external, with what is needed and from whom.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | GCF policies — NDA no-objection, gender assessment, ESIA/ESMP, FPIC |
| **Implementation** | `services/gcf/cn-package.js — external() entries in sections D and G` |
| **Proving test** | `tests/gcf-cn-package.test.js › External is the useful state › the legal instruments no model can produce are named as external` |

### G-CN-03 — This system does not write the Concept Note, score a proposal on GCF's behalf, substitute for an ESIA or FPIC consultation, produce the no-objection letter, or confirm co-financing.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Scope limit stated in the gap analysis |
| **Implementation** | `services/gcf/cn-package.js — limits; services/gcf/screening.js — recommend().limits` |
| **Proving test** | `tests/gcf-cn-package.test.js › External is the useful state › it says plainly that it does not write the Concept Note` |

### G-CN-04 — A document is collected in full, checked to be well formed, and declares a version covering every feature it draws.

| | |
|---|---|
| **Status** | implemented |
| **Requirement** | Document delivery |
| **Implementation** | `services/gcf/cn-package.js — buildPackagePDF with pdfVersion 1.4; services/pdf-response.js` |
| **Proving test** | `tests/gcf-cn-package.test.js › Documents › the PDF is well formed and declares a version covering what it draws` |


## Deliberately out of scope

### G-EXCL-01 — Institutional readiness assessment, governance and procurement policy drafting, and staff training design.

| | |
|---|---|
| **Status** | excluded |
| **Requirement** | ToR Lot 1, Milestones 1-3 and 5 |
| **Implementation** | — |
| **Proving test** | — |
| **Limitation** | These are consultancy deliverables carried out by people. This system addresses Milestone 4 (sustainability reporting and carbon accounting data) and Lot 2 (pipeline screening and instrument structuring). |

### G-EXCL-02 — Full Funding Proposal drafting, the appraisal GCF itself performs, and the Secretariat review process.

| | |
|---|---|
| **Status** | excluded |
| **Requirement** | GCF Funding Proposal preparation |
| **Implementation** | — |
| **Proving test** | — |
| **Limitation** | A Funding Proposal is an argument made by an accredited entity and assessed by GCF. This system prepares inputs to a Concept Note and states what it cannot supply. |

