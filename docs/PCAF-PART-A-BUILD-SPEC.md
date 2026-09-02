# PCAF Part A — build specification

Structure for a Part A (financed emissions) calculator, built separately from
Part C, with manual data entry and no AI agents.

**Source:** PCAF (2025). *The Global GHG Accounting and Reporting Standard
Part A: Financed Emissions.* Third Edition, December 2025. Held in the
repository as `PCAF-PartA-2025-V3-15012026.pdf`, with the Disclosure Checklist
(May 2025), its FAQs, and the avoided-emissions supplement alongside it.

Reporting requirements are in `docs/PCAF-PART-A-SOURCES.md`. This document
covers Chapter 5 — the calculation.

---

## 1. What the study established

### 1.1 Ten asset classes (Chapter 5)

| § | Asset class | In v1? |
|---|---|---|
| 5.1 | Listed equity and corporate bonds | — |
| 5.2 | Business loans and unlisted equity | **Yes** |
| 5.3 | Project finance | **Yes** |
| 5.4 | Commercial real estate | **Yes** |
| 5.5 | Mortgages | **Yes** |
| 5.6 | Motor vehicle loans | — |
| 5.7 | Use of proceeds structures | — (new in 3rd ed.) |
| 5.8 | Securitization and structured products | — (new) |
| 5.9 | Sovereign debt | — |
| 5.10 | Sub-sovereign debt | — (new) |

Six of these carry the *Built on GHG Protocol* mark from the first edition —
listed equity and corporate bonds, business loans and unlisted equity, project
finance, commercial real estate, mortgages, motor vehicle loans. **Additions in
the second and third editions have not been reviewed by the GHG Protocol**,
which closed its review service. Our conformance statement must not blur the
two.

### 1.2 Attribution

The general rule, in the standard's own words:

> the attribution factor is calculated by determining the share of the
> outstanding amount of loans and investments of a financial institution over
> the total value of the company, project, or asset to which the financial
> institution has lent money or in which it has invested capital

and

> the attribution factor is defined as the share of total annual GHG emissions
> of the borrower or investee that is allocated to the loan(s) or investment(s)

Denominators differ by asset class — this is why one generic
`loanAmount / projectValue` cannot serve:

| Asset class | Denominator |
|---|---|
| Business loans & unlisted equity, project finance | **Total equity plus debt** for private companies; **EVIC** for listed |
| Commercial real estate, mortgages | **Property value at origination** |
| Motor vehicle loans | **Total value at origination** |
| Use of proceeds structures | Total equity + debt **in the UoP structure** |
| Sub-sovereign debt | Exposure ÷ a GDP-based denominator (PPP-adjusted) |

**Property value at origination has rules of its own.** Where a loan is
modified or refinanced and a new valuation is obtained, the value at origination
*shall* be updated to the value at the time of modification. Where the value at
origination is not held, the latest available value is used and then **fixed for
subsequent years** of accounting — it must not drift with revaluation. The
standard also discusses the ordering of current versus original outstanding
amount against original versus updated asset value; the exact permitted
combination must be read per asset class at implementation.

**EVIC** follows the EU TEG definition, with a recommended inflation correction
over time for asset owners and managers.

### 1.3 Data quality — the finding that matters most

Part A scores data quality by **option**, in tables laid out as
*Option · Financial data · Emissions data · Equations* — the same shape as Part
C's Table 5.3-2. But:

> **The option-to-score mapping is not uniform across asset classes.**

Extracted from the document, the same option label carries different scores in
different asset classes:

```
Score 1 ← Option 1,  Option 1b
Score 2 ← Option 2,  Option 2a, Option 2b
Score 3 ← Option 2,  Option 2b, Option 3, Option 3a
Score 4 ← Option 3,  Option 3b, Option 4a
```

Option 2b is score 2 in one asset class and score 3 in another. Option 3 is
score 3 in one and score 4 in another.

**Consequence for the build:** there is no global option→score lookup. The score
must be resolved as **(asset class, option) → score**, from a table per asset
class, each row citing its page. Reusing Part C's `2b = 3` would be wrong for
some classes, silently.

### 1.4 Weighting and separation

- The disclosed weighted data-quality score is weighted by **outstanding
  amount** (DCL p.128) — **not** by premium, which is Part C (Box 6-3, p.107).
  The two engines must not share a weighting function.
- The scope 3 weighted score is reported **separately** from scopes 1 and 2
  (DCL p.128).
- Avoided emissions and removals are reported **separately** from the scope
  1/2/3 inventory and never netted, and never counted alongside carbon credits
  raised on the same emissions (DCL p.126).

---

## 2. Module structure

Entirely separate from `services/pcaf-partc/` and from the legacy
`services/pcaf.js`. Three scopes, never merged.

```
services/pcaf-parta/
  index.js            orchestration — assess one exposure, and a portfolio
  asset-classes.js    the ten classes: definition, required inputs, denominator
                      rule, DQ table id, which scopes apply
  attribution.js      attribution factor per class, as a traced value
  denominators.js     EVIC, total equity + debt, value at origination and its
                      fixing rule — each with its own validation
  emissions.js        borrower emissions × attribution, by scope
  data-quality.js     (assetClass, option) -> score. Never a global lookup.
  dq-weighting.js     outstanding-amount weighting; scope 3 separate
  scopes.js           scope 1 / 2 / 3, Category 15 labelling
  coverage.js         share of total loans and investments covered (a
                      requirement, p.124 — needs the book, not just what was assessed)
  intensity.js        economic intensity, tCO2e per million (p.127)
  recalculation.js    base year, significance threshold, triggers (p.124)
  avoided.js          avoided emissions and removals — a separate container
  rollup.js           portfolio position by asset class and by sector
  provenance.js       traced values: equation, inputs, factors, assumptions
  checklist.js        the PCAF DCL, auto-answered from what the report contains
  conformance.js      rule -> implementation -> proving test
  checks.js           validation and honest refusals

data/pcaf-parta/
  asset-classes.json  ten classes, each citing its section
  dq-tables/          ONE TABLE PER ASSET CLASS, each row citing its page

schemas/pcaf-parta.js
routes/v1/pcaf-parta.js
ui/pages/pcaf-parta.html      manual entry + exposure register
tests/parta-*.test.js
```

## 3. Data model

```
Reporting entity
  └── Reporting year
        └── Exposure  (one per instrument)
              asset class · counterparty · outstanding amount
              denominator inputs (per class)
              borrower scope 1 / 2 / 3, or the inputs to estimate them
              the option actually used, and the evidence for it
              currency + FX date · origination date · sector
```

Manual entry removes the hardest dependency: if the analyst enters the
borrower's emissions, no energy-intensity benchmark tables are needed. Those are
only required for the estimation options at the weak end of each table, and can
come later without blocking v1.

## 4. Rules carried over from Part C, because they were right

1. Data quality is a **lookup by option**, never an average — here, per asset class.
2. **1 is best, 5 is worst**; never rendered `3 / 5`; enforced by a source sweep.
3. Every figure is a **traced value**; registers derive from the trace.
4. **Refuse rather than render zero** — a year with no exposures is a 409.
5. **Measured / declared / absent** (`services/report-integrity.js`) from day one.
6. One content model, one renderer, for every document.

## 5. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Asset-class model, denominators, attribution, provenance | Worked examples from the standard reproduce exactly |
| 2 | DQ tables per asset class, scored by option | Each table row cites its page; a wrong-class lookup is impossible |
| 3 | Manual-entry UI and exposure register | An analyst can enter a book and see a position |
| 4 | Coverage, outstanding-amount weighting, scope separation, intensity | Matches DCL pp.124–128 |
| 5 | Report — one model, two renderers, reusing the Part C report standard | PDF and Word open clean |
| 6 | Auto-completed PCAF Disclosure Checklist | Every item answered from the report; No carries a justification |
| 7 | Conformance matrix + `docs/PCAF-PART-A-CONFORMANCE.md` | Build fails if a rule cites a missing file or test |

## 6. Decisions still open

1. **Four asset classes in v1, or all ten?** Four covers a Sri Lankan bank's book.
2. **Which scopes are mandatory per class**, and the mandatory sectors for scope 3
   (DCL Absolute Emissions item 2) — to be read per class in Chapter 5.
3. **Attribution factor above 1** — disclosed, capped, or refused. The legacy
   `services/pcaf.js` silently caps at 1; that behaviour must not carry over
   without a decision.
4. **Sector taxonomy** for the sector-level disaggregation requirement (p.125)
   — NACE, GICS, or the borrower's own.
5. `services/pcaf.js` currently labels attributed embodied carbon as "PCAF v3".
   Once Part A exists it must stop claiming to be PCAF.

