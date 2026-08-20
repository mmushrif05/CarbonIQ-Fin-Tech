# PCAF Part C — Conformance Statement

> Generated from `services/pcaf-partc/conformance.js`. Do not edit by hand —
> run `npm run docs:conformance`. Every claim below is checked by
> `tests/pcaf-partc-conformance.test.js`, which fails the build if a rule
> names a file that does not exist or a test that is not real.

**Standard:** PCAF Global GHG Accounting and Reporting Standard — Part C (insurance-associated emissions), v2

## What this is

Self-declaration of conformance with the published method, offered with the evidence needed to verify it. Every rule names the code that enforces it and the test that proves it.

**PCAF does not approve, endorse or certify software or service providers. Nothing in this matrix should be read as claiming that it does.**

## Summary

| Status | Rules |
|---|---|
| Implemented | 34 |
| Partial | 3 |
| Excluded | 1 |
| **Total** | **38** |

## How to verify any row

1. Open the file named in **Implementation** and read the rule as code.
2. Run the test named in **Evidence**: `npx jest <file> -t "<test name>"`.
3. Reproduce the headline figures yourself: `npx jest tests/pcaf-partc-engine.test.js`.

The engine is pure and deterministic — no network, no clock, and no language
model in any arithmetic path — so the same inputs always produce the same
disclosure. `tests/pcaf-partc-e2e.test.js` re-derives the A4 figure from the
published audit trail alone, which is the check an assurance provider would run.

## Scope

### C-SCOPE-01 — Implemented

**Clause:** Part C v2 §5.3

**Rule.** A4 and A5 (construction, scope 1 and 2) shall be reported for all project-insurance lines. This is the core figure.

**Implementation.** services/pcaf-partc/rollup.js — construction = A4 + A5, reported as the PCAF figure

**Evidence.** `tests/pcaf-partc-engine.test.js › end-to-end roll-up › workbook path reproduces the reference construction figure and IAE`

### C-SCOPE-02 — Implemented

**Clause:** Part C v2 §5.3

**Rule.** B1, B4 and B7 (use stage) are optional. Where computed they shall be reported separately and never merged into the A4+A5 figure.

**Implementation.** services/pcaf-partc/rollup.js — useStage is a distinct traced value; no code path sums it with construction

**Evidence.** `tests/pcaf-partc-engine.test.js › IDI policy runs the use stage and reports it separately`

### C-SCOPE-03 — Excluded

**Clause:** Part C v2 §5.3

**Rule.** A1-A3 embodied emissions are out of scope for project insurance.

**Implementation.** Not computed. services/pcaf.js handles A1-A3 for lending and is a separate service with no import path into the Part C engine.

**Evidence.** `tests/pcaf-partc-registers.test.js › separation from the lending PCAF service › the Part C engine does not import the lending PCAF service`

**Limitation.** Reserved for a future release (PCAF proposal PR-02b). Kept as an absent capability rather than a disabled one, so it cannot leak into the figure.

### C-SCOPE-04 — Implemented

**Clause:** Part C v2 §5.3, Fig 5.3-1

**Rule.** Policy type determines the life-cycle stage: CAR and EAR map to construction; IDI/Decennial and Property map to the use stage.

**Implementation.** services/pcaf-partc/policy-gate.js — useStageYears() returns 0 for CAR/EAR and the cover period for IDI/Property; an unrecognised type fails closed to construction-only

**Evidence.** `tests/pcaf-partc-engine.test.js › policy gate (4 tests)`

### C-SCOPE-05 — Implemented

**Clause:** Part C v2 §5.3

**Rule.** Where the policy carries no use stage, the use-stage modules are zero by scope rule rather than by omission, and the distinction is disclosed.

**Implementation.** services/pcaf-partc/{b1-refrigerant,b4-replacement,b7-water}.js — each returns an explicitly traced zero carrying a GATED assumption naming the policy type

**Evidence.** `tests/pcaf-partc-engine.test.js › CAR policy zeroes every use-stage module`

### C-SCOPE-06 — Implemented

**Clause:** RICS WLCA 2nd ed / EN 15978 (beyond PCAF)

**Rule.** Voluntary whole-life modules (B2, B5, B8) are outside PCAF scope and shall never enter the PCAF figure.

**Implementation.** services/pcaf-partc/beyond-pcaf.js is not imported by rollup.js — the constraint is enforced by the module graph, not by convention. Results surface only under result.beyondPcafAnnex.

**Evidence.** `tests/pcaf-partc-engine.test.js › scope wall › the roll-up module does not import the Beyond-PCAF module; and › the Beyond-PCAF annex never enters the PCAF figure`

## Attribution

### C-ATTR-01 — Implemented

**Clause:** Part C v2 — attribution

**Rule.** The insurer attributes emissions by premium over the relevant denominator: project cost for project-specific cover, revenue for annual cover, ceded over gross for treaty.

**Implementation.** services/pcaf-partc/attribution.js — one basis per policy type, each recording its equation and both operands

**Evidence.** `tests/pcaf-partc-engine.test.js › attribution (4 tests)`

### C-ATTR-02 — Implemented

**Clause:** Part C v2 — double counting

**Rule.** Reinsurance ceded may be deducted so the same exposure is not counted twice along the insurance chain.

**Implementation.** services/pcaf-partc/attribution.js — net-premium mode deducts ceded premium and records an ATTR_NET_PREMIUM assumption naming the amount

**Evidence.** `tests/pcaf-partc-engine.test.js › attribution › net-premium mode deducts reinsurance ceded`

### C-ATTR-03 — Partial

**Clause:** Part C v2 — aggregation

**Rule.** Attribution is applied per project and the results summed. Premiums, costs and emissions are never pooled before attribution.

**Implementation.** services/pcaf-partc/index.js — runPartC() computes a single policy against a single project; no cross-project pooling exists in the engine

**Evidence.** `tests/pcaf-partc-lifecycle.test.js › run store › runs are scoped per organisation`

**Limitation.** Portfolio aggregation across a book of policies is not yet built. The per-project rule it must respect is established and enforced; the aggregation layer is a later release.

## Method

### C-METH-01 — Implemented

**Clause:** RICS WLCA 2nd ed — A4

**Rule.** Transport emissions are mass times distance times a mode-specific emission factor, summed across materials.

**Implementation.** services/pcaf-partc/a4-transport.js — a4Material() and a4Total()

**Evidence.** `tests/pcaf-partc-engine.test.js › A4 transport (5 tests) — reproduces the reference workbook to 5 decimal places`

### C-METH-02 — Partial

**Clause:** RICS WLCA 2nd ed — A5

**Rule.** Construction-stage emissions comprise A5.1 pre-construction demolition, A5.2 site energy and A5.3 waste.

**Implementation.** services/pcaf-partc/a5-construction.js — the three sub-modules, summed by a5Total()

**Evidence.** `tests/pcaf-partc-engine.test.js › A5 construction (6 tests)`

**Limitation.** A5.4 worker transport is excluded, and the exclusion is stated in the module and in every report.

### C-METH-03 — Implemented

**Clause:** RICS WLCA 2nd ed, Table 18

**Rule.** Waste rates follow RICS Table 18 by product category, with a documented default where a product is unlisted.

**Implementation.** data/factors/waste-rates-rics-t18.json — all 28 categories; an unlisted product takes the 5% default and is flagged as a fallback

**Evidence.** `tests/pcaf-partc-engine.test.js › A5 construction › PVC falls back to the RICS 5% default and says so`

### C-METH-04 — Implemented

**Clause:** IPCC 2019 Refinement Table 7.9; IPCC AR5

**Rule.** Refrigerant emissions are charge times annual leak rate times GWP times years, with leak rate by equipment type and GWP on a stated basis.

**Implementation.** services/pcaf-partc/b1-refrigerant.js; factors in data/factors/refrigerant-{leak,gwp}.json. GWP basis is AR5 100-year and is stated in the factor table.

**Evidence.** `tests/pcaf-partc-engine.test.js › use-stage modules › B1 reproduces the workbook`

### C-METH-05 — Implemented

**Clause:** CIBSE TM65

**Rule.** Refrigerant charge is taken from the actual charge where known, then cooling capacity, then a floor-area screen.

**Implementation.** services/pcaf-partc/b1-refrigerant.js — three-step priority; each fallback records its basis, and the per-m2 screen is marked a literature assumption rather than a standard

**Evidence.** `tests/pcaf-partc-engine.test.js › use-stage modules › B1 prefers an actual charge over the per-m2 benchmark`

### C-METH-06 — Partial

**Clause:** RICS WLCA 2nd ed §5.2.4

**Rule.** Replacements are counted like-for-like within the cover window, excluding the original installation.

**Implementation.** services/pcaf-partc/b4-replacement.js — replacementCount() = max(ceil(years / life) − 1, 0)

**Evidence.** `tests/pcaf-partc-engine.test.js › use-stage modules › replacement counting excludes the original install`

**Limitation.** B4 covers HVAC refrigerant re-release (B4.2) only. Component-by-component replacement (B4.1) is not included, and every report states the restriction.

### C-METH-07 — Implemented

**Clause:** Part C v2 — operational water

**Rule.** Operational water covers supply and wastewater treatment. Water heating belongs to B6 and is excluded.

**Implementation.** services/pcaf-partc/b7-water.js — supply and wastewater factors held separately and summed, so either may be localised independently; the B6 exclusion is stated in the module output

**Evidence.** `tests/pcaf-partc-engine.test.js › use-stage modules › B7 reproduces the workbook`

### C-METH-08 — Implemented

**Clause:** GHG Protocol / US EPA

**Rule.** A de-minimis threshold may be reported, but nothing is excluded on that basis without disclosure.

**Implementation.** services/pcaf-partc/b1-refrigerant.js — deMinimisCheck() reports the ratio and always returns excluded: false

**Evidence.** `tests/pcaf-partc-engine.test.js › end-to-end roll-up › de-minimis is reported for information and excludes nothing`

## Data quality and disclosure

### C-DQ-01 — Implemented

**Clause:** PCAF data quality scoring

**Rule.** Every assessment discloses a data quality option and score on the 1 (best) to 5 (worst) scale.

**Implementation.** services/pcaf-partc/data-quality.js — option-to-score map; the MVP reports Option 2b (physical activity data with secondary factors) = score 3

**Evidence.** `tests/pcaf-partc-api.test.js › assessment › the response carries all three registers`

### C-DQ-02 — Implemented

**Clause:** PCAF — factor transparency

**Rule.** Every emission factor carries a data-quality tier and a named source.

**Implementation.** data/factors/*.json — every row carries tier and reference; services/pcaf-partc/factors.js refuses to return an anonymous value, and GET /v1/pcaf/part-c/factors publishes the whole store

**Evidence.** `tests/pcaf-partc-registers.test.js › factor store › every factor row carries a tier and a reference`

### C-DQ-03 — Implemented

**Clause:** PCAF — limitations

**Rule.** Assumptions and limitations are disclosed rather than buried.

**Implementation.** services/partc-registers.js — the Assumptions and Limitations Register is derived from the traced-value tree, so it cannot disagree with the arithmetic. Reported as Annex A in both PDF and Word.

**Evidence.** `tests/pcaf-partc-registers.test.js › registers (5 tests)`

### C-DQ-04 — Implemented

**Clause:** PCAF — conformance language

**Rule.** An assessment may claim conformance with the method. It may not claim PCAF approval, endorsement or certification.

**Implementation.** services/pcaf-partc/data-quality.js — containsForbiddenLanguage(); services/partc-reports.js refuses to build a report containing endorsement language

**Evidence.** `tests/pcaf-partc-registers.test.js › disclosure language guard (3 tests)`

### C-DQ-05 — Implemented

**Clause:** Audit and assurance

**Rule.** Every figure traces to its equation, its inputs and the factors it consulted.

**Implementation.** services/pcaf-partc/provenance.js — every engine function returns a traced value; the audit trail in Annex C is generated by walking that tree rather than narrated after the fact

**Evidence.** `tests/pcaf-partc-registers.test.js › registers › every audit trail entry carries an equation`

### C-DQ-07 — Implemented

**Clause:** Part C Table 5.3-2 (p.58)

**Rule.** One data-quality score per project, assigned by which option was used to estimate the emissions. It is not an average across inputs, modules or lifecycle stages.

**Implementation.** services/pcaf-partc/data-quality.js maps the six options to their scores and infers the option from the data the run actually consumed, with an explicit override honoured; services/pcaf-partc/dq-scoring.js reports that score and computes no average of its own.

**Evidence.** `tests/pcaf-partc-dq-scoring.test.js › The Fisheries run › is Option 2b with score 3 — a whole number, not an average`

### C-DQ-08 — Implemented

**Clause:** Part C Table 5.3-2 (p.58); Chapter 6 (p.106)

**Rule.** No numeric data-quality score is reported for optional lifetime (use stage) emissions, because the standard publishes no table for them; the basis is described instead.

**Implementation.** services/pcaf-partc/dq-scoring.js useStageBasis() returns a reason and a set of qualitative statements and no number at all. Nothing downstream — API, roll-up, report or UI — reconstructs one.

**Evidence.** `tests/pcaf-partc-dq-scoring.test.js › The use stage is never scored › no numeric use-stage score exists anywhere in the scoring output`

### C-DQ-09 — Implemented

**Clause:** PCAF — the disclosure statement is generated, not written

**Rule.** The disclosure statement is produced from the execution: standard, section, both figures, the PCAF option, both scores and the limitations the run actually carries.

**Implementation.** services/pcaf-partc/dq-scoring.js disclosureStatement() — every clause is read from the result, and limitations are named from the inputs that scored 4 or worse, so a supplied actual removes its own limitation

**Evidence.** `tests/pcaf-partc-dq-scoring.test.js › the generated disclosure statement › a supplied actual removes its limitation from the statement`

### C-DQ-06 — Implemented

**Clause:** Reproducibility

**Rule.** The same inputs produce the same disclosure.

**Implementation.** services/pcaf-partc/ is pure and deterministic: no network, no clock in any calculation, no LLM in any arithmetic path. Claude classifies, extracts and writes; the engine computes.

**Evidence.** `tests/pcaf-partc-e2e.test.js › reproducibility › the same inputs produce an identical disclosure`

### C-RPT-01 — Implemented

**Clause:** Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)

**Rule.** The insured’s scope 1 and 2 are reported combined as the absolute figure, with the insured’s scope 3 reported separately from them.

**Implementation.** services/pcaf-partc/ghg-scopes.js maps each lifecycle stage to a GHG scope once; the emissions split and the data-quality split both read that map, so the two cuts cannot disagree. The report renders both in section 4.

**Evidence.** `tests/partc-report-standard.test.js › The insured GHG scope split › reconciles exactly to the construction figure it is split from`

### C-RPT-02 — Implemented

**Clause:** Part C ch.6, DATA AND DATA QUALITY (p.106)

**Rule.** The disclosed data-quality score is weighted by outstanding premium (Box 6-3, p.107), reported to two decimals; ceded premium is substituted for treaty reinsurance (Box 6-4, p.108).

**Implementation.** services/partc-portfolio.js _premiumWeighted() produces the disclosed score from each policy’s own option score. No emission-weighted score exists to be quoted by mistake. A policy with no score is excluded from the weighting rather than counted as zero.

**Evidence.** `tests/partc-portfolio.test.js › Portfolio — the disclosed data-quality score › is premium-weighted, to two decimals, and says which scale it is on`

### C-RPT-03 — Implemented

**Clause:** Part C ch.6, RECALCULATION (p.99)

**Rule.** A base-year recalculation protocol and a significance threshold are stated by the reporting entity and printed in every report.

**Implementation.** schemas/partc-registry.js holds baseYear, significanceThresholdPct and recalculationTriggers on the entity’s settings, defaulted to the GHG Protocol Scope 3 triggers; section 7 of every report prints them, and says plainly when no base year has been set rather than implying one.

**Evidence.** `tests/partc-report-output.test.js › Part C report — the PDF is readable › the recalculation protocol and the significance threshold are present`

### C-RPT-04 — Implemented

**Clause:** Part C ch.6

**Rule.** The report answers every disclosure requirement of Chapter 6, or states a justification for each it does not.

**Implementation.** services/partc-checklist.js completes the checklist from the same facts the sections render, so an item cannot answer Yes to something the document does not contain; anything but Yes carries its reason, and the completed checklist is the final annex of both documents.

**Evidence.** `tests/partc-report-standard.test.js › The completed disclosure checklist › it cannot claim what the report does not contain`

### C-RPT-05 — Implemented

**Clause:** Part C ch.6, GASES AND UNITS (pp.103, 61)

**Rule.** The seven Kyoto Protocol gases are accounted for, and the GWP basis names its time horizon and IPCC assessment report.

**Implementation.** services/partc-report-standard.js KYOTO_GASES names all seven with where each arises in a construction value chain; section 3 states the 100-year horizon and IPCC AR5, and discloses the AR4/AR5 difference for R-410A rather than reconciling it silently.

**Evidence.** `tests/partc-report-output.test.js › Part C report — the PDF is readable › the seven Kyoto gases and the GWP basis are named`

### C-RPT-06 — Implemented

**Clause:** Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)

**Rule.** Financed emissions and insurance-associated emissions are reported separately and never combined.

**Implementation.** No code path sums the two: financed emissions are produced by services/pcaf.js for lending and have no import path into the Part C engine. Section 4 of every report states the separation explicitly.

**Evidence.** `tests/partc-report-standard.test.js › The section model › states that financed emissions are never combined with these`

### C-DISC-01 — Implemented

**Clause:** Part C v2 §6 — reporting

**Rule.** The reported position shall state the coverage it rests on. A total drawn from part of the book shall not be presented as the whole book.

**Implementation.** services/partc-disclosure.js — coverage.statement names assessed and in-force policy counts in section 3, and every unassessed policy is listed by name

**Evidence.** `tests/partc-disclosure.test.js › What the disclosure states plainly › coverage is stated as a fraction of the book, not left to be inferred`

### C-DISC-02 — Implemented

**Clause:** Part C v2 §6 — reporting

**Rule.** A disclosure shall report a position it holds. A reporting year with no locked assessment is not a position of zero.

**Implementation.** services/partc-disclosure.js — buildAnnualDisclosure throws NOTHING_TO_DISCLOSE (409) when the year holds no locked assessment

**Evidence.** `tests/partc-disclosure.test.js › What the disclosure refuses to do › a year with no locked assessment is refused, not reported as zero`

### C-DISC-03 — Implemented

**Clause:** Part C v2 §6 — reporting

**Rule.** Every disclosed figure shall be traceable to the assessment, bill of quantities and lock behind it.

**Implementation.** services/partc-disclosure.js — Annex C records assessment id, version, BOQ revision, lock time and locking organisation for every row in section 5

**Evidence.** `tests/partc-disclosure.test.js › What the disclosure states plainly › every disclosed figure traces to an assessment, a BOQ revision and a lock`

### C-REST-01 — Implemented

**Clause:** Part C v2 §6 — restatement

**Rule.** Where a previously reported figure has changed, both the figure as previously reported and the figure as restated shall be disclosed, with the reason.

**Implementation.** services/partc-comparatives.js — restatementsFor() reports asPreviouslyReported/asRestated per policy with the reason recorded at lock time; compare() carries both bases into the following year

**Evidence.** `tests/partc-comparatives.test.js › Restatement register › a locked version that moves the figure materially is disclosed on both bases`

### C-REST-02 — Implemented

**Clause:** Part C v2 §6 — restatement

**Rule.** Only a figure that has entered a disclosure can be restated. An unapproved calculation does not change a reported position.

**Implementation.** services/partc-comparatives.js — the register reads locked assessments only, so a draft that would move the figure has not moved it

**Evidence.** `tests/partc-comparatives.test.js › Restatement register › a draft that would move the figure has not moved it`

### C-REST-03 — Implemented

**Clause:** Comparability

**Rule.** A movement between annual totals shall not be presented as a change in performance where the underwritten book itself changed.

**Implementation.** services/partc-comparatives.js — a policy is reported in its inception year, so each year covers different policies; compare() states this with the movement and reports intensity (kgCO2e/m² insured) and emissions-weighted data quality as the comparable measures

**Evidence.** `tests/partc-comparatives.test.js › Prior-year comparison › a movement in the total is never described as a performance change`

## Known limitations, stated plainly

- **C-SCOPE-03** (Excluded) — Reserved for a future release (PCAF proposal PR-02b). Kept as an absent capability rather than a disabled one, so it cannot leak into the figure.
- **C-ATTR-03** (Partial) — Portfolio aggregation across a book of policies is not yet built. The per-project rule it must respect is established and enforced; the aggregation layer is a later release.
- **C-METH-02** (Partial) — A5.4 worker transport is excluded, and the exclusion is stated in the module and in every report.
- **C-METH-06** (Partial) — B4 covers HVAC refrigerant re-release (B4.2) only. Component-by-component replacement (B4.1) is not included, and every report states the restriction.

## Factor provenance

Every emission factor carries a data-quality tier (Local, Regional, Global) and a
named source. The full store is published at `GET /v1/pcaf/part-c/factors`, and
every assessment reports the factors it used, the gaps it fell back on, and which
gap carried the most emissions — which is what turns "our factors should be
localised" into a ranked, evidence-based research list.
