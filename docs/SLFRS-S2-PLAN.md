# Part A, the dashboard, and the S2 file that downloads in one click

*The end-to-end plan, revised 17 September 2026 to the scope agreed: **Part A
only**. Part C and the GCF pipeline are untouched. No figure the engines
compute changes, and no data model is reshaped to suit S2. Each stage is one
pull request with its own tests, to be asked for one at a time.*

---

## 0. The scope, stated plainly

1. **Part A financed emissions is the product being shown.** Insurance-associated
   emissions (Part C) and the GCF pipeline stay exactly as they are and appear
   nowhere in this work. Attributed embodied carbon on the lending side is not
   part of it either.
2. **Our report already goes beyond SLFRS S2 and stays that way.** The
   consolidated Part A disclosure prints the entity and boundary, per-class
   positions, the option distribution, the outstanding-weighted score, the
   factor set with its checksum, the baselines in force, the exposure register
   annex, the uncertainty statement, the fluctuation analysis and the
   improvement plan. S2 asks for a fraction of that. Nothing is removed to make
   the document "S2-shaped".
3. **S2 adds sections; it never changes a figure.** Where S2 asks for something
   the document does not yet carry, that section is added and the bank's own
   fact is collected. Every number stays the one the engine computed, and the
   §5.2 and §5.9 goldens do not move.
4. **One document, and it downloads as the S2 file.** There is no second
   report. The consolidated disclosure becomes the SLFRS S2 climate-related
   disclosure, downloadable as PDF, Word or JSON from the dashboard in one
   press.
5. **The sample book carries what S2 looks for**, so the walkthrough shows
   populated S2 lines rather than empty ones.
6. **The dashboard is the centrepiece** — one clear, colourful, interactive
   screen a chief executive reads first.

## 1. What the document already answers, and what S2 still asks for

SLFRS S2 is IFRS S2 as adopted in Sri Lanka. It asks for four things:
governance (§5–7), strategy (§8–23), risk management (§24–26), metrics and
targets (§27–37). The financed-emissions paragraphs are §29(a)(vi) and B58–B63.

**Already printed, and beyond what S2 requires:**

| S2 asks | The document already prints |
|---|---|
| §29(a)(vi), B58–B63 financed emissions by asset class, with the method | Every recorded class on the boundary its section reports, scope 3 apart, one data-quality score per class, the PCAF method named with its edition |
| B61(c) coverage | Assessed outstanding over the bank's own stated book total, the classes excluded from the share named |
| B63 data quality | The outstanding-weighted score with scope 3 apart, plus the option distribution and the improvement plan, which S2 does not ask for |
| §29(a)(v) measurement approach, inputs, assumptions | The factor set with its version and SHA-256, the baselines in force with scope and version, the uncertainty statement by score |
| Entity and boundary | Legal name, consolidation approach, boundary note, fiscal year-end, GWP basis, preparer, approver, classes not reported with reasons |
| — (beyond S2) | Per-exposure register annex, the fluctuation analysis, the recalculation protocol, the document identity and content hash, the assurance position |

**What S2 asks for that is collected nowhere:**

| S2 paragraph | What it asks | Who can state it |
|---|---|---|
| §6(a), §6(b) | Board oversight and management's role | The bank |
| §10–12 | The climate risks and opportunities identified, with time horizons | The bank, and per exposure |
| §13, §14 | Effects on the business model; the transition plan | The bank |
| §15–21 | Financial effects, current and anticipated | The bank |
| §22 | Climate resilience and scenario analysis | The bank |
| §25–26 | How climate risk is identified, assessed and monitored, and how it sits inside overall risk management | The bank |
| §29(a)(i)–(iv) | Gross scope 1, scope 2 location-based, scope 3 by category | The bank (Category 15 is **measured** here) |
| §29(b), §29(c), §29(d) | Amount and percentage of assets vulnerable to transition risk, vulnerable to physical risk, aligned with opportunities | Classified per exposure by the bank, **summed by the engine** |
| §29(e), §29(f), §29(g) | Capital deployed, internal carbon price, climate-linked remuneration | The bank |
| §32, banking guidance | Exposure and financed emissions by industry; lending to carbon-related industries | **Measured here** once every class carries a sector |
| §33–36 | Each target with its metric, scope, period, base year, milestones and progress | The bank |

Two of these the engine can compute the moment the input exists: the
§29(b)–(d) amounts, and the industry table. The rest are the bank's own words
and are collected, never written for it.

**One consequence worth stating.** The consolidated disclosure's checklist item
INV-1 — the entity's own gross scope 1, 2 and 3 — answers *No* today with the
reason that this report is one input to an S2 disclosure rather than the
disclosure itself. That reason is true only while the bank's own inventory is
uncollected. Once Stage 1 collects it, INV-1 answers Yes and the sentence goes,
because it has stopped being true. That is how the caveat is removed: by
collecting the fact, not by suppressing the item.

## 2. The rules this build is held to

- The engine does every arithmetic operation; the dashboard computes nothing.
  `tests/bank-ui.test.js` refuses a sum, a division or an average in the page
  module.
- Three kinds of statement and no fourth: measured, declared, absent with the
  clause. A governance paragraph is the bank's own words or it is absent.
- One renderer. The S2 sections are added to the report standard the
  consolidated disclosure already uses. Part C's documents stay byte-identical.
- Part A only. `tests/architecture.test.js` fails on an import that reaches
  into Part C or the GCF domain.
- PCAF-conformant, never PCAF-approved.
- No client name in the repository. The bank's name is the recorded reporting
  entity.
- The four mechanical rules: load before the first request, `[hidden]` beats
  display, grids and selects may shrink, every id a module reads exists in its
  fragment.

## 3. The stages

> **All six stages are built.** What follows is the plan they were built to,
> kept as written; `CLAUDE.md` records what shipped.
>
> Three things went differently from the plan and are recorded here rather
> than quietly absorbed. The S2 index is an **annex** rather than a section,
> beside the regulatory mapping, which is where a reader of a filed document
> looks for a content index. What is outstanding is named **one row per
> pillar** rather than one per paragraph: twenty rows would have buried the
> handful of Chapter 6 items beside them, and the index annex already names
> every paragraph. And `band()` gained a `totalAmount`, because the dashboard
> draws each §29 band as one bar split three ways and a browser that added the
> three parts together to find the bar's length would be a second engine.
>
> Stage 6 found one defect and it was on a screen rather than in the
> arithmetic, which is what the rehearsal exists for: the §32 industry table
> grouped on `counterparty.sector`, a field every class but §5.2 keeps its own
> descriptor in, so *office*, *retail* and *70* headed rows of an industry
> table. It groups on the sector vocabulary key alone now.

### Stage 1 — The bank's own climate facts

**Where they live.** On the existing `parta_settings` record, not a new table
and not a second entity vocabulary, so the bank's name cannot be stated twice
and disagree with itself. A migration extends the record; `GET/PUT
/v1/pcaf/part-a/settings` already read and write it, and the Joi schema gains
the new fields, every one optional and nullable.

**What is collected.** Governance (§6): the body that oversees, how often it is
informed, management's role. Strategy (§10–14): the risks and opportunities
identified, each one physical or transition, each with a horizon the bank
itself defines in years; the effect on the business model; the transition plan.
Financial effects (§15–21). Resilience and scenario analysis (§22). Risk
management (§25–26). The bank's own inventory (§29(a)(i)–(iv)): gross scope 1,
scope 2 location-based (market-based optional), and the scope 3 categories other
than 15, each figure carrying its basis and period, or an absent reason.
Capital deployed (§29(e)), internal carbon price (§29(f)), climate-linked
remuneration (§29(g)). Targets (§33–36), each with metric, scope, base year,
target year, milestones, whether absolute or intensity, who set it, whether it
was third-party validated, and progress.

**Dropdowns, not free text, wherever S2 implies a list.** Risk type (physical
acute, physical chronic, transition policy and legal, transition technology,
transition market, transition reputation); horizon (short, medium, long, with
the bank's own year ranges); scope 2 method (location-based, market-based);
target kind (absolute, intensity); target scope (scope 1, scope 2, scope 3,
financed emissions, share of portfolio); target source (set by the entity,
required by regulation, aligned with an international agreement); validation
(none, third party, with the validator named); carbon price applied to (lending
decisions, pricing, internal budgeting, not applied). One vocabulary module,
served on the Part A reference route, read by both the form and the document so
they cannot drift.

**Screen.** The entity form already on the Financed Emissions screen gains the
new cards, one per pillar, each showing *stated* or *not stated*. No arithmetic.

**Tests.** Schema refusals (a target with no base year, a scope 2 figure with no
method, a risk with no horizon), read-after-write on both stores, the reference
route carrying the vocabularies, the sweeps.

### Stage 2 — What a loan carries for S2, and the sample book that shows it

**On the exposure.** Every class's input gains an optional `climate` block:
transition risk and physical risk, each *vulnerable / not vulnerable / not
assessed* with a horizon and a note; opportunity alignment, *aligned / not
aligned / not assessed*, carrying the SLGFT activity code where one applies;
and a sector on every class from the one ISIC vocabulary §5.2 already uses,
with `carbonRelated` derived from the vocabulary rather than ticked by hand.
The block travels with the input, survives a recompute unchanged, and freezes
with the rest when an exposure is approved.

**In the engine.** The consolidated position sums outstanding by classification
— vulnerable, not vulnerable, not assessed — for each risk kind, for
opportunity alignment, and by sector with the carbon-related subtotal. The
percentages are over assessed outstanding and the *not assessed* share is
printed beside them, so a book nobody has classified reads as unclassified
rather than as safe. Every figure carries its basis: classified per exposure by
the bank, summed by the engine.

**In the form.** A *Climate risk* block on the Lending Book's record form, the
dropdowns above, shown on the row and on the detail.

**In the sample.** The starter book's seventeen exposures each carry a
classification and a sector, chosen so the S2 lines are populated and varied —
some vulnerable, some not, some aligned, a few deliberately not assessed so the
unassessed share is visible and honest.

**Tests.** Schema and freeze, the sums on both stores with *not assessed* held
apart, the projection carrying the block, the starter book install proving every
S2 line populated, the register journey setting a classification from the screen.

### Stage 3 — The one document becomes the S2 file

**No new report.** The consolidated Part A disclosure gains the sections S2 asks
for and keeps everything it already prints:

- Governance (§6), Strategy (§10–14), Financial effects (§15–21), Resilience
  (§22), Risk management (§25–26) and Targets (§33–36) — each the bank's own
  words from Stage 1, or absent with the paragraph.
- The GHG inventory (§29(a)): the bank's own scope 1 and scope 2 as stated,
  Category 15 **measured** from the consolidated position, the other scope 3
  categories stated or absent.
- Cross-industry metrics (§29(b)–(g)): the amounts and percentages Stage 2's
  engine summed, with the unassessed share beside them.
- Industry-based metrics (§32): exposure and financed emissions by sector,
  carbon-related subtotalled.
- An **S2 index**: one row per paragraph naming the section of this document
  that answers it. That is what makes the file readable as an S2 disclosure
  without a word of it being rewritten for S2.

**The download.** `GET /v1/pcaf/part-a/financed-emissions/:year/disclosure`
already serves PDF, Word and JSON; the button on the dashboard reads *SLFRS S2
climate-related disclosure*. The reference, content hash and build stamp are
unchanged in shape. The checklist gains the S2 items and can fail on every one
of them; INV-1 answers Yes once the inventory is stated.

**What does not change.** The §5.2 and §5.9 per-class documents and their
goldens. Every figure. The factor sets. The renderer. Part C, byte for byte.

**Tests.** The consolidated golden regenerated with the new sections and no
moved figure; a book whose bank stated nothing answering No on every declared
item; the S2 index resolving every paragraph to a section that exists; the
forbidden-language guard; all three formats over the route; conformance rules
`A-S2-01…n` in the Part A matrix proved by execution.

### Stage 4 — The dashboard

The screen a chief executive opens, over one reporting year, reading top to
bottom and computing nothing.

**The top band — the answer first.** The bank's name and the year. The headline
financed emissions with the boundaries it sums named beside it and scope 3 on
its own line. Coverage. Intensity. Approved of total. And, on the same band,
**Download SLFRS S2 disclosure** as PDF, Word or JSON, with a one-line S2
readiness strip: the four pillars as four states, each opening the form that
answers it.

**Interactive, and colourful with a reason for every colour.**

- **One hue per asset class** across every chart, chip and tile, defined once
  in the stylesheet. Scope 3 is grey wherever it is drawn and is never a
  segment of the headline bar. The data-quality ramp is the one every PCAF
  screen shares. The climate-risk palette is its own, and *not assessed* is
  neutral rather than green.
- **Class in focus**, already built, extended: selecting a class dims the rest
  across every chart and tile and opens that class's own panel, with a button
  into its book.
- **Hover anywhere** gives the figure, its unit and its basis; every chart
  keeps `role="img"` and an accessible label, and every figure is reachable
  without a pointer.
- **Click through**: a bar, a segment or a sector row opens the Lending Book
  filtered to exactly what was clicked, through the hand-over the book already
  reads.
- **Behind every figure**, the lineage drawer already built, extended to the S2
  document: the reference, the content hash, who stated each pillar and when.

**What it draws.** Financed emissions by class with scope 1 and 2 as segments
and scope 3 beside them; the share of each class's outstanding at each PCAF
score; outstanding per class with the coverage ring; economic intensity per
class; **the S2 climate-risk view** — outstanding vulnerable to transition
risk, to physical risk, and aligned with opportunity, each with its unassessed
share; **the sector view** — outstanding and emissions by sector with
carbon-related marked; and **this year against last**, where the register holds
a prior year, with the movement stated as fact and the note that a change of
book is not a change in performance.

**What it will not do.** No projection drawn as though it were measured; a
scenario is hatched and labelled. No netting of anything against the inventory.
A dash, never a zero, where a figure is absent. No arithmetic in the browser —
every number on the screen is one a route returned.

**Tests.** The sweep for arithmetic, the ids, the four mechanical rules, the
colour tokens read from the stylesheet rather than chosen in the module, and a
browser journey that seeds two classes, focuses a class, clicks through into
the book, downloads the S2 PDF and checks its header, and asserts the page
never widens at a phone width.

### Stage 5 — The walkthrough, chief executive first

Eight steps, each opening a real screen through the hand-overs those screens
already read. The strip carries the step, what to do and, behind a toggle, what
to say.

1. **The position** — the dashboard: the bank, the year, the headline, coverage.
2. **The S2 file, downloaded** — one press, the PDF opens, the cover names the
   bank and carries the reference.
3. **What S2 asks, and where it is answered** — the S2 index in the document
   beside the readiness strip on screen.
4. **The climate view** — the risk and sector charts, and what the unassessed
   share means.
5. **What is collected when a loan is awarded** — the Lending Book at one
   class, the record form open, the PCAF inputs and the climate block, each
   named with the S2 line it feeds.
6. **How it reaches the dashboard** — back with that class in focus.
7. **Behind a figure** — the lineage drawer.
8. **The detail, for the analysts** — the Financed Emissions screen and the
   engine, named as what is used after the loan is awarded.

The Walkthrough page's readiness table gains the four pillars and the S2
document's reference; `docs/DEMO-RUNBOOK.md` and the rehearsal script follow the
new order; the browser journey drives all eight and asserts the file downloaded
at step 2 opens as a PDF.

### Stage 6 — Close-out

Both suites, every browser journey, the conformance evidence run, the generated
documents regenerated, `CLAUDE.md` and the Part A research log updated, the
rehearsal driven end to end on a production-shaped instance with a screenshot
per step, and the live-site checklist: sign in, load the starter book, state the
bank's facts, download the S2 disclosure.

## 4. Order, and what Monday needs

| Stage | Depends on | Size | Monday |
|---|---|---|---|
| 1 The bank's climate facts | — | medium | **built** |
| 2 Loan-level classification and the sample book | — | medium | **built** |
| 3 The document becomes the S2 file | 1, 2 | large | **built** |
| 4 The dashboard | 3 | large | **built** |
| 5 The walkthrough | 4 | medium | **built** |
| 6 Close-out | all | small | **built** |

Stages 1 and 2 are independent of each other and could be built in either
order; 2 is what makes the climate view on the dashboard show real figures
rather than an unassessed book, which is why it is not deferred.

## 5. What this plan does not claim

- The bank's own words are the bank's. Governance, strategy, risk process and
  targets are collected through a form and printed as stated, or reported
  absent with the paragraph. Nothing is written on the bank's behalf, and no
  narrative in this document is produced by a language model.
- No figure in the S2 sections is computed by anything but the engine, and none
  of the existing Part A arithmetic is touched.
- The effective dates of SLFRS S1 and S2 for licensed banks in Sri Lanka are
  read from the adoption statement before they are printed anywhere.
