# PCAF Part A — the study, category by category

What the Third Edition actually requires for each of the ten asset classes,
what it leaves open, how banks are meeting it today, what is already built in
`src/domains/pcaf-part-a/`, and a plan for the rest — written so that one
section can be chosen and built next.

**Sources read in full for this study.** Every page number below is the
printed page of the document named, so a rule can be checked against the
standard rather than against this summary.

| Document | Held as | Pages | Role |
|---|---|---|---|
| PCAF (2025). *The Global GHG Accounting and Reporting Standard Part A: Financed Emissions.* **Third Edition**, December 2025 | `PCAF-PartA-2025-V3-15012026.pdf` | 209 | The method. Chapters 4–6 and Annex 10 are the calculator and the reporting rules |
| PCAF Disclosure Checklist, Part A | `PCAF-Disclosure-Checklist-Part-A-Financed-Emissions-May-2025.pdf` | 8 | The reporting requirements as Yes/No items a signatory files |
| Disclosure Checklist FAQ | `PCAF-DCL-Part-A-FAQs-May2025.pdf` | 4 | What the checklist is and is not |
| *Financed avoided emissions & forward-looking metrics* — supplemental guidance | `PartA-PCAF-Supplement-Avoided-Emissions-FLM.pdf` | 32 | Avoided emissions, EER, EAE — optional, always separate |
| *Bank climate risk compliance and the construction carbon data gap* | `Bank Climate Risk Compliance and the Construction Carbon Data Gap_ CarbonIQ Strategic Analysis.pdf` | 19 | Market context. Its own sourcing, checked against the standard in §9 below |

Two version facts to carry everywhere. The Disclosure Checklist is dated May
2025 and cites Chapter 6 at **pp.122–129** and "the seven asset classes"; in the
Third Edition Chapter 6 is **pp.160–174** and there are **ten**. And the *Built
on GHG Protocol* mark applies to the first edition only: the GHG Protocol closed
its review service, so everything added in the second (Dec 2023) and third (Dec
2025) editions — sovereign debt, use of proceeds, securitizations, sub-sovereign
debt, undrawn commitments, the fluctuation analysis, the inflation adjustment —
**has not been reviewed by the GHG Protocol** (p.8, p.10). A conformance
statement must say which half a figure sits in.

---

## 0. How this document is kept

This is **the reference guide for Part A**. Every section built under
`src/domains/pcaf-part-a/` is built from what is written here, and what is
written here is held to the standard rather than to our memory of it.

Four rules keep it worth reading a year from now.

**A new finding is recorded here first, before the code that acts on it.** A
rule read off the standard, a worked example that reproduces, a table whose
shape differs from the one beside it, a claim of ours the document does not
support — each lands in the section it belongs to, with the page of the source
it came from, and then the change log below records what moved. A finding that
lives only in a commit message is a finding the next person re-derives.

**A page cite is the unit of evidence.** Every figure, threshold and rule in
this document names the printed page of the named document, so a reader can
check the standard rather than check us. A statement with no cite is either
CarbonIQ's own judgement — and says so — or it is not yet evidence.

**A built section moves from §11 to §10.** §11 is the plan and §10 is what
exists; a row that has shipped belongs in the second. The "done when" column is
the acceptance test and is not rewritten after the fact to match what was
built.

**A correction is recorded as a correction.** Where this study contradicts
something we had previously written — `docs/PCAF-PART-A-BUILD-SPEC.md`, the
strategic-analysis PDF, `CLAUDE.md` — the contradiction is stated with both
readings and the page that settles it (§3 and §9 both carry one). Silently
replacing the old text leaves the next reader to rediscover the same trap.

---
---

## 1. The frame every asset class sits inside (Chapter 4, pp.24–31)

These are the rules that apply before any asset class is chosen. Each is a
"shall" unless marked.

| Rule | What it says | Page | Engine consequence |
|---|---|---|---|
| **Consolidation** | Operational or financial control approach, never equity share. Everything financed lands in **scope 3 category 15** | 26–28 | One field on the reporting entity; a document prints it |
| **Recognition** | Account for all financed emissions; disclose and justify every exclusion | 25 | Coverage is a figure with a denominator — the whole book, not what was assessed |
| **Measurement** | Follow the money. Seven Kyoto gases. Absolute emissions at minimum; removals separately where relevant | 28 | Removals are a separate container, never netted |
| **Fixed point in time** | Positions at one date (fiscal year-end); the GHG period aligns with the financial period | 28 | The exposure register is a snapshot per reporting year |
| **Attribution** | Financed emissions = attribution factor × borrower emissions; the factor = outstanding ÷ total value of the company, project or asset (equity + debt, or EVIC) | 28–29 | The denominator is a property of the asset class, never a shared default |
| **Five levels of double counting** | Between institutions; co-financing; between transactions in one institution; across asset classes; within an asset class. The scope-1/2 vs scope-3 kind cannot be avoided, only made transparent | 29–30, 163–164 | Scope 3 is always reported apart from scope 1+2 |
| **Data quality** | Highest quality available per class; improve over time; the score is class-specific (Chapter 5, Annex 10.1). A lag between financial and emissions data years is acceptable | 30–31 | One table per class; a year mismatch is recorded, not refused |
| **Disclosure** | Absolute financed emissions shall be disclosed, under Chapter 6 | 31 | The report is the product |

**Choosing the method is a decision tree, not a dropdown (Figure 5-1,
pp.34–36).** Step 1: is the exposure debt or equity? No → out of Part A
(derivatives, underwriting, advisory; Part B or C). Step 2: are proceeds
allocated to specific assets? No → Step 3a, classify by customer segment
(sovereign, sub-sovereign, listed equity/corporate bonds, unlisted
equity/business loans); general consumer credit is out of scope. Yes → Step 3b,
is it securitized? Yes → §5.8's own tree. No → Step 4a, does the UoP structure
control the underlying? Yes → treat as a corporate (§5.1/5.2/5.3). No → Step 5a,
debt-based with one fully allocated asset? Yes → Step 6, classify by asset type
(CRE, mortgage, motor vehicle, project). No → §5.7 use of proceeds. The engine
should ask these questions in this order and refuse an exposure that cannot
answer them, because the answer decides the denominator and the score table.

**Coverage boundary (pp.36–37).** Only what is on the balance sheet at
fiscal year-end. Revolving facilities, bridge loans and letters of credit count
only for the outstanding amount at year-end; assets held for sale and short
positions are out. Exchange-traded funds and derivatives have no method.

---

## 2. The ten asset classes

The same seven headings for each: definition and boundary · scopes required ·
attribution (numerator, denominator, and the rules at the edges) · equations
and options · data-quality table · limitations PCAF itself records · status in
CarbonIQ and relevance to a Sri Lankan bank.

### 2.1 Listed equity and corporate bonds (§5.1, pp.40–53)

**Boundary.** On-balance-sheet listed equity (common and preferred) and
corporate bonds — **listed or unlisted** — for general corporate purposes.
Funds are in if the holdings are known. Out: derivatives, short/long positions,
IPO underwriting, trading-book and held-for-sale assets, and equity in private
companies (→ §5.2).

**Scopes.** Scope 1, 2 **and 3** of the investee, **all sectors** — the phase-in
ended for reports published from 2025 (Box 5.1-1, p.40). Scope 3 disclosed
separately. An institution that cannot report scope 3 **shall explain**.
Scope 3 of investees in the financial sector is required too; separate
reporting of financed emissions to the financial sector is recommended, and
mutual holdings between two FIs may ignore the reverse leg to stop a loop
(p.41).

**Attribution (pp.41–43).**
- Numerator: market value for listed equity (price × shares); book value of
  debt for bonds. Year-end, consistently.
- Denominator: **EVIC** for listed companies — market cap of ordinary and
  preferred shares at year-end + book value of total debt + minorities'
  interests; **cash is not deducted**, so the total attribution to equity and
  debt providers is 100% and never more (Box 5.1-2's worked example: EV
  excluding cash attributes 126%). For bonds of **private** companies: total
  equity + debt from the balance sheet.
- Edge rules: negative book equity → set equity to 0 (fn 42); total debt
  includes current and long-term (fn 43); if debt or equity cannot be obtained,
  fall back to **total balance sheet value** with intent to improve (fn 44);
  the EU TEG precautionary principle allows *excluding* EVIC elements (lower
  denominator, higher attribution) but never the market cap or total debt base
  (fn 46); a subsidiary is attributed at subsidiary level if its balance sheet
  is held, otherwise at the level of the entity with recourse (fn 48); for
  loans to other FIs, customer deposits are part of debt (p.43).

**Options (pp.44–48).** Option 1 reported (verified 1a, unverified 1b — from
the company or a provider such as CDP); Option 2 physical activity (energy
consumption 2a — scope 1 and 2 only, fn 53; production 2b); Option 3 economic
activity (revenue × sector factor 3a; asset-based 3b; revenue-with-turnover 3c
— 3b and 3c produce **no attribution factor** at all, fn 41). Alternative
methods are allowed with an explanation. Providers estimate too; an FI should
ask which option a provider's figure really is, and PCAF recommends one
provider across the book because scope 1+2 figures vary between them (p.47).

**DQ table 5.1-2 (p.46).** 1a→1, 1b→2, 2a→2, 2b→3, 3a→4, 3b→5, 3c→5.

**Removals (p.49).** Attributed with the same factor; reported separately from
absolute emissions and from credits retired or generated. Worked example
Tables 5.1-3/5.1-4 (pp.49–50) — the engine's acceptance test.

**Limitations PCAF records.** EVIC moves with the market, so unadjusted
absolute figures are **required**; adjusted ones are optional, separate, and
must disclose the method (pp.50–51). Box 5.1-3 gives asset owners an
inflation-correction factor ADJ = Σ W × EVIC_b / EVIC_T for economic
intensity, with the reservation that it is untested for banks (p.51).
Organisation identifiers (LEI, ISIN, CUSIP) are needed at scale (p.53).

**CarbonIQ status: built.** `domain/listed-equity/` (classify, denominator,
estimate, fluctuation, intensity, lines, options, portfolio), the DQ table in
`data/pcaf-parta/dq-listed-equity-corporate-bonds.json` with per-option scope
and attribution-factor flags, 33 tests, and `docs/PCAF-PART-A-LISTED-EQUITY.md`.
**Sri Lankan relevance: moderate** — a bank's CSE equity book and corporate
debentures; small beside loans and government securities.

### 2.2 Business loans and unlisted equity (§5.2, pp.55–65)

**Boundary.** Business loans to listed and unlisted companies for general
corporate purposes — including revolving and overdraft facilities and loans
secured on real estate — and equity in private companies. State-owned
enterprises are in; loans to governments are §5.9/5.10 (fn 69). Loans with
known use of proceeds go to §5.4/5.5/5.6/5.7 — though an institution may still
*report* them under the name "business loans" if that is its book's name
(fn 72). Private equity funds go to §5.7.

**Scopes.** Identical to §5.1: scope 1, 2 and 3, all sectors, scope 3 separate,
an explanation where scope 3 cannot be reported (p.56).

**Attribution (pp.56–58).** Numerator: disbursed debt minus repayments,
declining to 0 when repaid; for unlisted equity, the FI's share of shares ×
the investee's total book equity. Denominator: total equity + debt from the
balance sheet for private companies; **EVIC for business loans to listed
companies**. The same edge rules as §5.1 (negative equity → 0; fallback to
total balance sheet; subsidiary rule; deposits count as debt for FIs).

**Options and DQ table 5.2-1 (p.60).** The same three options and the same
scores as §5.1: 1a→1, 1b→2, 2a→2, 2b→3, 3a→4, 3b→5, 3c→5. Footnote 86: for
loans to listed companies "total equity and debt" means EVIC. The emission
factor must match the primary activity financed — a paddy-rice factor, not an
agriculture factor (p.62). For loans to other FIs with no PCAF-aligned figure,
a score-5 estimate from the borrower's sectoral distribution is permitted, or an
economy-wide factor if no breakdown exists.

**Limitations PCAF records (pp.64–65).** Option 3 is generalised and needs
sector mapping; mixing borrower-specific and sector-average data mixes scope
coverage (specific data often has scope 3, EEIO often does not); year-end
balances miss seasonal books — a monthly average may be used but reported
separately; EVIC volatility as in §5.1. Footnote 71 is worth quoting for a
lending bank: guidance on the interannual fluctuation of revolving products is
still to come, and an FI "should be transparent on any major last minute
increases or decreases at fiscal year-end".

**CarbonIQ status: built** — `domain/business-loans/` (classify, numerator,
checks, engine, portfolio) over `domain/corporate/` (the denominator, option,
line and estimation machinery §5.1 and §5.2 share, bound per chapter to its own
table and footnote numbers), Table 5.2-1 in
`data/pcaf-parta/dq-business-loans-unlisted-equity.json`, two routes, 39 tests
anchored on the standard's own Tables 5.2-2/5.2-3, and
`docs/PCAF-PART-A-BUSINESS-LOANS.md`; the persisted exposure register
(migration 0008), the Lending Book screen, and the sector factor library with
the intensity bands governed in the baseline registry. What is *not* built is
the report and a released factor set — see §10.
**Sri Lankan relevance: the largest class on the book.** Corporate and SME
lending is the bulk of a Sri Lankan commercial bank's assets; almost every
borrower is unlisted; almost none reports emissions, so Options 2 and 3 carry
the book. This is also where a **contractor or developer** borrowing for
general purposes sits, which is where CarbonIQ's physical-activity data reaches
Part A through Option 2 (see §9).

### 2.3 Project finance (§5.3, pp.67–75)

**Boundary.** Loans or equity to projects with **known** use of proceeds and a
self-contained budget — a power plant, a wind farm, an efficiency project.

**Scopes.** Scope 1 and 2 of the project; **scope 3 "should be covered if
relevant"** — nuclear, hydro, infrastructure (airports, highways), oil and gas
exploration are the examples (fn 102). Removals separate. **Avoided emissions
were removed from this chapter in the Third Edition** and moved to the
supplement, which itself says it contains no renewable-specific calculation
guidance and points back to earlier editions (fn 103).

**Attribution (pp.67–69).** Outstanding ÷ total project equity + debt. Debt
excludes accrued interest (fn 105); equity is the FI's share × project book
equity; **guarantees attribute nothing until called** (p.68); at the start the
denominator is the total financing raised, thereafter the project's own balance
sheet. Figure 5.3-1: attribution shifts from debt to equity as debt is repaid.
Negative equity → 0; fallback to total balance sheet.

**Projects without a balance sheet (p.69) — the rule that matters for
construction.** An efficiency project financed by an integrated debt structure
(LEDs, a new boiler) has no balance sheet and its total debt cannot be
monitored. If the project's emissions **can be defined independently**, the
factor is outstanding ÷ **total project value at origination**, frozen; if that
value is unobtainable, the latest value, then fixed. If the emissions cannot be
defined independently, attribute on the overarching entity instead.

**Options and DQ table 5.3-1 (p.71).** 1a→1, 1b→2, 2a→2, 2b→3, 3a→4, 3b→5,
3c→5. Option 2 accepts **P50** production estimates for renewables (fn 113).
The table is "recommended", and an institution may refine it per project type
if the refined table is disclosed (p.71) — the only class where PCAF says so.

**Lifetime emissions (p.74) — a "should".** An initial sponsor or lender should
assess the **total projected lifetime scope 1 and 2** of a project financed in
the reporting year and report it **separately, in the year of contracting**,
from capacity × load factor × life × carbon content. Chapter 6 repeats it
(p.163). Portfolio and lifetime accounting are complementary (p.75).

**Construction emissions.** PCAF states them plainly: a plant is usually built
by a contractor, so construction emissions sit in the **project developer's
scope 3**, "usually not significant enough to report or … unavailable", and
"when these scope 3 emissions are relevant, they should be reported" (p.74).
That is the door CarbonIQ's A1–A5 figure enters by, and it is a *should* under
a *scope 3 if relevant* rule — not the mandatory figure.

**CarbonIQ status: built, with a strong renewable path.** Attribution,
the DQ table (`dq-project-finance.json`), a generation → grid-factor derivation
that decides the option from the data consumed rather than a picked value,
country grid factors in `country-config.json`, refusal of a factor above 1
unless justified, and the impact container (reduction/avoided/EER/EAE) kept
apart from the inventory. 27 engine + 39 generation + 10 API tests. **Gaps
against the chapter:** the no-balance-sheet rule (value at origination,
frozen), lifetime emissions in the year of contracting, removals, and the
"refine per project type" disclosure. **Sri Lankan relevance: high** —
renewable IPPs, the DFCC GCF pipeline, and every construction project financed
through an SPV.

### 2.4 Commercial real estate (§5.4, pp.77–81)

**Boundary.** Loans to buy or refinance income-producing property, and CRE
investments without operational control (joint ventures). Listed CRE → §5.1;
loans secured on CRE for other purposes → §5.2. **Construction and renovation
loans are optional** (p.77).

**Scopes.** Scope 1 and 2 of the building's operational energy use, occupants
and shared facilities included. Construction emissions: optional; if the
developer reports them, account for them during construction as scope 3
category 15; PCAF "will continue to monitor" embodied-carbon guidance and
"could expand its coverage" when robust approaches exist (pp.77–78, fn 123
names the WBCSD kgCO2e/m² work).

**Attribution (pp.78–79).** Outstanding ÷ **property value at origination**
(land + building + improvements). Where origination value is unobtainable: the
latest value, then **fixed** for every subsequent year. A modification,
renewal, refinance or extension with a new valuation **updates** the
origination value to that date. Full financing without operational control →
100% attribution; joint ownership → by share invested.

**Equation.** Σ (outstanding ÷ value at origination) × energy consumption by
source × emission factor per source (p.79). Supplier-specific (market-based)
factors first, average (location-based) second (fns 126–127).

**DQ table 5.4-1 (p.80) — a different shape and different numbers.**
1a→1 metered energy × supplier factor; 1b→2 metered × average factor;
2a→3 **official energy label** × floor area; 2b→4 building-type and
location statistics × floor area; 3→5 statistics × number of buildings.
**Option 2a is score 3 here and score 2 in the corporate classes; 2b is 4 not
3; Option 3 is 5.** Where no official labels exist an FI may use an equivalent
certificate it judges comparable (fn 129).

**Limitations PCAF records (p.81).** Most countries lack labels and metered
data, so estimates prevail; country-specific tailoring is expected; the
property-value rule exists precisely because origination values are held in
some countries and revalued annually in others.

**CarbonIQ status: not built.** **Sri Lankan relevance: high** — hotels,
office, retail and industrial lending; no national energy-label scheme, so a
book starts at score 4 or 5 and floor-area statistics for Sri Lanka are a gap
the regional-baseline registry is built to govern.

### 2.5 Mortgages (§5.5, pp.83–88)

**Boundary.** Residential purchase and refinance, including small multifamily.
A refinance by the original lender supersedes; by another lender it moves the
building. **HELs and HELOCs are not required**; **construction and renovation
mortgages are not required** — the homeowner does not account for the builder's
emissions (pp.83, fn 132). No distinction between private and corporate
mortgages (p.87).

**Scopes.** Scope 1 and 2 of the property's energy use; whole property for
multifamily with shared facilities, the unit alone for a single apartment.

**Attribution (p.84).** Outstanding ÷ property value at origination, the same
fixing rule as CRE, and PCAF's stated assumption that the owner takes
ownership of the building's emissions.

**DQ table 5.5-1 (p.86).** Identical to CRE: 1a→1, 1b→2, 2a→3, 2b→4, 3→5.
"Easily accessible data for many countries is currently between score 4 and
5" (p.85). EV charging may be inside a home's metered electricity and should be
separated where possible (p.87).

**CarbonIQ status: not built.** **Sri Lankan relevance: high** — housing
lending is a large retail book, and green mortgage products (p.87) are a
product line the data would support.

### 2.6 Motor vehicle loans (§5.6, pp.90–96)

**Boundary.** Loans and lines of credit to consumers and businesses to finance
one or several vehicles. **The FI defines which vehicle types it includes** and
must explain any type it leaves out (p.90). Boats, yellow equipment, buses and
motorcycles are all in the example list.

**Scopes.** Scope 1 (fuel) and scope 2 (electricity for EVs and hybrids).
Scope 3 (production, delivery, end of life) is not required; an FI that
chooses to report production emissions of a **new** vehicle reports them as a
lump sum under scope 3 in the first year only (p.91).

**Attribution (p.91).** Outstanding ÷ total value at origination (the price,
equity + debt). **If the value at origination is unknown, assume 100%
attribution** — the standard's own conservative default. On repayment the
financed emissions are 0.

**Equation (p.92).** Σ factor × distance × efficiency (per fuel) × fuel emission
factor.

**Options and DQ table 5.6-1 (p.94).** Six sub-options: 1a actual fuel → 1;
1b make/model efficiency × actual distance → **1**; 2a make/model × local
statistical distance → 2; 2b make/model × regional distance → 3; 3a vehicle
type only → 4; 3b average vehicle → 5. **Two options score 1 here**, and Table
10.1-6 confirms it. **Mixed options take the lowest score in the mix** (p.93),
the one class where PCAF states a combination rule. Dual-fuel: manufacturer or
national usage split, else geography split, else assume 100% combustion (p.96).
Grid factor: borrower's locality, then the branch's, then the country's.

**CarbonIQ status: not built.** **Sri Lankan relevance: moderate-to-high** —
leasing and vehicle finance is a large consumer book for banks and finance
companies, and make/model efficiency data is public (WLTP, ICCT).

### 2.7 Use of proceeds structures (§5.7, pp.98–109) — new in the Third Edition

**What it is.** A structure holding a pool of one or more underlying assets —
equity and debt funds, SPVs without control, labelled bonds and loans allocated
to specific assets, loans allocated to multiple named projects. Two kinds:
**separate** (a legal entity with its own balance sheet — funds, SPVs) and
**integrated** (assets remain on the issuer's balance sheet — green bonds,
labelled loans). Table 5.7-1 (p.98) is the inclusion map; sustainability-linked
instruments are **not** UoP structures and are accounted at issuer level; a
project SPV is accounted under §5.3; a single fully allocated debt asset goes to
its own class.

**Scopes.** Those of each underlying asset's class (p.100).

**Attribution — double (p.100).** Factor = (investor outstanding ÷ total equity
+ debt in the structure) × Σ per-asset attribution under the asset's own class.
Separate structures: financed emissions only once allocated, so **zero at
issuance** unless assets were allocated at once (p.101). Integrated structures:
allocated + unallocated amounts, the unallocated part on issuer-level data or a
score-5 sectoral estimate where the intended sector is evidenced (p.102).
Investors may fall back to issuer-level data for integrated structures where
look-through is theoretically impossible, practically infeasible or immaterial
(pp.101–102). Where the issuer reports the structure's financed emissions,
investor share × reported figure (p.102).

**Outstanding amount for portfolio metrics** = investor outstanding × allocation
percentage; 100% for integrated; for separate, Σ asset outstanding ÷ total
equity + debt in the structure (p.103). An unknown allocation may be assumed
100% — but then unallocated amounts must also be given emissions.

**Data quality.** The structure's score is the **outstanding-weighted average
of the underlying assets**; with nothing allocated the score **cannot be
defined** (p.103) — the second place the standard says a score is absent, not
zero.

**The adjustment nobody else prints (pp.108–109).** A non-UoP investor in an
issuer that has integrated UoP debt should restrict the boundary: outstanding ÷
((EVIC or equity) + total debt − UoP debt) × (company emissions − UoP
emissions), feasible only where the issuer discloses both. An FI that issues an
integrated UoP structure **shall** report its emissions and total debt
separately (also Chapter 6, p.162). An investor holding both a green bond and a
general bond of the same issuer **shall** make the adjustment for the general
bond (p.109).

**CarbonIQ status: not built.** **Sri Lankan relevance: direct** — DFCC's
green, blue and GSS+ bonds are integrated UoP structures, and DFCC as issuer
must report the structure's emissions and total debt separately.

### 2.8 Securitizations and structured products (§5.8, pp.111–138) — new

**Boundary.** RMBS, CMBS/CMO, mortgage covered bonds, other property-backed
ABS, CLO/CDO, auto ABS — in scope, each built on the corresponding Part A
class (Table 5.8-1, pp.112–113). Out: credit-card, student-loan, home-equity
receivables, public-sector and land covered bonds, other hard-asset ABS
(aircraft, solar, railcar) unless asset-level emissions are held. A look-through
to the collateral is mandatory; if the collateral's nature is unknown the
method cannot be applied (p.113).

**Scopes.** As the underlying class (p.119): scope 1+2 for real estate and
vehicles; scope 1, 2 and 3 for corporate collateral, scope 3 separate.

**Attribution — five steps, four factors (pp.117–124).** Asset emissions →
**collateral attribution factor** (COA nominal ÷ asset value at origination, or
÷ total equity + debt, ÷ EVIC, ÷ vehicle value — Table 5.8-2, p.121) → **loan
attribution factor** (loan COA in pool ÷ total loan COA) → pool → **tranche
attribution factor** (tranche COA ÷ deal COA; seniority is irrelevant) →
**investment attribution factor** (holding ÷ tranche). **CAFs are capped at 1**
(p.122) — the one place in the corporate-side classes where PCAF caps rather
than leaves it. Preference order for the CAF: COA/AVO, OOA/AVO, COA/UAV,
OOA/UAV (p.122). Five guiding principles (p.120): tranche totals equal the pool;
equal what the originator would report; tranches repaid from principal get
emissions; on-balance-sheet securitised loans are counted by both originator and
tranche holders, an acknowledged double count; no per-tranche asset allocation
unless a tranche is backed by a distinct pool.

**Structural rules (Tables 5.8-4/5.8-5, pp.131–136).** Static and revolving
pools, SRT, synthetics, warehouses, master trusts (re-levering treated as a
refinance), re-REMICs (decompose), private deals — in scope; repos and TBAs —
out until derivative guidance exists; IO/PO strips split by issuance proceeds;
reserve funds, liquidity facilities and hedges — out; over-collateralisation is
a virtual tranche; risk retention stays with the retention holder. Losses:
COA net of allocated losses ideally, unadjusted acceptable (p.137); defaults
keep COA ÷ AVO until the asset leaves the pool (p.138).

**Data quality.** Weighted by COA of the underlying assets; a pool amortisation
factor or constant intensity where amounts are unavailable (Figure 5.8-6,
p.127). Conservative assumptions where data is missing — assume single-family
detached if property type is unknown (p.126).

**CarbonIQ status: not built.** **Sri Lankan relevance: low** — a shallow
securitisation market; one to hold as a reference, not to build first.

### 2.9 Sovereign debt (§5.9, pp.140–148)

**Boundary.** Sovereign bonds and loans of any maturity and currency; central
bank issuance on the sovereign's behalf is in; supranationals not required
(p.140).

**Scopes — PCAF's own definition, mirroring the cities protocol (Table 5.9-1,
p.141).** Scope 1 = domestic territorial emissions (UNFCCC, exports included);
scope 2 = imported grid electricity, heat, steam, cooling; scope 3 = non-energy
imports. Scope 1 is a shall; 2 and 3 are shoulds. **Scope 1 shall be reported
both including and excluding LULUCF** (p.141). Consumption emissions =
production − exported + imported, recommended as an additional view with its
stated limitations (pp.142–143).

**Attribution (pp.143–144).** Exposure (USD) ÷ **PPP-adjusted GDP**
(international USD). The rationale (Annex 10.3, pp.201–204): debt alone is a
poor denominator — Hong Kong's near-zero debt would attribute 1,369× Singapore's
emissions per dollar — so output stands in for enterprise value, accepting the
stock-over-flow mismatch consciously.

**Intensities (pp.144–146).** Production ÷ PPP-GDP; consumption per capita;
at least five years of history recommended.

**DQ table 5.9-6 (p.147).** 1a→1 verified UNFCCC-reported; 1b→2 unverified;
2→3 physical energy activity; 3a→4 sectoral revenue; 3b→5 proxy country.
Annex 10.3 (pp.205–206) lists sources: UNFCCC data interface, Climate Watch,
EDGAR (four-year lag), OECD trade-embodied CO2 for scope 2/3 (CO2 only),
World Bank PPP GDP.

**Limitations PCAF records.** Scope definitions are an analogy, not a 1:1;
double counting with corporate classes is accepted if reported separately;
PPP-GDP is a flow (p.148).

**CarbonIQ status: not built.** **Sri Lankan relevance: high and under-noticed**
— government securities are a large share of a Sri Lankan bank's assets, the
inputs are public (Sri Lanka's UNFCCC submissions, World Bank PPP GDP), and the
arithmetic is one division. It is the cheapest high-coverage class to add.

### 2.10 Sub-sovereign debt (§5.10, pp.150–158) — new

**Boundary.** Bonds and loans of regions, cities and municipalities. Three
issuer types (Table 5.10-2, pp.151–152): **sovereign-like without a balance
sheet** (a US state) → territorial method here; **sovereign-like with a balance
sheet** (a Dutch municipality) → either territorial or organisational; and
**corporate-like** (a municipal power agency) → §5.2. The FI judges which and
must say so. UoP bonds financing specific projects are excluded.

**Scopes.** Scope 1 shall, **excluding LULUCF; including LULUCF should** where
available (p.154) — the reverse emphasis from sovereigns, because sub-national
LULUCF data is weaker. Scope 2 and 3 should.

**Attribution (p.154).** Exposure ÷ sub-sovereign PPP-adjusted GDP, the PPP
factor derived at country level (PPP GDP ÷ nominal GDP) and applied to the
region's nominal GDP (Annex 10.3, pp.204–205, worked for Bavaria).
**The factor shall be capped at 1** (p.154).

**DQ table 5.10-5 (p.156).** 1a→1, 1b→2, 2→3, **3→4**, 4a→5 (one level above as
proxy), 4b→5 (two levels above). Option 3 is 4 here and 5 in real estate.
Regional, city and local levels should be disclosed separately; summing them
risks a triple count (p.157). Data exists for US states, EU NUTS-2, Canadian
provinces and Australian states; emerging markets are named as not yet covered
(pp.206–207).

**CarbonIQ status: not built.** **Sri Lankan relevance: low** — provincial
councils barely issue; a reference implementation at most.

---

## 3. Data quality — the consolidated matrix

The build spec recorded that the option-to-score mapping is not uniform. Read
against every table (Chapter 5 and Annex 10.1, pp.191–198) it is this:

| Option | Listed eq. & bonds | Business loans | Project finance | CRE | Mortgages | Motor vehicles | Sovereign | Sub-sovereign |
|---|---|---|---|---|---|---|---|---|
| 1a | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 1b | 2 | 2 | 2 | 2 | 2 | **1** | 2 | 2 |
| 2 / 2a | 2 | 2 | 2 | **3** | **3** | 2 | 3 | 3 |
| 2b | 3 | 3 | 3 | **4** | **4** | 3 | — | — |
| 3 / 3a | 4 | 4 | 4 | **5** | **5** | 4 | 4 | **4** |
| 3b | 5 | 5 | 5 | — | — | 5 | 5 | — |
| 3c | 5 | 5 | 5 | — | — | — | — | — |
| 4a / 4b | — | — | — | — | — | — | — | 5 |

Three facts the engine must carry beyond the lookup. **Motor vehicles score
the lowest option in a mix** (p.93). **UoP and securitised structures carry no
table of their own** — the score is the outstanding- (or COA-) weighted mean of
the underlying, and is **undefined** with nothing allocated (p.103, p.127).
**Avoided emissions have a three-point scale** (supplement, Table 1, p.9):
scores 4 and 5 do not exist because economic-intensity estimation is forbidden.

The build spec's own phrasing — "Option 2b is score 2 in one class" — was not
quite right; 2b is 3 in the corporate classes and 4 in real estate, 2a is 2 and
3, and 1b is 1 in motor vehicles only. The conclusion stands and is stronger:
there are five distinct option→score shapes across eight tables.

**Weighting.** Σ outstanding × score ÷ Σ outstanding, per asset class and per
sector, scope 3 weighted apart from scope 1+2 (Box 6.1-6, pp.167–168, worked
to 3.03 and 3.53). Part C weights by premium; the two functions never merge.

---

## 4. Reporting — what a disclosure must contain (Chapter 6, pp.160–174)

**Shall.** Control approach; the five principles; annual, at a fixed point,
with large changes near the date disclosed; a **baseline recalculation policy
with a disclosed significance threshold**; public reports; all relevant classes
with justified exclusions (data, size, no methodology); **percentage of total
loans and investments covered, by asset class**; seven gases in CO2e on IPCC
100-year GWP (AR5 or latest); biogenic CO2 separate; scope 1+2 combined at
minimum; scope 3 separate where the class requires it, sectors named;
disaggregation by asset class **or** sector, with the emission-intensive
sectors (energy, power, cement, steel, automotive) singled out; no carbon
credits netted; an integrated UoP issuer reports the structure's emissions and
debt separately; removals and avoided emissions outside the scope 1/2/3
inventory; scope 3 weighted score separate; a fluctuation analysis, **if given,
shall state its basis**; an inflation adjustment, if applied, shall be
disclosed; undrawn commitments, if reported, separate from drawn.

**Should.** Multiple periods; lifetime emissions of newly financed projects;
a **fluctuation analysis** decomposing the change into outstanding, enterprise
value and emissions (Box 6.1-3, pp.164–165, from the NZAOA method — new); an
inflation adjustment to score-4 and score-5 economic factors (Box 6.1-5, GDP
deflator or CPI — new); economic intensity in tCO2e per million; physical
intensities per sector; a weighted DQ score or an explanation why not; data
sources and dates; verification to at least limited assurance over time.

**Undrawn loan commitments (§6.2, pp.169–174) — optional, for IFRS S2.** Not an
asset class but a condition of a loan. Undrawn = total commitment − drawn, on
the same denominator as the drawn part (EVIC or equity + debt). An
**unweighted** figure on the full commitment **shall** be reported by anyone
reporting undrawn; a weighted figure (utilisation factor, method disclosed)
**may** be added beside it, never instead. Same DQ table as the drawn loan.
Reported separately from drawn — and Sri Lanka's SLFRS S2 is IFRS S2, so this
is the bridge a Sri Lankan bank needs.

**The Disclosure Checklist.** Twelve reporting requirements and three
recommendations, each Yes/No, a No on a requirement needing a justification,
"non-applicable" recorded as No with a comment, pages of the report cited per
item. Completed checklists are **confidential**, and the Secretariat's review
**is not assurance** — "a form of quality review" (FAQ, p.4). Part C's
`partc-checklist.js` is the pattern: answered from what the report contains,
so an item cannot say Yes to what the document does not hold.

**Annex 10.2 (pp.199–200)** gives the template: scope 3 category 15 by asset
class (now ten rows) or sector, with outstanding covered, scope 1+2, scope 3,
intensity and weighted score per row; a separate table for removals, credits
generated and credits retired; and a separate table for undrawn commitments
with full and optional weighted columns.

---

## 5. Avoided emissions and forward-looking metrics (the supplement)

Optional, and if reported: **separately**, never aggregated for portfolio
comparison, never used to substantiate net-zero claims (pp.2–3).

**Financed avoided emissions.** Two routes: general corporate instruments
(company-level counterfactual, e.g. equity in an insulation maker) and specific
instruments (project- or product-level, e.g. a green bond) — reported apart
from each other, and solutions apart from enablers (p.9). The period must match
the counterparty's own inventory basis: lifetime-in-year-of-sale for
use-of-sold-products, annual for scope 1 (p.7). Counterfactuals must be
conservative and exclude what would have happened anyway — mandated grid
decarbonisation, efficiency already underway (pp.11–12). **Economic-intensity
estimation is forbidden** (p.8). DQ: 1 verified reported, 2 unverified reported
or energy-activity, 3 production-activity (Table 1, p.9). Renewable projects:
operating margin first, then fossil mix traded, fossil mix produced, average
mix last (Table A.1, p.24). The worked green-bond example (pp.25–26) shows the
UoP double attribution applied to avoided emissions with a weighted score of
1.2.

**EER** = base-year − expected-year emissions, calculated **once at
contracting**, attributed with the current-year factor each year, followed by
**AER** (achieved), **%AER** and an **interpolated EER** on a linear path
(pp.15–18). It has a built-in safeguard: an overstated EER shows up as
underperformance later.

**EAE** = counterfactual − projected, annualised over the useful life, reported
each year while exposure exists (pp.19–20). The shipping example (pp.29–31)
carries the rule that matters: a retrofit only to a regulatory minimum (MARPOL
CII rating C) has an EAE of **zero**, because the counterfactual already
contains it. Disclosures must state whether expected changes, a credibility
assessment, a discount rate and a fixed timeframe were used, and use them
uniformly (p.15).

**CarbonIQ status:** the archetype → metric mapping and the separate impact
container exist (`archetypes.js`, `impact.js`); the counterfactual guardrails,
the three-point DQ scale, the year-of-contracting rule and AER tracking do not.

---

## 6. What the standard leaves open — gaps in Part A itself

1. **Embodied carbon of buildings is outside the required boundary.** CRE
   construction and renovation loans are optional (p.77); construction
   mortgages are not required (p.83); the standard names WBCSD's per-m² work as
   something it will monitor. A tool cannot claim that Part A *requires* A1–A5.
2. **Project construction emissions are the developer's scope 3**, reported
   "when relevant" (p.74). Relevance is the FI's judgement and the standard
   gives no threshold.
3. **No corporate-side rule for an attribution factor above 1.** EVIC's design
   avoids it for listed companies; the SSP and sub-sovereign chapters cap at 1;
   motor vehicles assume 100% when the denominator is unknown; business loans
   and project finance say nothing. CarbonIQ's refuse-unless-justified is a
   defensible policy, and it should be stated per class beside the standard's
   own rule where one exists.
4. **Revolving facilities** are counted at year-end only; PCAF says fuller
   guidance is "under development" (fn 71) and asks for transparency about
   year-end swings meanwhile.
5. **Derivatives, ETFs, consumer credit, assets held for sale** — no method.
6. **Sub-sovereign scope 2 and 3, and emerging-market sub-sovereign data** —
   acknowledged absent (pp.157, 206–207).
7. **Sovereign consumption emissions** — CO2 only, two-year lag, input-output
   dependent (p.143).
8. **Renewable avoided-emissions calculation** — removed from Part A, not
   carried into the supplement; the reader is sent to earlier editions (fn 103).
9. **Removals** — attribution guidance only; the calculation waits on the GHG
   Protocol's Land Sector and Removals Guidance (p.22).
10. **The DQ tables are not uniform and the standard never says so in one
    place** — the matrix in §3 is assembled here, not published there.
11. **The PCAF emission-factor database is signatory-only** (p.48, p.62, fn
    137) — an institution that is not a signatory must find Option 2 and 3
    factors elsewhere.
12. **The DCL lags the standard** by one edition on page numbers and class
    count.

---

## 7. What the world needs, and where it is lagging

In PCAF's own words the financed emissions of a financial institution are "by
far the largest share of their overall emissions inventory" (p.14) and the
sector's inconsistency before PCAF "hampered transparency, comparability and
accountability" (p.7). The standard's stated ambition is to be the harmonised
method that ISSB (IFRS S2), CDP and the regulators build on (pp.18–20); IFRS S2
requires banks to disclose category 15 for loans, bonds, equity, project
finance and undrawn commitments, which is why §6.2 exists.

**Where it lags, from the standard's own text.** Scope 3 of investees is now
required across all sectors while "the comparability, coverage, transparency,
and reliability of scope 3 data still varies greatly" (p.41). "Reporting in
emerging markets often lags that of developed markets" (p.47, p.61). Building
data "is still limited in many countries" and easily accessible mortgage data
sits "between score 4 and 5" (p.85). Sub-sovereign and emerging-market data
sources are listed as future work (p.206). Every class's limitations section
says results depend on data quality and on country-specific tailoring.

**Where it lags, from the market.** The repository's strategic analysis (its
own sources are listed in it) reports major banks disclosing whole commercial
books at score 5, HSBC noting that only a third of clients report scope 1 and 2
directly, a twenty-bank review finding scores of 3 to 5 for most portfolios,
and EEIO estimates diverging from reported figures by 100% or more in nearly
half of cases. Two of those examples — a book at score 5 whose own disclosure
says the figures "may not be useful for investment decisions", and a bank that
withholds absolute figures because the data is too poor — are the state of the
art at institutions with far more resources than a Sri Lankan bank.

**Sri Lanka specifically.** SLFRS S1 and S2 are adopted with a phased timeline
(the top-100 listed entities first, all listed entities by 2027), the Central
Bank's Sustainable Finance Roadmap 2.0 (May 2025) mandates climate disclosure
for banks, and Direction 05 of 2022 already requires sustainable-financing
reporting. Against that: no Sri Lankan commercial bank is yet a full PCAF
signatory; Commercial Bank of Ceylon has signed an MOU with IFC support; First
Capital is the first capital-markets signatory; DFCC's 2025 report uses the
transition provisions. There is no national building energy label, no
Sri Lankan EEIO table in common use, and no published Sri Lankan grid
operating-margin series — the three inputs the CRE, business-loan and
project-finance classes lean on at scores 2 to 4.

---

## 8. How banks are doing the work today

The workflow, as the strategic analysis reconstructs it and as the standard's
own text implies:

1. **Origination collects no carbon data.** Financial projections and a
   description; an environmental assessment where required, rarely quantified.
2. **Annual data collection** by the sustainability team, once a year, at
   year-end, across the whole book.
3. **Reported emissions where a borrower has them** (large corporates, listed
   names via a provider such as CDP, Bloomberg, MSCI, S&P Trucost, ISS) —
   Option 1, scores 1–2.
4. **Everything else estimated** from revenue or outstanding × a sector factor
   from an EEIO table (EXIOBASE, CEDA, or a provider's model) — Option 3,
   scores 4–5. For construction, one factor per dollar of "construction"
   revenue, which cannot tell a timber building from a concrete tower.
5. **Attribution in a spreadsheet or a vendor platform** (Persefoni, Watershed,
   MSCI) that holds the formulae and the score tables at issuer level.
6. **A weighted DQ score published**, usually 3–5 for lending books, with a
   narrative that it will improve.
7. **Limited assurance** over the process, rarely over the figures.

What this produces is a number that is conformant and uninformative at the
same time: right by the method, useless for a credit decision, and stuck at the
bottom of the scale because the one input that would move it — borrower- or
project-specific activity data — is never collected where it exists, at
origination.

---

## 9. How CarbonIQ improves it — and the claims it must not make

**The genuine advantage is Option 2.** PCAF ranks physical-activity data
(quantities × verified factors) at score 2–3 and says production-based factors
are "especially useful for emission-intensive industries like utilities,
materials, energy, and industrials" (p.47). A bill of quantities *is* physical
activity data for a construction project, and CarbonIQ already turns it into
A1–A5 with named factors and provenance. That reaches Part A in three places,
each with a different status in the standard:

| Where | How the figure enters | Status in the standard | Score reachable |
|---|---|---|---|
| Project finance, project SPV | Construction-phase emissions as the project's **scope 3**, "should be reported when relevant" (p.74); operational scope 1+2 from the plant thereafter | Should | 2b (production data) → **3** for the construction line |
| Project finance, no balance sheet (integrated debt) | Attribution on value at origination, frozen (p.69); emissions defined independently from the BOQ | Shall, where the emissions can be defined independently | 2b → 3 |
| Business loan to a contractor or developer | The borrower's own scope 1+2 (site energy, plant) from Option 2a, and its scope 3 from production data (2b) | Shall (scope 1, 2 and 3, all sectors) | 2a → 2, 2b → 3 |
| CRE or mortgage construction loan | Construction emissions as scope 3 category 15 **only if the developer reports them** | Optional | — |

So the honest claim is: **BOQ-derived data moves construction exposures from
Option 3 (scores 4–5) to Option 2 (scores 2–3), on the lines the standard
permits, with the figure's status — mandatory, should, or optional — printed
beside it.** The strategic analysis says embodied carbon is "required for new
construction and major renovation loans"; the Third Edition says the opposite
for CRE and mortgages (pp.77, 83) and "when relevant, should" for project
finance (p.74). That sentence must not reach a customer.

**The second advantage is provenance.** Every Part A figure the engine returns
is traced — equation, inputs, factors with source and vintage, assumptions —
which is what limited assurance over the *figures* (not the process) needs
under ISAE 3000 / ISO 14064-3. Banks today get assurance over the process.

**The third is the regional baseline.** The inputs Sri Lanka lacks — grid
operating margin, building energy per m² by type, sector EEIO factors — are
exactly what `src/domains/baseline/` governs: scoped, released, versioned,
superseded with a reason. A country-level factor released there is the
regional judgement the market will quote.

**The fourth is the checklist and coverage.** Auto-answering the DCL from the
report, computing coverage against the whole book, weighting the score by
outstanding with scope 3 apart — the machinery Part C has, applied to Part A's
twelve requirements.

**What must never be said.** "PCAF certified/approved/endorsed"
(`containsForbiddenLanguage()` holds). "Part A requires embodied carbon." A
score quoted from the wrong class's table. A Part C score reused for Part A.
Avoided emissions netted against, or even placed beside, the inventory without
the separation the supplement requires. A lifetime figure presented as the
annual inventory.

---

## 10. What is built, what is not

| Area | Built | Not built |
|---|---|---|
| Asset classes | §5.1 listed equity & corporate bonds; §5.2 business loans & unlisted equity; §5.3 project finance | §5.4, §5.5, §5.6, §5.7, §5.8, §5.9, §5.10 |
| Attribution | EVIC, private-company equity + debt, project equity + debt; factor above 1 refused unless justified | Value at origination with the fixing and modification rules; PPP-GDP; UoP double attribution; SSP four factors; the standard's own caps where it has them |
| Data quality | Three tables, `(assetClass, option) → score`, outstanding-weighted mean, scope 3 apart | Five tables; the motor-vehicle lowest-in-mix rule; the weighted-of-underlying rule for structures; the avoided-emissions 1–3 scale |
| Emissions paths | Direct scope 1/2 entry; renewable generation × country grid factor deriving the option from the data | Building energy paths (metered, label × area, statistics × area, statistics × count); vehicle distance × efficiency × fuel factor; sovereign territorial |
| Impact | Archetype → reduction/avoided/EER/EAE, separate container | Counterfactual guardrails; year-of-contracting; AER and interpolated EER; the shipping "regulatory minimum → zero" rule |
| Portfolio | §5.2 roll-up over a **persisted** register (migration 0008): one row per exposure per reporting year holding the input and the result, a stored projection the roll-up reads instead of the trace (316 ms over 10,000), one loan per year said in the database (migration 0009, `409 DUPLICATE_LOAN`), a recomputation that compares every line and both scores, real coverage against the entity's stated book total, and the improvement plan | The same register reaching §5.1 and §5.3; the lock-and-supersede lifecycle; economic intensity across a book; recalculation policy and threshold on entity settings |
| Reporting | — | The Part A report (one model, two renderers, reusing Part C's standard); auto-answered DCL; Annex 10.2 tables |
| Conformance | — | Rule → implementation → proving test, generated document, evidence run |
| Data validation | §5.2 only: the footnote 71 year-end fluctuation, the emissions-year lag, the vintage of an economic factor (Box 6.1-5), denominator-versus-balance-sheet coherence, sector-intensity plausibility against a **governed band** (the baseline registry, cited by version on the finding), attribution concentration — as findings that refuse nothing and change no figure | The same for every other class |
| Factors | The Option 3 sector factor library keyed to a closed ISIC-based vocabulary (`data/pcaf-parta/sectors.json`, `sector-factors.json`), versioned, dated and checksummed (`data/pcaf-parta/MANIFEST.json`); an estimated figure names the set; a factor in one currency is never applied to an exposure in another | A released factor set — every shipped row is a stated order of magnitude and says so; sector factors for the other classes |
| Surface | The stateless engine routes (`read`), and the register: `exposures` CRUD and `recompute`, `book`, `years`, `position/:year`, `storage` (the writes on `write`, deliberately apart from the engine's `read`); the **Lending Book** screen over the register (`ui/pages/parta-register.html`), computing nothing, with a sample book for a preview session | A reporting-year screen across classes |

Ten test suites: `parta-api`, `parta-business-loans`, `parta-engine`,
`parta-factor-provenance`, `parta-generation`, `parta-listed-equity`,
`parta-register`, `parta-register-api`, `parta-register-ui`, `parta-ui` — and
the browser journey `e2e/parta-register.spec.js`.

---

## 11. The plan, category by category

Ordered by what a Sri Lankan bank's book is made of, by what the existing code
already pays for, and by what the standard itself makes mandatory.

| # | Section | Why this order | What it takes | Done when |
|---|---|---|---|---|
| ~~1~~ **done** | **§5.2 Business loans and unlisted equity** — shipped; see §2.2 and `docs/PCAF-PART-A-BUSINESS-LOANS.md` | The largest class on any Sri Lankan book; the EVIC and equity + debt machinery and the identical DQ table shape already exist for §5.1; the class where CarbonIQ's Option 2 data reaches a contractor's or developer's own inventory | Class entry; `dq-business-loans-unlisted-equity.json` (Table 5.2-1, p.60); unlisted-equity numerator (share × book equity); the listed-borrower EVIC branch (fn 86); the p.62 loans-to-FIs score-5 path; the fn 71 year-end note | Tables 5.2-2/5.2-3 (pp.63) reproduce exactly; a listed borrower resolves to EVIC; scope 3 separate |
| ~~2~~ **done** | **The portfolio layer** — the register shipped; see §2.2 and `docs/PCAF-PART-A-BUSINESS-LOANS.md` §7 | Without it every class is a calculator and none is a disclosure; the DCL's Coverage and Data Quality items cannot be answered per exposure | Exposure register (reporting entity → year → exposure, migration + collection); coverage % by class against the whole book (p.161); outstanding-weighted score with scope 3 apart (Box 6.1-6); economic intensity (p.166); by-class and by-sector roll-up; recalculation policy + threshold on entity settings (reuse Part C's) | The Box 6.1-6 example yields 3.03 and 3.53; a year with no exposures is a 409; Annex 10.2's table renders |
| **3** | **§5.9 Sovereign debt** | Government securities are a large share of a Sri Lankan bank's assets; the inputs are public; the arithmetic is one division; scope 1 with and without LULUCF is a two-line rule | Class entry; PPP-GDP denominator; Table 5.9-6; a `data/pcaf-parta/sovereign/` file for Sri Lanka's UNFCCC figures and World Bank PPP GDP, versioned and dated like the factor manifest | The Singapore/Hong Kong example (Annex 10.3, p.202) reproduces: 106 and 91 tCO2e |
| **4** | **§5.4 CRE and §5.5 mortgages together** | One denominator rule (value at origination, fixed, updated on modification), one DQ table, one energy equation; the retail and property book | The origination-value rule with its three states; four energy paths; the CRE/mortgage table (2a→3, 2b→4, 3→5); a Sri Lankan building-energy baseline in the registry, provisional and said so | A metered building scores 1 with a supplier factor and 2 without; a floor-area estimate without a label scores 4; a modification updates the origination value |
| **5** | **§5.3 completion** | The built class is missing three rules from its own chapter | No-balance-sheet attribution (p.69); lifetime scope 1+2 in the year of contracting, separate (p.74, p.163); removals with credits generated/retired apart (pp.72–73); the "refined table disclosed" flag | Tables 5.3-2/5.3-4 reproduce; a lifetime figure never enters the annual inventory |
| **6** | **§5.6 Motor vehicle loans** | A material consumer and leasing book; public efficiency data | Six sub-options with the lowest-in-mix rule; distance × efficiency × fuel factor; dual-fuel and grid fallbacks; the 100%-if-unknown denominator rule | Two options score 1; a 1b + 3a mix scores 4 |
| **7** | **§5.7 Use of proceeds** | DFCC is an issuer of integrated UoP structures and must report them separately (p.102, p.162); investors in its bonds need the look-through | Separate vs integrated; double attribution; allocation percentage; the undefined-score rule; the non-UoP investor adjustment (pp.108–109) | The 50/100/10 debt-fund example (p.103) yields 5 MEUR; the green-bond example (supplement pp.25–26) yields 5,200 and 2,600 with a weighted score of 1.2 |
| **8** | **The Part A report and the DCL** | The deliverable a bank actually files | One content model in the DCL's order, two renderers via Part C's report standard; twelve requirements answered from the report; conformance matrix and generated document | Every DCL item answers from a rendered fact; `npm run docs:conformance` covers Part A |
| **9** | **§6.2 Undrawn commitments** | SLFRS S2 is IFRS S2; the bridge is short once §5.2 exists | Undrawn = commitment − drawn; unweighted shall, weighted may, both shown; separate line | Annex 10.2-4 renders with full and weighted columns |
| **10** | **Supplement completion** | Transition-finance products need it, but only once the inventory is solid | Counterfactual guardrails; three-point DQ; EER at contracting with AER/interpolated tracking; EAE annualised; the regulatory-minimum-is-zero rule | The rail, geothermal, green-bond and shipping examples reproduce |
| 11 | §5.8 Securitizations · §5.10 Sub-sovereign | Reference implementations; no material Sri Lankan exposure | Later | — |

**§5.2 is built.** The next step is row 2, and building §5.2 sharpened what it
has to be. The roll-up exists as a *read* over a book posted whole, which is
right for a pilot and wrong for a bank with five thousand loans: what is
missing is the persisted register, coverage against the whole book rather than
against what was posted, and the same roll-up reaching §5.1 and §5.3 so a
disclosure covers the classes a bank actually holds.

**The finding that came out of building it, and that should shape everything
after:** the standard sets the method and says almost nothing about whether a
bank's data is telling it the truth. That gap is where a tool stops being a
calculator. §5.2 answers it with a third verdict — refuse what would be wrong,
record what is merely weak, never block a number, only ever block a claim —
and with checks that report divergence where an independent path exists and say
so where none does. Every class built after this carries the same, and the
threshold behind any check that is CarbonIQ's rather than PCAF's says so on its
own face and is settable.

Each section follows the rules Part C established: data quality by option from
the class's own table, never averaged; 1 best, 5 worst, never rendered as a
fraction; every figure traced; refuse rather than render zero; measured,
declared or absent; one content model, one renderer; conformance evidence
before a section is called done.

---

## 12. Change log

What moved in this document and why, newest first. A row is added whenever a
finding lands — a rule read off the standard, a worked example that reproduces,
a correction to something we had previously written, or a section moving from
§11 to §10 because it shipped.

| Date | Section | What changed | Source |
|---|---|---|---|
| 2026-09-11 | §2.2, §10 | **A factor must match the primary activity financed (p.62), so the library is keyed to a closed sector vocabulary.** ISIC Rev.4 sections, with the divisions a Sri Lankan lending book actually holds (tea, rice, textiles and apparel, cement, food, rubber and plastics) as rows of their own beneath their section, because "a paddy-rice factor, not an agriculture factor" is the standard's own example. A factor resolves by `sectorKey`; a free-text sector mapped by name is recorded as an assumption on the trace, never silently. Step 3 of the §5.2 plan | p.62; `data/pcaf-parta/sectors.json` |
| 2026-09-11 | §10 | **The held sector factors are provisional, every row a gap, and a run that uses one names the set.** `data/pcaf-parta/sector-factors.json` carries order-of-magnitude figures derived from published global EEIO ranges at an indicative exchange rate — not a licensed EXIOBASE extraction and not a Sri Lankan measurement — and each row says so. The table is versioned, dated and checksummed (`data/pcaf-parta/MANIFEST.json`, the discipline `data/factors/MANIFEST.json` established for Part C) and an exposure estimated from it carries the table, version and checksum on its result. A factor held in one currency is never applied to an exposure in another: the resolver reports it absent with the reason | Box 6.1-5 (p.167); CarbonIQ |
| 2026-09-11 | §2.2, §10 | **Correction: `factorVintageYears` was declared and nothing checked it.** The §5.2 checks named three thresholds as CarbonIQ's and only two had a check behind them. `FACTOR_VINTAGE_STALE` now fires where an economic factor's vintage sits at or beyond the threshold behind the reporting year and no deflator was applied — the omission Box 6.1-5 (p.167) is about, reported as a finding rather than left as an assumption in the trace | Box 6.1-5 (p.167); `domain/business-loans/checks.js` |
| 2026-09-11 | §10 | **Sector intensity bands are regional judgement, so they live in the baseline registry.** `sector_intensity_tCO2e_per_million_revenue` is a metric of shape `sector_bands` — a low and a high per sector of the vocabulary, scoped global → country → organisation, released by an administrator and superseded only with a recorded reason. The plausibility finding cites the baseline version it was checked against, and `INTENSITY_BAND_NOT_HELD` now names the two ways to clear it: map the borrower to a held sector, or release a band. The shipped LK set is provisional and says so | CarbonIQ; `docs/BASELINE-GOVERNANCE.md` |
| 2026-09-11 | §10 | **The §5.2 screen built** — the Lending Book, over the register. It computes nothing; every figure is the register's. Position, book total, groups with financial-sector borrowers apart, the improvement plan with every projected score marked *scenario*, and each exposure opening into its findings with what clears them. A preview session sees a six-exposure sample book. Step 2 of the §5.2 plan | `docs/PCAF-PART-A-BUSINESS-LOANS.md` §8; p.56 (financial-sector borrowers apart) |
| 2026-09-11 | §10 | **One loan, once — said in the database.** Migration 0009: a generated `account_number` column and a partial unique index on `(org_id, reporting_year, account_number)`, so one facility cannot be financed twice in a year by two people or one double press. The service refuses first with `409 DUPLICATE_LOAN` naming the row that holds the reference; the index closes the race the service cannot. Partial, because two exposures recorded without a reference are not thereby the same loan | CarbonIQ; the one-locked-assessment-per-policy-year index in Part C |
| 2026-09-11 | §10 | **A recomputation compares every line and both scores.** It compared the headline alone and reported "nothing moved" when scope 3, removals or a data-quality score had. All seven lines and both scores now travel with before, after and whether each moved, and the note names what did | CarbonIQ; `application/register.js` |
| 2026-09-11 | §10, §11 | **The exposure register built** (migration 0008). One row per exposure per reporting year holding the input *and* the result; a stored projection the roll-up reads instead of the provenance trace; coverage as a real percentage of the entity's declared book total. Row 2 of the plan moves to §10 | DCL p.124 (coverage over the whole book); the projection follows `partc_assessments.rollup` |
| 2026-09-11 | §10 | **A rule for every register after this.** Both halves are kept and nothing recomputes on read: a figure somebody was shown stays that figure until `recompute` is called, and that call reports what moved. Keeping only the input would let a factor correction rewrite history silently; keeping only the result would leave nobody able to see what produced it | CarbonIQ; `application/register.js` |
| 2026-09-11 | §2.2, §10, §11 | **§5.2 built.** Business loans and unlisted equity: the class entry, Table 5.2-1, both numerators, the two denominators, the roll-up and the improvement plan. Row 1 of the plan moves to §10 | §5.2 pp.55–65; Tables 5.2-2/5.2-3 reproduce at 6,100 / 1,260 / 10,000 / 2,200 / 7,250 / 600 |
| 2026-09-11 | §11 | **Design rule, carried by every class after this.** The standard sets the method and says almost nothing about whether a bank's data is telling it the truth. §5.2 answers with a third verdict — refuse what would be wrong, record what is merely weak — and never blocks a number, only a claim. A threshold that is ours says so on its own face | CarbonIQ; `domain/corporate/findings.js` |
| 2026-09-11 | §2.2 | **The standard's own cross-reference is wrong.** Footnote 69 sends loans to governments to "the Sovereign Debt and Sub-Sovereign Debt asset class (see subchapter 5.7)". §5.7 is Use of Proceeds Structures; sovereign debt is §5.9 and sub-sovereign §5.10. The classifier redirects to §5.9/§5.10 and the note records why it does not follow the footnote | fn 69 (p.55) against §5.7 (p.98), §5.9 (p.140), §5.10 (p.150) |
| 2026-09-11 | §2.2 | **A rule the standard states for the denominator only.** Footnote 75 sets negative book equity to zero so every emission is attributed to debt. The unlisted-equity *numerator* is a share of that same equity, so the same rule there gives an equity holder in such a company a numerator of zero. The reading is applied and travels on the trace as ours, not as the standard's | fn 75 (p.57) with p.56 |
| 2026-09-11 | §0 | The maintenance rules and this log, so a later finding has a place to land rather than a commit message | — |
| 2026-09-11 | all | First full study: the ten asset classes, the consolidated data-quality matrix, Chapter 6, the supplement, the twelve gaps, the market picture, and the build order | Third Edition (Dec 2025) 209 pp.; DCL May 2025; DCL FAQ; the avoided-emissions supplement; the strategic analysis |
| 2026-09-11 | §3 | **Correction.** `docs/PCAF-PART-A-BUILD-SPEC.md` said Option 2b was "score 2 in one class and 3 in another". Read against all eight tables there are five distinct shapes: 2a is 2 or 3, 2b is 3 or 4, Option 3 is 4 or 5, and 1b is 1 for motor vehicles alone | Tables 5.1-2 … 5.10-2, Annex 10.1 |
| 2026-09-11 | §9 | **Correction.** The strategic analysis says Part A "requires" embodied carbon for new construction and major renovation lending. The standard makes it **optional** for CRE and mortgages, and the developer's own scope 3 "when relevant, should" for project finance | pp.77, 83, 74 |
