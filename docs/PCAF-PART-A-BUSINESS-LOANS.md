# PCAF Part A §5.2 — business loans and unlisted equity

The largest class on a Sri Lankan commercial bank's book, and the one where
almost no borrower reports its emissions. What is built, what it refuses, what
it merely records, and how to drive it.

Method: PCAF (2025), *Part A: Financed Emissions*, Third Edition, §5.2
(pp.55–65), Annex 10.1 and Chapter 6. Every page cite below is the printed page
of that document. The study behind this is `docs/PCAF-PART-A-RESEARCH.md` §2.2,
which is the reference guide this class was built from.

---

## 1. The shape

```
                                                 scope    stores
POST /v1/pcaf/part-a/business-loans/assess       read     nothing
POST /v1/pcaf/part-a/business-loans/portfolio    read     nothing
GET  /v1/pcaf/part-a/reference                   read     —

GET    /v1/pcaf/part-a/years                     read     —
GET    /v1/pcaf/part-a/book/:year                read     —
PUT    /v1/pcaf/part-a/book                      write    the book total
GET    /v1/pcaf/part-a/exposures?reportingYear=  read     —
POST   /v1/pcaf/part-a/exposures                 write    one exposure
GET    /v1/pcaf/part-a/exposures/:id             read     —
PUT    /v1/pcaf/part-a/exposures/:id             write    replaces the input, reruns the engine
POST   /v1/pcaf/part-a/exposures/:id/recompute   write    reruns on the same input
DELETE /v1/pcaf/part-a/exposures/:id             write    —
GET    /v1/pcaf/part-a/position/:year            read     —
GET    /v1/pcaf/part-a/storage                   read     —
```

**The two surfaces need different scopes and that is not a detail.** The engine
routes compute and store nothing, so a read-only key may ask them. The register
writes — it is the book a disclosure is built from — so it needs `write`. The
two rules sit in that order in `scopes.js` because the first match wins, and
the broad "Part A engine, stateless" rule would otherwise have handed a
read-only key the ability to record exposures.

```
application/register.js      the register: record, change, recompute, the position
infrastructure/store.js      the two collections behind the seam
domain/business-loans/
  classify.js    the Figure 5-1 gate, and which denominator applies
  numerator.js   the outstanding amount, which this chapter defines twice
  checks.js      what the data says about itself
  index.js       the engine
  portfolio.js   the book, and what to fix first
  denominator.js · options.js · lines.js · estimate.js   bindings of domain/corporate/
domain/corporate/   the machinery §5.1 and §5.2 share, bound per chapter
  denominator.js · options.js · lines.js · estimate.js · findings.js
```

§5.1 and §5.2 carry the same seven options at the same seven scores and the
same two denominators under different footnote numbers. The logic is therefore
shared and the **table and the citations are not**: each class passes its own,
so a reviewer checking a business loan is sent to §5.2's footnotes. The
sameness is a fact about these two chapters, not about the standard — the
real-estate tables put the same labels at different scores.

---

## 2. The rule that decides everything else

**The engine never blocks a number. It blocks a claim.**

A **refusal** (a thrown 400 with its clause and its remedy) is for an input
that would make the arithmetic wrong or the figure uncitable. There is always a
way forward from one, and it is the standard's own: Option 3b needs nothing but
the outstanding amount and a sector factor, and produces a figure at score 5.

A **finding** is for an input that yields a correct figure at a correctly lower
score, or a disclosure the standard asks for that the data does not yet
support. It does not stop the assessment, changes no figure, and travels with
the result into the report. Two severities: **material**, which a reader of the
figure has to be told, and **advisory**, which is worth fixing and changes
nothing a reader would act on.

That line is stated once, in `domain/corporate/findings.js`, rather than decided
case by case. An engine that only refuses is a gate, and a gate on five
thousand SME loans is a product nobody finishes onboarding. An engine that never
refuses will print a score of 2 on evidence worth a 5.

### What is refused

| Code | Why |
|---|---|
| `NOT_DEBT_OR_EQUITY` | A derivative, a guarantee or underwriting creates no financed asset (Figure 5-1, Step 1) |
| `OFF_BALANCE_SHEET` · `NOT_ON_BALANCE_SHEET_AT_YEAR_END` | Off-balance-sheet lines of credit are excluded by name (p.55) |
| `GOVERNMENT_BORROWER` | Loans to governments are §5.9/§5.10 — but a state-owned enterprise is in this class (footnote 69) |
| `KNOWN_USE_OF_PROCEEDS` | §5.4, §5.5, §5.6 or §5.7 by what it buys; footnote 72 travels with the refusal |
| `PRIVATE_EQUITY_FUND` | A fund is §5.7; shares in a private company are this class (p.55) |
| `LISTED_EQUITY_OR_BOND` | §5.1 — same denominator, different table |
| `BORROWER_LISTING_UNKNOWN` | Decides EVIC against equity plus debt (footnote 86) |
| `OUTSTANDING_INCONSISTENT` | A balance that is not disbursed less repayments; a book holding two answers reports whichever the code reads |
| `SHARES_EXCEED_TOTAL` | A holding cannot exceed the company |
| `VALUATION_DATE_MISMATCH` · `CURRENCY_MISMATCH` | The numerator is defined in line with the denominator (p.56) |
| `ATTRIBUTION_ABOVE_ONE` | Refused rather than capped; an override needs a justification, which is printed |
| `VERIFIER_REQUIRED` | Score 1 is a claim about a third-party auditor and needs the auditor's name |
| `DQ_OPTION_NOT_EARNED` | A better option than the evidence supports needs a justification, recorded beside the score |
| `FACTOR_SOURCE_REQUIRED` | A factor without a publisher cannot be cited |

### What is recorded

| Code | Severity | What it says |
|---|---|---|
| `FN71_YEAR_END_FLUCTUATION` | material | The year-end balance is far from the year's average on a revolving facility |
| `FN71_AVERAGE_NOT_HELD` | advisory | A revolving facility with no average: the check did not run, and says so |
| `EMISSIONS_DATA_LAG` | material | The borrower's figure is years behind the reporting year |
| `DENOMINATOR_EXCEEDS_ASSETS` | material | Equity plus debt above total assets cannot be one balance sheet at one date |
| `INTENSITY_OUTSIDE_SECTOR_BAND` | material / advisory | Outside the band supplied; a factor of ten or more is more often a unit error than a real one |
| `INTENSITY_BAND_NOT_HELD` | advisory | No band supplied, so nothing was checked |
| `HIGH_ATTRIBUTION_SHARE` | advisory | Above 50%: ordinary for an SME lender, a sign of a wrong denominator for a syndicated book |
| `BALANCE_SHEET_FALLBACK` | material | Footnote 77's denominator, which understates the attributed figure |
| `SCOPE_3_NOT_REPORTED` | material | Required across all sectors from 2025; an institution that cannot shall explain |
| `NO_ATTRIBUTION_FACTOR` | material | Option 3b or 3c: a rough estimate, not a share of a measured figure |

---

## 3. Validating the data, not just multiplying it

Every check follows the rule the GCF engine already uses: **where an
independent path to the same figure exists, recompute and report the
divergence; where none exists, say so with the reason.** A check that passes
because it had nothing to check is worse than no check — which is why
`FN71_AVERAGE_NOT_HELD` and `INTENSITY_BAND_NOT_HELD` exist as findings rather
than as silence.

Three thresholds are CarbonIQ's rather than PCAF's, and every finding that uses
one says so on its face and takes it from the request:

| Threshold | Default | Why it is ours | The finding |
|---|---|---|---|
| `fluctuationPct` | 25 | Footnote 71 asks for transparency about "any major" year-end movement and defines neither *major* nor a method | `FN71_YEAR_END_FLUCTUATION` |
| `emissionsLagYears` | 2 | Chapter 4 permits a lag between the financial and emissions years and sets no limit | `EMISSIONS_DATA_LAG` |
| `factorVintageYears` | 3 | Box 6.1-5 recommends inflating score 4 and 5 factors and names no age | `FACTOR_VINTAGE_STALE` |

The third row shipped as a threshold with no check behind it — declared in
`DEFAULTS`, documented here, read by nothing — which is the same as none.
`FACTOR_VINTAGE_STALE` now fires where an economic factor's vintage sits at or
beyond the threshold behind the reporting year and no deflator was applied;
with a deflator, Box 6.1-5 is applied and there is nothing to report.

**The sector band is a baseline, not a request field.** The intensity
plausibility check compares a borrower's reported scope 1 and 2 against a
low–high band for its sector, per million units of the reporting currency of
revenue. PCAF sets no such test, so the band is regional judgement — and
regional judgement lives in the baseline registry
(`sector_intensity_tCO2e_per_million_revenue`, `docs/BASELINE-GOVERNANCE.md`),
scoped global → country → organisation, released by an administrator and
superseded only with a recorded reason. The band is resolved on the way into
the engine (`application/plausibility.js`) and handed in with its provenance,
so `INTENSITY_OUTSIDE_SECTOR_BAND` cites the baseline version it was checked
against and the shipped set says *illustrative dataset, not a released
baseline* on the finding itself. A band supplied on the request stands over
the registry's and says so. `INTENSITY_BAND_NOT_HELD` names the two ways to
clear it: map the borrower to a held sector, or release a band for the sector.

The band is never written into the stored input. A recomputation reads the
band in force *now* — a newly released band is exactly what a recomputation
is for — and the movement reports the findings that changed beside the lines
that did not.

Footnote 71 is the one worth dwelling on. Only the year-end balance counts —
that is the rule, and it is applied. But a revolving facility drawn to
LKR 100m on 31 December after a year averaging LKR 400m reports a quarter of
the emissions the bank actually financed, and nothing in the standard catches
it. The finding is not that the rule was applied; it is what applying it to
*this* facility produced. That disclosure belongs beside the figure.

---

### The held sector factors

Option 3 needs a sector-average factor, and until this step every one was
supplied on the request. The library (`domain/sector-factors.js`,
`data/pcaf-parta/sector-factors.json`) holds one row per sector of a closed
vocabulary (`data/pcaf-parta/sectors.json`: ISIC Rev.4 sections, with the
divisions a Sri Lankan book actually holds — tea, rice, textiles and apparel,
cement, food, rubber and plastics — as rows of their own beneath their
section, because "a paddy-rice factor, not an agriculture factor" is the
standard's own example on p.62). Each row carries scope 1, 2 and 3 intensities
per million LKR of revenue and the sector's asset turnover; Option 3b's
per-assets factor is derived as GHG ÷ revenue × revenue ÷ assets rather than
held as a second number that could disagree with the first.

An Option 3 line with no `activity.factor` takes the held factor for
`counterparty.sectorKey` — a free-text `sector` is mapped by name and the
mapping recorded as an assumption on the trace, never silently — and the
result carries `factorRelease`: the table, version, status, the rows used and
a SHA-256 over the set, so a disclosure names the factor set it rests on.
Three refusals, each with the way forward: a sector that is not held is
`FACTOR_REQUIRED` naming the vocabulary, never the nearest sector; a factor
held in LKR is not applied to an exposure in USD; a scope the row does not
hold is absent with the reason.

**Every shipped row is provisional and says so.** The figures are
order-of-magnitude, derived from published global EEIO ranges at an
indicative exchange rate — not a licensed EXIOBASE extraction and not a
Sri Lankan measurement — and each row's `gap` records that. The table is
versioned, dated and checksummed in `data/pcaf-parta/MANIFEST.json`
(`npm run docs:parta-manifest`, held to the table by
`tests/parta-factor-provenance.test.js` and regenerated in the CI `docs`
job), kept apart from `data/factors/MANIFEST.json` because Part A and Part C
are two scopes that never merge. `GET /v1/pcaf/part-a/factors` publishes the
vocabulary, the table and the release.

## 4. Driving it

```jsonc
POST /v1/pcaf/part-a/business-loans/assess
{
  "reportingYear": 2024,
  "instrument": "revolving-credit",        // or business-loan, overdraft, unlisted-equity, …
  "borrowerListed": false,                 // decides EVIC vs equity + debt (fn 86)
  "borrowerType": "company",               // state-owned-enterprise is in; government is not (fn 69)
  "counterparty": { "name": "…", "sector": "Textiles", "financialInstitution": false },

  "outstanding": {                         // a loan: disbursed − repayments
    "disbursed": 500000000, "repayments": 400000000,
    "averageOutstanding": 400000000,       // optional; runs the footnote 71 check
    "asOf": "2024-12-31", "currency": "LKR"
  },

  "denominator": {                         // private borrower
    "totalEquity": 2000000000, "totalDebt": 3000000000,
    "asOf": "2024-12-31", "currency": "LKR"
  },

  "emissions": {
    "scope1": { "value": 12000, "basis": "reported-unverified", "period": "2024" },
    "scope2": { "value": 3400,  "basis": "reported-unverified", "period": "2024" },
    "scope3AbsentReason": "The borrower does not measure it."
  },

  "plausibility": { "revenue": 8000000000, "sectorBand": { "low": 5, "high": 60 } }
}
```

An unlisted-equity holding replaces the numerator block:

```jsonc
"outstanding": { "sharesHeld": 250, "totalShares": 1000,
                 "investeeTotalEquity": 2000000000, "asOf": "2024-12-31", "currency": "LKR" }
```

A borrower with no financial data at all still reports:

```jsonc
"emissions": {
  "scope1": { "basis": "assets-sector",
              "activity": { "factor": { "value": 0.00004, "unit": "tCO2e/LKR",
                                        "source": "EXIOBASE v3.8", "vintage": 2024 } } }
}
```
— no denominator, no attribution factor, a figure at score 5 with
`NO_ATTRIBUTION_FACTOR` beside it saying what it is.

**Emission bases** (the option is read from the basis, never chosen):
`reported-verified` · `reported-unverified` · `provider` (with
`providerMethod`) · `energy-activity` · `production-activity` ·
`revenue-sector` · `assets-sector` · `turnover-sector` · `alternative`.

---

## 5. The book, and what to fix first

`POST /business-loans/portfolio` takes `exposures`, an optional
`totalLoansAndInvestments` for coverage, and an optional `improvementTarget`.

It returns the six lines summed per group and never across lines; the disclosed
score weighted by **outstanding amount** with scope 3 apart (Box 6.1-6, p.168 ·
p.167); groups by sector, by kind, by borrower type; financial-sector borrowers
rolled up separately, because the scope 3 of a bank includes its own financed
emissions and a book holding bank paper counts those twice (p.56).

Then `improvementPlan`. A score is a measurement and not a task list, and
"improve your data quality" is not a plan. So:

- **`steps`** — the exposures at each option, the outstanding they carry, and
  what the book's weighted score would be if those reached the target. Ordered
  by outstanding × score points above the target, because that is what moves a
  disclosed figure; ordering by count sends a bank to two hundred small
  borrowers before the one exposure carrying a fifth of the book.
- **`byRemedy`** — every finding across the book grouped by the sentence that
  would clear it, with the outstanding it sits on.

The default target is **score 2** — the borrower's own reported figure,
unverified. Score 1 needs third-party verification, which is the borrower's
decision and not the lender's, so it is not the default.

Every figure under `steps` is a **scenario**, run through the same weighting the
disclosure uses, and it is never presented as the reported score — separate
keys, separate labels, the same discipline the capital forecast follows with
hatching.

---

## 6. What is proved

`tests/parta-business-loans.test.js` (39) and the §5.2 block of
`tests/parta-api.test.js`.

The anchor is the standard's own worked example: Tables 5.2-2 and 5.2-3 (p.63),
three companies at 10%, 25% and 20%, reproduced at **6,100 / 1,260 / 10,000 /
2,200 / 7,250 / 600** across the six lines. A test that checks our arithmetic
against our arithmetic proves nothing; that one knows something the code does
not.

---

## 7. The register

Migration `0008` gives §5.2 a book: `parta_exposures`, one row per exposure per
reporting year, and `parta_book`, one row per year carrying the entity's own
total loans and investments.

**Both halves are kept.** A row holds the input the bank keyed *and* the result
the engine computed, with the instant and the standard edition beside them.
Keeping only the input would mean a factor correction silently rewrote a figure
somebody had already been shown; keeping only the result would mean nobody
could see what it was computed from. `POST /exposures/:id/recompute` reruns the
engine over the input already held and **reports what moved** — nothing
recomputes on read, so a figure a person saw yesterday is the figure they see
today until somebody decides otherwise and can see the difference.

**Coverage is now a figure rather than an absence.** PCAF asks for assessed
outstanding over total loans and investments (DCL p.124). A posted body was
only ever what somebody chose to send, so the denominator was unknowable. The
entity states its book total once per year, at `PUT /v1/pcaf/part-a/book`, and
it is recorded as **declared** with who stated it — nothing here can derive an
institution's balance sheet, and that provenance travels with every coverage
percentage it produces. A book total of zero is refused: a book of zero has no
coverage rather than full coverage.

**The roll-up reads a projection, and that is why it is fast.** A stored
exposure is several kilobytes, most of it the provenance trace, and the
reporting-year position needs about twenty fields. `parta_exposure_rollup()`
computes exactly those into a generated column at write time. Every path in it
is a path **into the record**, never a flattened shape of its own — which is
what lets the in-memory store project the same set with no column at all, and
is the only reason the suite can prove on either store that the projected
roll-up equals the whole-record roll-up figure for figure. Measured: **316 ms
over 10,000 exposures**, against a one-second bound.

One detail worth knowing, because it silently returns the opposite of the
truth: `jsonb_strip_nulls` removes a null field and leaves the object that held
it, so an exposure with no attribution factor (Option 3b or 3c) projects as
`attribution: {}` — which is truthy. `inflate()` normalises it, and a test
pins the count.

**One loan, once — said in the database (migration `0009`).** Two rows for one
facility in one year is the same loan financed twice, and nothing in 0008
stopped it: an exposure keyed on the bank's own account number could be
recorded twice by two people, or by one person pressing the button twice, and
the position would carry both. `account_number` is a generated column over
`input.identifiers.accountNumber` with a partial unique index on
`(org_id, reporting_year, account_number)` — partial, because an exposure
recorded without a reference is not thereby the same loan as every other
exposure recorded without one. The service refuses first, with a **409
`DUPLICATE_LOAN`** naming the exposure that already holds the reference and
the two ways forward (change that one, or give this one its own reference);
the index is what closes the race the service cannot, exactly as the one
locked assessment per policy-year index does in Part C.

**A recomputation compares every line and both scores.** It used to compare
the headline — financed scope 1 and 2 — and report "nothing moved" when scope 3,
removals or a data-quality score had. The movement now carries all seven
reporting lines and both scores, each with before, after and whether it moved,
and the note names what did: *Moved on the same input: scope3.* The cause of
such a movement is a change in the engine or in a factor, never in what the
bank recorded, and the note says so.

**The sample book.** A preview visitor sees six FY2024 exposures in Sri Lankan
rupees, chosen so that each shape the checks can take is on the screen: a clean
term loan at Option 1b; an overdraft drawn to a quarter of its own annual
average, which is the footnote 71 finding; a hardware merchant with no company
value, estimated under Option 3b from a sector factor whose vintage is stale; a
listed cement producer attributed on EVIC; a development-finance company whose
customer deposits are excluded from its debt (p.56); and a tea estate whose
emissions year lags the reporting year. The book total is stated so coverage is
a percentage. It is installed by the same installer that seeds the Part C
sample book, into the preview organisation only, and a read-only session can
open every exposure and record none.

## 8. The screen

`ui/pages/parta-register.html` · `ui/js/parta-register.js` · `ui/css/parta-register.css`,
under **Lending Book** in the navigation. It computes nothing: every figure on it
is one the register returned, which is the rule the Fund Desk established and
`tests/parta-register-ui.test.js` holds it to.

It is laid out in the order a bank reads its own book. The **position** first —
financed scope 1 and 2, scope 3 on its own line, removals netted against
nothing, and coverage of the book — each with its data-quality score as a
category, 1 the highest and 5 the lowest, never as a fraction. Then the **book
total** and the **groups** side by side: the total is stated from the screen,
so coverage becomes a percentage without leaving the page, and financial-sector
borrowers are rolled up apart from the rest (p.56). Then **what to fix first**:
the improvement plan, every step ordered by outstanding × points above the
target, every projected score marked *scenario* so it cannot be read as the
reported one. Then the **exposures**, one row each with its verdict — clean, or
the count of material and advisory findings — and a row opens into the
exposure: its lines, its scores, its attribution with the equation the engine
ran, and its findings inline with *what clears it*, because a finding without
the sentence that clears it is a complaint.

Recording an exposure is a form and no arithmetic: the engine runs before
anything is written, and a refusal reaches the screen with its clause. Every
write control carries `data-writes` and is hidden for a preview session — a
courtesy, not the control; the server refuses the same call with `read`.

Two rules from the rest of the product apply and were both needed. The panel
grid's items had to be allowed to shrink: a grid item's `min-width` is `auto`,
so the groups table set the Book panel at 599px inside a 430px viewport, with
its scroll box already in place. And a `max-content` label column with no floor
does the same; `minmax(0, max-content)` is the whole difference. The browser
journey (`e2e/parta-register.spec.js`) seeds a book through the API, opens the
overdraft, states the total, recomputes, and asserts the page never widens.

## 9. What is still not built

- **No lifecycle.** An exposure is recorded and can be changed; there is no
  lock and no supersede. Nothing publishes from this register yet, and a
  half-built lifecycle is worse than none. `lock()` refuses with a 501 naming
  the step that builds it, and the `status` column exists in 0008 so that step
  needs no migration.
- **No §5.2 report.** The figures are there; the document PCAF's Chapter 6 and
  the Disclosure Checklist ask for is row 8 of that plan.
- **The sector factors are placeholders.** The library is built and every
  row of it is provisional: a released factor set — a licensed EEIO extraction
  mapped to the vocabulary, or a Sri Lankan measurement — replaces the shipped
  figures under the same version, date and checksum. Until then an estimate
  from the library is a score-5 figure resting on a stated order of magnitude,
  and the trace says so.
- **A released band set replaces the seed entirely.** An organisation that
  releases a band for one sector holds a band for that sector alone; the
  others are then *not held* and the finding says so with the remedy. That is
  the registry's rule for every metric and it is the right one — a
  half-shipped, half-recorded band set is a figure with two authors — but it
  means a first release is the whole set, not one row.
- **No recalculation policy.** Base year and significance threshold are on the
  reporting entity's settings in Part C and have no Part A equivalent yet.
