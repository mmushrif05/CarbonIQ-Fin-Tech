# The GCF pipeline — the reference guide

**What this is.** The document the GCF pipeline module is built from, in the shape
`docs/PCAF-PART-A-RESEARCH.md` gave Part A: what the Green Climate Fund actually asks of an
accredited entity's pipeline, with the source beside each claim; what the module holds today;
the gaps; and the order to close them. A finding lands here *before* the code that acts on it,
and §12 logs every change. A finding that lives only in a commit message is one the next person
re-derives.

**How it is kept.** Where GCF publishes a figure, a stage name or a criterion, its wording wins
and the citation is given. Where GCF is silent — how a bank should *display* a pipeline, what
"ready" means for a board that meets three times a year — the judgement is CarbonIQ's and is
labelled as such. Nothing on a screen or in a document claims GCF approval, endorsement or
certification; `src/shared/report-integrity.js` refuses the words.

---

## 1. What GCF is, and what "the pipeline" means for DFCC

The **Green Climate Fund** is the operating entity of the UNFCCC's financial mechanism, funding
mitigation and adaptation in developing countries through **Accredited Entities (AEs)**. A
**Direct Access Entity (DAE)** is a national or regional AE; DFCC Bank PLC is Sri Lanka's first
and, at the time of writing, only one. The country's **National Designated Authority (NDA)** is
the Ministry of Environment, acting through its Climate Change Secretariat; it issues the
**no-objection letter** every funding proposal must carry, reviewed by the National Expert
Committees on Climate Change Adaptation and Mitigation (NECCCA / NECCCM) under the NDA's
Operation Manual on the GCF for Sri Lanka.
([GCF — DFCC Bank PLC](https://www.greenclimate.fund/partners/accredited-entities/dfccbank) ·
[Sri Lanka NDA Operation Manual](https://env.gov.lk/web/images/pdf/divisions/climate_change_division/publications/new/Operation_Manual_on_Green_Climate_Fund_GCF_for_Sri_Lanka_ENGLISH.pdf))

**DFCC's accreditation envelope** — Board decision **B.36/10**, accredited 12 July 2023;
Accreditation Master Agreement executed 2 August 2024, effective 27 September 2024. Size
category **medium** (projects up to USD 250 million; GCF's size categories are nested ceilings —
micro ≤ 10m, small ≤ 50m, medium ≤ 250m — so a medium entity may carry all three).
Environmental and social risk category **B / I-2**. Fiduciary standards: **basic, project
management, on-lending and blending** (loans, equity, guarantees). The **grant award modality is
not held** — the ToR says so and the pipeline record carries it as a fact to verify with DFCC or
the NDA, because misreading an accreditation scope is a serious error.
([B.36/10](https://www.greenclimate.fund/decision/b36-10) ·
[DFCC — What is GCF](https://www.dfcc.lk/what-is-gcf/))

**What "pipeline" means to GCF.** An AE's pipeline is its **entity work programme**: the
candidate projects it intends to bring to the Fund, each aligned to the **Country Programme**
(for Sri Lanka: the NAP and the NDC) and moved through the Fund's **project activity cycle**
from idea to closure. GCF expects a DAE to develop that pipeline *with* the NDA, to match the
**investment criteria**, and to report results through the **IRMF**. A pipeline is therefore
not a list of projects; it is a set of projects **each at a known stage of a known cycle, each
with a known gap to the next stage, each with a date**.
([GCF in Brief: Direct access](https://www.greenclimate.fund/document/gcf-brief-direct-access) ·
[Accredited Entities](https://www.greenclimate.fund/partners/accredited-entities))

**Why it matters now (GCF-2, 2024–2027).** The Strategic Plan adopted at B.36 commits the Fund
to **double the number of Direct Access Entities with approved funding**, and the *Efficient
GCF* initiative commits the Secretariat to **concept-note screening feedback within six weeks**
(from December 2024) and **nine months from concept note to Board approval**, against an
average of over two years before. 2025's three Board meetings approved USD 3.26 billion across
50 proposals. A DAE with a pipeline that can be read at a glance is the DAE that gets into that
queue.
([Strategic Plan 2024–2027](https://www.greenclimate.fund/about/strategic-plan) ·
[Annual progress report 2024](https://www.greenclimate.fund/annual-progress-report-2024) ·
[Revised concept-note submission process](https://www.greenclimate.fund/event/launch-revised-gcf-concept-note-submission-process))

---

## 2. The project activity cycle — the ten stages, and where a project can be

GCF describes its project cycle over ten stages from origination to closure. The names below
are GCF's where GCF names them and CarbonIQ's paraphrase where the public material describes
rather than names. ([Project cycle](https://www.greenclimate.fund/project-cycle) ·
[Programming Manual](https://www.greenclimate.fund/document/programming-manual))

| # | Stage | Who acts | What exists at the end of it |
|---|---|---|---|
| 1 | Country and entity programming | NDA · AE | The project is on the entity work programme, aligned to the Country Programme (NAP, NDC) |
| 2 | Targeted generation of the proposal | AE · NDA | A project idea with a climate rationale, a results area and a stream |
| 3 | Concept note | AE → Secretariat | The CN submitted; Secretariat feedback (target six weeks); NDA informed; PPF may be requested here |
| 4 | Funding proposal development | AE (± PPF) | The FP drafted with its annexes; NDA no-objection requested |
| 5 | Funding proposal review | Secretariat · ORMC | Second-level due diligence complete; conditions and recommendations drafted |
| 6 | Board consideration | iTAP → Board | iTAP assessment; Board decision with conditions |
| 7 | Legal arrangements | GCF · AE | Funded Activity Agreement (FAA) signed and effective |
| 8 | Implementation and monitoring | AE | First disbursement (average under 11 months from approval in 2022); annual performance reports |
| 9 | Adaptive management | AE · Secretariat | Interim evaluation; restructuring where needed |
| 10 | Closure and evaluation | AE · IEU | Completion report, final audit, exit strategy executed, lessons synthesised |

Two shortcuts sit beside the cycle. The **Simplified Approval Process (SAP)** takes proposals
requesting **up to USD 25 million** of GCF funding with **category C / I-3** risk on a shorter
template and review (decision B.32/05). The **Project Preparation Facility (PPF)** funds
preparation of a concept-note-stage project at **up to 10% of the GCF ask, capped at USD 1.5
million**, with micro and small DAE projects as its stated focus.
([SAP](https://www.greenclimate.fund/projects/sap) · [B.32/05](https://www.greenclimate.fund/decision/b32-05) ·
[PPF](https://www.greenclimate.fund/projects/ppf))

**The module's stage vocabulary.** The record's `stage` enum was `concept · pre_feasibility ·
cn_drafted · cn_submitted · ppf · fp · board` — seven values that stop at the Board and know
nothing after it. §11 extends it through approval, legal effectiveness, implementation and
closure, maps every value onto the ten stages above, and gives each stage a **gate** — what
must be on the record before the project can honestly be said to be there — and a **next
step** naming who acts and which document. CarbonIQ's judgement: the gate is advisory in the
software (a project may be moved with the gap open and the gap travels with it), because the
bank, not the tool, decides what it submits.

---

## 3. The six investment criteria

The Investment Framework (decision B.09/05 and successors) assesses every proposal on six
criteria, each with activity-specific sub-criteria and indicative assessment factors. The
Fund and the iTAP score them; an AE evidences them. ([Investment framework](https://www.greenclimate.fund/access-funding/project-approval-process/investment-framework) ·
[B.09/05](https://www.greenclimate.fund/decision/b09-05))

| Criterion | What GCF looks for (sub-criteria, as published) |
|---|---|
| Impact potential | Mitigation: tCO2e reduced, avoided or removed (Core Indicator 1). Adaptation: people made more resilient — direct and indirect beneficiaries (Core Indicator 2), assets and hectares (Core Indicators 3 and 4) |
| Paradigm-shift potential | Potential for scaling up and replication; potential for knowledge and learning; contribution to an enabling environment; contribution to regulatory frameworks and policies; overall contribution to climate-resilient development pathways. The IRMF assesses it on three dimensions — **scale, replicability, sustainability** — by scorecard |
| Sustainable development potential | Environmental, social, economic co-benefits; gender-sensitive development impact |
| Needs of the recipient | Vulnerability of the country and of the target population; economic and social development level; absence of alternative funding; institutional and implementation capacity |
| Country ownership | Alignment with NDC, NAP and national strategies; the NDA's engagement and no-objection; stakeholder engagement; the AE's capacity to deliver |
| Efficiency and effectiveness | Cost-effectiveness; co-financing and the amount of GCF funding requested; financial viability; best practices; **minimum concessionality** |

**What the module does, and does not, claim.** `screening.js` scores three of the six —
impact potential, country ownership (on NDC-target alignment only) and efficiency and
effectiveness — from data it holds, and names the other three **unscored with reasons**. That
stays: a self-assessment is not an iTAP assessment. What §11 adds is the *evidence* view —
for each sub-criterion, whether the record holds what a reviewer would ask for, so a bank can
see which criterion its concept note is silent on before the Secretariat does.

---

## 4. Results, indicators and the evidence tiers

**Eight results areas**, four per stream — mitigation: energy generation and access;
low-emission transport; buildings, cities, industries and appliances; forests and land use.
Adaptation: health, food and water security; livelihoods of people and communities;
infrastructure and built environment; ecosystems and ecosystem services. The Fund aims at a
50:50 balance between the streams over time. ([Areas of work](https://www.greenclimate.fund/portfolio/areas-of-work))

**The Integrated Results Management Framework** (decision B.29/01, applied from B.32) has four
core indicators — **1** tonnes of CO2e reduced, avoided or removed; **2** direct and indirect
beneficiaries; **3** value of physical assets made more resilient; **4** hectares of natural
resource areas under improved management — plus supplementary indicators and a paradigm-shift
assessment. Direct and indirect beneficiaries are never summed. ([B.29/01](https://www.greenclimate.fund/decision/b29-01))

**Evidence tiers.** Every figure the module holds is `{ value, tier }` with tier one of
*measured · modelled · benchmark · declared*. These are appraisal classes, deliberately words and
deliberately **not** PCAF's 1–5 data-quality scale; reusing those numerals here would invite a
benchmark grid factor to be quoted as a PCAF score. `docs/GLOSSARY.md` §1 carries the rule.

---

## 5. Money — instruments, concessionality, co-financing

GCF's instruments are grants, contingent grants, concessional loans, equity, guarantees and
results-based payments; across the portfolio roughly 42% is grant, 41% concessional loans, 12%
equity, 3% guarantees, 4% results-based. The Fund applies a **minimum concessionality**
principle — no more concession than the project needs — and sets **no minimum co-financing
ratio**; the Private Sector Facility reports about three dollars mobilised per dollar of GCF
money. ([Financial products](https://www.greenclimate.fund/funding/products) ·
[Private sector financing](https://www.greenclimate.fund/document/gcf-brief-private-sector-financing))

The module's seven structures (`data/gcf/instruments.json`) are matched to recorded barriers,
and every fit is reported with **what it leaves standing**. The one structure that reaches a
project with no revenue stream — results-based finance — needs the grant modality DFCC does
not hold, which the engine reports as a **mandate question**, not a low score. §11 adds what
the record could not say: **who** the co-financiers are and whether each is indicative,
committed or evidenced by letter — the fact the FP's Annex on co-financing commitment asks for.

---

## 6. Safeguards, gender, Indigenous Peoples

**Environmental and social risk** is categorised **A** (significant, diverse or irreversible
impacts), **B** (limited, site-specific, reversible, readily mitigated), **C** (minimal or
none), with **I-1 / I-2 / I-3** for intermediated portfolios carrying A / B / C exposure. A
category A project is outside DFCC's accreditation and the module **excludes** it at the gate
rather than down-ranking it. Every proposal carries an initial **gender and social assessment**
and, at preparation, a **gender action plan** with sex-disaggregated targets, timelines,
responsibilities and budget. The **Indigenous Peoples Policy** applies to every proposal, with
**free, prior and informed consent** where Indigenous Peoples are affected; the module treats
FPIC as a process with communities evidenced by the record, never a document drafted for them.
([Revised Environmental and Social Policy](https://www.greenclimate.fund/document/revised-environmental-and-social-policy) ·
[Gender](https://www.greenclimate.fund/access-funding/sustainability-and-inclusion/gender) ·
[Indigenous Peoples](https://www.greenclimate.fund/projects/sustainability-inclusion/ip))

---

## 7. The two documents — concept note and funding proposal

**Concept note** (template v2.2): **A** project information; **B** project details — B.1
context and baseline, B.2 project description and theory of change with the climate rationale,
B.3 expected results against the investment criteria; **C** indicative financing by component
and source; annexes. Optional in principle, standard in practice: it is the step that earns the
six-week feedback. ([Concept note template](https://www.gwp.org/globalassets/global/gwp-saf-files/gcf-asia/day2/6.-document-9-worksheet-for-group-discussion-on-gcf-concept-note-preparation.pdf))

**Funding proposal**: **A** summary · **B** project information · **C** financing · **D**
expected performance against the investment criteria · **E** logical framework (IRMF) · **F**
risk assessment and management · **G** GCF policies and standards · **H** annexes — fifty pages
excluding annexes. The annexes a reviewer expects include the no-objection letter, feasibility
study, economic and financial analysis and financial model, ESIA/ESMP or ESAP by category,
gender assessment and action plan, stakeholder consultation summary, procurement plan,
monitoring and evaluation plan, co-financing commitment letters, and the term sheet.
([Funding proposal template](https://www.greenclimate.fund/document/funding-proposal-template))

The module's Concept Note package (`cn-package.js`) already lays every held input out in the
FP's A–H order and marks each **held · partial · external**. What §11 adds is that an external
item can be **recorded as obtained** — reference, date, holder — so the worklist shrinks as the
bank works, and the readiness figure can move.

---

## 8. What a pipeline dashboard has to show — CarbonIQ's design rule

GCF publishes no dashboard standard for an AE; the following is CarbonIQ's judgement, read off
what the Secretariat's screening, the iTAP's assessment and a bank's own credit committee each
ask first.

1. **Where each project sits in the cycle, and how long it has sat there.** A stage rail across
   the ten stages, count and GCF ask per stage, days in stage.
2. **What the next step is, who takes it, and what is missing for it.** One list per project,
   derived from the record, ordered as the cycle orders it.
3. **The money on one line.** Total cost, GCF ask, co-financing by counterparty and status,
   instrument, mobilisation, the accreditation ceiling each project sits under, SAP and PPF
   eligibility.
4. **The results on their own boundaries.** Core Indicators 1–4 per project and per portfolio,
   mitigation and adaptation apart, embodied carbon as a payback and never a deduction, financed
   emissions named as living in the capital book.
5. **The evidence behind every number** — the tier, and the weakest tier per project.
6. **The gate and the criteria** — eligible, flagged or excluded with the reason; the six
   criteria as evidenced, partial or absent.
7. **The dates** — target submission, expected Board window (a projection, drawn as one), NDA
   no-objection, FAA, first disbursement, commissioning.
8. **Sample or recorded, said on every surface** — the illustrative pipeline replaced entirely,
   never merged, the moment a bank records anything of its own.

---

## 9. What the module holds today (audit, September 2026)

**Engines** — sound, and every invariant below is a test. Record schema with `{value, tier}`
figures and a refusal of bare numbers; the accreditation gate (category A excluded, size
ceilings nested, grant dependence flagged not struck); two rankings never merged, a missing
component dropped and renormalised, never zero; three carbon boundaries with nowhere to net;
two NDC ledgers with no key holding their sum and only 2026–2035 counted; seven instruments
with what each leaves standing and minimum concessionality able to answer "does not need GCF";
the SLFRS S2 / GRI report refusing to put pipeline mitigation on an inventory line; the A–H
package with three states; export and import with a canonical checksum; 32 conformance rules
proved by execution.

**What the record cannot hold** — no dates of any kind (no stage history, no targets, no
commissioning date, so the NDC clip assumes operation from 2026); no NDA / no-objection state;
FPIC as a magic string in a free list; gender as one benchmark percentage; co-financing as bare
amounts; `instrument` and `barriers` as free text; `technical` unvalidated and its `lifetimeYears`
the one arithmetic input without a tier; no documents; no per-figure history; accreditation read
from the sample's metadata rather than a record of the entity's own.

**The screen** — seven sub-tabs with the method argued before the position; the stage rendered
as `cn_drafted`, the area as `EP`; no next step, no dates, no per-project view (three per-id
routes never called); portfolio totals stopping at count, cost and ask; an intake form that
cannot record barriers, embodied carbon, technical parameters or safeguards flags and hard-codes
the instrument, the taxonomy band and viability; no edit and no delete; and the illustrative
pill never clearing after the sample is adopted, so the first thing a new user does makes the
screen wrong.

---

## 10. The gaps, in order

| # | Gap | Closed by |
|---|---|---|
| 1 | No time axis | `timeline` and `stageHistory` on the record; days-in-stage, next milestone, projected Board window as a projection |
| 2 | Process state only as prose | `nda`, `safeguards`, `coFinancing[]`, `documents[]` on the record; the A–H package reads them |
| 3 | Stage stops at the Board | The stage vocabulary extended to closure and mapped onto the ten stages |
| 4 | No "next step" | `readiness.js`: per-stage requirements answered from the record, the next step named |
| 5 | No pipeline view | `portfolio.js`: by stage, by area, by stream, money, results, evidence, envelope, SAP/PPF, actions |
| 6 | Accreditation from sample metadata | The entity's own accreditation on `gcf_entity`, the sample as fallback |
| 7 | Sample pill lies after adopt | The pill follows `pipeline.sample` on every render |
| 8 | No edit, no delete, thin intake | A grouped form over the whole schema; edit pre-fills; delete with confirmation |
| 9 | Free-text instrument and barriers | The screen offers the catalogue and the barrier vocabulary; the schema still accepts free text, because two shipped records name instruments the catalogue does not hold and refusing them would refuse the sample |
| 10 | `technical` untyped | Left as an open object. The figures the cycle reads live on typed blocks (`mitigation`, `beneficiaries`, `area`, `assets`); `technical` carries per-project engineering notes and no engine reads it |

---

## 11. The build (this step)

**Domain.** `domain/cycle.js` — the ten stages, the mapping from the record's `stage` values,
the next step per stage, the GCF-2 service standards as projections. `domain/readiness.js` — what each stage needs, answered held / partial /
missing from the record, with the field and the remedy; SAP and PPF eligibility. `domain/criteria.js`
— the six criteria as evidence coverage. `domain/portfolio.js` — the dashboard roll-up, reading
`emissions.portfolioEmissions` and `screening.screen` rather than restating them. `domain/record.js`
— the optional process sub-schemas; the extended stage list.

**Routes.** `GET /v1/gcf/portfolio`; `GET /v1/gcf/pipeline/:id/readiness`; `PATCH /v1/gcf/pipeline/:id`
(a deep merge, revalidated); `POST /v1/gcf/pipeline/:id/stage` (a move, dated, into the history).
Accreditation readable and settable on the entity.

**Screen.** The Pipeline tab becomes the dashboard: portfolio tiles, the stage rail, the board,
and a project page with the cycle, the next step, the checklist, the money, the results, the
criteria and the documents. The other six sub-tabs stay and lose their preambles. The intake
becomes a grouped form over the record with the catalogue's instruments and barriers; edit and delete
live on the project page (a merge through PATCH, a dated move through the stage route). Styles move to
`ui/css/gcf.css`; the Pipeline tab is its own module, `ui/js/gcf-pipeline.js`.

**Proof.** Conformance rules for each new fact, proved by execution; the journey test extended
through a stage move and a recorded no-objection; a browser journey that records a real project,
watches the sample pill clear, moves it a stage, and downloads the pack.

---

## 12. Log

| Date | Section | Change | Source |
|---|---|---|---|
| 2026-09-14 | all | First study: what GCF asks of a DAE's pipeline, the ten-stage cycle, the six criteria and their sub-criteria, IRMF core indicators 1–4, SAP and PPF thresholds, ESS categories, the CN and FP templates, DFCC's accreditation envelope and dates, the Sri Lanka NDA route; the audit of the module and the screen; the gaps and the build | GCF project cycle page; Investment framework; B.29/01 IRMF; B.32/05 SAP; PPF guidelines; B.36/10; DFCC AE profile; Sri Lanka NDA Operation Manual; GCF Strategic Plan 2024–2027; Annual progress report 2024 |
| 2026-09-14 | §1 | **DFCC's dates recorded**: accredited 12 July 2023; AMA executed 2 August 2024, effective 27 September 2024. The module had carried the decision number alone | GCF AE profile for DFCC Bank PLC |
| 2026-09-14 | §2 | **The cycle has ten stages and the record knew seven values ending at the Board.** Extended through approval, FAA, implementation and closure so a pipeline can carry a project past the day it is approved | GCF project cycle page |
| 2026-09-14 | §2 | **GCF-2's timing commitments are facts a dashboard can draw**: six weeks for CN feedback, nine months CN to approval, about eleven months approval to first disbursement. Drawn as projections, hatched, never as dates the Fund has given | Annual progress report 2024; revised CN submission process (Dec 2024) |
| 2026-09-14 | §9–§11 | **Built.** `domain/cycle.js`, `readiness.js`, `criteria.js`, `portfolio.js`; the record carries timeline, history, NDA, safeguards, co-financing, documents, narrative; accreditation on the entity; `GET /portfolio`, `GET /pipeline/:id/readiness`, `PATCH /pipeline/:id`, `POST /pipeline/:id/stage`; the Pipeline tab as the dashboard with a project page; nine conformance rules (G-CYCLE-01…08, G-ACCR-05) proved by execution | this repository |
| 2026-09-14 | §10 | **Rows 9 and 10 corrected against what shipped**: instruments and barriers are offered from the catalogue on screen but not enforced in the schema, because two shipped records name structures the catalogue does not hold; `technical` stays untyped because no engine reads it | `src/domains/gcf/domain/record.js` |
| 2026-09-14 | §4 | **The gate tiles partition the pool.** The screening engine's `eligible` list includes the flagged projects; three tiles that read 5 + 1 + 0 over five candidates are a count that is wrong, so the portfolio counts one verdict per project from the screening row | `src/domains/gcf/domain/portfolio.js` |
| 2026-09-15 | §9 | **Phase 0 — recording real projects.** `scripts/gcf-record-projects.js` (`npm run gcf:record`) loads a curated book into the connected store through the same validation and seam the route uses: validated whole before any write, idempotent per id, attributed, refused on a non-writable store and on the preview organisation. `data/gcf/real-projects.template.json` is the annotated, fillable book; `docs/GCF-RECORDING.md` is the runbook. Proved on both stores by `tests/gcf-record-script.test.js` | this repository |
| 2026-09-15 | §9 | **Phase 1 Stage 1 — guided intake and the sponsor pre-check.** The record gained an optional results logframe (per IRMF indicator: baseline, target, target year) and an optional preCheck (the sponsor's self-screen answers), both backward compatible. `domain/precheck.js` reads the answers into an advisory — held / attention / stop with a way forward — grounded in DFCC's accreditation (category A is a stop under B.36/10, with the separable-component route named; grant-dependent adaptation is a mandate question, not a stop). `POST /v1/gcf/precheck` serves it, `read` scope, stores nothing. The intake form is now plain-language: help on every field, a pre-check panel that gives an instant read a preview visitor can run, and baseline→target→year inputs for the three core indicators. `tests/gcf-precheck.test.js` proves the advisory, the route, and the record round-trip | this repository |
