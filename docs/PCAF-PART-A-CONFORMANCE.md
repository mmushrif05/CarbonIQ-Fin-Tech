# PCAF Part A §5.2 — Conformance Statement

> Generated from `src/domains/pcaf-part-a/domain/conformance.js`. Do not edit by hand —
> run `npm run docs:parta-conformance`. Every claim below is checked by
> `tests/pcaf-parta-conformance.test.js`, which fails the build if a rule
> names a file that does not exist or a test that is not real, and each rule is
> re-proved by execution in `docs/CONFORMANCE-EVIDENCE.md`.

**Standard:** PCAF Global GHG Accounting and Reporting Standard — Part A: Financed Emissions, Third Edition (December 2025), §5.2 (business loans and unlisted equity) and Chapter 6

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
| Implemented | 41 |
| Partial | 1 |
| **Total** | **42** |

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

### A-REG-07 — Partial

**Clause:** Register — a half-built lifecycle is worse than none

**Rule.** Nothing publishes from this register yet, so lock() refuses with a 501 naming the step that builds it rather than doing half of a lock-and-supersede.

**Implementation.** src/domains/pcaf-part-a/application/register.js — lock() throws a 501 with the step that builds the lifecycle; the status column sits in migration 0008 so that step needs no migration

**Evidence.** `tests/parta-register.test.js › locking refuses with a 501 rather than doing half of it`

**Limitation.** The lock-and-supersede lifecycle is a later release. It is an absent capability that refuses explicitly, not a disabled one, so nothing can publish from the register in the meantime.

### A-REG-08 — Implemented

**Clause:** Chapter 6 — recalculation and significance

**Rule.** A recomputation reports whether the movement reaches the entity’s own significance threshold: a movement at or above it is a recalculation trigger that, once the lock-and-supersede lifecycle exists, requires a restatement with a recorded reason; below it, the movement is reported but is not a trigger. The threshold judged against is the one the disclosure publishes, not a figure hidden in code.

**Implementation.** src/domains/pcaf-part-a/application/register.js — recompute() reads the entity settings and attaches a significance verdict using src/domains/pcaf-part-a/domain/recalculation.js significanceOf() against the stated threshold

**Evidence.** `tests/parta-register.test.js › a recomputation says whether the movement reaches the significance threshold`

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

## Known limitations, stated plainly

- **A-REG-07** (Partial) — The lock-and-supersede lifecycle is a later release. It is an absent capability that refuses explicitly, not a disabled one, so nothing can publish from the register in the meantime.

## Factor provenance

Every Option 3 sector factor carries a data-quality tier and a named source, and the
shipped rows say they are provisional. The full library is published at
`GET /v1/pcaf/part-a/factors` with the release checksum, and every estimated figure names
the table, version and checksum it was computed on — so a disclosure names the set it
rests on. The sector intensity bands the plausibility check reads are a governed baseline,
not a factor, scoped global → country → organisation and released with a recorded reason.
