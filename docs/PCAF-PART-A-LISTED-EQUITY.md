# PCAF Part A §5.1 — Listed equity and corporate bonds

Analysis, scenario catalogue and build plan for the second Part A asset class.

**Source.** PCAF (2025). *The Global GHG Accounting and Reporting Standard
Part A: Financed Emissions.* Third Edition, December 2025. Held as
`PCAF-PartA-2025-V3-15012026.pdf`. Every rule below cites its page in that
file. Where this document says *shall*, *should* or *may*, it is quoting the
standard's own modal verb — the distinction is the difference between a
refusal, a warning and a choice in the engine.

**Status.** Analysis complete. Plan agreed in §5. Implementation in
`src/domains/pcaf-part-a/domain/` follows the plan; the conformance matrix ties each rule
here to the code that enforces it and the test that proves it.

---

## 1. What the asset class is, and is not (p.40)

**In scope.** All on-balance-sheet *listed* equity — common and preferred
stock traded on a stock or securities exchange — and all on-balance-sheet
corporate bonds, *listed or unlisted*, for general corporate purposes, meaning
unknown use of proceeds. Indirect holdings through funds follow the same method
**provided the individual holdings are known**.

**Out of scope, and why it matters to the engine.**

| Excluded | Where it goes | Engine behaviour |
|---|---|---|
| Derivatives — futures, options, swaps | Not covered by Part A (Figure 5-1, Step 1: no debt or equity exposure) | Refused with the clause. Never silently accepted as a bond. |
| Short and long positions, IPO underwriting | Later editions; underwriting is Part B | Refused with the clause. |
| Assets held for sale, trading-book assets, debt securities at fair value held short | Not in scope (p.40; p.36–37 "on the balance sheet at fiscal year-end") | Refused. An exposure needs a year-end balance-sheet flag. |
| Equity in **private** companies | §5.2 Business loans and unlisted equity | Refused with a redirect — the denominator and the score table both differ. |
| General-purpose **loans** to listed companies | §5.2 (Table 10.1-2 covers "business loans to listed companies" with EVIC) | Refused with a redirect. Same denominator, different table. |
| Fund holding where the underlying is unknown | §5.7 Use of proceeds structures | Refused with a redirect. |

The decision tree (Figure 5-1, pp.35–36) resolves this: **Step 1** debt or
equity? → **Step 2** proceeds allocated to specific assets? No → **Step 3a**
classify by customer segment. Listed-equity/corporate-bond is one of four
segments at 3a. The engine asks the same questions in the same order, and an
exposure that cannot answer them is not assessed.

A **corporate bond of a private company is in this class** (p.40 "listed and
unlisted corporate bonds"; p.42 "for bonds to private companies"). This is the
one place the class uses total equity + debt instead of EVIC. Two instrument
types, two denominators, one table.

## 2. The rules, extracted

### 2.1 Emission scopes (pp.40–41)

- FIs **shall** report absolute scope 1, 2 **and 3** of investees, **across all
  sectors**. The former sector phase-in is complete for reports published from
  2025 (Box 5.1-1).
- Scope 3 **shall** be disclosed **separately** from scope 1 and 2.
- An FI that cannot report scope 3 for data-availability or uncertainty
  reasons **shall explain** why. Absence is a disclosure with a reason, never a
  zero.
- Scope 3 is required for investees in the **financial sector** too. PCAF
  acknowledges the double count and **recommends separate reporting** of
  financed emissions to the financial sector. Where two FIs hold each other,
  each **may** account the other's emissions **without** the reverse position,
  to prevent calculation loops.

### 2.2 Attribution (pp.41–43)

**Numerator** — the actual outstanding amount, *defined in line with the
denominator*:
- listed equity: **market value** = market price × number of shares;
- corporate bonds: **book value** of the debt the borrower owes the lender.

Taken at **calendar or fiscal year-end**, provided the choice is communicated
and applied consistently.

**Denominator**
- Listed company: **EVIC** = market capitalisation of ordinary shares at
  fiscal year-end + market capitalisation of preferred shares at fiscal
  year-end + book value of total debt + minorities' interests. **No cash
  deduction** (p.42). Total debt = current + long-term (fn 43).
- Bonds to a private company: **total company equity + debt** from the balance
  sheet (p.42).

**Footnotes that are rules, not commentary:**

| fn | Rule | Consequence |
|---|---|---|
| 41 | The factor is only calculable where investee-specific financial data exists. Otherwise no factor — only a rough estimate via 3b/3c. | 3b and 3c produce **no attribution factor**. The engine must not print one. |
| 42 | Negative book equity → **set equity to 0**. All emissions then attribute to debt. | A rule, not a validation error. Recorded as an assumption on the trace. |
| 43 | Total debt is current + long-term. | Two inputs, or one with a declaration. |
| 44 | If debt or equity cannot be obtained, **fall back to total balance sheet** (= total assets), with intent to improve. | A permitted fallback, recorded as one, and it lowers nothing on the score table. |
| 45 | EU TEG "total debt" includes non-interest-bearing liabilities. Where that information is missing, the **precautionary principle: exclude** it. | Two debt fields: interest-bearing, and non-interest-bearing (optional). |
| 46 | Precautionary deviations from EVIC (e.g. excluding minorities) are allowed if (1) they lower EVIC, and (2) the base still = market cap + total book debt. | The engine accepts an element being omitted, never one being added, and records what was omitted. |
| 48 | Subsidiary: "follow the money" — attribute at subsidiary level if its balance sheet is held; else on the balance sheet of the entity with **recourse**. | Denominator entity may differ from issuer; both names are recorded. |
| p.43 | For investees that are **financial institutions**, book debt **includes customer deposits**. | A flag on the counterparty changes what "total debt" means. |

**Why EVIC and not EV** (Box 5.1-2): EV deducts cash, so equity + debt shares
can exceed 100% (the standard's own example: 63% + 63%). EVIC guarantees the
sum of all providers' attribution is exactly 100%. For a listed company,
therefore, **a factor above 1 is impossible unless an input is wrong**. For a
bond to a private company it is possible if reported debt is partial. Either
way the engine refuses rather than caps (Decision D1 in §5).

### 2.3 Equations (p.44; Annex Table 10.1-1, p.191)

```
Financed emissions = Σ_c  attribution factor_c × company emissions_c
```

Per option, from Table 10.1-1 (c = company, s = sector):

| Option | Financial data | Emissions data | Equation |
|---|---|---|---|
| 1a | outstanding; EVIC or E+D | **verified** reported emissions (GHG Protocol) | AF × verified emissions |
| 1b | outstanding; EVIC or E+D | **unverified** reported emissions (GHG Protocol) | AF × unverified emissions |
| 2a | outstanding; EVIC or E+D | energy consumption by source + **process emissions** | AF × (Σ energy × EF **+ process**) — fn 204: process added *before* attribution |
| 2b | outstanding; EVIC or E+D | production quantity | AF × production × EF |
| 3a | outstanding; EVIC or E+D; **company revenue** | sector GHG ÷ sector revenue | AF × revenue_c × (GHG_s ÷ revenue_s) |
| 3b | **outstanding only** | sector GHG ÷ sector assets | outstanding × (GHG_s ÷ assets_s) — **no AF** |
| 3c | **outstanding only**; sector asset-turnover ratio | sector GHG ÷ sector revenue | outstanding × turnover_s × (GHG_s ÷ revenue_s) — **no AF** |

Three consequences the engine must carry:

1. **2a cannot score scope 3** (fn 53, fn 202). A run using 2a for scope 1
   and 2 must use a *different* option for scope 3, and the scope-3 score is
   reported separately anyway (§2.1). So an exposure carries **two options**:
   one for scope 1+2, one for scope 3.
2. **3b and 3c have no attribution factor.** The outstanding amount is
   multiplied directly by a sector intensity. They exist precisely for the
   case where EVIC is unknown (fn 41).
3. **3a's revenue may be replaced** by another financial indicator where
   revenue is unsuitable for the sector, with the reasoning made transparent;
   the score is unaffected (fn 55). The indicator's name travels with the figure.

### 2.4 Data quality (Table 5.1-2, p.46)

```
1a → 1    1b → 2    2a → 2    2b → 3    3a → 4    3b → 5    3c → 5
```

Compared with project finance (Table 5.3-1): **identical mapping** for this
class. Compared with Part C Table 5.3-2: identical labels, identical scores —
but the build-spec's finding stands: the mapping is *not* uniform across all
ten classes, so the score still resolves through the class's own table and
never through a shared one.

**Data-provider scoring (p.47).** Emissions from a provider are Option 1 only
if the provider is relaying what the company reported. Where the provider
*estimated* them, the calculation "would be in line with Options 2 or 3". So an
input cannot say "from Bloomberg" and claim score 1; it must say *what the
provider did*. The engine derives the option from the **basis of the
emissions figure**, not from a dropdown.

**Same provider across equity and bonds** (p.47) — a recommendation, because
providers disagree on scope 1 and 2. The portfolio roll-up counts providers.

**Alternative options** (p.48): where none of 1–3 apply, an FI may use
another method, **with an explanation**. The engine takes an `alternative`
option only with a justification, scores it 5 (p.48 treats the residual case
as "a data quality score 5 approach"), and marks it.

**Inflation on score 4/5 factors** (Box 6.1-5, p.167): PCAF recommends
inflating economic emission factors (tCO₂e per unit currency) to the reporting
year, with CPI or GDP deflator. A revenue-based factor from a 2019 EEIO table
applied to 2026 revenue understates emissions by the inflation between them.
The factor record carries its vintage; the engine applies the deflator and
prints both.

### 2.5 Emission removals and carbon credits (pp.49–50)

- Removals: investees **should** report; FIs attribute with the **same factor**;
  **shall** be reported **separately** from absolute emissions **and** from
  credits retired and generated.
- Credits **generated**: **should** be reported. Credits **retired**: **may**.
- "Net" figures are optional and **only in addition to** the separate numbers.

Table 5.1-3 / 5.1-4 (pp.49–50) is a complete worked example with six
reporting lines and three attribution factors. It is the first acceptance test
(§5.4).

### 2.6 Market-value fluctuation (pp.50–53)

- EVIC moves with the market, so financed emissions move without any change
  in activity. All FIs **shall** report **unadjusted** absolute financed
  emissions.
- FIs **may** report **adjusted** figures — **separately**, with methodology,
  inputs and models, and **for every period presented**.
- **Box 5.1-3**, for asset owners and managers: economic emission intensity =
  Σ(outstanding_i ÷ EVIC_i × emissions_i) ÷ AuM. Adjustment factor
  `ADJ_b,T = Σ_i W_T,i × (EVIC_b,i ÷ EVIC_T,i)`, applied either backward
  (base-year intensity × ADJ) or to the current year (÷ ADJ). If applied, **both**
  unadjusted and adjusted **shall** be reported. The worked example (pp.52–53)
  is the second acceptance test: ADJ = 0.896, adjusted base 89.6, adjusted
  current 100.9.
- "Further research is needed" before the factor is applied to **banks** on loan
  exposure (p.51). The engine labels the metric as an asset-owner/manager
  metric and says so.

### 2.7 Chapter 6 rules that bind this class

- **Fluctuation analysis** (pp.164–165): where absolute financed emissions
  change significantly for reasons unrelated to the assets, FIs **should**
  disclose the drivers; where they do, they **shall** disclose the calculation
  basis, assumptions and limitations. The illustrative decomposition is into
  **outstanding amount, enterprise value, and emissions** — exactly the three
  variables of this class's equation.
- **Weighted data-quality score** (pp.167–168): weighted by **outstanding
  amount**; scope 3 weighted **separately**; per asset class and per sector.
  Box 6.1-6 gives 3.03 and 3.53 — third acceptance test.
- **Organisation identifiers** (p.53): LEI, ISIN, CUSIP, SEDOL. Needed to join
  positions to emissions data, and because identifiers change on merger faster
  than providers update. The record holds them; the engine warns on a mismatch
  between issuer name and identifier across years.

---

## 3. Scenario catalogue

Each row: the situation an analyst meets, what goes wrong if handled naively,
what the standard says, and what the engine does. **R** = refused, **W** =
accepted with a recorded warning/assumption, **A** = absent-with-reason.

### 3.1 Classification

| # | Scenario | Complication | Standard | Engine |
|---|---|---|---|---|
| C1 | Common stock in a CSE-listed company | none | p.40 | Assessed, EVIC denominator. |
| C2 | Preferred stock | Often omitted from EVIC; is part of it | p.42 | Preferred market cap is an EVIC input, defaulted to 0 only with a declaration. |
| C3 | Listed corporate bond | numerator is book value, not market | p.41 | Bond numerator field is `bookValue`; market value refused with explanation. |
| C4 | Unlisted bond of a private company | different denominator | p.42 | Denominator = total E+D; table unchanged. |
| C5 | Term loan to a listed company | not this class | Table 10.1-2 | **R** → §5.2. |
| C6 | Private equity stake | not this class | p.40 | **R** → §5.2. |
| C7 | Unit trust holding listed equities, holdings known | same method | p.40 | Look-through: each holding is an exposure with `viaFund` recorded; the fund's own weight is applied. |
| C8 | Unit trust, holdings unknown | cannot follow the money | Fig 5-1 | **R** → §5.7 UoP structures. |
| C9 | Equity futures / warrants / swaps | no debt or equity exposure | p.40 | **R**, clause quoted. |
| C10 | Trading-book position marked held-for-sale at year-end | not on balance sheet as a financed asset | p.40, p.37 | **R**. |
| C11 | Position bought in December, sold in January | on balance sheet at year-end → in | p.36–37 | Assessed on year-end outstanding. |
| C12 | Both equity and a bond in the same company | double counting between transactions | p.29–30 | Two exposures, one counterparty; EVIC attribution guarantees the sum ≤ 100%; roll-up shows the combined share per counterparty. |

### 3.2 The denominator

| # | Scenario | Complication | Standard | Engine |
|---|---|---|---|---|
| D1 | Full EVIC inputs held | none | p.42 | EVIC traced from its four elements. |
| D2 | Minority interests not available | element missing | fn 46 | **W** — omitted under the precautionary principle; EVIC lower; recorded. |
| D3 | Non-interest-bearing liabilities unknown | fn 45 | fn 45 | **W** — excluded; recorded. |
| D4 | Only total assets known, no debt/equity split | fn 44 | fn 44 | **W** — total balance sheet used as denominator; recorded with "intent to improve". |
| D5 | Negative book equity (private bond) | equity < 0 | fn 42 | Equity set to 0, all attribution to debt; recorded as the standard's own rule. |
| D6 | Analyst *adds* an element to EVIC (e.g. deferred tax) | raises EVIC, lowers attribution | fn 46 (only reductions permitted) | **R** — precautionary principle runs one way. |
| D7 | Market cap at 31 Dec, but company's fiscal year ends 31 Mar (common in Sri Lanka) | numerator and denominator on different dates | p.41 "defined in line with the denominator" | Both taken on the **same** date; the reporting entity's year-end basis is a portfolio setting; a mismatch is **R**. |
| D8 | Investee is a bank; its "debt" excludes deposits | understated denominator | p.43 | Counterparty flagged `financialInstitution` → deposits are a required debt input. |
| D9 | Holding is in a subsidiary; only the parent's balance sheet is held | follow the money | fn 48 | Denominator entity recorded as the parent, with `recourse` reason. |
| D10 | Outstanding > EVIC | inputs wrong | Box 5.1-2 | **R** (Decision D1). |
| D11 | EVIC unknown entirely | no factor possible | fn 41 | Options 1/2/3a **R**; only 3b/3c available, and they print no factor. |
| D12 | Currency of outstanding ≠ currency of EVIC | ratio meaningless | p.41 implied | **R** unless an FX rate and date are supplied; rate recorded. |

### 3.3 The emissions figure

| # | Scenario | Complication | Standard | Engine |
|---|---|---|---|---|
| E1 | Company publishes verified S1/S2/S3 | none | 1a | Score 1; verifier named. |
| E2 | Company publishes unverified S1/S2 only | S3 missing | 1b + §2.1 | S1/S2 score 2; S3 **A** with the "shall explain" text. |
| E3 | Provider figure, company-reported | 1a/1b per verification | p.47 | Option follows the *basis*, not the source name. |
| E4 | Provider figure, **provider-estimated** | looks like Option 1, is not | p.47 | Option 2 or 3 by the provider's method; provider must state it; unknown method → 3a at best. |
| E5 | Two providers disagree on S1 | variability | p.47 | Portfolio roll-up counts providers and warns when > 1. |
| E6 | Energy data (MWh by source) + process emissions | 2a | fn 204 | Process added before attribution; S3 needs a second option. |
| E7 | Energy data, but S3 requested on 2a | 2a cannot score S3 | fn 53 | **R** for S3 under 2a; a second option required. |
| E8 | Production tonnes + factor | 2b | Table 10.1-1 | Score 3. |
| E9 | Revenue + EEIO sector factor | 3a | Table 10.1-1 | Score 4; AF still applies. |
| E10 | Revenue unsuitable (e.g. a holding company), assets used instead | fn 55 | fn 55 | Indicator name recorded; score unchanged. |
| E11 | Only outstanding and sector known | 3b/3c | fn 41 | Score 5; **no attribution factor printed**; equation shown as outstanding × intensity. |
| E12 | EEIO factor vintage 2019, reporting year 2026 | understated | Box 6.1-5 | Deflator applied; factor vintage, index and adjusted value all printed. |
| E13 | Investee's own reporting year ≠ FI's | mismatch | p.47 "most recent available… with reference to period" | Emissions period recorded and disclosed; a lag > 2 years warned. |
| E14 | Investee is another FI, reports no S3 | required, often absent | p.48 | Score-5 approach: sector distribution × EEIO, or economy-wide factor; flagged `financialSector` and rolled up separately. |
| E15 | Mutual holdings (FI A holds B, B holds A) | loop | p.41 | Cannot be detected from one side; the counterparty flag prompts the analyst; the roll-up note states the treatment. |
| E16 | None of 1–3 applicable | alternative | p.48 | Only with a justification; score 5; marked. |
| E17 | Scope 3 present but of a different vintage than S1/S2 | mixed periods | p.47 | Each scope carries its own period. |

### 3.4 Removals and credits

| # | Scenario | Complication | Standard | Engine |
|---|---|---|---|---|
| R1 | Forestry investee reports removals and sells credits | netting temptation | p.49–50 | Six separate lines (Table 5.1-4); nothing netted; a "net" line only on request and beside the gross. |
| R2 | Industrial investee retires credits | may report | p.49 | Optional line; attributed with the same factor. |
| R3 | Investee reports "net zero" as a single number | absolute unknown | p.50 | **R** — absolute and removals must be separate inputs. |

### 3.5 Time, market and portfolio

| # | Scenario | Complication | Standard | Engine |
|---|---|---|---|---|
| T1 | Share price doubles, nothing else changes | financed emissions halve | p.50 | Unadjusted figure reported; fluctuation analysis attributes the change to EV. |
| T2 | FI wants to show a "like-for-like" figure | adjusted | p.51 | Optional adjusted figure, **beside** unadjusted, with method, for every period. |
| T3 | Asset manager reports intensity per AuM | denominator also moves | Box 5.1-3 | ADJ factor computed; both intensities reported; labelled as the asset-owner metric. |
| T4 | Bank reports intensity per loan exposure and wants the same correction | not validated | p.51 | **A** — engine states research is pending; no bank adjustment computed. |
| T5 | Year-on-year change > significance threshold | should explain | pp.164–165 | Decomposition into Δoutstanding, ΔEVIC, Δemissions per exposure, with basis and limitations text. |
| T6 | Investee merges; ISIN changes; provider still on old ISIN | join fails | p.53 | Identifiers stored; a name↔identifier change between years is warned. |
| T7 | Mixed options across the book | one score | p.45, p.167 | Outstanding-weighted score; **S3 weighted separately**; per class and per sector. |
| T8 | An exposure carries no score | weighting | Box 6.1-6 | Excluded from the weighting, counted, never zero. |
| T9 | Base year set; a restatement is needed | recalculation | Chapter 6 (already in `partc`-style settings) | Reuses the base-year / threshold / trigger model. |

### 3.6 The Sri Lanka layer

These are not in the standard; they are what an analyst at a Colombo bank or
insurer will meet on day one.

| # | Fact | Consequence |
|---|---|---|
| S1 | Many CSE-listed companies have a **31 March** fiscal year-end; the FI may report to 31 December. | D7 is the common case, not the edge case. The engine's year-end basis setting defaults to the FI's and requires investee figures on that date or a declared approximation. |
| S2 | GHG reporting by CSE issuers is rare and rarely verified. | The book will sit on **3a** (revenue) with a handful of 1b. The weighted score will be near 4. That is honest; the improvement plan names which holdings would move it. |
| S3 | PCAF's emission-factor database is signatory-only. | Option 3 needs an EEIO factor source the FI can cite. EXIOBASE has no Sri Lanka region (it has "rest of Asia-Pacific"); the factor record must say so. |
| S4 | Revenue in LKR; EEIO factors in EUR or USD, of a given year. | Two conversions — currency at the factor's vintage, then inflation to the reporting year (Box 6.1-5). Both printed. |
| S5 | SLFRS S2 asks for scope 3 Category 15 and CBSL Direction 05 references the taxonomy. | The output names the category and the disclosure line, as the project-finance module already does. |
| S6 | Bank holds both equity and bonds of the same conglomerate through several subsidiaries. | D9 and C12 together: consolidation choice recorded per exposure. |

---

## 4. What the existing Part A code already provides

`src/domains/pcaf-part-a/domain/` (project finance) supplies, and this class reuses without
change: `provenance.traced/absent`, the refuse-not-cap attribution shape, the
per-class `data-quality.js` lookup and `weightedByOutstanding`, the
inventory/impact separation in `index.js`, and the route/schema/test layout.

What it does **not** have and this class needs: a denominator module (EVIC and
its footnotes), three scopes with two options per exposure, removals *and*
credits as separate lines, a fluctuation analysis, the intensity adjustment
factor, a portfolio roll-up with financial-sector separation, identifiers, and
an exposure register.

---

## 5. Build plan

### 5.1 Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | Attribution factor > 1 is **refused**, not capped. | Box 5.1-2: EVIC makes it impossible for a listed company; if it happens an input is wrong. Consistent with project finance. |
| D2 | The year-end basis (calendar / fiscal) is a **portfolio setting**, and numerator and denominator must share a date. | p.41. |
| D3 | The data-quality option is **derived from the basis of the emissions figure**, never chosen from a list; a different option may be claimed only with a justification, recorded. | p.47 (provider-estimated ≠ reported). Same rule as the generation path already enforces. |
| D4 | Each exposure carries **two options**: scope 1+2, and scope 3. | fn 53; §2.1. |
| D5 | 3b and 3c **print no attribution factor**. | fn 41. |
| D6 | **Unadjusted** absolute financed emissions are the figure. The **adjusted** absolute figure is not computed in v1 and is reported absent with p.51 quoted. The Box 5.1-3 **intensity** adjustment *is* computed, because the equation is given, labelled for asset owners/managers, with the bank caveat. | pp.50–53. |
| D7 | Financial-sector counterparties are flagged and **rolled up separately**. | p.41. |
| D8 | Sector taxonomy for disaggregation: **NACE Rev. 2 Level 2**, because the standard's own phase-in table is written in it (Table 5.1-1). GICS may be stored beside it. | p.41. |
| D9 | The **Third Edition** is cited; this class carries the *Built on GHG Protocol* mark (first-edition class) and the conformance statement may say so. | Build spec §1.1. |

### 5.2 Module structure

Extending `src/domains/pcaf-part-a/domain/`:

```
src/domains/pcaf-part-a/domain/
  listed-equity/
    index.js          assessListedEquity(exposure) → traced result
    classify.js       Figure 5-1 gate: instrument, listing, UoP, held-for-sale, fund look-through
    denominator.js    EVIC and total E+D with every footnote as a named rule
    options.js        derive (scope12 option, scope3 option) from the emissions basis
    estimate.js       Options 2a/2b/3a/3b/3c arithmetic, inflation on 4/5 factors
    lines.js          six reporting lines: S1, S2, S3, removals, credits retired, credits generated
    portfolio.js      roll-up: by class, by NACE L2, financial sector apart, weighted DQ, S3 apart
    fluctuation.js    Δoutstanding · ΔEVIC · Δemissions decomposition, with basis text
    intensity.js      economic intensity, Box 5.1-3 ADJ factor, both figures
    conformance.js    rule → implementation → proving test (this document's §2)
  attribution.js      + DENOMINATORS['listed-equity'], ['corporate-bond-private']
  data-quality.js     + TABLES['listed-equity-corporate-bonds']

data/pcaf-parta/
  dq-listed-equity-corporate-bonds.json     Table 5.1-2, every row cites p.46
  nace-l2.json                               codes and names, for sector disaggregation

src/domains/pcaf-part-a/interface/schemas/pcaf-parta.js                        + listedEquityExposureSchema, portfolioSchema
src/domains/pcaf-part-a/interface/routes/pcaf-parta.js                      + /listed-equity/assess, /listed-equity/portfolio
tests/parta-listed-equity.test.js            acceptance from the standard's own examples
docs/PCAF-PART-A-LISTED-EQUITY.md            this document
```

### 5.3 Data model — one exposure

```
Exposure
  identifiers        { lei, isin, cusip, sedol }        p.53
  counterparty       name · country · naceL2 · financialInstitution?   p.41, p.43
  instrument         'listed-equity' | 'corporate-bond'
  listed             true | false  (bond only; equity must be listed)   p.40
  onBalanceSheetAtYearEnd, heldForSale                                   p.37, p.40
  viaFund            { fundName, fundWeight } | null                     p.40
  outstanding        { amount, currency, basis: 'market-value' | 'book-value', asOf }   p.41
  denominator        EVIC: { marketCapOrdinary, marketCapPreferred, totalDebtInterestBearing,
                             totalDebtNonInterestBearing?, minorityInterests?, customerDeposits?,
                             asOf, currency, entity, recourseReason? }
                     or  E+D: { totalEquity, totalDebt, asOf } or { totalAssets, asOf, fallbackReason }
  emissions          scope1, scope2, scope3 each: { value, period, basis:
                        'reported-verified' | 'reported-unverified' | 'provider-relayed' |
                        'provider-estimated' | 'energy-activity' | 'production-activity' |
                        'revenue-sector' | 'assets-sector' | 'turnover-sector' | 'alternative',
                        source, verifier?, provider?, providerMethod?, justification? }
  activity           for 2a/2b/3x: energy[], processEmissions, production, revenue, indicator?, factor{...}
  removals, creditsRetired, creditsGenerated   { value, period, basis } | null   p.49
```

### 5.4 Acceptance tests — the standard's own numbers

| Test | From | Must reproduce |
|---|---|---|
| Portfolio of three companies | Table 5.1-3/5.1-4, pp.49–50 | S1 6,100 · S2 1,260 · S3 10,000 · removals 2,200 · credits retired 7,250 · generated 600 |
| EVIC vs EV | Box 5.1-2, p.43 | EV: 63% + 63% > 100%; EVIC: 50% + 50% = 100% |
| Intensity adjustment | Box 5.1-3, pp.52–53 | ADJ = 0.896; adjusted base 89.6; adjusted current 100.9; decarbonisation 0.914% either way |
| Weighted DQ | Box 6.1-6, p.168 | 3.03 across the class; 3.53 for oil & gas |
| Negative equity | fn 42 | equity → 0, all to debt |
| 2a for scope 3 | fn 53 | refused |
| 3b/3c | fn 41 | no attribution factor in the result |
| Derivative | p.40 | refused with the clause |

### 5.5 Phases

| Phase | Deliverable | Done when |
|---|---|---|
| L1 | `classify`, `denominator`, `attribution` extension, DQ table | Every §3.1–3.2 scenario has a test; Box 5.1-2 reproduces |
| L2 | `options`, `estimate`, `lines` | Table 5.1-4 reproduces; fn 53 / fn 41 / fn 55 enforced |
| L3 | `portfolio`, `intensity`, `fluctuation` | Box 6.1-6 and Box 5.1-3 reproduce; financial sector apart; S3 apart |
| L4 | Route, schema, reference endpoint, exposure register (manual entry) | An analyst enters a book of CSE holdings and sees the position |
| L5 | Report and checklist, reusing `partc-report-standard` and `report-integrity` | Every DCL item answered from the report; adjusted figure **absent** with p.51 |
| L6 | Conformance matrix + generated doc; `src/domains/lending/application/pcaf.js` stops claiming to be PCAF | Build fails if a rule cites a missing test |

### 5.6 Not built, and said so

- Derivatives, short positions, underwriting — refused with the clause (p.40).
- The adjusted *absolute* figure (p.51) — reported absent; the adjusted
  *intensity* (Box 5.1-3) is computed.
- Loop-breaking between mutually holding FIs — prompts, does not compute.
- A Sri Lanka EEIO factor set — the factor store carries the gap as a named
  gap, in the same way `A5.2` does in Part C.
