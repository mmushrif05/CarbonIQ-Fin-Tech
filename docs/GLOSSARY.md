# Glossary

Read **§1 first**. There are three different 1–5 scales in this system and
they are not interchangeable; assuming one is the other produces a wrong
regulatory figure that nothing downstream will catch.

---

## 1. The three scales, and why they must not be mixed

| | What it measures | Values | Where |
|---|---|---|---|
| **PCAF Part C data quality** | which *option* the estimate was built from | 1–5, **1 is best** | `pcaf-part-c/domain/data-quality.js` |
| **PCAF Part A data quality** | the same idea, **per asset class** | 1–5, **1 is best** | `pcaf-part-a/domain/` |
| **GCF evidence tier** | how a figure is known, for appraisal | measured · modelled · benchmark · declared | `gcf/domain/record.js` |

**Part C** assigns one score per project, decided by which option was used
(Table 5.3-2, p.58): `1a=1, 1b=2, 2a=2, 2b=3, 3a=4, 3b=5`. It is **not an
average** — not across inputs, not across modules, not across lifecycle stages.

**Part A's mapping is not uniform across asset classes.** Option 2b is score 2
in one class and score 3 in another; Option 3 is score 3 in one and score 4 in
another. There is therefore **no global option→score lookup**: the score
resolves as *(asset class, option) → score* from a table per class. Reusing
Part C's `2b = 3` here is wrong in some classes, silently.

**GCF's tiers are deliberately not numerals.** They are appraisal classes, and
writing them as 1–4 would invite them to be quoted as PCAF scores.

Two more that follow from the same discipline:

- Part A weights the disclosed score by **outstanding amount** (p.128); Part C
  weights by **premium** (Box 6-3, p.107). The two engines must not share a
  weighting function.
- The scale has a **direction**, and it is the point. A score is a category,
  never a mark out of five. Written `3 / 5` it reads as a fraction and inverts
  the meaning for anyone who has not opened the standard. Every rendering is
  `Data quality score: 3 (Option 2b)` with the scale stated beside it, and
  `tests/dq-rendering.test.js` sweeps the whole tree for the inverted form.

---

## 2. Lifecycle modules

The EN 15978 / RICS module letters, which is how a construction emission is
divided up.

| | |
|---|---|
| **A1–A3** | product stage — extracting, transporting and making the materials. Out of scope for PCAF Part C project insurance; this is what Part A attributes for lending. |
| **A4** | transporting the materials to site. Mass × distance × a mode factor. |
| **A5** | construction. **A5.1** pre-construction demolition, **A5.2** site energy, **A5.3** waste. **A5.4** worker transport is excluded, and the exclusion is stated in every report. |
| **B1** | in-use emissions — refrigerant leakage from installed plant. |
| **B4** | replacement — refrigerant re-release when plant is replaced (B4.2 only). |
| **B7** | operational water. |
| **B2, B5, B8** | maintenance, refurbishment, other operational. Beyond PCAF: a voluntary annex, never in the PCAF figure. |

**A5.2 site energy is typically 90%+ of the construction figure.** That is why
a bill-of-quantities change moves the total very little, and why the RICS
default behind it (40 kgCO2e/m²) is the single most material constant in the
system.

### Part C's three tiers, and where each appears

| Tier | Modules | Where |
|---|---|---|
| **Mandatory** | A4 + A5 | `result.rollup.construction` — **the PCAF figure** |
| **Optional** | B1 + B4 + B7 | `result.rollup.useStage` — a separate line, policy-gated, never summed with construction |
| **Beyond PCAF** | B2 + B5 + B8 | `result.beyondPcafAnnex` — voluntary, never in the PCAF figure |

`rollup.js` does not import `beyond-pcaf.js`, so tier 3 cannot reach the
roll-up through the module graph, and a test asserts it.

---

## 3. Scopes, boundaries and the words that look alike

| | |
|---|---|
| **Scope 1 / 2 / 3** | GHG Protocol **ownership** boundaries: direct, purchased energy, everything else. |
| **Category 15** | the scope 3 category financed emissions belong to, **in full**. |
| **IAE** | insurance-associated emissions — PCAF Part C. Always the re/insurer's own scope 3. |
| **Financed emissions** | PCAF Part A. A different attribution against a different denominator, reported separately and never added to IAE. |
| **Attribution** | the share of a project's emissions an institution takes onto its own inventory. Part A: outstanding ÷ (equity + debt). Part C: premium ÷ project cost. |
| **Avoided emissions** | reported **separately** from the scope 1/2/3 inventory and never netted against it (Part A, p.126). |
| **Embodied** | A1–A5 of the asset itself. In the GCF model it is a payback period against the mitigation, never a deduction from it. |
| **Mitigation** | what a project achieves against a counterfactual. Not an attributed emission. |

A5/A4 and B1/B4/B7 are **lifecycle stages**; scope 1/2/3 are **ownership
boundaries**. They are two cuts of the same figures, and
`pcaf-part-c/domain/ghg-scopes.js` maps stage → scope **once**, because
declaring it twice is how a report states a total that its own data-quality
section contradicts.

---

## 4. The insurer's book

| | |
|---|---|
| **BOQ** | bill of quantities — the priced list of materials for a project. Never final: each project holds a series of **revisions** (R1 tender → R2 variation → R3 as-built) and an assessment binds to exactly one. |
| **CAR / EAR** | Contractors' / Erection All Risks — construction-period cover. The policy gate sets `use_stage_years = 0`, so B1/B4/B7 are zero **by scope rule**, not by omission. |
| **IDI** | Inherent Defects Insurance — typically ten years after completion. Runs the use stage over the cover period. |
| **Policy** | lives on the *project*, because one building typically carries CAR through construction and then IDI for ten years. Its **reporting year is its inception year**. |
| **Assessment** | one calculation bound to a policy, a BOQ revision and a reporting year. `draft → under_review → locked`. |
| **Locked** | only a locked assessment enters the disclosure, and a locked assessment is never edited — only superseded by a new version. |
| **Restatement** | a new version that moves a locked figure by at least the settings threshold (default 5%). A reason is required. |
| **Ceded premium** | the part of a premium passed to a reinsurer. Substituted for gross in the data-quality weighting for treaty reinsurance (Box 6-4, p.108). |
| **gifa_m2** | gross internal floor area, in square metres. The denominator of the kgCO2e/m² intensity. |

---

## 5. Lending, scoring and the taxonomy

| | |
|---|---|
| **CRS** | Carbon Finance Score, 0–100, for construction loan risk. `lending/domain/score.js`. Unrelated to any 1–5 scale. |
| **SLL** | sustainability-linked loan. Covenants per LMA/APLMA GLP 2021. |
| **SLGFT** | Sri Lanka Green Finance Taxonomy, May 2022. Activity codes are `{Objective}{MacroSector}.{Activity}` — `M6.3` is new construction. **The taxonomy sets no absolute kgCO2e/m² threshold**; its construction criteria are relative or certification-based. |
| **CBSL** | Central Bank of Sri Lanka — the regulator, and the body that decides compliance. This software screens; it does not find compliance. |
| **Intensity bands** | 520 / 780 kgCO2e/m². Regional judgement rather than a published threshold, which is exactly why they are governed by the baseline registry. |
| **Baseline** | a governed figure, scoped global → country → organisation, released, versioned, and superseded only with a recorded reason. |
| **Pledge** | an institution's own declared commitment, with who stated it and where it can be read. Computed against, and labelled apart from a forecast. |
| **DNSH** | do no significant harm — the taxonomy test that an activity helping one objective does not damage another. |
| **Pareto 80%** | the top 20% of materials driving 80% of emissions, pre-computed by the core engine. |

---

## 6. The GCF pipeline

| | |
|---|---|
| **GCF** | Green Climate Fund. |
| **B.36/10** | the Board decision this work sits under — DFCC Bank's post-accreditation programme. |
| **AE** | accredited entity — the institution that carries a project to the Fund. |
| **NDA** | National Designated Authority — the country's GCF counterpart. |
| **Accreditation gate** | size (micro ≤$10m, small ≤$50m, medium ≤$250m — **nested ceilings, not bands**) and E&S category. A category A project is **excluded**, not down-ranked. |
| **Concept Note** | the short submission that precedes a Funding Proposal. This system lays out the *inputs*; it does not write it. |
| **MCI-1** | GCF Mitigation Core Indicator 1 — tCO2e reduced, avoided **and** removed, together. |
| **IRMF** | the GCF's Integrated Results Management Framework. |
| **FPIC** | free, prior and informed consent. A process with affected communities, evidenced by a project's record — not a document that can be drafted for them. |
| **Reduced / avoided / removal** | which one applies is decided by the **counterfactual**, not by the engine. |
| **NDC 3.0** | Sri Lanka's Nationally Determined Contribution, September 2025. **20.09%** cumulative reduction against BAU over 2026–2035, and **separately** a **4.49%** increase in net removal. Never summed. NDC 3.0 states no net-zero year. |
| **Stream** | mitigation or adaptation. Ranked on different metrics and never merged into one league table: carbon per dollar puts every adaptation project last. |

---

## 7. The capital book and the Fund Desk

| | |
|---|---|
| **EVIC** | enterprise value including cash — the Part A denominator for listed equity. |
| **status** | the bank's position: pipeline · committed · deployed · exited · declined. |
| **delivery** | the asset's own progress: not_started · under_construction · completed. Moves independently of status. |
| **At full commitment** | what the book will carry once every facility is fully drawn. |
| **Carried today** | what it carries against the payments actually made, on outstanding-amount attribution. |
| **Still to arrive** | the difference between the two. The same emissions, not a second inventory. |
| **countsInHeadline** | whether a project's mitigation enters the carbon ranking. Decided from the stream as well as the flag, so one un-ticked box cannot put a mangrove project into a carbon-per-dollar ranking. |
| **Overlay / adjustment** | a value one reader holds, applied over the book on the way into the engine and never written down. Neither a question nor a record. |

---

## 8. The words used about the software itself

| | |
|---|---|
| **measured** | computed from data held here, and traceable to it. |
| **declared** | a fact only the reporting entity can know, recorded by them. |
| **absent** | required by the standard, and not available. Reported as absent with the clause that requires it — never estimated. |
| **provisional** | a shipped value standing in until a governed one is released. Said on every screen that reads it. |
| **traced value** | what every engine function returns: the figure plus its equation, inputs, factors and assumptions. |
| **the seam** | `src/platform/database/store.js` — the one interface every record goes through. |
| **composition root** | one of the four files allowed to wire the domains together. |
| **conformance** | this software follows a published method. It is **not** endorsement: PCAF does not approve, endorse or certify software. |
| **self-declared** | an operating mode. The figures rest on the reporting entity's own baseline and its own values, and neither the tool provider nor Datum Solutions has confirmed them. Every document says so on its face. |
| **verified** | the other operating mode. Every governed value the document reads resolves to a *released* baseline, and the entity has recorded who assured the figures, to what standard and at what level. It is a request rather than an assertion: where either condition is unmet the position resolves back to self-declared and prints the reason. |
| **the operating mode** | which of those two a deployment may claim. It is the **tool provider's** to set (`PUT /v1/assurance/mode`, scope `admin`), never the reporting entity's — an entity that could choose `verified` for itself would be self-declaring by another name. Distinct from the entity's own **assurance declaration** (`PUT /v1/assurance`), which says who audited what. |
