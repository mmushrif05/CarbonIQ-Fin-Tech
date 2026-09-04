# CarbonIQ FinTech — Product Brief

**A complete product reference for presentation preparation.**

Datum Solutions · Colombo, Sri Lanka
Live: **https://carboniqfintech.netlify.app**
Version of record: commit `2d317f0`, deployed 3 September 2026

---

## How to use this document

This is a factual reference, written to be given to a Claude Project as source
material for building a presentation. Every figure in it was read out of the
running code, not recalled. Where something is unbuilt, unproven or uncertain,
it says so — the honest gaps are as useful in a pitch as the achievements,
because an audience that finds one you did not disclose stops believing the
ones you did.

Three cautions for whoever builds the deck:

1. **The pipeline figures are illustrative.** The five GCF projects are
   realistic in shape and internally consistent, but they are not DFCC's book.
   Every screen says so, and any slide using them must too.
2. **Nothing here is endorsed by PCAF, GCF, CBSL or the GHG Protocol.** The
   product claims *conformance with published method*, never approval. That
   distinction is load-bearing and a slide that blurs it creates real
   regulatory risk.
3. **Do not present the roadmap as shipped.** Section 11 separates the two.

---

## 1. What this is, in one paragraph

CarbonIQ FinTech is a Node.js/Express REST API and web application that turns
construction carbon data into the specific documents banks and insurers are
legally required to produce. It covers four regulatory scopes that must never
be mixed — insurance-associated emissions (PCAF Part C), financed emissions
(PCAF Part A), Green Climate Fund project appraisal, and Sri Lankan taxonomy
and NDC alignment — and it is built on one governing principle: **a figure in a
regulatory disclosure must be traceable to the data behind it, and anything the
system cannot compute is reported absent rather than estimated.**

---

## 2. The problem

A bank or insurer facing climate disclosure has three bad options today.

**Spreadsheets.** Every carbon assessment in the region is built in Excel. They
break silently: a wrong emission factor, a copied row, a lookup that stopped
resolving. Nothing announces the error and the total still looks plausible.

**Consultants.** Expensive, slow, and the method leaves when they do. Next
year's disclosure starts from nothing, and the year-on-year comparison the
standard requires cannot be made because the two years were computed
differently.

**Generic ESG software.** Built for corporate inventories — an office's
electricity and business travel. It has no concept of a bill of quantities, a
construction insurance policy, an emission factor with a data-quality tier, or
the attribution arithmetic that PCAF requires. It produces a number, and the
number cannot be defended.

**What none of them do is refuse.** They all produce an answer whether or not
the data supports one. That is the actual failure mode in climate disclosure:
not absent numbers, but confident wrong ones.

---

## 3. The principle everything else follows from

> A regulatory disclosure contains exactly three kinds of statement.
>
> **MEASURED** — computed from data the system holds, traceable to it.
> **DECLARED** — a fact only the reporting entity can know: what its board
> approved, who sits on its risk committee, what it has committed to.
> **ABSENT** — required by the standard and not available. Saying so is a
> disclosure in its own right; a plausible number in its place is not.

This is enforced in code (`services/report-integrity.js`), not by convention,
and it is the thing that makes the product defensible under assurance.

**Why it exists.** An earlier version of this product's own reports emitted the
first and third kinds as though they were the second. The scope 1/2/3 split was
the financed-emissions total multiplied by 0.08 / 0.14 / 0.78 and printed under
GRI 305 and IFRS S2 §29. The TCFD section described a board meeting quarterly, a
three-person ESG team reporting to the CRO, a $340M pipeline and 12% of the book
in flood zones — all literals. The CBSL disclosure asserted `'Compliant'` to the
regulator that decides compliance. The PCAF checklist hardcoded every item as
met, including the scope breakdown that was only "present" because it had been
invented.

None of it was malicious. All of it would have been a serious problem in front
of an assurance provider. **That failure, found and fixed in this codebase, is
the most credible thing the product has to say about itself** — and it is worth
a slide.

---

## 4. What is built and working

| Capability | Status | Where |
|---|---|---|
| PCAF Part C — insurance-associated emissions | **Shipped** | `services/pcaf-partc/` |
| The insurer's book — clients, projects, policies, BOQ revisions | **Shipped** | `services/partc-registry.js`, `partc-boq.js` |
| Assessment lifecycle, locking, restatement | **Shipped** | `services/partc-assessments.js` |
| Annual disclosure — PDF, Word, JSON | **Shipped** | `services/partc-disclosure.js` |
| Methodology statement, extracted from engine execution | **Shipped** | `services/partc-methodology.js` |
| Sri Lanka taxonomy, NDC 3.0, Green Loan Certificate | **Shipped** | `services/taxonomy.js`, `certificate.js` |
| Capital / anchor dashboard with attribution and forecast | **Shipped** | `services/capital-*.js` |
| GCF pipeline — appraisal through Concept Note inputs | **Shipped** | `services/gcf/` |
| AI agent layer — 9 agents, health-probed | **Shipped** | `services/agents/` |
| PCAF Part A — financed emissions | **Specified, not built** | `docs/PCAF-PART-A-BUILD-SPEC.md` |

**Scale as of commit `2d317f0`:**

- **1,722 automated tests across 80 suites**, all passing
- **74 documented API endpoints**
- 43 top-level services; 27 modules inside the two engines
- 13 web application screens
- Two machine-checked conformance matrices: **38 PCAF Part C rules**
  (34 implemented, 3 partial, 1 excluded) and **32 GCF rules**
  (29 implemented, 1 partial, 2 excluded)

---

## 5. The four scopes, and why they never merge

This is the most important technical slide in any deck about this product.
Four questions sound alike and are legally distinct:

| Scope | The question | Attribution basis | Where |
|---|---|---|---|
| **PCAF Part C** | What emissions are associated with what we **insure**? | Premium | `services/pcaf-partc/` |
| **PCAF Part A** | What emissions are associated with what we **lend**? | Outstanding amount | `services/pcaf-parta/` *(planned)* |
| **GCF appraisal** | What will this **project achieve** against a counterfactual? | Not attributed — project-level | `services/gcf/` |
| **Entity inventory** | What does the **institution itself** emit? | Not attributed — direct | Not held; reported absent |

Mixing any two produces a figure defined by no standard. The separation is
structural: the modules do not import each other, and tests assert it rather
than trusting discipline. Three concrete rules:

- `services/pcaf-partc/rollup.js` **deliberately does not import**
  `beyond-pcaf.js`, so voluntary whole-life figures cannot reach the PCAF
  total through the module graph.
- Part A weights data quality by **outstanding amount**; Part C weights by
  **premium**. The two engines must not share a weighting function.
- Part A's option-to-score mapping is **not uniform across asset classes** —
  Option 2b is score 2 in one class and score 3 in another. Reusing Part C's
  `2b = 3` would be wrong for some classes, silently. This is the single most
  important finding from studying the Third Edition.

---

## 6. PCAF Part C — insurance-associated emissions

The first engine, and the deepest. It computes the emissions associated with a
construction insurance policy and produces the annual disclosure.

**Three tiers, structurally enforced:**

| Tier | Modules | Where it appears |
|---|---|---|
| Mandatory | A4 + A5 | `rollup.construction` — **the PCAF figure** |
| Optional | B1 + B4 + B7 | `rollup.useStage` — separate line, policy-gated, never summed |
| Beyond-PCAF | B2 + B5 + B8 | `beyondPcafAnnex` — voluntary, never in the PCAF figure |

**The policy gate.** A CAR/EAR policy covers construction only, so
`use_stage_years = 0` and B1/B4/B7 are zero **by scope rule**, not by omission.
IDI and Property policies run the use stage over the cover period. A
client-entered cover period applies *within* the gate and can never override it.

**Data quality is a category, not a mark.** PCAF assigns one score per project,
decided by **which option was used** (Table 5.3-2, p.58): `1a=1, 1b=2, 2a=2,
2b=3, 3a=4, 3b=5`. It is not an average — not across inputs, not across modules,
not across lifecycle stages.

The scale runs **1 = best, 5 = worst**, and the direction is the point. Written
`3 / 5` it reads as a fraction and inverts the meaning for anyone who has not
opened the standard. Every rendering is `Data quality score: 3 (Option 2b)` with
the scale stated beside it, and a test sweeps the entire source tree for the
inverted form.

**The use stage is never scored.** PCAF publishes no data-quality table for
optional lifetime emissions on project insurance, so the engine returns a reason
and qualitative statements and **no number at all**. A figure invented to fill
that gap would be read as a PCAF score, which is worse than the gap.

**Across a book the disclosed score is premium-weighted** (Box 6-3, p.107), with
ceded premium substituted for treaty reinsurance (Box 6-4, p.108). A policy
carrying no score is excluded from the weighting rather than counted as zero,
and the count of what was excluded travels with the score.

**The annual disclosure refuses to be empty.** A reporting year holding no
locked assessments returns **409**, not a position of zero. "We insured nothing
carbon-intensive" and "we have not measured yet" are different claims.

**Comparatives are honest about what they compare.** A policy's reporting year
is its inception year, so each year covers a *different set of policies* — two
annual totals are measurements of two different books. Presenting their
difference as a reduction would be false. The movement is reported as fact,
alongside intensity (kgCO₂e/m² insured) and the weighted data-quality score as
the measures that survive a change of book.

---

## 7. The GCF pipeline — the newest capability

Built for DFCC Bank's post-accreditation work under Board decision **B.36/10**,
against the Terms of Reference dated 21 November 2025. It addresses **Lot 1
Milestone 4** (sustainability reporting, whose stated gap is *"lack of proper
systems and procedures to capture data"*) and **Lot 2** (screening a candidate
pool down to up to two Concept Notes).

### 7.1 The record is the spine

One record per candidate project, read by every screen and every document, so
nothing is re-keyed and no two views can disagree. Four rules live in the schema:

**A bare number is refused.** Every figure is `{value, tier}` where tier is
**measured · modelled · benchmark · declared**. Without it, a benchmark grid
factor becomes a measured fact by the time it reaches a submission and nothing
on the page says otherwise.

These are GCF appraisal classes and are deliberately **not** PCAF's 1–5 scale —
reusing those numerals would invite them to be quoted as PCAF scores.

**A tCO₂e figure carries its baseline** — the counterfactual and the type
(reduced, avoided, or removal). Which applies is decided by the counterfactual,
not by the engine.

**Adaptation is never ranked on carbon.** An adaptation project's mitigation is
a co-benefit on its own line.

**Accreditation is a gate, not a score.** A category A project is *excluded* —
DFCC cannot carry it as the accredited entity. Down-ranking instead drifts a
pipeline towards projects that touch nobody.

### 7.2 Three carbon boundaries that cannot merge

- **Mitigation** — what the project achieves against a counterfactual (GCF
  Mitigation Core Indicator 1).
- **Embodied** — A1–A5 of the asset itself. A *payback period* against the
  mitigation, never a deduction from it.
- **Financed** — the bank's own attributed exposure. Not in this model at all;
  the response says it lives in the capital book rather than leaving it
  quietly missing.

Netting embodied against mitigation produces a "net benefit" defined by no
standard. No function returns a figure combining two boundaries, and a test
sweeps the entire roll-up for one.

### 7.3 The engine checks, and never overwrites

Where an independent path exists — generation × grid factor, annual × asset
life — the recorded figure is recomputed and any divergence reported. A mistyped
emission factor is caught before a Concept Note carries it.

Where no path exists, the check reports **unverifiable with the reason**. A
check that silently passes because it had nothing to check is worse than no
check.

### 7.4 The shipped illustrative pipeline

Five projects, marked **SAMPLE DATA** on every surface. Verified totals:

| | |
|---|---|
| Total project cost | **USD 196.5M** |
| GCF ask | **USD 72.0M** |
| DFCC contribution | **USD 79.0M** |
| Mitigation (headline) | **65,800 tCO₂e/yr · 1,202,600 tCO₂e lifetime** |
| Adaptation co-benefit | **180,000 tCO₂e lifetime** — separate line, never summed |
| Direct beneficiaries | **317,500** |
| Indirect beneficiaries | **1,031,000** — a separate core indicator, never added to direct |
| Contribution inside the NDC window | **658,000 tCO₂e** (2026–2035 only) |

Projects: Jaffna solar mini-grids (EP, mitigation) · Dry Zone irrigation (HW,
adaptation) · Colombo district cooling (BA, mitigation) · Puttalam–Mannar
mangrove restoration (EE, adaptation) · Western Province e-bus fleet (LT,
mitigation). Five of GCF's eight results areas, both streams.

### 7.5 Three findings the model produced

These are the strongest demonstration material in the product, because the
system reached them rather than being told them.

**Finding 1 — the pipeline has a mandate gap.** Both adaptation projects rest
on an outcome nobody pays for (`no_revenue_stream`). The only structure that
reaches such a project is results-based finance — which requires the **grant
modality DFCC's accreditation does not carry**. The system reports this as a
*mandate question* (seek the modality, or partner with an entity that holds it),
not as a low score on a spreadsheet.

**Finding 2 — the model disagrees with the recorded selection.** The pipeline
records **GCF-P1 + GCF-P3** as chosen for Concept Notes. The computable criteria
reach **GCF-P3 + GCF-P2**. Neither is wrong on its face: the ranking uses only
the three of GCF's six investment criteria that can be computed from a record,
and the three it cannot score — paradigm shift, needs of the recipient,
sustainable development — are exactly where a sector judgement legitimately
overrides a score. **The divergence is reported so it is argued rather than
absorbed.**

**Finding 3 — a self-inflicted bug, found by driving the product.** An earlier
size check flagged four of the five candidates for falling *below* DFCC's
$50–250M accreditation band. GCF size categories are **nested ceilings** — micro
≤ $10M, small ≤ $50M, medium ≤ $250M — so a medium-accredited entity may carry
all three. The floor check was removed. *A flag that fires on a non-issue is a
flag readers learn to skip.*

### 7.6 The ranking says what it could not weigh

Three of GCF's six investment criteria are named **unscored with reasons**
rather than filled in. A missing component is dropped and its weight
renormalised — **never scored zero** — because scoring absence as zero ranks a
project down for a field nobody filled in.

The weighting belongs to the reader, travels with the answer so a screenshot
carries it, and is stated as *an input to a decision, not the decision*.

### 7.7 Minimum concessionality — the appraisal can say no

GCF applies minimum concessionality: a project viable on commercial terms should
not receive concessional finance. The engine can return **"does not need GCF
support"**, and an unassessed project cannot be put forward at all.

*An appraisal that can only say yes is a sales tool.*

### 7.8 The Concept Note package — the deliverable most people need

Every input the system holds, in GCF's section A–H order, each marked
**held**, **partial**, or **external**.

On the mangrove project: **63 inputs — 43 held, 1 partial, 19 external.**

The external list is the point: the worklist standing between a pipeline entry
and a submission, which otherwise lives in one person's head. It names the NDA
no-objection letter, the gender assessment, the ESIA/ESMP, signed co-financing
commitments, the FPIC process record, and DFCC's own two open accreditation
conditions — with what is needed and from whom, for each.

**It does not write the Concept Note.** A GCF submission is an argument made by
people who carry the institutional commitments behind it. Software that drafted
one would produce something fluent and unsupported, and the author would not
know which sentences were theirs.

A package is **never called complete** while an external input is outstanding,
and the readiness figure says plainly that it measures what is *held*, not how
close the submission is.

---

## 8. Regulatory reporting — what the product will and will not say

### The rule that matters most

**A pipeline of financed projects is not the bank's inventory.**

- SLFRS S2 §29(a) asks for the entity's own absolute gross scope 1, 2 and 3.
- GRI 305-5 is reduction of the *organisation's own* emissions from its own
  initiatives.

Project mitigation is neither. Putting it on either line would report an
emission the entity does not have, in place of one it does.

So the inventory lines are reported **absent, with the clause that requires them
and where the figure actually comes from**, and the pipeline is disclosed where
it belongs: climate-related opportunities (§29(d)), capital deployment (§29(e)),
and a separately-stated avoided-and-reduced line **never netted against
anything** — as GRI and PCAF Part A (p.126) both require.

### The checklist can fail

It is answered *from the report*, so an item cannot claim Yes to something the
document does not contain. The inventory item stays unmet even when every entity
fact is recorded — because this report is **one input to** an SLFRS S2
disclosure, not the disclosure itself. A checklist that could reach 100% would
be claiming otherwise, and the report says so on its own face.

### Standards covered

| Standard | Treatment |
|---|---|
| PCAF Part C v2 (insurance-associated) | Implemented, 38-rule conformance matrix |
| PCAF Part A 3rd Ed. (2 Dec 2025) | Studied and specified; **not built** |
| SLFRS S1 / S2 (ISSB as adopted in Sri Lanka, effective 1 Jan 2025) | Opportunity, capital-deployment and avoided-emissions lines |
| GRI 305 | Mapped; 305-1 to 305-5 answered absent with reasons |
| GHG Protocol Scope 3 | Recalculation triggers, base year, significance threshold |
| CBSL Direction 05 / SLGFT v2024 | Taxonomy screening, Green Loan Certificate |
| Sri Lanka NDC 3.0 (Sept 2025) | Two ledgers, never summed |
| GCF Investment Framework + IRMF (B.29/01) | Six criteria, three scored, three named unscorable |
| IFC Performance Standards 1–8 | Applied as GCF's interim safeguards |

### Sri Lanka NDC 3.0 — a worked example of the discipline

Two **separate** commitments over 2026–2035, **never summed**:

- **20.09%** cumulative GHG reduction against BAU (8.11% unconditional +
  11.98% conditional)
- **4.49%** increase in net carbon removal (0.96% + 3.53%)

Their sum is not a figure Sri Lanka has committed to, and the codebase cannot
produce it: two ledgers from record to output, no key anywhere holding the sum,
and a test that sweeps the entire tree for the combined literal.

**NDC 3.0 states no net-zero year**, so none is asserted — an absent commitment
is reported absent rather than carried forward from the superseded 2021 NDC.

**Why this is a slide.** The superseded 2021 targets (4.5% / 14.5%, net zero
2050) were live in **seven source files and three test files**, including the
Green Loan Certificate — which printed them onto a document carrying a SHA-256
audit hash. Nothing announced the drift, because the tests asserted the same
superseded figures the code produced. A tree-wide currency sweep now permits the
old figures only on a line marked as superseded.

---

## 9. Architecture

```
server.js                Express entry + /health
config/                  env, business constants, CORS
middleware/              auth (JWT + API key), rate limit, audit, validation
routes/v1/               22 route modules
services/                43 services
  pcaf-partc/            Part C engine — pure, deterministic
  gcf/                   GCF pipeline — record, emissions, NDC, screening,
                         instruments, reporting, CN package, conformance
  capital-*.js           Anchor dashboard: attribution, forecast, basket
  agents/                9 Claude-powered agents
data/                    Versioned factor tables and seed books (JSON)
bridge/                  Firebase + core engine bridge (READ-ONLY)
schemas/                 Joi validation for every request body
tests/                   80 suites, 1,722 tests
netlify/functions/       serverless-http adapter
ui/                      13 screens, vanilla HTML/CSS/JS
docs/                    Architecture, specs, generated conformance matrices
```

**Deployment.** Netlify Function (`serverless-http` wrapping Express), Node 22,
us-east-2, 26-second timeout on the Pro plan. Storage is Netlify Blobs or
Firebase; the deployment reports which, and a runtime that cannot persist
**refuses writes with 503** rather than accepting data it will lose.

**Division of labour with the AI layer.** Claude classifies, extracts, maps BOQ
lines and writes narrative. **The engine does every arithmetic operation.** An
LLM must never compute a figure that reaches a regulatory disclosure. This is
worth stating explicitly in any AI-focused slide.

---

## 10. Engineering practices worth presenting

These are differentiators, not housekeeping. Each exists because something
failed.

**Conformance matrices that cannot rot.** Every rule cites the file that
enforces it and the test that proves it. The build fails if a cited file *or a
cited test name* stops resolving — including a test renamed inside a file that
still exists. The GCF matrix caught an error in its own introducing commit: a
citation differing from the real test name by a curly apostrophe.

**Documents generated from a single source.** `npm run docs:conformance` and
`npm run docs:gcf-conformance` render the matrices to Markdown. A test fails the
build if the document drifts — *a doc regenerated from a stale checkout is worse
than no doc, because it reads as current.*

**The methodology statement is extracted from an execution of the engine**, not
transcribed beside it. A test asserts every documented equation appears in the
executed trace, so the document cannot describe an equation the engine does not
run.

**Source-wide sweeps, not path-dependent tests.** The data-quality renderer, the
removed report constants and the superseded NDC figures are each checked by
sweeping the whole tree — rather than trusting the paths a feature test happens
to walk.

**End-to-end proof.** One suite walks record → screen → rank → structure →
emissions → NDC → disclose → Concept Note → export → import, following a
distinctive figure through every module. *Unit tests cannot catch a
disagreement between modules, and every defect in this codebase that reached a
screen did so with its own unit test passing.*

**Diagnosis built into the product.** `/health` reports the running commit,
which configuration is present as booleans, and — since the storage work
appeared to ship and do nothing — **which store was asked for**, not only which
is running. *"The variable never took" and "the store is unreachable" look
identical from a browser, and the first is far more common.*

**Documents are bytes, not text.** A PDF is collected in full, checked to be
well-formed, and sent with explicit `Content-Length` and `Cache-Control:
no-store`. Every "the PDF is empty" report this project had came from the
delivery path rather than the drawing, and none announced itself — the browser
saved a file with the right name and it would not open.

---

## 11. Roadmap — explicitly not yet built

Present these as roadmap. Do not imply they ship today.

| Item | State |
|---|---|
| **PCAF Part A** — financed emissions | Third Edition studied; build spec written; **no code** |
| Multi-tenant onboarding for a second institution | Single-organisation model today |
| Assurance-provider read-only access | Not started |
| Batch API for large portfolios | Identified; not built |
| Automated EPD ingestion | Not started |
| Regional expansion beyond Sri Lanka | Taxonomy engine supports EU/ASEAN/HK screening; NDC and certificate work is Sri Lanka only |

### Known open issues — disclose these if asked

- **`npm run lint` is broken repo-wide** (ESLint 9 wants a flat config). The CI
  lint job is `continue-on-error: true`, which is why it reports success.
- **Two disagreeing Sri Lankan embodied-carbon threshold sets** exist in the
  codebase (520/780 vs 600/900 kgCO₂e/m²). Unreconciled.
- **`services/pcaf.js` still labels its output "PCAF v3"** and should stop
  claiming to be PCAF until Part A exists properly.
- **Storage precedence.** Under `auto`, Firebase takes precedence over Netlify
  Blobs when configured. Deliberate — flipping it would make existing Firebase
  records silently invisible — but it means the Blobs work is inert on a
  deployment that still carries Firebase variables without an explicit
  `STORAGE_BACKEND`.

---

## 12. Positioning

**For a bank or insurer:** the difference between a number and a defensible
number. The product produces the specific documents the standard asks for, with
every figure traceable, and it tells you what it could not compute.

**For DFCC specifically:** the Lot 1 Milestone 4 gap — *"lack of proper systems
and procedures to capture data for sustainable reporting"* — is a data-capture
problem, and this is a data-capture system that happens to also do the appraisal
arithmetic and produce the Concept Note input package.

**For an assurance provider:** conformance matrices mapping every claimed rule
to enforcing code and a proving test, a methodology statement extracted from
engine execution, and a gaps list on every report.

**The honest competitive line:** most climate software produces a number
whatever the data supports. This one refuses, and says why. In a domain where a
wrong disclosure is a regulatory event rather than an inconvenience, that is the
product.

### Three things it will not do — and this is a feature

1. It does not write the Concept Note, score a proposal on GCF's behalf, or
   produce the NDA no-objection letter.
2. It does not substitute for an ESIA, an FPIC consultation, or a gender
   assessment.
3. It does not confirm co-financing. Commitments are legal instruments, not
   fields.

---

## 13. Suggested narrative arc for a deck

1. **The trap** — climate software produces confident wrong numbers, and nothing
   announces it.
2. **The evidence it is real** — our own reports once invented a scope split and
   printed it under a cited clause. We found it and fixed it. *(Section 3.)*
3. **The principle** — measured, declared, or absent. Never filled in.
4. **The engine** — PCAF Part C: policy gate, data quality as a category not a
   mark, a disclosure that refuses to be empty. *(Section 6.)*
5. **The newest capability** — GCF appraisal for DFCC. *(Section 7.)*
6. **What the model found** — the mandate gap, the disagreement with the
   recorded selection, and the size-gate bug we found by driving it.
   *(Section 7.5. This is the most persuasive slide in the deck.)*
7. **How you know it holds** — 1,722 tests, two conformance matrices that fail
   the build when a citation rots, documents generated from one source.
8. **What is next, honestly** — Part A specified not built; the four open
   issues. *(Section 11.)*

---

## Appendix A — Key figures for slides

| Figure | Value |
|---|---|
| Automated tests / suites | 1,722 / 80 |
| API endpoints | 74 |
| Web screens | 13 |
| PCAF Part C conformance rules | 38 (34 implemented) |
| GCF conformance rules | 32 (29 implemented) |
| Illustrative pipeline value | USD 196.5M (USD 72.0M GCF ask) |
| Illustrative pipeline mitigation | 65,800 tCO₂e/yr · 1,202,600 lifetime |
| Illustrative beneficiaries | 317,500 direct · 1,031,000 indirect |
| CN package inputs (mangrove project) | 63 total — 43 held, 1 partial, 19 external |
| Sri Lanka NDC 3.0 | 20.09% reduction · 4.49% removal — never summed |
| SLGFT embodied carbon | Green ≤ 600, Transition ≤ 900 kgCO₂e/m² |
| DFCC accreditation | B.36/10 · medium (≤ USD 250M) · E&S B/I-2 · no grant modality |

## Appendix B — Vocabulary

- **A1–A5 / B1–B8 / C** — lifecycle modules (EN 15978). A1–A3 product, A4
  transport, A5 construction, B use stage, C end of life.
- **Attribution** — the share of a project's emissions a financier carries.
  Part A: outstanding ÷ (equity + debt). Part C: premium-based.
- **BOQ** — bill of quantities: the priced schedule of materials and works.
- **CAR / EAR** — Contractors' / Erection All Risks: construction-period
  insurance.
- **DAE** — Direct Access Entity: an institution accredited to access GCF
  funding directly.
- **IAE** — insurance-associated emissions (PCAF Part C).
- **IDI** — Inherent Defects Insurance: post-completion, typically ten years.
- **IRMF** — GCF's Integrated Results Management Framework (decision B.29/01).
- **NDA** — National Designated Authority: the country's GCF counterpart.
- **NDC** — Nationally Determined Contribution under the Paris Agreement.
- **SLFRS S1/S2** — Sri Lanka's adoption of the ISSB standards.
- **SLGFT** — Sri Lanka Green Finance Taxonomy (CBSL, v2024).

---

*Every figure in this document was read from the running code at commit
`2d317f0`. Where a claim could not be verified from the code, it is marked as
unbuilt or uncertain rather than stated.*
