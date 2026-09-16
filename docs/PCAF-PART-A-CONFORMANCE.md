# PCAF Part A §5.2 — Conformance Statement

> Generated from `src/domains/pcaf-part-a/domain/conformance.js`. Do not edit by hand —
> run `npm run docs:parta-conformance`. Every claim below is checked by
> `tests/pcaf-parta-conformance.test.js`, which fails the build if a rule
> names a file that does not exist or a test that is not real, and each rule is
> re-proved by execution in `docs/CONFORMANCE-EVIDENCE.md`.

**Standard:** PCAF Global GHG Accounting and Reporting Standard — Part A: Financed Emissions, Third Edition (December 2025), the built asset classes §5.2 (business loans and unlisted equity) and §5.9 (sovereign debt), and Chapter 6

## What this is

Self-declaration of conformance with the published method for the §5.2 asset class, offered with the evidence needed to verify it. Every rule names the code that enforces it and the test that proves it.

This is the §5.2 asset class — business loans and unlisted equity — one input to a
bank’s Chapter 6 financed-emissions disclosure, not the disclosure. It is kept apart
from the Part C matrix because the two scopes never merge and the option-to-score
numerals are not interchangeable between them.

**PCAF does not approve, endorse or certify software or service providers. Nothing in this matrix should be read as claiming that it does. The Third Edition’s asset-class additions have not been reviewed by the GHG Protocol.**

## Summary

| Status | Rules |
|---|---|
| Implemented | 84 |
| **Total** | **84** |

## How to verify any row

1. Open the file named in **Implementation** and read the rule as code.
2. Run the test named in **Evidence**: `npx jest <file> -t "<test name>"`.
3. Reproduce the standard’s own worked example (Tables 5.2-2/5.2-3, p.63):
   `npx jest tests/parta-business-loans.test.js`.

The engine is pure and deterministic — no network, no clock, and no language model in
any arithmetic path — so the same inputs always produce the same figures. A citation
that resolves is not evidence of behaviour, so `docs/CONFORMANCE-EVIDENCE.md` runs each
rule’s own proving test under coverage restricted to the files it cites and records what
actually ran.

## Scope

### A-SCOPE-01 — Implemented

**Clause:** Part A §5.2 (p.55)

**Rule.** The class is on-balance-sheet loans and lines of credit to businesses and equity in unlisted companies. What is not this class — a loan to a government, a known use of proceeds, an off-balance-sheet line, a private-equity fund — is redirected by name to the section that owns it, never assessed here by default.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/classify.js — the Figure 5-1 gate redirects sovereign, use-of-proceeds, off-balance-sheet and fund exposures, each carrying the footnote that governs it

**Evidence.** `tests/parta-business-loans.test.js › the gate (Figure 5-1 and p.55)`

### A-SCOPE-02 — Implemented

**Clause:** Part A §5.2 (p.56)

**Rule.** The borrower’s scope 3 is reported and is disclosed separately from its scope 1 and 2; the two are never summed into one figure.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/lines.js — six reporting lines with scope 3 as its own line; no code path sums it with scope 1 and 2

**Evidence.** `tests/parta-business-loans.test.js › no line is netted against another and none is summed across lines`

### A-SCOPE-03 — Implemented

**Clause:** Part A p.126

**Rule.** Removals and emission credits are reported on their own lines and netted against nothing; the inventory total never absorbs a credit.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/lines.js — removals, credits generated and credits retired are distinct lines, never subtracted from the scope lines

**Evidence.** `tests/parta-business-loans.test.js › no line is netted against another and none is summed across lines`

### A-SCOPE-04 — Implemented

**Clause:** Three scopes never merge (architecture)

**Rule.** Part A, Part C and the GCF pipeline are three domains whose engines never import one another. The option-to-score numerals are not interchangeable across them, so a shared import is the route by which one scope’s scale is quoted as another’s.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/index.js — the §5.2 engine imports only its own domain, src/shared and data/; it has no import path into the Part C or GCF engines

**Evidence.** `tests/architecture.test.js › PCAF Part A, Part C and the GCF pipeline are three domains that never import one another` (proved by the absence of a path)

### A-SCOPE-05 — Implemented

**Clause:** Part A §5.2; GHG Protocol "Built on" mark

**Rule.** The report claims PCAF conformance and never endorsement, and does not blur the six original asset classes’ GHG-Protocol review with the Third Edition additions.

**Implementation.** src/domains/pcaf-part-a/reporting/facts.js — conformanceStatement() states PCAF-conformant, records that PCAF does not approve or certify, and carries the "Built on" mark for this class; report-integrity refuses endorsement language at build

**Evidence.** `tests/parta-report.test.js › a report with endorsement language is refused`

## Classification and attribution

### A-CLASS-01 — Implemented

**Clause:** Part A §5.2, footnote 86 (p.55)

**Rule.** A loan to a listed company is attributed on EVIC; unlisted equity never reaches the EVIC branch. Listed equity and corporate bonds are sent to §5.1 even where the denominator is identical.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/classify.js — the gate selects the EVIC denominator for a listed borrower on a loan, keeps unlisted equity on total equity plus debt, and redirects listed equity and bonds to §5.1

**Evidence.** `tests/parta-business-loans.test.js › a loan to a listed company is attributed on EVIC (footnote 86)`

### A-ATTR-01 — Implemented

**Clause:** Part A §5.2 (p.56)

**Rule.** The numerator is defined twice: a business loan is disbursed debt less repayments; unlisted equity is the share of the investee. A balance that disagrees with disbursed less repayments is refused rather than chosen between.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/numerator.js — the two definitions, each recording its operands; a stated balance inconsistent with disbursed less repayments raises a refusal

**Evidence.** `tests/parta-business-loans.test.js › a balance that disagrees with disbursed less repayments is refused, not picked between`

### A-ATTR-02 — Implemented

**Clause:** Part A §5.2 — attribution factor

**Rule.** The attribution factor is the numerator over the denominator and cannot exceed 1: a holding larger than the company, or an attribution factor above 1, is refused rather than capped; a numerator and denominator on different dates is not an attribution factor.

**Implementation.** src/domains/pcaf-part-a/domain/corporate/denominator.js and business-loans/denominator.js — the denominator per instrument, with the coherence guards that refuse an out-of-range or date-mismatched factor

**Evidence.** `tests/parta-business-loans.test.js › an attribution factor above 1 is refused rather than capped`

## Data quality — the option-to-score mapping

### A-OPT-01 — Implemented

**Clause:** Part A §5.2, Table 5.2-1 (p.60)

**Rule.** Data quality is scored by the option used to estimate the emissions, read from Table 5.2-1, and this table belongs to this asset class alone — it is a different table object from §5.1’s even though the two carry the same labels at the same scores.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/options.js binds src/domains/pcaf-part-a/domain/corporate/options.js to Table 5.2-1 (data/pcaf-parta/dq-business-loans-unlisted-equity.json); the machinery is shared and the table is not, so asking §5.1’s table here is impossible rather than discouraged

**Evidence.** `tests/parta-business-loans.test.js › the option-to-score mapping is the one printed on p.60`

### A-OPT-02 — Implemented

**Clause:** Part A §5.2 fn 87 (p.61)

**Rule.** The option is read from the basis of the emissions figure, never chosen from a list; a figure relayed by a data provider is Option 1 only where the provider is relaying what the company reported. A better option than the evidence supports needs a justification, which is recorded beside the score.

**Implementation.** src/domains/pcaf-part-a/domain/corporate/options.js — deriveOptions() maps each scope’s basis to an option; reconcileClaim() records a claimed override with its justification and refuses one with none

**Evidence.** `tests/parta-business-loans.test.js › a better option than the evidence supports needs a justification, and is then recorded`

### A-OPT-03 — Implemented

**Clause:** Data-quality rendering (the scale has a direction)

**Rule.** A score is a category, never a mark out of five: 1 is the highest quality and 5 the lowest, and it is rendered with the scale beside it, never as a fraction.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/lines.js and reporting/sections.js render the score as a category with the scale stated; tests/dq-rendering.test.js sweeps the tree for the inverted form

**Evidence.** `tests/parta-business-loans.test.js › a score renders as a category with the scale beside it, never as a fraction`

## Estimation and the sector factor library

### A-EST-01 — Implemented

**Clause:** Part A §5.2 (p.62)

**Rule.** Option 3 with no factor supplied takes the held sector factor for the counterparty’s sector — per unit of revenue for 3a and 3c, per unit of assets for 3b — and the result names the release it rests on. A factor supplied on the request stands and names no held set.

**Implementation.** src/domains/pcaf-part-a/domain/sector-factors.js resolves the held factor per basis; src/domains/pcaf-part-a/domain/business-loans/estimate.js applies it and records factorRelease (table, version, rows, checksum)

**Evidence.** `tests/parta-business-loans.test.js › Option 3b with no factor supplied takes the held factor per unit of assets, and the result names the set`

### A-EST-02 — Implemented

**Clause:** Part A §5.2 (p.62)

**Rule.** A sector not held is a refusal naming the vocabulary and the two ways forward, never the nearest sector; a factor held in one currency is never applied to an exposure in another; a free-text sector mapped by name records the mapping on the trace rather than silently.

**Implementation.** src/domains/pcaf-part-a/domain/sector-factors.js — a closed ISIC-based vocabulary; an unheld sector refuses, a currency mismatch refuses, and a name match is recorded on the trace

**Evidence.** `tests/parta-business-loans.test.js › a sector that is not held is a refusal naming the two ways forward, never the nearest sector`

### A-EST-03 — Implemented

**Clause:** Part A Box 6.1-5 (p.167)

**Rule.** An economic factor whose vintage sits at or beyond the threshold behind the reporting year, applied without a deflator, is a finding; with a deflator applied it is not.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/checks.js — factorVintage() raises FACTOR_VINTAGE_STALE where the vintage is stale and no inflation was applied, and the threshold is settable per request

**Evidence.** `tests/parta-business-loans.test.js › an economic factor four years old, applied without a deflator, is a finding; with a deflator it is not`

## The six reporting lines

### A-LINE-01 — Implemented

**Clause:** Part A §5.2, Tables 5.2-2/5.2-3 (p.63)

**Rule.** The engine reproduces the standard’s own worked example across the six lines, and each attribution factor is the share the table states.

**Implementation.** src/domains/pcaf-part-a/domain/corporate/lines.js and business-loans/lines.js — the six lines, computed from attribution × the borrower’s reported or estimated emissions

**Evidence.** `tests/parta-business-loans.test.js › the six portfolio lines reproduce Table 5.2-3 exactly`

## The third verdict, and the checks a standard cannot give

### A-FIND-01 — Implemented

**Clause:** CarbonIQ — the engine blocks a claim, not a number

**Rule.** A correct figure at a correctly lower score is a finding, not a refusal: it changes no figure, stops nothing and travels into the report. With no financial data at all, Option 3b still produces a figure at score 5. Every finding names what would clear it.

**Implementation.** src/domains/pcaf-part-a/domain/corporate/findings.js — the material/advisory finding, refused at construction if it names no remedy; the refusal is reserved for an input that makes the arithmetic wrong or the figure uncitable

**Evidence.** `tests/parta-business-loans.test.js › with no financial data at all, Option 3b still produces a figure at score 5`

### A-FIND-02 — Implemented

**Clause:** Part A footnote 71 (year-end balance)

**Rule.** Only the year-end balance counts, which is the rule; but a revolving facility far from its own annual average reports less than the bank financed, so it raises footnote 71 and still assesses. Where no average is held the check says it did not run rather than passing.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/checks.js — yearEndFluctuation() raises FN71_YEAR_END_FLUCTUATION for a revolving facility away from its average and FN71_AVERAGE_NOT_HELD where the average is absent

**Evidence.** `tests/parta-business-loans.test.js › a revolving facility far from its own average raises footnote 71 and still assesses`

### A-FIND-03 — Implemented

**Clause:** CarbonIQ — a check that had nothing to check does not pass

**Rule.** The intensity plausibility check compares against the sector band; a thousand-fold divergence is material and the figure still stands, and where no band is held the check says so rather than passing silently. The finding cites the band version it was checked against.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/checks.js — intensityPlausibility() raises INTENSITY_OUTSIDE_SECTOR_BAND when a band is held and INTENSITY_BAND_NOT_HELD when it is not, and cites the band version on the finding (the band’s resolution from the baseline registry is A-REG-06)

**Evidence.** `tests/parta-business-loans.test.js › the intensity finding cites the band it was checked against`

### A-FIND-04 — Implemented

**Clause:** CarbonIQ thresholds (stated on the finding, settable per request)

**Rule.** An emissions figure years behind the reporting year is reported, not rejected, with the lag as a finding; a denominator larger than the balance sheet it came from is a finding; a missing scope 3 is material and never reported as zero.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/checks.js — emissionsLag(), denominatorCoherence() and the scope-3 absence finding, each carrying the CarbonIQ threshold it used

**Evidence.** `tests/parta-business-loans.test.js › a missing scope 3 is material and is never reported as zero`

## The exposure register

### A-REG-01 — Implemented

**Clause:** Register (migration 0008) — both halves kept

**Rule.** A row holds the input the bank keyed and the result the engine computed, with the instant and the standard edition beside them; an exposure the standard refuses never reaches the book, and a change reruns the engine rather than editing a figure directly.

**Implementation.** src/domains/pcaf-part-a/application/register.js — record() runs the engine and stores input and result together; a refusal is not written, and change() reruns rather than editing

**Evidence.** `tests/parta-register.test.js › an exposure is recorded with both halves and the standard it rests on`

### A-REG-02 — Implemented

**Clause:** Register (migration 0009) — one loan, once

**Rule.** The same facility reference in the same reporting year is refused, naming the existing exposure; uniqueness is on the loan, never the counterparty, and a loan with no reference carries no constraint. A partial unique index closes the race the service cannot.

**Implementation.** src/domains/pcaf-part-a/application/register.js — a 409 DUPLICATE_LOAN naming the existing exposure, restated in the database by a partial unique index on (org, year, account_number)

**Evidence.** `tests/parta-register.test.js › the same facility reference in the same year is refused, naming the existing exposure`

### A-REG-03 — Implemented

**Clause:** Register — a recomputation is a decision, not a read

**Rule.** A recomputation reruns the engine over the stored input and reports what moved across all seven lines and both scores; nothing recomputes on read, and the note names the engine or a factor as the cause, never what the bank recorded.

**Implementation.** src/domains/pcaf-part-a/application/register.js — recompute() compares every line and both scores with before, after and whether each moved; a plain read returns the stored result untouched

**Evidence.** `tests/parta-register.test.js › the movement carries all seven lines and the two scores, and the headline is still where it was`

### A-REG-04 — Implemented

**Clause:** DCL Part A (p.124) — coverage over the whole book

**Rule.** Coverage is the assessed outstanding over the entity’s stated total loans and investments; without a stated total it is absent with what it needs, a book of zero is refused rather than read as full coverage, and a year has one denominator.

**Implementation.** src/domains/pcaf-part-a/application/register.js — the book total is a separate stated fact (parta_book); coverage is computed against it or reported absent, and a zero book is refused

**Evidence.** `tests/parta-register.test.js › without a stated book total it is absent with what it needs`

### A-REG-05 — Implemented

**Clause:** Register — the roll-up reads a projection

**Rule.** The reporting-year position is read from a stored projection computed at write time, and the projected roll-up equals the whole-record roll-up figure for figure; every projected field is a path into the record, never a shape of its own, so the in-memory store projects the same set with no column.

**Implementation.** src/domains/pcaf-part-a/application/register.js — position() reads the projection; the field list is declared once in src/platform/database/collections.js and the SQL function and the registry name the same fields

**Evidence.** `tests/parta-register.test.js › the projected roll-up equals the whole-record roll-up, figure for figure`

### A-REG-06 — Implemented

**Clause:** Register — the band is resolved at call time

**Rule.** The sector intensity band comes from the baseline registry and is applied on the way into the engine, never written into the stored input; a released band changes what a recomputation reports, and a band supplied on the request stands over the registry and says so.

**Implementation.** src/domains/pcaf-part-a/application/plausibility.js — withSectorBand() resolves the most specific released band and records the version on the finding; the band is never persisted into the input

**Evidence.** `tests/parta-register.test.js › a band the organisation releases changes what recompute reports, and the note says findings moved`

### A-REG-07 — Implemented

**Clause:** Register — one version of an approved row, never two

**Rule.** There is no supersede on this register: an approved exposure has exactly one version, a change to it is refused rather than versioned, and reopening it records the reason on the same row. The stub that once refused with a 501 is gone with the lifecycle that replaced it.

**Implementation.** src/domains/pcaf-part-a/application/register-lifecycle.js — assertNotApproved(); src/domains/pcaf-part-a/application/register.js — update(), recompute() and remove() refuse an approved exposure, and no supersede path exists

**Evidence.** `tests/parta-approval.test.js › an approved exposure is frozen until reopened, and the consolidated position and checklist say how many stand approved`

### A-REG-08 — Implemented

**Clause:** Chapter 6 — recalculation and significance

**Rule.** A recomputation reports whether the movement reaches the entity’s own significance threshold: a movement at or above it is a recalculation trigger that, once the lock-and-supersede lifecycle exists, requires a restatement with a recorded reason; below it, the movement is reported but is not a trigger. The threshold judged against is the one the disclosure publishes, not a figure hidden in code.

**Implementation.** src/domains/pcaf-part-a/application/register.js — recompute() reads the entity settings and attaches a significance verdict using src/domains/pcaf-part-a/domain/recalculation.js significanceOf() against the stated threshold

**Evidence.** `tests/parta-register.test.js › a recomputation says whether the movement reaches the significance threshold`

### A-REG-09 — Implemented

**Clause:** Chapter 6 — one position per asset class (DCL p.128; §5.1–§5.5 tables)

**Rule.** One exposure register holds every built Part A class, and each row names the class whose engine computed it. The reporting-year position is rolled up per class, on that class’s own data-quality table, label and groupings, from one read of the projection; no total and no score is ever summed or averaged across classes, because the option-to-score tables differ between classes and a mean of two categories from two tables means nothing.

**Implementation.** src/domains/pcaf-part-a/application/register-classes.js — each class’s engine, preparation and adapter onto the one register shape; src/domains/pcaf-part-a/application/register.js — position() filters the projection to one class and positions() rolls each class alone; src/domains/pcaf-part-a/domain/business-loans/portfolio.js — rollUp() bound per class through opts

**Evidence.** `tests/parta-register-classes.test.js › the position is per class, from one read, and a class the year holds nothing of is a 409 naming what it does hold`

### A-REG-10 — Implemented

**Clause:** §5.4 (p.79) / §5.5 — energy statistics per square metre of floor area

**Rule.** A floor area arrives with the unit it was measured in and is converted to square metres once, in the engine, with the exact factor (1 ft = 0.3048 m); the trace carries the area as keyed beside the square metres it became. A land unit — perch, acre, hectare — is refused by name, because the intensity is per square metre of floor and the extent of the plot says nothing about the building on it. No conversion lives in the browser.

**Implementation.** src/domains/pcaf-part-a/domain/real-estate/area.js — floorAreaM2(); src/domains/pcaf-part-a/domain/real-estate/index.js — the area resolved once and both forms refused together; src/domains/pcaf-part-a/domain/real-estate/energy.js — areaTrace() on the Option 2a/2b trace

**Evidence.** `tests/parta-register-classes.test.js › an office keyed at 10,763.91 ft² is the 1,000 m² office, figure for figure, and the option is derived`

### A-REG-11 — Implemented

**Clause:** Chapter 6 — a document states the class it reports

**Rule.** The per-exposure §5.2 document refuses a row of another class by name rather than printing it under §5.2 clauses; the row still reaches the consolidated disclosure and its register annex, which names each row’s class and section.

**Implementation.** src/domains/pcaf-part-a/application/parta-report.js — exposureReport() refuses with REPORT_NOT_BUILT_FOR_CLASS; src/domains/pcaf-part-a/application/parta-consolidated.js — registerRows() over every register class

**Evidence.** `tests/parta-register-classes.test.js › the per-exposure §5.2 report refuses a row of another class by name; the consolidated register carries it`

### A-REG-12 — Implemented

**Clause:** ISAE 3000 §12(a); ISO 14064-3 §5.2 — the responsible party stands behind the figures

**Rule.** An exposure moves recorded → under review → approved through one state machine, one step at a time; approving needs the lock scope, a different authority from recording; every move is dated and attributed on the exposure’s own trail; reopening an approved exposure requires a recorded reason.

**Implementation.** src/domains/pcaf-part-a/application/register-lifecycle.js — move(), TRANSITIONS, withMove(); src/domains/pcaf-part-a/application/register.js — setStatus(); src/platform/auth/scopes.js — a status of approved resolves to the lock scope

**Evidence.** `tests/parta-approval.test.js › an exposure moves recorded → under review → approved, attributed and dated, and reopening needs a reason`

### A-REG-13 — Implemented

**Clause:** ISAE 3000 §12(a) — a figure the entity has stood behind does not move underneath the disclosure

**Rule.** An approved exposure is frozen: it cannot be changed, recomputed or removed until it is reopened, and a changed input restarts review. The consolidated position counts approval per class and in total, names what is still unapproved among the items outstanding, and the checklist answers No while any exposure is unapproved.

**Implementation.** src/domains/pcaf-part-a/application/register-lifecycle.js — assertNotApproved(), approvalOf(); src/domains/pcaf-part-a/application/register.js — update(), recompute() and remove() refuse an approved exposure; src/domains/pcaf-part-a/application/parta-consolidated.js — approval per class and in total; src/domains/pcaf-part-a/reporting/consolidated/checklist.js — APR-1

**Evidence.** `tests/parta-approval.test.js › an approved exposure is frozen until reopened, and the consolidated position and checklist say how many stand approved`

## The disclosed score and the improvement plan

### A-DQ-01 — Implemented

**Clause:** Part A Box 6.1-6 (pp.167–168), p.128

**Rule.** The disclosed data-quality score is weighted by outstanding amount, with scope 3 weighted separately from scope 1 and 2. This is not how Part C weights it (by premium), so the two engines never share a weighting function.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/portfolio.js — the disclosed score is Σ(outstanding × score) ÷ Σ(outstanding), scope 3 apart, and names its basis

**Evidence.** `tests/parta-business-loans.test.js › the disclosed score is weighted by outstanding amount and names its basis`

### A-DQ-02 — Implemented

**Clause:** Part A (p.56)

**Rule.** Financial-sector borrowers are rolled up separately from the rest of the book, as PCAF recommends.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/portfolio.js — financial-sector borrowers form their own group in the roll-up

**Evidence.** `tests/parta-business-loans.test.js › financial-sector borrowers are rolled up apart, as PCAF recommends`

### A-DQ-03 — Implemented

**Clause:** CarbonIQ — a score is a measurement, a plan is a task list

**Rule.** The improvement plan is ordered by what each step is worth — outstanding × score points above the target — not by how many rows it touches, and every projected figure is a scenario run through the disclosure’s own weighting and never presented as the reported score.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/portfolio.js — the plan groups findings by the sentence that clears them and orders option bands by outstanding × points above target; scenario figures are marked as scenarios

**Evidence.** `tests/parta-business-loans.test.js › the plan is ordered by what each step is worth, not by how many rows it touches`

### A-DQ-04 — Implemented

**Clause:** Comparability — a position of zero is a different claim

**Rule.** An empty book is refused rather than rendered as a position of zero: "we measured nothing carbon-intensive" is a different claim from "we have not measured yet". The register makes the same refusal for a reporting year with no exposures, and the disclosure route answers it as a 409 (A-REPORT-09).

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/portfolio.js — rollUp() refuses an empty book rather than returning a total of zero

**Evidence.** `tests/parta-business-loans.test.js › an empty book is refused rather than rendered as a position of zero`

## Recalculation and significance

### A-RECALC-01 — Implemented

**Clause:** Chapter 6 — recalculation and significance

**Rule.** The reporting entity’s recalculation protocol — a base year, a significance threshold and the triggers that force a recalculation — is a "shall". It is held as the entity’s own settings, and the base year is null until the entity sets one, because a base year is a claim about history and belongs to the entity, not to its software.

**Implementation.** src/domains/pcaf-part-a/application/parta-settings.js — getSettings()/saveSettings() over an org-wide parta_settings record (re-exported through register.js); src/domains/pcaf-part-a/domain/recalculation.js holds the default triggers and the significance test

**Evidence.** `tests/parta-register.test.js › the recalculation protocol is the entity’s own settings, base year null until set`

## The disclosure and the per-exposure report

### A-MV-01 — Implemented

**Clause:** §5.6 Table 5.6-1 (p.94); Annex Table 10.1-6

**Rule.** The motor-vehicle option-to-score table is its own: 1a and 1b both score 1 — the one Part A table where two options do — 2a scores 2, 2b 3, 3a 4 and 3b 5. The option is derived per vehicle from the data actually supplied, never chosen from a list, and no other class’s table is substituted.

**Implementation.** data/pcaf-parta/dq-motor-vehicles.json loaded by src/domains/pcaf-part-a/domain/reference.js; src/domains/pcaf-part-a/domain/motor-vehicles/index.js — assessVehicle() derives the option from fuel consumed, efficiency basis and distance basis

**Evidence.** `tests/parta-motor-vehicles.test.js › two options score 1, and the rest are 2a→2, 2b→3, 3a→4, 3b→5 — the table is its own`

### A-MV-02 — Implemented

**Clause:** §5.6 fn 146 (p.94)

**Rule.** A "local" distance statistic is the province, state or small-country level, so a Sri-Lanka-wide annual-km figure is local: make/model efficiency read off the registration certificate with the registry’s Sri Lankan distance baseline is Option 2a, score 2; a regional statistic is 2b. The statistic’s vintage and provenance travel on the trace.

**Implementation.** src/domains/pcaf-part-a/application/vehicle-factors.js — resolves vehicle_annual_distance_km from the baseline registry; src/domains/pcaf-part-a/domain/motor-vehicles/index.js — the registry’s figure is taken as a local statistic and named with its scope and version

**Evidence.** `tests/parta-motor-vehicles.test.js › make/model efficiency × the Sri-Lanka-wide statistic is Option 2a, score 2 — local under fn 146`

### A-MV-03 — Implemented

**Clause:** §5.6 (p.93) — combination of options

**Rule.** Where a borrower’s vehicles are assessed under different options the borrower’s score is the lowest data quality in the mix — the one class where the standard states a combination rule — and the mix is printed beside the score rather than averaged into it.

**Implementation.** src/domains/pcaf-part-a/domain/motor-vehicles/index.js — assessMotorVehicles() takes the worst vehicle’s option for the facility and carries the mix and the rule on dataQuality

**Evidence.** `tests/parta-motor-vehicles.test.js › a borrower’s vehicles under different options carry the lowest quality in the mix (p.93)`

### A-MV-04 — Implemented

**Clause:** §5.6 (p.91) — attribution; (p.96) — hybrids and electric vehicles

**Rule.** Attribution is outstanding over the total value at origination; where that value is unknown 100 % attribution is assumed, the standard’s own default, and the trace says the default was taken. A non-plug-in hybrid burns petrol only; a plug-in with no manufacturer usage split is 100 % combustion; an electric vehicle’s electricity is scope 2 on the grid factor in force.

**Implementation.** src/domains/pcaf-part-a/domain/motor-vehicles/index.js — the assumed-100pct denominator state and the electricShare rule in assessVehicle()

**Evidence.** `tests/parta-motor-vehicles.test.js › the value at origination unknown is 100 % attribution, the standard’s default, and the trace says so (p.91)`

### A-REPORT-01 — Implemented

**Clause:** Part A Chapter 6 (pp.160–174)

**Rule.** The disclosure is built from one content model in the order Chapter 6 reads, rendered to PDF and Word by one renderer shared with Part C without either domain importing the other.

**Implementation.** src/domains/pcaf-part-a/reporting/sections.js builds the content model; src/platform/reporting/report-standard/ renders it, theme injected as a parameter so Part C’s output stays byte-identical

**Evidence.** `tests/parta-report.test.js › the annual disclosure reads in Chapter 6 order`

### A-REPORT-02 — Implemented

**Clause:** Part A §5.2 (p.56); p.126

**Rule.** In the disclosure, scope 3 is a separate line from scope 1 and 2 and is never summed with it, and removals and credits are netted against nothing.

**Implementation.** src/domains/pcaf-part-a/reporting/sections.js — the absolute-emissions section carries scope 3 as its own line and states that no row nets a credit or a removal and no row sums scope 1 and 2 with scope 3

**Evidence.** `tests/parta-report.test.js › scope 3 is a separate line and nothing is netted`

### A-REPORT-03 — Implemented

**Clause:** DCL Part A (p.124)

**Rule.** Coverage is the assessed outstanding over the entity’s stated total loans and investments; where the total is unstated it is reported absent, not assumed.

**Implementation.** src/domains/pcaf-part-a/reporting/facts.js — coverageStatement() states the percentage against the whole book or reports it absent with what it needs

**Evidence.** `tests/parta-report.test.js › coverage is a percentage of the stated book, or absent`

### A-REPORT-04 — Implemented

**Clause:** Part A Box 6.1-6 (pp.167–168)

**Rule.** The disclosed data-quality score is rendered as a category with the 1–5 scale and its direction stated, scope 3 apart, and never as a fraction.

**Implementation.** src/domains/pcaf-part-a/reporting/sections.js — the data-quality section states that 1 is the highest quality and 5 the lowest and renders no score as a mark out of five

**Evidence.** `tests/parta-report.test.js › the weighted score is a category with the scale stated`

### A-REPORT-05 — Implemented

**Clause:** Part A §5.2 (p.57); factor manifest

**Rule.** The factor set the figures rest on is named in the report with a version, a status and a checksum; a provisional table says so.

**Implementation.** src/domains/pcaf-part-a/reporting/model.js — Annex A prints the factorRelease from src/domains/pcaf-part-a/domain/sector-factors.js: table, version, rows used and SHA-256

**Evidence.** `tests/parta-report.test.js › the factor set is named with a checksum`

### A-REPORT-06 — Implemented

**Clause:** Part A Chapter 6 (p.160); SLFRS S2 §29(a)

**Rule.** The completed checklist is answered from the report and covers the §5.2 asset class only, so it can fail and can never reach a hundred per cent — this report is one input to a Chapter 6 disclosure, not the entity’s own gross scope 1/2/3 inventory.

**Implementation.** src/domains/pcaf-part-a/reporting/checklist.js — completeChecklist() answers each item from the report and holds the entity-inventory item (INV-1) to No by rule, so the checklist cannot be complete

**Evidence.** `tests/parta-report.test.js › the checklist is answered from the report and cannot reach 100%`

### A-REPORT-07 — Implemented

**Clause:** report-integrity; PCAF conformance language

**Rule.** The document claims PCAF conformance and never endorsement; a report carrying forbidden language is refused at build.

**Implementation.** src/domains/pcaf-part-a/reporting/model.js — buildStandardModel() scans for endorsement language via src/shared/report-integrity.js and throws before a document can be built

**Evidence.** `tests/parta-report.test.js › a report with endorsement language is refused`

### A-REPORT-08 — Implemented

**Clause:** The engine does every arithmetic operation

**Rule.** The report reads figures the register already holds and recomputes none of them; no language model computes a figure that reaches the document.

**Implementation.** src/domains/pcaf-part-a/application/parta-report.js — annualDisclosure() and exposureReport() read the register’s stored position and result and arrange them; no arithmetic path runs here

**Evidence.** `tests/parta-report.test.js › every figure is one the register returned`

### A-REPORT-09 — Implemented

**Clause:** pdf-response; delivery

**Rule.** A document is collected in full and checked to be a well-formed PDF before it is sent, and a reporting year with no exposures is a 409, never a document of zeros.

**Implementation.** src/domains/pcaf-part-a/interface/routes/register.js delivers via src/platform/reporting/pdf-response.js; annualDisclosure refuses an empty year with a 409

**Evidence.** `tests/parta-report-api.test.js › a well-formed PDF is delivered and an empty year is a 409`

### A-REPORT-10 — Implemented

**Clause:** Chapter 6 — recalculation and significance

**Rule.** The disclosure prints the entity’s recalculation protocol — base year, significance threshold and triggers — from its settings, and where no base year is set it says so on the page rather than implying the current year.

**Implementation.** src/domains/pcaf-part-a/reporting/sections.js — recalculationSection() prints the base year (or "Not yet stated"), the threshold and the triggers, with an Open item callout when no base year is set

**Evidence.** `tests/parta-report.test.js › the recalculation section prints the entity’s protocol and says so when no base year is set`

### SOV-ATTR-01 — Implemented

**Clause:** Part A §5.9 (p.144); Annex 10.3 (pp.201–204)

**Rule.** The attribution factor is the exposure in international USD over the sovereign’s PPP-adjusted GDP in international USD — never equity plus debt. There is no cap, and a factor above 1 is refused as an input error: a single institution’s holding cannot exceed a nation’s output. Debt alone is a poor denominator (the 1,369× distortion), so output stands in for enterprise value.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/attribution.js — sovereignAttributionFactor divides exposure by PPP-GDP and refuses a factor above 1

**Evidence.** `tests/parta-sovereign.test.js › the attribution factor is exposure ÷ PPP-adjusted GDP, not equity plus debt`

### SOV-ATTR-02 — Implemented

**Clause:** Part A §5.9; Table 10.3-2 (p.202)

**Rule.** The engine reproduces the standard’s own worked example: $1M of Singapore’s debt attributes 106 tCO2e and $1M of Hong Kong’s 91 tCO2e, from the excluding-LULUCF territorial emissions over PPP-GDP.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/index.js — assessSovereign over data/pcaf-parta/sovereign/dataset.json

**Evidence.** `tests/parta-sovereign.test.js › $1M to Singapore attributes 106 tCO2e`

### SOV-LULUCF — Implemented

**Clause:** Part A §5.9 (p.141)

**Rule.** Scope 1 is domestic territorial (production) emissions, reported both including and excluding LULUCF, and the two are never summed — they are the same emissions on two boundaries. The excluding-LULUCF line is the headline; where an including-LULUCF figure is not held it is reported absent, not assumed equal.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/index.js and src/domains/pcaf-part-a/domain/sovereign/portfolio.js — scope 1 carried and rolled up on each boundary separately, the including-LULUCF sum partial with a held-count and never added to the excluding-LULUCF sum

**Evidence.** `tests/parta-sovereign-register.test.js › scope 1 is summed on both boundaries and never added together`

### SOV-SCOPE23 — Implemented

**Clause:** Part A §5.9 (p.141)

**Rule.** Scope 2 (imported grid energy) and scope 3 (non-energy imports) are §5.9 shoulds, reported absent rather than zero where not held; scope 3 is reported apart from scope 1 and 2 and never summed into it.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/index.js — scope 2 and 3 returned as a stated absence when no figure is held, scope 3 kept as its own line

**Evidence.** `tests/parta-sovereign-report-golden.test.js › the whole disclosure matches the committed golden`

### SOV-DQ-TABLE — Implemented

**Clause:** Part A Table 5.9-6 (p.147)

**Rule.** Data quality is scored from Table 5.9-6 alone — 1a→1, 1b→2, 2→3, 3a→4, 3b→5 — which has no Option 2b and no Option 3c. The sovereign table is held apart from every other class’s and cannot be substituted for one: the numerals mean different things.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/options.js over data/pcaf-parta/dq-sovereign.json — the source basis maps to the option and the option to the score

**Evidence.** `tests/parta-sovereign-data.test.js › the option-to-score mapping is the sovereign table and no other`

### SOV-DQ-WEIGHT — Implemented

**Clause:** PCAF Disclosure Checklist Part A (p.128)

**Rule.** The disclosed data-quality score is one score, weighted by outstanding amount — never Part C’s premium weighting. A holding carrying no score is excluded from the weighting, not counted as zero.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/portfolio.js uses src/domains/pcaf-part-a/domain/data-quality.js weightedByOutstanding

**Evidence.** `tests/parta-sovereign-register.test.js › the disclosed score is weighted by outstanding amount`

### SOV-COVERAGE — Implemented

**Clause:** PCAF Disclosure Checklist Part A (p.124)

**Rule.** Coverage is assessed outstanding over the reporting entity’s whole book, or reported absent with what it needs — never a percentage of a book nobody stated. The book total is the shared parta_book, not a sovereign-specific figure.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/portfolio.js and src/domains/pcaf-part-a/application/sovereign-register.js — coverage against the shared book total or absent with a remedy

**Evidence.** `tests/parta-sovereign-register.test.js › coverage is a percentage of the stated book, or absent`

### SOV-CHECK-PROXY — Implemented

**Clause:** Part A Table 5.9-6 (p.147); CarbonIQ

**Rule.** A figure resting on another country’s inventory (Option 3b, a proxy) raises a material finding — it refuses nothing and changes no figure, but a reader of the number is told the figure is a proxy.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/checks.js — proxyCountry() fires from the resolved Option 3b

**Evidence.** `tests/parta-sovereign-checks.test.js › an Option 3b figure is flagged material as resting on another country`

### SOV-CHECK-LAG — Implemented

**Clause:** Part A ch.4 (p.31); Table 10.3-4 (pp.205–206); CarbonIQ threshold

**Rule.** Where the emissions year sits at or beyond a threshold behind the reporting year a finding fires. PCAF permits the lag and EDGAR’s own series runs four years behind, so the threshold is CarbonIQ’s and says so on the finding; it is settable per request.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/checks.js — emissionsLag() with a CarbonIQ-owned, settable threshold

**Evidence.** `tests/parta-sovereign-checks.test.js › Singapore raises the emissions-lag and one-sided-LULUCF findings`

### SOV-CHECK-INTENSITY — Implemented

**Clause:** Part A Annex 10.3 (pp.201–204); CarbonIQ threshold

**Rule.** A production intensity (scope 1 excl LULUCF ÷ PPP-GDP) outside a plausible band raises a finding — the guardrail against the very distortion PPP-GDP exists to remove, where a denominator or the emissions are in the wrong units. The band is CarbonIQ’s and settable.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/checks.js — intensityPlausibility() against a settable band

**Evidence.** `tests/parta-sovereign-checks.test.js › a denominator in the wrong units produces an implausible intensity`

### SOV-CHECK-INDEP — Implemented

**Clause:** CarbonIQ (the GCF independent-path rule)

**Rule.** Where a second source is supplied the engine recomputes and reports the divergence rather than averaging it away; where none is supplied it says the cross-check could not run rather than passing silently.

**Implementation.** src/domains/pcaf-part-a/domain/sovereign/checks.js — independentSource() reports SOVEREIGN_SOURCE_DIVERGENCE or SOVEREIGN_NO_INDEPENDENT_SOURCE

**Evidence.** `tests/parta-sovereign-checks.test.js › a diverging second source is reported, not averaged away`

### SOV-REGISTER — Implemented

**Clause:** CarbonIQ; the §5.2 register (migrations 0008/0009)

**Rule.** The register keeps both the input keyed and the result computed and recomputes nothing on read; one bond is recorded once per year (a 409 and a partial unique index on the facility reference).

**Implementation.** src/domains/pcaf-part-a/application/sovereign-register.js and migrations/0011_parta_sovereign_exposures.sql — a partial unique index on (org, year, account_number) and a 409 DUPLICATE_SOVEREIGN_HOLDING

**Evidence.** `tests/parta-sovereign-register.test.js › one bond once — a repeated reference in a year is a 409`

### SOV-PROJECTION — Implemented

**Clause:** CarbonIQ (the partc_assessments.rollup discipline)

**Rule.** The roll-up reads a stored projection rather than the whole record, and the projected roll-up equals the whole-record roll-up figure for figure on either store.

**Implementation.** src/domains/pcaf-part-a/application/sovereign-register.js and src/domains/pcaf-part-a/domain/sovereign/portfolio.js — the projection the position rolls up from

**Evidence.** `tests/parta-sovereign-register.test.js › the position rolled from the projection matches the whole-record roll-up figure for figure`

### SOV-EMPTY — Implemented

**Clause:** PCAF Disclosure Checklist Part A (p.124)

**Rule.** A reporting year with no sovereign exposures is refused with a 409 rather than rendered as a position of zero — an empty book and an unmeasured one are different claims.

**Implementation.** src/domains/pcaf-part-a/application/sovereign-register.js — position() throws EMPTY_SOVEREIGN_YEAR (409) on a year with no rows

**Evidence.** `tests/parta-sovereign-register.test.js › a reporting year with no exposures is a 409, not a position of zero`

### SOV-REPORT — Implemented

**Clause:** Part A Chapter 6 (pp.160–174); Annex 10.2 (pp.199–200)

**Rule.** The §5.9 disclosure is one content model in the order Chapter 6 reads, rendered by the platform report standard, with scope 1 on both LULUCF boundaries never summed, the outstanding-weighted score, the Annex 10.2 table by sovereign, and the checklist answered from the report so it can fail.

**Implementation.** src/domains/pcaf-part-a/reporting/sovereign/{facts,sections,model,checklist,report}.js — one document model over the sovereign position, rendered through src/platform/reporting/report-standard

**Evidence.** `tests/parta-sovereign-report-golden.test.js › the whole disclosure matches the committed golden`

### SOV-REPORT-INV — Implemented

**Clause:** Part A ch.6 (p.160); SLFRS S2 §29(a)

**Rule.** The completed checklist can never reach a hundred per cent: the entity-inventory item is answered No with the reason, because this report covers the §5.9 asset class, one input to a Chapter 6 disclosure, not the disclosure.

**Implementation.** src/domains/pcaf-part-a/reporting/sovereign/checklist.js — the INV-1 item is always answered No with its reason

**Evidence.** `tests/parta-sovereign-report-golden.test.js › the disclosure is a document, not an empty file`

### SOV-SCALE — Implemented

**Clause:** Part A Table 5.9-6 (p.147); docs/GLOSSARY.md §1

**Rule.** A data-quality score is a category, not a mark out of five: the scale is stated wherever a score is shown, and no rendering writes "n / 5".

**Implementation.** data/pcaf-parta/dq-sovereign.json states the scale, and src/domains/pcaf-part-a/reporting/sovereign/sections.js prints it beside every score

**Evidence.** `tests/parta-sovereign-data.test.js › the scale states 1 is the highest quality and is never a fraction`

### A-DOC-01 — Implemented

**Clause:** Part A ch.6 (p.161); GHG Protocol Corporate Standard ch.3

**Rule.** The reporting entity’s legal name, consolidation approach, organisational boundary, fiscal year-end and GWP basis are the entity’s own statements, printed as stated or as "Not stated"; nothing is defaulted, and the checklist answers No where one is missing.

**Implementation.** src/domains/pcaf-part-a/application/parta-settings.js — the entity facts on the org-wide settings, every one null by default; src/domains/pcaf-part-a/reporting/entity.js — the entity block with its gaps; src/domains/pcaf-part-a/reporting/common-sections.js — the section that prints it

**Evidence.** `tests/parta-report-golden.test.js › an entity that has stated nothing answers No on the governance items`

### A-DOC-02 — Implemented

**Clause:** ISAE 3000 §12(a); ISO 14064-3 §5.2

**Rule.** The responsible party — who prepared and who approved the disclosure, with the approval date — is named on the face of the document, and the checklist answers No where it is not.

**Implementation.** src/domains/pcaf-part-a/reporting/entity.js — the responsible-party lines; src/platform/reporting/report-standard/theme/pdf-writer.js — drawn on the cover; src/domains/pcaf-part-a/reporting/checklist.js — GOV-2

**Evidence.** `tests/parta-report-golden.test.js › the cover names the reporting entity, not a re/insurer, and carries the responsible party and the identity`

### A-DOC-03 — Implemented

**Clause:** ISAE 3000 §69; ISO 14064-3 §9

**Rule.** Every document carries an identity: a reference derived from its content, the build that produced it and a SHA-256 over the canonical facts — so the same position rendered twice is one reference and a changed figure is another, and a filed copy can be matched.

**Implementation.** src/domains/pcaf-part-a/reporting/identity.js — the content hash, the reference and the build

**Evidence.** `tests/parta-report-golden.test.js › the reference is derived from the content: the same position twice is one reference, a changed figure another`

### A-DOC-04 — Implemented

**Clause:** Part A ch.6 (p.161)

**Rule.** A bank’s financed-emissions document names a reporting entity, never a re/insurer; the shared renderer takes the label from the model, and Part C’s documents are unchanged.

**Implementation.** src/platform/reporting/report-standard/render-docx.js — the entity label from the model, defaulting to the re/insurer wording; src/domains/pcaf-part-a/reporting/facts.js — the Part A label

**Evidence.** `tests/parta-report-golden.test.js › the cover names the reporting entity, not a re/insurer, and carries the responsible party and the identity`

### A-DOC-05 — Implemented

**Clause:** ISO 14064-3 §6.1.3; ISAE 3000 §48

**Rule.** The annual disclosure carries one register row per recorded exposure, from the same stored projection the totals were rolled up from, each resolving to its stored record — the audit trail a verifier samples from.

**Implementation.** src/domains/pcaf-part-a/application/register.js — rows(); src/domains/pcaf-part-a/reporting/facts.js — registerRows; src/domains/pcaf-part-a/reporting/common-sections.js — the register annex

**Evidence.** `tests/parta-report-golden.test.js › the exposure register is the audit trail: one row per recorded exposure, each resolving to a stored id`

### A-DOC-06 — Implemented

**Clause:** SLFRS S2 §29(a)(vi); Part A ch.6 (p.163)

**Rule.** Financed scope 1 and scope 2 are printed apart as well as combined, and the two sum to the combined line; scope 3 stays a separate line.

**Implementation.** src/domains/pcaf-part-a/reporting/facts.js — lines() carries scope1 and scope2; src/domains/pcaf-part-a/reporting/sections.js — the absolute table

**Evidence.** `tests/parta-report-golden.test.js › scope 1 and scope 2 are printed apart and sum to the combined line`

### A-DOC-07 — Implemented

**Clause:** DCL p.127

**Rule.** The annual disclosure prints an economic emission intensity across the class and per sector, computed by the engine in the roll-up and never in the report.

**Implementation.** src/domains/pcaf-part-a/domain/business-loans/portfolio.js — economicIntensity_tCO2e_per_M in group(); src/domains/pcaf-part-a/reporting/sections.js — the intensity figure

**Evidence.** `tests/parta-report-golden.test.js › the disclosure prints a portfolio intensity the engine computed, and every sector carries one`

### A-DOC-08 — Implemented

**Clause:** Part A Box 6.1-5 (p.167)

**Rule.** The factor annex names every table with its whole SHA-256 and prints every row of the set, so a disclosed tonne can be tied to a factor value; the word "undefined" never reaches a document.

**Implementation.** src/domains/pcaf-part-a/reporting/facts.js — factorRows; src/domains/pcaf-part-a/reporting/model.js — Annex A

**Evidence.** `tests/parta-report-golden.test.js › the factor annex carries the whole checksum and every row of the set`

### A-DOC-09 — Implemented

**Clause:** Part A ch.6 (p.164)

**Rule.** The per-exposure report reads the same entity facts and the same recalculation protocol as the annual disclosure, so two documents from one book cannot contradict each other.

**Implementation.** src/domains/pcaf-part-a/application/parta-report.js — shared() hands both documents the settings and the assurance declaration

**Evidence.** `tests/parta-report-golden.test.js › the per-exposure report reads the same entity and the same recalculation protocol as the disclosure`

### A-DOC-10 — Implemented

**Clause:** Part A ch.6 (pp.160–169)

**Rule.** No checklist item is a constant: every answer is read from a fact the document prints, so the checklist can fail — and the entity-inventory item is No by design on every document.

**Implementation.** src/domains/pcaf-part-a/reporting/checklist.js — every test reads the facts

**Evidence.** `tests/parta-report-golden.test.js › no item is a constant: every test reads the facts`

### A-DOC-16 — Implemented

**Clause:** Part A ch.6 (pp.160–169); §5.9

**Rule.** The sovereign checklist follows the same rule: no item is a constant, every answer is read from a fact the document prints, and the entity-inventory item is No by design.

**Implementation.** src/domains/pcaf-part-a/reporting/sovereign/checklist.js — every test reads the facts

**Evidence.** `tests/parta-sovereign-report-golden.test.js › the checklist reads the facts: the governance items are Yes here and INV-1 is No`

### A-DOC-11 — Implemented

**Clause:** Part A ch.6 (p.162)

**Rule.** The consolidated disclosure lists every Part A asset class — recorded, not recorded for the year, engine built but no register, or not built — each with a reason; the entity’s stated reason overrides the system’s and never the reverse.

**Implementation.** src/domains/pcaf-part-a/application/parta-consolidated.js — position(), the class rows and their reasons

**Evidence.** `tests/parta-consolidated.test.js › every Part A asset class is a row — recorded, not recorded, engine only, or not built — each with a reason`

### A-DOC-12 — Implemented

**Clause:** Part A §5.2 (p.56); §5.9 (p.141); p.126

**Rule.** The consolidated headline sums each recorded class on the boundary its section reports — §5.2 scope 1 and 2, §5.9 scope 1 excluding LULUCF — and names them; scope 3 is summed apart and never into it.

**Implementation.** src/domains/pcaf-part-a/application/parta-consolidated.js — totals

**Evidence.** `tests/parta-consolidated.test.js › the headline sums each class on its own boundary and names them; scope 3 is summed apart`

### A-DOC-13 — Implemented

**Clause:** DCL p.128; Part A Box 6.1-6; Table 5.9-6

**Rule.** The data-quality score is one per class, weighted within it, and never averaged across classes that score on different tables.

**Implementation.** src/domains/pcaf-part-a/application/parta-consolidated.js — dataQuality.byClass

**Evidence.** `tests/parta-consolidated.test.js › the data-quality score is one per class, never averaged across classes`

### A-DOC-14 — Implemented

**Clause:** DCL p.124

**Rule.** Consolidated coverage sums outstanding only across the classes in the book’s currency and names the class it excludes; nothing converts a currency at a rate the system does not hold.

**Implementation.** src/domains/pcaf-part-a/application/parta-consolidated.js — coverage

**Evidence.** `tests/parta-consolidated.test.js › coverage sums only the classes in the book’s currency and names the class it excludes`

### A-DOC-15 — Implemented

**Clause:** Part A ch.6 (p.160)

**Rule.** The consolidated document is served as JSON, PDF and Word, the register across classes as CSV, and a year with nothing recorded in any class is a 409 on the document.

**Implementation.** src/domains/pcaf-part-a/interface/routes/consolidated.js — the three routes; src/domains/pcaf-part-a/reporting/consolidated/report.js — the barrel

**Evidence.** `tests/parta-consolidated.test.js › GET /financed-emissions/:year answers the position; the disclosure answers JSON, PDF and Word; the register answers CSV`

## Known limitations, stated plainly


## Factor provenance

Every Option 3 sector factor carries a data-quality tier and a named source, and the
shipped rows say they are provisional. The full library is published at
`GET /v1/pcaf/part-a/factors` with the release checksum, and every estimated figure names
the table, version and checksum it was computed on — so a disclosure names the set it
rests on. The sector intensity bands the plausibility check reads are a governed baseline,
not a factor, scoped global → country → organisation and released with a recorded reason.
