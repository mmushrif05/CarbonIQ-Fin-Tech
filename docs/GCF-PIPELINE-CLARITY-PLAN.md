# The GCF pipeline — making it simple, and keeping everything

**Status:** plan, not built. Nothing in this document has shipped.
**Scope:** `src/domains/gcf/`, `ui/pages/gcf*.html`, `ui/js/gcf*.js`.
**Rule this plan is held to:** every research finding, every clause, every engine
and every conformance rule that exists today survives. What changes is *where a
person meets them* and *when they are asked for*. Nothing is deleted to make the
screen shorter.

---

## 0. The complaint, restated precisely

> The GCF pipeline is not clear, it is not easy to understand. Keep all the
> research findings, the theory of change and the other important work — but
> they are not properly interpreted. During the intake those measures are not
> easy to enter and record the project.

Read against the code, that is three separate problems with three different
causes, and they need three different fixes. Treating them as one "make the UI
nicer" task is how this gets worse.

1. **The surface is four screens and 50 cards for one job.** Not complexity of
   subject — complexity of layout.
2. **The intake asks everything at once, including facts the project's stage
   does not need yet.** The engine already knows which stage needs what, and the
   form does not ask it.
3. **The research is encoded in the engines and not interpreted on the screen.**
   The theory of change is the clearest case: GCF reads it as the core of the
   argument, and this system holds it as one textarea nobody is ever prompted
   to fill.

---

## 1. What the deep dive found

### 1.1 The surface

| What | Count |
|---|---|
| Nav entries under *Capital & GCF* | 4 — GCF Overview, Fund Desk, GCF Pipeline, GCF Walkthrough |
| Sub-tabs on the GCF Pipeline screen | 7 |
| `.gcf-card` blocks in `ui/pages/gcf.html` | 50 |
| Inline write forms (`data-writes`) on one page | 19 |
| Lines of GCF frontend | 9,616 across 3 modules and 2 stylesheets |
| Fields before **Record project** | 42 — 9 pre-check, 33 intake |
| Readiness requirements a project then meets | 40, across 10 cycle stages, 7 owners |

To record one candidate completely a person passes through the pre-check, a
33-field form, then roughly 28 further forms spread across the project page and
a sibling module (`gcf-sections.js`). There is no draft, no progress, and no
statement anywhere of how much is left.

### 1.2 The intake ignores the engine that already knows the answer

`src/domains/gcf/domain/readiness.js` holds 40 requirements, each keyed to a
cycle stage, each carrying `clause`, `remedy` and `owner` — a genuinely good
piece of work, and the honest interpretation of the research. The intake form
(`ui/js/gcf.js` `INTAKE()`) is a hand-written flat list that reads none of it.

So a project at **stage 2, concept** — where the research says five facts are
needed (rationale, results area, NDC target, taxonomy band, indicative cost) —
is asked on the same screen, with equal weight, for its barriers to commercial
finance, its viability without GCF, its selection reasoning at 40 characters
minimum, and baseline→target→year for three IRMF indicators. Those are stage 3
and stage 4 facts. The form has no idea.

`FormSteps` is attached, but with `attach()` alone. The Part A register form
uses the same helper with `missing()`, `revealMissing()` and `flag()`, and
drives a `preview()` route that shows the engine's answer *before* Record. GCF
took the cheap half of a pattern this repository had already built.

### 1.3 Four defects, each proved by running the code

**(a) An adaptation project cannot be recorded at all.** `mitigation.baseline.description`
and `.counterfactual` are `.required()` strings on every record. A mangrove
project — no carbon counterfactual, by design; the model's own rule is that
adaptation is never ranked on carbon — is refused at the door:

```
REFUSED (INVALID_GCF_PROJECT):
  "mitigation.baseline.description" is not allowed to be empty
  "mitigation.baseline.counterfactual" is not allowed to be empty
```

and that string reaches the screen verbatim through `err.textContent = e.message`.
A sponsor is shown JSON paths and told to invent a carbon counterfactual for a
coastal protection project. Half of what GCF exists to fund cannot be keyed.

**(b) A tier is fabricated on a figure nobody entered.** To get past (a), the
form sends `{ value: null, tier: 'declared' }` for every blank figure. So
`weakestTier()` on a record where nothing was entered returns `declared` — a
provenance claim about a number that does not exist. The record schema exists
to stop exactly this, and the browser walks around it.

**(c) Two panels on one project page disagree about the same fact.**
`readiness.js` reads the structured sections through `sections.best()`;
`criteria.js` still reads document flags. Recorded stakeholder consultations,
same project, same screen, same second:

```
sections.status(stakeholders)  = held        → the checklist ticks
criteria countryOwnership.stakeholders = absent  → the scorecard says absent
sections.status(monitoring)    = partial
criteria paradigmShift.knowledge = absent    → paradigmShift reads absent overall
```

When Phase C put the eight sections on the record, readiness was taught to read
them and the six-criteria scorecard was not. So a bank records its consultations
and the criteria panel still says it has none. This is the sharpest instance of
*the important work is not properly interpreted*: the fact is held, and one of
the two readers of it never learned.

**(d) Recording a project whose code already exists silently overwrites it.**
The intake derives the id from the code (`gcf_${code}`), and `POST /v1/gcf/pipeline`
is an upsert by design. Two people keying `DFCC-1`, or one person pressing
Record twice, replaces the first project — and the screen says `DFCC-1 recorded.`
This is the same shape as the `desk/adopt` defect already recorded in
`CLAUDE.md`, for which `store.insert()` was built and is not used here.

### 1.4 The research is held; it is not interpreted

`docs/GCF-PIPELINE-RESEARCH.md` is 353 lines and the engines encode it
faithfully — ten stages, six criteria and their sub-criteria, IRMF indicators,
SAP and PPF thresholds, GCF-2 service standards, DFCC's envelope under B.36/10.
None of that is lost. What is missing is the step from *encoded* to
*interpreted on the screen a person uses*.

**The theory of change is the case that matters most.** GCF reads it as the core
of the argument. In this system it is:

- one `Joi.string().max(3000)` on `narrative.theoryOfChange`;
- **absent from the intake form entirely**;
- editable only on the project page, inside a narrative card, as the last of
  five textareas;
- read by exactly one line, in `cn-package.js` section B, where it is either
  `held` or `external`;
- cited by **no readiness requirement and no investment criterion**.

So recording it moves nothing, and not recording it costs nothing until the
Concept Note package marks one more input external. A causal chain — barriers →
activities → outputs → outcomes → impact, with its assumptions and its evidence —
is held as an unstructured paragraph that the product never asks for.

---

## 2. The design rules this plan is built on

These are the repository's own rules, applied here. They are what keeps the fix
from becoming a second layout that drifts from the first.

1. **The form is generated from the engine that judges it.** The intake must be
   composed from `readiness.REQUIREMENTS`, so the form and the checklist cannot
   disagree about what a stage needs — the rule the OpenAPI document, the
   `docs:scopes` table and the S2 item registry already follow.
2. **The browser holds no vocabulary, no clause and no field list.** All of it
   comes from `GET /v1/gcf/reference` and the new form route. `tests/gcf-ui.test.js`
   extends its sweep to refuse a clause, a paragraph reference or a field label
   in the module.
3. **The browser computes nothing.** Unchanged.
4. **Nothing held becomes missing.** Every new structured block counts a
   document or a free-text narrative of the same kind through `sections.best()`,
   so a project recorded today reads exactly the same tomorrow.
5. **Absence is an answer.** A stage that does not ask for a fact leaves it off
   the list rather than showing it empty; a fact nobody has entered is absent,
   never a zero and never a fabricated tier.
6. **Simplify by moving, never by deleting.** Every reading available today
   stays reachable. The guard test in `tests/desk-ui.test.js` ("nothing was
   taken off the GCF Pipeline screen") is kept and its *intent* strengthened —
   see §3.4.

---

## 3. The plan

Five phases. Phases 1 and 2 are the ones that answer the complaint; 3 is the
theory of change; 4 is the layout; 5 is proof. Each phase is shippable alone.

### Phase 1 — Make the record honest (server only, no UI change)

The four defects in §1.3. Do these first: a form generated over a schema that
refuses adaptation projects would generate a form that refuses adaptation
projects.

**1.1 `mitigation` becomes conditional on the stream.** `Joi.when('stream')`:
required for a mitigation project, optional for an adaptation project unless
`isCoBenefit` is set — in which case the baseline and counterfactual are
required again, because a claimed co-benefit is a carbon claim. An existing
record carrying a mitigation block validates unchanged.
*Files:* `domain/record.js`.
*Proof:* a pure adaptation record validates with no mitigation block; a
co-benefit record without a counterfactual is refused naming the co-benefit flag.

**1.2 A null figure carries no tier.** `traced()` refuses `tier` on a
`value: null`; `weakestTier()` and `tracedFigures()` skip a null value; the
intake omits the block rather than sending a fabricated one.
*Proof:* `weakestTier()` on a record where nothing was entered returns `null`,
not `'declared'`.

**1.3 One reader of the sections, not two.** `criteria.js` resolves
`knowledge`, `stakeholders`, and the implementation and sustainability
sub-criteria through the same `sections.best()` helper `readiness.js` uses,
extracted to one function both import.
*Proof:* the §1.3(c) record above, asserted to give the same verdict from both
modules — the test states the two must agree, so this cannot silently happen
again when a ninth section is added.

**1.4 One project, once.** `POST /v1/gcf/pipeline` uses `store.insert()` and
refuses an id already held with `409 DUPLICATE_PROJECT`, naming the project that
holds the code and both ways forward (open it and edit, or choose another code).
`PATCH` remains the way to change a record. The recorder script and the starter
install keep their idempotent upsert — they are curated books, and that is a
different act, which the code will say.
*Proof:* two Records of one code on both stores; the second is a 409 and the
first project is intact.

**Conformance:** four rules added to `domain/conformance.js`, proved by execution.

---

### Phase 2 — One intake, generated from the cycle

This is the answer to *"during the intake those measures are not easy to enter"*.

**2.1 `domain/intake.js` — the form as a derived fact.** For a given
`(stage, stream)`, compose the fields the intake asks, grouped into steps, each
field carrying the requirement id it closes, its clause, its plain-language
help and its vocabulary key. Built **from** `readiness.REQUIREMENTS` plus a
field-metadata map over `record.js`, so a requirement added to the cycle appears
on the form on the same commit. Computes nothing; reads paths and returns a
shape.

**2.2 `GET /v1/gcf/intake/form?stage=&stream=`** serves it, `read` scope,
reference-cached with an ETag like the other reference data. The browser's
`INTAKE()` array — 33 hand-written entries with their help text and clause
knowledge — is deleted and replaced by a render of what the route returned.

**2.3 The intake becomes three steps and about ten fields.**

| Today | After |
|---|---|
| Pre-check, 9 fields | **Step 1 — Is this a GCF project?** The pre-check, unchanged, still stateless, still runnable by a preview visitor. |
| Intake, 33 fields, one column | **Step 2 — The project.** Only what stage 2 needs: code, name, sector, province, stream, results area, ESS category, total cost, GCF ask, and the counterfactual. Ten fields. Then **Record**. |
| The project page's 19 forms, found by scrolling | **Step 3 — What this stage needs.** The project page opens on its readiness checklist, which already exists, with each open item carrying its clause, its owner and an inline form. The other ~23 fields are asked *here*, at the stage that asks for them. |

Nothing is removed. Every field still exists and is still recordable. What
changes is that a sponsor is asked for a barrier analysis when the project
reaches the concept note, not while typing its name.

**2.4 `POST /v1/gcf/pipeline/preview` — the engine's answer before Record.**
The Part A pattern exactly: the same validated body Record takes, through the
same engines, writing nothing and issuing no id. Returns the accreditation gate
verdict, the stage readiness with what is still open, the weakest evidence tier,
and — the useful half — **what would raise it**, read off the requirement list
in the desk's words. A record the schema would refuse says so, with its clause,
*before* the button is pressed. `read` scope, its rule placed before the write
rule because the first match wins.

**2.5 `FormSteps` used in full.** `missing()` to hold Record shut until the
record can be made, `revealMissing()` to open the step that is short,
`flag()` on the fields the preview's refusals name. This is already built and
already proved on the Part A register; it costs no new mechanism.

**2.6 A draft survives a reload.** The step and the entered values are held in
the browser under one key, read *before the first request* — the rule this
codebase has shipped five defects by breaking — and cleared on Record. A draft
is one person's unfinished form; it is never written to the book.

---

### Phase 3 — The theory of change, structured and interpreted

**3.1 `domain/theory-of-change.js`.** The causal chain as facts, in the shape
GCF's own template reads:

- **barriers** → the ones already named on the record, not re-keyed;
- **activities** → what the money buys;
- **outputs** → what the activities produce;
- **outcomes** → the change in behaviour or condition, each linked to the IRMF
  indicator it lands on, so the chain and the logframe cannot disagree;
- **impact** → the results area, already on the record;
- **assumptions** → what must hold for each link, which is the half reviewers
  actually read;
- **evidence** → what supports the assumption.

Closed vocabularies where the template uses one. Optional and backward
compatible; the existing `narrative.theoryOfChange` free text stays and still
counts, through `sections.best()`, so no project loses a fact it held.

**3.2 It is read by the two things that judge a project.** A readiness
requirement at cycle 3 (`theory_of_change`, clause *Concept note B.2*, owner
`dfcc`) and a `paradigmShift` sub-criterion. Recording the chain moves the
checklist and the scorecard — which is the whole difference between a fact the
product holds and a fact the product interprets.

**3.3 The Concept Note package resolves it.** Section B's theory-of-change input
is answered from the structured chain rather than marked external, so the
external worklist — the deliverable most people actually need — shrinks by one
on every project that records it.

**3.4 It is drawn, not listed.** The project page renders the chain as a chain,
each link carrying its assumption and its evidence, absences visible as gaps in
the chain rather than as empty rows. The assessment report prints it. Nothing is
computed in the browser.

**3.5 Proof.** `G-TOC-01…03` proved by execution; the chain recorded from the
screen in the pipeline journey and read back on the next stage's checklist, the
way a risk already is.

---

### Phase 4 — Fewer screens, nothing taken away

**4.1 Seven sub-tabs become three, and Intake stops being a tab.**

| Today | After | Why |
|---|---|---|
| Pipeline | **Pipeline** | The board, the rail, the project. Unchanged. |
| Emissions · The decision · Instruments | **Appraisal** | Three readings of one appraisal of one candidate, each already scoped to the candidate in focus. One panel, three sections. |
| Reporting · Concept Note | **File** | Both answer *what does this pipeline produce for somebody else*. |
| Intake | *(not a tab)* | A **Record a candidate** button on the Pipeline board. A tab you visit once per project is not a tab; it is an action. |

**4.2 The guard test is kept and strengthened.** `tests/desk-ui.test.js` asserts
the seven sub-tab *buttons* exist. Its intent is "nothing was taken off the GCF
Pipeline screen", and a tab id is a weak proxy for that. It is restated to
assert the seven *readings* are still reachable — the content container ids
(`gcfEmissions`, `gcfDecision`, `gcfInstruments`, …) and their routes — which is
a stronger guard than the one it replaces and permits the regrouping. The
`PANELS` list in `tests/gcf-ui.test.js` follows.

**4.3 The project page's 20 cards become the four questions a reviewer asks** —
*Where is it* (cycle, next step, dates), *What does it do* (results, logframe,
theory of change), *How is it paid for* (money, co-financing, instrument,
terms), *Is it ready* (readiness, criteria, safeguards, validation, return
loop). The eight proposal sections sit behind one *Proposal sections* card with
held/partial/missing on its face. Every form keeps its id, so every test and
every walkthrough hand-over keeps working.

**4.4 The nav is left alone.** Four entries is right: the Overview is the
meeting screen, the Pipeline the working screen, the Walkthrough the presenter's,
the Fund Desk is capital and not GCF intake. Nothing to fix here.

---

### Phase 5 — Proof

- Unit tests per phase, on **both stores**, as the suite already requires.
- The §1.3 defects each get a test that fails on today's code — a regression
  test written after the fix proves nothing about the fix.
- Conformance rules for every new fact, **proved by execution** under
  `scripts/conformance-evidence.js`, not merely resolving.
- `tests/gcf-ui.test.js` extends its sweep: no clause, no paragraph reference,
  no field label and no vocabulary list in the browser module.
- `e2e/gcf-pipeline.spec.js` records an **adaptation** project from the screen —
  the journey that is impossible today — moves it a stage, records the theory of
  change, and watches the checklist and the criteria scorecard both move.
- `npm run rehearse:gcf` re-run end to end; the runbook updated for the new
  three-step intake.
- `docs/GCF-PIPELINE-RESEARCH.md` §12 gains an entry per phase, **written before
  the code that acts on it**, as §0 of that document requires.

---

## 4. Order, and what each phase is worth on its own

| Phase | Ships | Worth on its own |
|---|---|---|
| 1 — the record is honest | Server only | Adaptation projects become recordable. Two panels stop disagreeing. A project stops being silently overwritten. **Do this first regardless of the rest.** |
| 2 — the intake is generated | Server + UI | 42 fields before Record becomes ~10. The form can no longer drift from the checklist. |
| 3 — the theory of change | Server + UI | The core of a GCF argument becomes a fact the product asks for, judges and prints. |
| 4 — fewer screens | UI only | 7 sub-tabs → 3; 20 cards → 4 groups. No capability moves. |
| 5 — proof | Tests, docs | The above cannot quietly rot. |

Phase 1 is a day or two and unblocks everything. Phases 2 and 3 are the
substance. Phase 4 is safe to defer and safe to do early — it touches no engine.

---

## 5. What this plan deliberately does not do

- **It does not simplify the standard.** The ten stages, six criteria, four
  evidence tiers, three carbon boundaries and two NDC ledgers stay exactly as
  they are. They are the product.
- **It does not merge the three scopes.** Part A, Part C and GCF remain three
  domains that never import one another. `tests/architecture.test.js` stays.
- **It does not drop a field.** Every one of the 33 intake fields is still
  recordable; 23 of them move to the stage that asks for them.
- **It does not relax a refusal.** The only refusal that changes is the one in
  §1.3(a), which was refusing correct records.
- **It does not put arithmetic in the browser.** The sweeps stay, and Phase 2
  adds one.
