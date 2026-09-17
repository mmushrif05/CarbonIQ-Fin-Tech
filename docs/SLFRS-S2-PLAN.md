# The SLFRS S2 disclosure, and the walkthrough a CEO sees first

*The end-to-end plan. Written 17 September 2026 from a reading of every screen,
route, document and note in the repository; nothing here is built yet. Each
stage is one shippable pull request with its own tests, and they are meant to
be asked for one at a time.*

---

## 0. What was asked

The walkthrough must open on the dashboard and lead with what matters to a
chief executive: that the bank's **SLFRS S2 climate-related disclosure** (IFRS
S2 as adopted in Sri Lanka) downloads as a PDF in one click, and that every
other document the product produces downloads the same way. Project-level
detail and data entry come at the end, because those facts are collected when a
loan is awarded. When the walkthrough says *"this is what S2 requires you to
collect at loan registration"*, the screen must show those fields, the
dashboard must reflect them, and the S2 file must then download. Whatever S2
needs that the product does not yet collect — a field, a column, a dropdown — is
added, wired to the dashboard and to the document.

## 1. What exists today — read against SLFRS S2

SLFRS S2 asks for four things: **governance** (§5–7), **strategy** (§8–23),
**risk management** (§24–26) and **metrics and targets** (§27–37). The
financed-emissions paragraphs are §29(a)(vi) and B58–B63. The product answers
some of this in three places that do not know about each other.

| Where | What it is | What it answers | Why it is not the S2 document |
|---|---|---|---|
| `GET /v1/pcaf/part-a/financed-emissions/:year/disclosure` (Financed Emissions, Bank Overview) | The consolidated PCAF Part A disclosure, PDF/Word/JSON | §29(a)(vi) financed emissions per class, B61(a)–(d), B63 data quality, coverage (DCL p.124), the entity and boundary, the checklist | It is one asset-class input to S2, and says so: the entity's own inventory item (INV-1) answers *No* by design. No governance, strategy, risk or targets section. |
| `POST /v1/reports/generate` type `ifrs-s2` (Reports screen) | A JSON report with a generic PDF, over the **lending** portfolio | The four pillars as declared-or-absent, plus a Category 15 line | The figure it prints is **attributed embodied carbon (A1–A3)** of construction projects, not PCAF Part A financed emissions — the class of claim `tests/lending-pcaf-claim.test.js` exists to stop. With no portfolio it is stamped SAMPLE DATA. It never reads the Part A register. |
| `GET /v1/gcf/report` (GCF tab) | SLFRS S1/S2 and GRI lines over the GCF pipeline | §6(a)(b), §9, §25, §29(d), §29(e), §33 as entity facts recorded at `PUT /v1/gcf/entity`, else absent | It is the pipeline's disclosure: the pipeline sits under opportunities and capital deployment, and the inventory lines are absent with the clause. It is DFCC's flow, not a bank's Part A workspace. |

Four facts follow from that reading.

1. **There is no bank-level SLFRS S2 document.** Nothing lays the four pillars
   over the bank's own financed-emissions position. A CEO cannot download it
   because it does not exist.
2. **The entity's facts are held in two vocabularies.** `parta_settings` holds
   the legal name, consolidation approach, boundary, fiscal year-end, GWP
   basis, preparer, approver, classes not reported, base year and threshold.
   The GCF entity record holds board oversight, management role, strategy
   narrative, risk process and targets. The Part A workspace holds **none** of
   the governance, strategy, risk or targets facts, and two records can
   disagree about the entity's name.
3. **The bank's own scope 1 and scope 2 are collected nowhere.** §29(a)(i)–(iii)
   ask for gross scope 1, scope 2 (location-based) and scope 3 by category.
   Financed emissions are Category 15; the other fourteen categories and the
   bank's own operations are never asked for, so the S2 inventory cannot be
   printed even as *absent with reason*, because the reason is never recorded.
4. **The loan-level facts S2 needs beyond emissions are not on the register.**
   §29(b)–(e) ask for the amount and percentage of assets vulnerable to
   transition risk, vulnerable to physical risk, aligned with opportunities,
   and capital deployed; the industry-based guidance for commercial banks asks
   for exposure by sector and lending to carbon-related industries. The
   register holds the sector (§5.2) and the SLGFT screen exists on the
   taxonomy side, but no exposure carries a climate-risk classification, so
   none of those amounts can be summed.

Smaller gaps found on the way:

- A per-exposure PDF exists for §5.2 and §5.9 only; the other four classes
  answer `501 REPORT_NOT_BUILT_FOR_CLASS`.
- The Bank Overview downloads the Part A disclosure (PDF, Word, CSV) and
  nothing else; there is no one place listing every document the bank can take.
- The Walkthrough opens on the overview, has no S2 step, no download step, and
  puts the book before the document.
- The consolidated disclosure's regulatory mapping cites *§29(b)* for the
  intensity line. In IFRS S2 as published, §29(b) is the transition-risk
  amount; intensity is an industry-based metric under §32. The citation is to
  be verified against the SLFRS S2 text and corrected in Stage 2.
- SLFRS S1 and S2 were adopted by CA Sri Lanka with phased effective dates for
  licensed banks. The exact dates are **not** asserted anywhere in this plan or
  in the document until read from the adoption statement; the cover prints the
  standard's name and edition only.

## 2. The rules the build is held to

These are the repository's own rules, restated so the stages below can be
checked against them.

- **The engine does every arithmetic operation; the screen computes nothing.**
  Every S2 amount is summed by a service and returned; `tests/bank-ui.test.js`
  and its siblings refuse a sum in a page module.
- **Three kinds of statement, never a fourth** (`src/shared/report-integrity.js`):
  measured, declared, absent with the clause. A governance paragraph is
  declared by the entity or absent; it is never written by the software.
- **A checklist that cannot fail says nothing.** Every S2 checklist item is
  answered from the document's own content.
- **One renderer.** The S2 document is built on
  `src/platform/reporting/report-standard/` like the Part A, Part C and GCF
  documents, so it shares their cover, identity, checksum and delivery path
  (`pdf-response.js`), and Part C's golden stays byte-identical.
- **Three scopes never merge.** Part A feeds the S2 document; nothing from
  Part C or the GCF pipeline enters it, and the architecture test holds it.
- **PCAF-conformant, never PCAF-approved.** `containsForbiddenLanguage()` runs
  over the S2 document as over every other.
- **No client name in the repository.** The bank's name is the recorded
  reporting entity, read from `parta_settings`.
- **Load before the first request; `[hidden]` beats display; grids and selects
  may shrink; every id a module reads exists in its fragment.**

## 3. The requirement register — S2 paragraph → collected → printed

*Held* means the product already collects it. *Add* names the stage that adds
it. The right-hand column is what the S2 document will print.

| S2 paragraph | What it asks | Collected today | Stage | Printed as |
|---|---|---|---|---|
| S1 §B38, §27 | Reporting entity, consolidation, boundary, period | `parta_settings` (name, approach, boundary, FYE, GWP) | held | Basis of preparation (declared) |
| §6(a) | Board oversight: body, terms of reference, competence, how informed, how targets are overseen | — | 1 | Governance (declared) |
| §6(b) | Management's role: positions, delegation, controls | — | 1 | Governance (declared) |
| §10–12 | Risks and opportunities identified, each physical/transition, with time horizons defined in years | — | 1 (entity list) + 4 (per exposure) | Strategy table; horizons printed as the entity defined them |
| §13 | Effects on business model and value chain | — | 1 | Strategy (declared) |
| §14 | Transition plan, and the assumptions behind it | — | 1 | Strategy (declared) |
| §15–21 | Financial effects, current and anticipated; the qualitative route where quantification is not possible | — | 1 | Financial effects (declared, or the §19–21 reason) |
| §22 | Climate resilience, scenario analysis, the scenarios used | — | 1 | Resilience (declared or absent) |
| §25–26 | Risk identification, assessment, prioritisation, monitoring; integration into overall risk management | — | 1 | Risk management (declared) |
| §29(a)(i) | Gross scope 1 | — | 1 (entity inventory) | Metrics (declared, with basis) or absent with reason |
| §29(a)(ii)–(iii) | Gross scope 2, location-based; market-based optional | — | 1 | Metrics (declared) |
| §29(a)(iv) | Scope 3 by category, Category 15 apart | Category 15 = Part A consolidated position | 1 (other categories) | Category 15 **measured** from the register; other categories declared or absent |
| §29(a)(v) | Measurement approach, inputs, assumptions; GHG Protocol | Part A methodology, factor release, baselines | held | Methodology, factor set with checksum |
| §29(a)(vi), B58–B63 | Financed emissions by asset class, the PCAF method, data quality, coverage | Part A consolidated disclosure | held | The financed-emissions section, per class, one score per class |
| §29(b) | Assets vulnerable to transition risk: amount and percentage | — | 4 | Summed by the engine over exposures classified by the entity; *not assessed* excluded and counted |
| §29(c) | Assets vulnerable to physical risk: amount and percentage | — | 4 | As above |
| §29(d) | Assets aligned with opportunities: amount and percentage | SLGFT screen exists per project, not per exposure | 4 | As above, with the SLGFT activity code where one is recorded |
| §29(e) | Capital deployed towards climate risks and opportunities | — | 1 | Declared |
| §29(f) | Internal carbon price: whether, the price, how applied | — | 1 | Declared |
| §29(g) | Remuneration linked to climate considerations: whether, and the share | — | 1 | Declared |
| §32, industry guidance (commercial banks) | Exposure by industry; financed emissions by industry; lending to carbon-related industries | Sector per §5.2 exposure | 4 (sector on every class; carbon-related flag from the vocabulary) | Industry table, measured from the register |
| §33–35 | Each target: metric, objective, scope, period, base year, milestones, absolute/intensity, source of the target, third-party validation, review, progress | — | 1 | Targets table (declared) |
| §36 | GHG targets: gases, scopes covered, gross/net, offsets and their nature | — | 1 | Targets (declared) |
| Chapter 6 (PCAF) | Base year, threshold, triggers | `parta_settings` | held | Recalculation section |

Everything in the *Stage 1* rows is a fact only the entity can state, so it is
a form with closed vocabularies wherever the standard implies one, and it is
declared or absent — never defaulted.

## 4. The stages

Each stage ends with the repository's verification cadence: lint, typecheck,
`build:ui`, the sweeps, the affected browser journeys, the memory suite, the
PostgreSQL suite, the generated documents, a pull request, merge, and a
production deploy confirmed by `/health`. Stages are ordered so that Monday's
walkthrough can run after 1, 2, 3 and 6; 4, 5 and 7 complete the ask.

### Stage 1 — The climate facts: one record, one form, closed vocabularies

**Backend.** Migration `0011` adds `climate_settings` — one row per
organisation, JSONB, the same shape as `parta_settings` — holding the S2 facts
the entity states: governance (§6), strategy items (§10–14), financial effects
(§15–21), resilience (§22), risk management (§25–26), the entity's own
inventory (§29(a)(i)–(iv) other than Category 15, each figure with a *basis*
and a *period*, or an *absent reason*), capital deployed (§29(e)), internal
carbon price (§29(f)), remuneration (§29(g)), and targets (§33–36). The legal
name, consolidation approach, boundary, fiscal year-end and GWP basis are
**read from `parta_settings`** and never duplicated, so the two records cannot
name two entities. `GET/PUT /v1/climate/settings` (`read` / `write`), Joi
schema closed, every field optional and nullable, and a `PUT` that sets one
fact without restating the rest.

**Vocabularies, so a dropdown is a dropdown.** Risk type (physical acute,
physical chronic, transition policy and legal, transition technology,
transition market, transition reputation); time horizon (short, medium, long,
each with the entity's own year range, because S2 makes the entity define
them); scope 2 method (location-based required, market-based optional); target
kind (absolute, intensity); target scope (scope 1, 2, 3, financed emissions,
portfolio share); target source (entity-set, required by regulation, aligned
with an international agreement); validation (none, third-party, with the
validator named); carbon price applied to (lending decisions, pricing,
internal budgeting, not applied). Each lives in
`src/domains/pcaf-part-a/domain/climate/vocabulary.js` and is served on the
reference route, so the form and the document read one list.

**Screen.** A *Climate disclosure* page in the financed-emissions group, one
card per pillar, each a form that writes to `PUT /v1/climate/settings` and
shows *stated* or *not stated* per item. The page computes nothing.

**Tests.** Schema refusals (a target with no base year, a scope 2 figure with no
method, a risk with no horizon), the read-after-write on both stores, the
seven reachability edits, the four mechanical rules, the no-arithmetic sweep.

### Stage 2 — The SLFRS S2 document, one click

**The model.** `src/domains/pcaf-part-a/reporting/climate/` builds one
content model in S2's own order: cover and identity · basis of preparation ·
governance · strategy (risks and opportunities, business model, transition
plan, financial effects, resilience) · risk management · metrics — the GHG
inventory with Category 15 **measured** from the consolidated position and
every other line declared or absent · financed emissions (B58–B63, the Part A
consolidated position laid out per class, one data-quality score each,
coverage, the factor set with its checksum) · the §29(b)–(g) cross-industry
metrics · industry-based metrics · targets · the recalculation protocol · the
completed checklist · annexes (the exposure register, the baselines in force,
the assurance position). Every figure is one the register returned; the
document recomputes nothing. The checklist can fail: an S2 item is answered
from the section that would satisfy it, and the inventory items answer *No*
until Stage 1's facts are stated.

**The route.** `GET /v1/climate/disclosure/:year?format=json|pdf|docx`
(`read`, stores nothing) through `pdf-response.js`; a year with no Part A
position is a **409** naming what the year holds, never a document of zeros.
The reference is a SHA-256 over the canonical facts, so one position rendered
twice is one reference. The Part A citation for intensity is checked against
the SLFRS S2 text and corrected.

**The lending report that could be mistaken for it.** The Reports screen's
`ifrs-s2` type is retitled *Attributed embodied carbon (A1–A3) — climate
disclosure inputs* and carries, on its face, where the SLFRS S2 disclosure
actually comes from — the correction the PCAF v3 header already had.

**Tests.** A golden for the document (`tests/climate-disclosure-golden.test.js`,
`UPDATE_GOLDEN=1`), a book whose entity stated nothing answering *No* on every
declared item, the 409, PDF well-formedness and the draw-call sweep, the
forbidden-language guard, the deterministic reference, all three formats over
the route, and conformance rules `S2-DOC-01…n` in the Part A matrix proved by
execution.

### Stage 3 — The dashboard: S2 on the first screen

**Bank Overview.** A band at the top of the position, above the charts: the
four pillars as four tiles — *stated / partly / not stated* counts per pillar,
read from a `readiness` block the disclosure route returns — a **Download
SLFRS S2 (PDF)** button beside Word and JSON, and *What S2 still needs from
you*, each item naming its paragraph with a button to the form that answers
it. The band reads the same JSON the lineage drawer reads, so the screen and
the document cannot disagree. The starter book gains nothing here: S2 facts
are the bank's and are never seeded.

**The behind-the-figure drawer** gains *behind the S2 document*: the
reference, the content hash, who stated each pillar and when.

**Tests.** The band's ids in the fragment, no arithmetic, the download wiring,
`e2e/bank.spec.js` downloading the S2 PDF and checking its header.

### Stage 4 — At the loan: what S2 collects when a facility is awarded

**Register.** Every class's exposure input gains an optional `climate` block:
`physicalRisk` and `transitionRisk` (each *vulnerable / not vulnerable / not
assessed*, with the horizon and a note), `opportunity` (*aligned / not aligned
/ not assessed*, with the SLGFT activity code where one applies, from the
taxonomy's own list), and `sector` on every class where §5.2 alone holds it
today, from the one ISIC vocabulary, with `carbonRelated` derived from the
vocabulary rather than ticked. The block is stored with the input, travels
through recompute unchanged, and an approved exposure's block is frozen with
the rest.

**Engine.** The consolidated position sums outstanding by classification —
vulnerable, not vulnerable, not assessed — per risk kind and per class, and by
sector; the percentages are over the assessed outstanding and the *not
assessed* share is printed beside them, so a book nobody has classified reads
as unclassified rather than as safe. Every figure carries the basis *declared
per exposure by the entity, summed by the engine*.

**Screens.** The Lending Book form gains the block under a *Climate risk*
heading with the dropdowns; the row and the detail show the classification;
the Bank Overview's S2 band and the document's §29(b)–(d) and industry tables
read the sums. The starter book carries a classification on each of its
exposures so the walkthrough has figures to show.

**Tests.** Schema and freeze, the sums on both stores with *not assessed*
excluded, the projection carrying the block, the register journey setting a
classification from the screen, the golden updated.

### Stage 5 — Every document, one click

- Per-exposure PDF/Word for the four classes that answer 501 today (§5.1,
  §5.3, §5.4/§5.5, §5.6), through the one renderer, each carrying its native
  trace and findings.
- A *Documents* card on the Bank Overview listing every document the bank can
  take for the year — the SLFRS S2 disclosure, the Part A consolidated
  disclosure, each class's disclosure, the exposure register CSV, and (where
  recorded) the Part C annual disclosure — each with PDF, Word and JSON, every
  link a route that already serves the document. The card reads a `documents`
  list the position route returns, so a document that is not there is not
  offered.
- The Lending Book and Sovereign Book rows gain a per-exposure download.

**Tests.** Goldens for the four new per-exposure documents, the card's links
resolving to served routes (held to `docs/openapi.json`), the browser journey
downloading one of each kind.

### Stage 6 — The walkthrough, CEO first

The steps are reordered and rewritten so a chief executive sees the answer
before the method. Every step still opens a real screen through the hand-overs
the screens already read; the strip's *Open* on step 2 triggers the download.

1. **The bank's position** — the Bank Overview: the entity, the headline with
   its boundaries named, coverage, the S2 band.
2. **The disclosure, downloaded** — *Download SLFRS S2 (PDF)*; what the
   document is, what it is not (one input to the entity's full S2 report where
   the entity's own inventory is unstated), and the reference on its cover.
3. **What S2 requires, and where it is collected** — the Climate disclosure
   page: the four pillars, each *stated* or *not*, and the paragraph beside
   each.
4. **What is collected when a loan is awarded** — the Lending Book at one
   class, the record form open, the climate-risk block and the PCAF inputs
   shown with the sentence that says which S2 line each feeds.
5. **How it reaches the dashboard** — back to the overview with that class in
   focus: the class's figures, its score, its share vulnerable and aligned.
6. **Behind a figure** — the lineage drawer: factor set, baselines, approval,
   document identity.
7. **Every document** — the Documents card: each report as PDF, Word or JSON.
8. **The technical detail, for later** — the Financed Emissions screen and the
   Part A engine, named as what the analysts use after the loan is awarded.

The readiness table on the Walkthrough page gains the four pillars and the S2
document's reference; `docs/DEMO-RUNBOOK.md` and `scripts/rehearse-runbook.js`
follow the new order; `e2e/walkthrough.spec.js` drives all eight steps and
asserts the PDF downloaded at step 2 opens with a PDF header.

### Stage 7 — Close-out

Both suites, the browser journeys, the conformance evidence run, the generated
documents (OpenAPI, scopes, README, code tour, typecheck worklist, Part A
conformance), `CLAUDE.md` and `docs/PCAF-PART-A-RESEARCH.md` §12 logged, the
rehearsal script run against a production-shaped instance with a screenshot
per step, and the live-site checklist handed over — sign in, load the starter
book, state the entity, state the pillars, download the S2 PDF.

## 5. Order, and what Monday needs

| Stage | Depends on | Size | Needed for Monday |
|---|---|---|---|
| 1 Climate facts | — | medium | yes |
| 2 S2 document | 1 | large | yes |
| 3 Dashboard band and download | 2 | small | yes |
| 6 Walkthrough CEO-first | 3 | medium | yes |
| 4 Loan-level classification | 1 | medium | recommended — it is what makes step 4 true |
| 5 Every document | 2 | medium | after |
| 7 Close-out | all | small | after |

Stages 1, 2, 3 and 6 give the walkthrough its opening: the overview, the S2
PDF in one click, the pillars, the book, the lineage. Stage 4 is what lets the
walkthrough say *"these are collected when the loan is awarded"* and show the
dashboard moving; without it, step 4 shows the PCAF inputs only and the S2
band's §29(b)–(d) lines print *not assessed*, which is true and is not the
demonstration asked for. Stage 5 completes *"set up all our documents like
that"*.

## 6. What this plan does not claim

- The S2 document is the disclosure over what this product holds. Where the
  entity has not stated its own inventory, its governance or its targets, the
  document prints *not stated* with the paragraph, and its checklist says so.
  It never becomes complete by being printed.
- The effective dates of SLFRS S1/S2 for licensed banks in Sri Lanka are read
  from CA Sri Lanka's adoption statement before they are printed anywhere.
- No figure in the S2 document is computed by a language model, and no
  narrative is written by one: the narrative is the entity's own words, typed
  into the form, or absent.
