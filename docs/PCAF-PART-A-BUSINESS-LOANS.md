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
POST /v1/pcaf/part-a/business-loans/assess      one exposure
POST /v1/pcaf/part-a/business-loans/portfolio   a book, rolled up and ranked
GET  /v1/pcaf/part-a/reference                  the class, its options, its thresholds
```

Both POSTs carry the `read` scope: they compute and store nothing, issue no id,
and the same request twice returns the same answer. A persisted exposure
register is the next step and is not built — see §7.

```
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

| Threshold | Default | Why it is ours |
|---|---|---|
| `fluctuationPct` | 25 | Footnote 71 asks for transparency about "any major" year-end movement and defines neither *major* nor a method |
| `emissionsLagYears` | 2 | Chapter 4 permits a lag between the financial and emissions years and sets no limit |
| `factorVintageYears` | 3 | Box 6.1-5 recommends inflating score 4 and 5 factors and names no age |

Footnote 71 is the one worth dwelling on. Only the year-end balance counts —
that is the rule, and it is applied. But a revolving facility drawn to
LKR 100m on 31 December after a year averaging LKR 400m reports a quarter of
the emissions the bank actually financed, and nothing in the standard catches
it. The finding is not that the rule was applied; it is what applying it to
*this* facility produced. That disclosure belongs beside the figure.

---

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

## 7. What is not built

- **No persisted exposure register.** Both routes are reads. A book has to be
  posted whole each time, which is right for a pilot and wrong for a bank with
  five thousand loans. The register — reporting entity → year → exposure, with
  coverage against the whole book — is row 2 of the plan in
  `docs/PCAF-PART-A-RESEARCH.md` §11 and is the next thing to build.
- **No §5.2 report.** The figures are there; the document PCAF's Chapter 6 and
  the Disclosure Checklist ask for is row 8 of that plan.
- **No screen.** The surface is the API.
- **No sector factor library and no sector intensity bands.** Both are supplied
  per request. A held, versioned and checksummed set — the discipline
  `data/factors/MANIFEST.json` already follows for Part C — is what turns
  `INTENSITY_BAND_NOT_HELD` from the usual answer into the rare one, and it is
  regional judgement, so it belongs in the baseline registry.
- **No recalculation policy.** Base year and significance threshold are on the
  reporting entity's settings in Part C and have no Part A equivalent yet.
