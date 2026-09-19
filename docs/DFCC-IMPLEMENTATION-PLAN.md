# DFCC — phased implementation plan

From the chief executive's briefing to the first Concept Note and the first
sustainability report: what is built, what each phase delivers, who does the
work in it, what only DFCC can supply, and how each phase is proved before the
next one starts. The scope is DFCC's post-accreditation work under Board
decision **B.36/10** — Lot 1 Milestone 4 (sustainability reporting) and Lot 2
(screening the pool down to up to two Concept Notes) — on the GCF pipeline in
`src/domains/gcf/` and the two walkthroughs that present it. The bank's own
financed-emissions work (PCAF Part A, the SLFRS S2 file) runs beside it in the
same organisation and is planned in `docs/SLFRS-S2-PLAN.md`; nothing here is a
financed or an insurance-associated emission, and the three scopes never
merge.

Three rules hold through every phase, because they are what a reviewer at the
Fund would test first:

- **The tool computes, it does not judge.** *Held* means the fact is recorded,
  not that the Secretariat or the iTAP will accept it. Three of the six
  investment criteria are judgements and are named unscored; DFCC's share of
  the national NDC target is absent until the Ministry's BAU tonnage is
  supplied; the entity's own inventory is never inferred from the pipeline.
- **A gap never refuses.** A candidate may move with a gap open and the gap
  travels with it, because the bank and not the tool decides what it submits.
- **Every figure carries its evidence tier** — measured, modelled, benchmark or
  declared — and a benchmark never becomes a measured fact on the way to a
  submission.

## 0. Where it stands

Built, tested on both stores, and merged to `main` (the research behind it is
`docs/GCF-PIPELINE-RESEARCH.md`; the conformance matrix is
`docs/GCF-CONFORMANCE.md`, 54 rules proved by execution in
`docs/CONFORMANCE-EVIDENCE.md`):

| Delivered | What it is | Where |
|---|---|---|
| Phase 0 — a real book | A curated book recorded through the same validation and seam the route uses; the three starter projects loaded with one press on a deployment with no shell | `npm run gcf:record`, `POST /v1/gcf/pipeline/install-starter`, `docs/GCF-RECORDING.md` |
| Phase 1, stages 1–2 — intake | The sponsor pre-check (held · attention · stop, grounded in the accreditation), the guided intake with the IRMF logframe (baseline → target → year) | `POST /v1/gcf/precheck`, the Intake sub-tab |
| Phase 1, stages 3–6 — the assessor | The `assessor` role and the `validate` scope; the validation lifecycle (draft → under review → validated, ratings in words); the signable appraisal; the return-to-sponsor loop with resolved · outstanding · raised | `GET/POST /v1/gcf/pipeline/:id/validation`, `…/assessment-report`, `…/return`, `…/return-letter` |
| Phase 1, stage 7 — proved end to end | The assessor journey on both stores and in Chromium | `tests/gcf-assessment-journey.test.js`, `e2e/gcf-pipeline.spec.js` |
| The cycle and readiness | The ten-stage project activity cycle with dated history and projected dates hatched; what each stage needs, held / partial / missing with the clause, the remedy and the owner | `domain/cycle.js`, `domain/readiness.js`, `POST /v1/gcf/pipeline/:id/stage` |
| The eight sections | Risk register, arrangements and timetable, sustainability and exit, consultations, climate rationale, financial terms, monitoring and evaluation, annual reporting — structured facts on the record, one function answering readiness and the package alike | `domain/sections.js`, the eight cards on the project page |
| The pipeline as a dashboard | The gap register by candidate and by owner (now and next apart), the assessment state on the portfolio, the GCF Overview read in a meeting, the candidate in focus opening into its journey | `GET /v1/gcf/gaps`, the GCF Overview |
| The disclosure | SLFRS S1/S2 and GRI lines as a filed document — inventory absent with its source, avoided-and-reduced stated apart, the two NDC 3.0 ledgers never summed, the register by owner as an annex | `GET /v1/gcf/report?format=pdf|word` |
| The Concept Note package | Every held input in GCF's A–H order, marked held · partial · external; the external list is the worklist between a pipeline entry and a submission | `GET /v1/gcf/cn/:id` |
| The period package | A checksummed export, verified whole on the way back in | `GET /v1/gcf/export`, `POST /v1/gcf/import` |
| The walkthrough | Ten steps, the dashboard first and then one candidate from the door to the Fund, each opening the real screen with the control to press marked; presenter mode takes the whole screen; the rehearsal script drives it against a site with a screenshot per step | The GCF Walkthrough page, `npm run rehearse:gcf`, `docs/DEMO-RUNBOOK.md` |

What the tool deliberately does not do is on the record too: it does not write
the Concept Note, it does not score the three judgement criteria, it does not
estimate the NDC share, and it does not report the pipeline as the bank's
inventory.

## 1. Phase I — the presentation, and DFCC's own organisation (weeks 0–2)

**Purpose.** The briefing runs on the live product, and by the end of the
fortnight every screen reads DFCC's own facts rather than the illustrative
ones.

**Steps.**

1. The day itself: `docs/DEMO-RUNBOOK.md`, the DFCC section — the GCF
   walkthrough first (presenter mode, ten steps, the boiler-conversion
   candidate recorded live), then the SLFRS S2 walkthrough over the lending
   book. Rehearsed the day before with `npm run rehearse:gcf` against the
   site; the screenshots are the evidence that every step passes.
2. Accounts: the administrator, the ESG analysts who record candidates, and
   the assessor as a role of their own (`assessor` — `read` and `validate`,
   never `write`). Created on the Accounts screen; a preview visitor sees only
   the sample book and is offered nothing the server would refuse.
3. The entity's own facts: legal name, the accreditation as it stands under
   B.36/10 (size, E&S category, and whether the grant modality is held —
   **verify with the NDA before recording it**), governance, strategy,
   risk-management and target statements. `PUT /v1/gcf/entity`; every gate
   reads it from then on, and the disclosure prints each statement as the
   entity's own or *not stated* with its clause.
4. DFCC's own candidates in place of the starter projects: through the intake
   form (each figure with its tier and its counterfactual), or as a curated
   book through `npm run gcf:record`. The sample pill switches off the moment
   one is recorded; the recorded book replaces the illustrative one entirely
   and is never merged with it.

**DFCC supplies.** The names of the accounts and who the assessor is; the
accreditation as granted; the candidate list with what is already known about
each.

**Datum does.** Production deployment on DFCC's own database (the site is
handed a `DATABASE_URL`, and nothing else — `docs/DATA-LAYER.md`); the first
administrator; training for the analysts and the assessor on the intake, the
project page and the assessor panel.

**Exit criterion.** The GCF Overview's cover names DFCC; the gate reads DFCC's
accreditation; no screen carries the illustrative pill; the walkthrough runs
end to end on DFCC's own candidate.

## 2. Phase II — the pipeline as the working record (weeks 2–6)

**Purpose.** The register of gaps by owner becomes the sustainability unit's
working list, and the first candidate is assessed and signed off.

**Steps.**

1. Each candidate's eight sections recorded as facts on the project page — the
   risk register first, because it is what the Fund reads first — so
   readiness and the package stop asking for documents they can now read.
2. The register worked by owner: *now* before *next*, the candidate furthest
   along first. The bank's own items (NDC sector target, co-benefits,
   scalability, enabling environment, vulnerability) are the analysts'; the
   NDA's no-objection letter is recorded when it arrives; the gender
   assessment, the ESIA/ESMP and consent where a project flags it are
   commissioned and recorded as documents.
3. The assessor rates the six criteria in words, records a recommendation and
   signs the first candidate off; the appraisal is downloaded and filed. A
   conditional sign-off goes back to the sponsor as a recorded return with the
   letter; the resubmission is compared against it.
4. Two candidates chosen for Lot 2, on the recommendation the engine gives
   (`GET /v1/gcf/recommendation`) and the judgement it cannot — where the
   recorded selection and the computed ranking disagree the screen says so,
   and that disagreement is where the unscored criteria are doing the work.

**DFCC supplies.** The facts behind each section; the letters and studies as
they arrive; the assessor's time.

**Datum does.** A weekly read of the register with the unit; the first
assessment sat beside the assessor; the regional judgement where a figure's
tier or counterfactual is unclear.

**Exit criterion.** One candidate *validated* with a signed appraisal; the
return loop used once; the *now* count on the register for the two selected
candidates at zero.

## 3. Phase III — the first Concept Note (weeks 6–12)

**Purpose.** The A–H package for the selected candidate has no external input
left that DFCC can supply, and the Concept Note goes to the Fund through the
NDA.

**Steps.**

1. The Concept Note package read once a week until the external list holds
   only what the Fund or the NDA supplies. The package does not write the
   Concept Note; it is the worklist, and the printed package goes beside the
   submission as evidence of what is held.
2. Project Preparation Facility support considered at this stage — up to 10 %
   of the ask and at most USD 1.5 mn — and recorded on the financial terms if
   sought.
3. The stage moved to *Concept note submitted* with the submission date, so
   the Fund's service standards project the feedback and approval dates from
   it, hatched, on the timeline.
4. The same for the second candidate where Lot 2 allows two.

**DFCC supplies.** The narrative for the unscored criteria, in DFCC's own
words; the co-financier letters; the NDA's engagement.

**Datum does.** A read of the package against GCF's own template before
submission, and the record of what the Fund says back, so the next candidate
starts from it.

**Exit criterion.** One or two Concept Notes submitted, each with its package
printed and its stage dated; the projected feedback date on the overview.

## 4. Phase IV — the reporting year (Lot 1 Milestone 4)

**Purpose.** The ToR's stated gap — *lack of proper systems and procedures to
capture data for sustainability reporting* — is closed by a filed document
rather than a claim.

**Steps.**

1. The GCF disclosure (`GET /v1/gcf/report?format=pdf`) filed beside the
   bank's SLFRS S2 disclosure: climate-related opportunities (§29(d)), capital
   deployment (§29(e)), avoided-and-reduced stated apart, the two NDC 3.0
   ledgers never summed, every entity statement the entity's own or *not
   stated*. The inventory line stays absent by rule, because the entity's own
   scope 1, 2 and 3 come from the bank's own systems and never from a
   pipeline.
2. Annual performance reporting recorded per candidate as the eighth section,
   so the APR the Fund asks for after approval is a fact on the record and not
   a document nobody can find.
3. The period package exported at year end and held with the filing, so the
   period can be transferred whole and verified on the way back in.
4. The conformance matrix and the evidence document handed to the assurance
   provider as the method statement — rule → implementation → proving test —
   and the assurance mode set by the tool provider (`docs/ASSURANCE-MODE.md`).

**DFCC supplies.** The entity statements in their final form; the reporting
entity's sign-off.

**Datum does.** The independent read of the disclosure under ISO 14064-3 /
ISAE 3000, and the regional baselines the figures rest on.

**Exit criterion.** The disclosure filed; the checklist answered from the
document with every entity item Yes and the inventory item No by rule.

## 5. Phase V — after the first cycle

Candidates for build once the first cycle has run, in the order they earn
their place. None is assumed; each is a decision taken on what the first
Concept Note taught.

| Candidate | Why it would earn its place |
|---|---|
| The funding proposal's sections beyond the Concept Note | Once a Concept Note is accepted, the funding proposal asks for what the eight sections hold and more; the same structured-facts rule extends |
| The APR as a document | Post-approval reporting is recorded per candidate; rendering it through the report standard is the next step once one project is under implementation |
| The Fund's feedback as a recorded event | Concept-note feedback and iTAP comments, recorded like a return, so the comparison that exists for the sponsor exists for the Fund |
| The capital book join | An approved project adopted onto the capital book carries the frozen gate verdict and the pledged mitigation (`POST /v1/desk/adopt`); the bank's own attributed emissions on it are PCAF Part A's and live there, never on the pipeline |
| The NDC share | Computed, at tier *declared*, the day the Ministry's BAU tonnage is supplied — and absent until then |

## 6. What each phase is proved by

| Phase | Evidence |
|---|---|
| I | The rehearsal report and screenshots from the day before; the overview cover; `tests/gcf-cycle.test.js` on the starter install and the entity's accreditation reaching every gate |
| II | The register's counts on the overview; the signed appraisal; `tests/gcf-assessment-journey.test.js` and `e2e/gcf-pipeline.spec.js` for the flow the unit is using |
| III | The printed package with its held / partial / external counts; the dated stage move on the timeline; `tests/gcf-sections.test.js` for the inputs the package resolves |
| IV | The filed disclosure and its checklist; the exported period package and its checksum; `docs/CONFORMANCE-EVIDENCE.md` regenerated on the release |

## 7. Language, on every artefact

The tool is PCAF-conformant where PCAF applies and it conforms to nothing at
the Fund: the GCF has no provider programme and endorses no software, so no
screen, document or deck says otherwise. *Held* is recorded, not accepted.
The evidence tiers are GCF appraisal classes and never PCAF's 1–5 scale. The
assessor's ratings are words. Where this plan says the tool *lays out* or
*records*, it means exactly that, and where it says DFCC *decides*, the tool
has no view.
