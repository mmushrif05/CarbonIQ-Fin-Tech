# The Baseline Register — every figure a financed-emissions disclosure rests on, and where it came from

**Status: Part 1 research compiled and Part 2 seeded, 16 September 2026. The adopted
candidates for the metrics an engine reads — the grid average, the fuel factors, the
building intensities — ship as the registry's provisional seed, labelled with their
verification level; nothing is *released* until an operator has re-read the figure from its
source. `GET /v1/baselines/for/:assetClass` and the Baselines screen show, per class, what
is in force and what is proposed. This document is the reference the registry is
seeded from, in the discipline `docs/PCAF-PART-A-RESEARCH.md` §0 sets: a finding is
recorded here, with its source, before the code that acts on it.**

---

## 0. How this register is kept

**What a baseline is here.** PCAF sets the *method* for financed (Part A), facilitated
(Part B) and insurance-associated (Part C) emissions. It does not set Sri Lanka's grid
factor, its building energy intensities, its sector intensities or its vehicle fleet
economy. Those are *baselines*: figures the method consumes, and which somebody credible and
in-region has to publish, date, version and defend. This register is the list of every such
figure the product needs, per asset class, and the evidence behind each.

**The rule that decides what is governed.** Where a published standard sets a figure, the
standard's value wins and the registry holds only the citation (IPCC default factors, the
PCAF option-to-score tables, AR5/AR6 GWPs). Where no standard sets one, the figure is
regional judgement and belongs in the governed registry (`src/domains/baseline/`,
`docs/BASELINE-GOVERNANCE.md`): scoped global → country → organisation, released by an
administrator, versioned, superseded only with a recorded reason.

**The source hierarchy the world uses, which this register follows.** For every figure:
Sri Lankan published source first; a regional (South Asia / tropical Asia-Pacific) source
where none exists; a global default last — and the tier is printed beside the figure
wherever it is used, because a global factor presented as a Sri Lankan one is the failure
`src/shared/report-integrity.js` exists to prevent. Within a tier: verified reported →
reported → physical-activity-based → economic-activity-based, which is PCAF's own
data-quality ordering.

**Verification levels — declared on every figure, never implied.**

| Level | Meaning | May a disclosure rest on it? |
|---|---|---|
| `primary` | The publishing document was opened and the number read from it, with page or table cited | Yes |
| `secondary_reported` | The figure and its citation come from a description of the primary source (a search excerpt, a third-party summary, a republisher) — the document itself was not opened | **Not until re-read from the source.** It is a worklist row with a URL |
| `not_found` | The source is known to exist but no figure could be evidenced | No — reported absent with what is needed |

**The constraint this session worked under, stated so the register is read correctly.**
This research was compiled on 16 September 2026 from a Claude Code cloud session whose
network policy answers 403 to every general website; only package registries, GitHub raw
content and Google Cloud Storage buckets could be reached. Consequently: every PCAF
document held in this repository was read (`primary`); open datasets on GitHub/GCS were
read (`primary`); **every Sri Lankan government, IEA, UNFCCC, CEB, SLSEA, DCS and vendor
page was quoted from search excerpts only (`secondary_reported`)**. Section 5 is the
verification worklist: each such row carries the exact URL, and a person with an open
network (or a session with a permissive policy) re-reads the figure and promotes the row.
No figure below was invented; where no excerpt gave a number, the row says `not_found`.

**How a baseline links to an asset class.** Section 2 is the matrix: each baseline names
the PCAF asset classes and options that read it, and each asset class names the baselines
it needs. `data/baselines/baseline-register.json` (Part 1c) carries the same links
machine-readably; a test holds the two to one another. When a user selects an asset class
on the Lending Book, the product resolves that class's baselines from the registry and
shows them — value, tier, vintage, version — beside the figure they produced.

---

## 1. How the world does it — the practice a Sri Lankan bank should follow

Everything in this section that cites the PCAF Third Edition, the Disclosure Checklist
or the avoided-emissions supplement is `primary` (repository copies, page-cited).
Everything about peers, regulators and vendors is `secondary_reported` — no bank,
regulator or vendor page could be opened from this session.

### 1.1 The rules the standard itself sets (`primary`)

| Rule | Where | What it says |
|---|---|---|
| Best available data, improving over time | p.30 | "use the highest quality data available for each asset class … and, where relevant, improve the quality of the data over time"; estimated data serves to "identify emission-intensive hotspots" |
| Data lag | p.31 | use the most recent data "even if it is representative of different years" — FY2019 financials beside 2018 emissions — and say so |
| Physical factors and their date | p.48 | example sources "ecoinvent, Defra, IPCC, GEMIS, FAO … including a mention of the data source, reporting period, or publication date" |
| Sector specificity | p.48, p.62 | "for a business loan to a paddy rice farmer … a sector-specific average emission factor for the paddy rice sector and not … the agricultural sector in general" |
| A regional authority is anticipated | fn 51 p.45, fn 84 | "National agencies and regional data providers or statistical offices in individual regions may assist reporting financial institutions … in finding regional and more relevant financial or emissions data" |
| The option-to-score tables are **not uniform across classes** | pp.45, 60, 71, 80, 86, 94, 147, 156; fn 200 p.191 | business loans 2a = 2, CRE/mortgages 2a = 3, motor vehicles 1b = 1; UoP and securitisations take the score of their underlying assets |
| Supplier-specific factors always preferred | fn 54 p.46, fn 115 p.71 | market-based = supplier-specific; location-based = average |
| Publication dates, weighting, scope 3 apart | p.167, Box 6.1-6 | describe "emission factors, and all relevant publication dates"; weighted DQ score **by outstanding amount**; scope 3 score separate |
| Inflation adjustment | p.167, Box 6.1-5 | *may* be applied to score 4–5 economic factors; the index (CPI, PPI, GDP deflator) *shall* be disclosed |
| Frequency, recalculation, coverage, exclusions, fluctuation | pp.161, 164 | annual at a fixed point; a base-year recalculation policy with a significance threshold; coverage as % of total loans and investments; every exclusion justified (data availability, size, methodology); a fluctuation analysis with its calculation basis |
| Assurance | p.167 | "Over time and where possible, data should be verified to at least a level of limited assurance … disclose whether data is verified and to what level" |
| Avoided emissions | supplement pp.8–9 | reported separately, additional to, never deducted from financed emissions; DQ 1–3 only — economic intensities are not permitted |
| Origination is where the data is | p.126 | originators "are best positioned to obtain or estimate this information" |
| What PCAF review is | DCL FAQ | "not a form of assurance as PCAF does not have the capacities of an auditing firm"; the DCL asks for "significant improvements … compared to last year's reporting" |
| GHG Protocol mark | p.2, p.9 | the six original classes carry *Built on GHG Protocol*; the 2023 and 2025 additions "have not yet been reviewed by the GHG Protocol" |

### 1.2 The PCAF ecosystem

The emission-factor database is "currently available only to PCAF signatories" (p.48,
p.62, fn 137 p.85, p.95 — `primary`); joining is reported free of charge, the database is
updated in March and September, carries a DQ score on every row, and has integrated CEDA
since 2025 (`secondary_reported`: https://carbonaccountingfinancials.com/files/database/PCAF-2025Database-2Pager-R2.pdf,
https://carbonaccountingfinancials.com/en/newsitem/pcaf-integrates-ceda-into-database-to-improve-emissions-measurement).
Sri Lanka's first PCAF partner is the Climate and Conservation Consortium (Daily News,
22 Jul 2026, `secondary_reported`) — a local competitor with database access.

**The programme's exact name could not be verified** (partners page blocked). PCAF's own
headlines read "PCAF Accredited Partner program" / "Regional Accredited Partner"; the
Daily News wrote "Accredited Partnership Programme". **Print no programme name until the
partners page has been read**, and the ~USD 13,500/yr fee in `CLAUDE.md` remains
unverified — no source carried a figure.

### 1.3 Sri Lankan peers and the regulatory clock (`secondary_reported`)

| Item | Finding | Source |
|---|---|---|
| Commercial Bank of Ceylon — a PCAF-hosted disclosure | *GHG Emissions in the bank portfolio (PCAF) 2024* (`CBK-2024.pdf` in PCAF's downloads): second-year report expanded from business loans to "Business Loans, Mortgage Loans, Motor Vehicle Loans, and other categories"; scores "linked to monetary emission factors and sectoral and regional averages" (i.e. score 4–5 EEIO); business loans the largest contributor. **Identity of "CBK" to be confirmed by opening the file.** | http://carbonaccountingfinancials.com/files/institutions_downloads/CBK-2024.pdf |
| LB Finance PLC — signatory | published motor-vehicle-loan financed emissions of 27,245.12 tCO2e (FY2024/25) under PCAF before joining | https://www.dailymirror.lk/amp/business-news/LB-Finance-joins-PCAF-to-strengthen-climate-action-in-financial-sector/273-320425 |
| HNB, Sampath, DFCC, NDB, Seylan, NTB, BOC, People's, Amana, LOLC, CDB | no signatory statement or financed-emissions disclosure surfaced — absence of evidence; **check the signatory list by hand** | https://carbonaccountingfinancials.com/signatories |
| CBSL Banking Act Direction No. 05 of 2022 | *Sustainable Finance Activities of Licensed Banks* (22 Jun 2022): ESG risk management and priority-sector reporting; clause numbers and any GHG-measurement requirement not verified | https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/laws/cdg/Banking_Act_Directions_No_5_of_2022.pdf |
| CBSL Roadmap for Sustainable Finance 2019 · Roadmap 2.0 (5 May 2025) | exists; the claim that 2.0 "mandates climate disclosure" is unverified | https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/press/pr/press_20250505_CBSL_launches_the_sustainable_finance_roadmap_2.0_e.pdf |
| **SLFRS S1/S2 timeline (CA Sri Lanka)** | effective 1 Jan 2025: top-100 main-board entities by market cap in 2025; **all main-board entities in 2026**; all listed except Empower Board for periods from **1 Jan 2027**. SLFRS S2 = IFRS S2, so §29(a)(vi) financed emissions by asset class with a PCAF-consistent method applies once in scope. Transition reliefs not captured. | https://www.casrilanka.com/casl/index.php?option=com_content&view=article&id=4193 |

**Correction to the repository's research note:** `docs/PCAF-PART-A-RESEARCH.md` §7 says
no Sri Lankan commercial bank is a full PCAF signatory; a PCAF-hosted second-year
disclosure and a signatory NBFI contradict that. Resolve from the signatory list.

### 1.4 Amana Bank PLC — what is public (`secondary_reported`)

FY ends 31 December; total assets LKR 182.3 bn at end-2024 (from 159.5 bn), deposits
154.4 bn, CASA 44 %, PAT LKR 1.8 bn, financing margin 4.0 %, Stage 3 ratio 1.3 %
(https://www.amanabank.lk/news/amana-bank-continues-robust-performance-in-2024.html).
Products confirmed: Murabaha, Ijarah, Diminishing Musharakah, Sukuk — **no product-wise
breakdown and no GHG or financed-emissions statement found**. The Annual Report 2025
(https://www.amanabank.lk/pdf/investor-relations/annual-reports/amana-bank-plc-ar-2025-web-upload.pdf,
blocked) is the document to open for financing by product, sector concentration and
treasury/sukuk holdings. Its SDG page reports avoided emissions from financed mini-hydro,
biomass and solar ("12,040 Mt" — almost certainly tonnes, a units defect) — these belong
on the separate avoided-emissions line, never against the inventory.

**Classification is by the substance of the financed asset, exactly as for any bank.** A
home-purchase facility is a mortgage, a vehicle facility a motor vehicle loan, a facility to
a business a business loan, a bond or sukuk holding a corporate bond or sovereign debt.
PCAF's asset classes are the only vocabulary the product uses; no instrument-specific layer
sits on top of them, and none is needed for emissions accounting.

### 1.5 Global practice and the improvement levers (`secondary_reported`)

The only quantified before/after found: CIMB weighted DQ scope 1+2 4.70 (2023) → 4.27
(2024); Maybank 4.63; DBS publishes per-sector data-coverage targets; NatWest restates
prior years when data improves; ING states FY2024 figures rest on year-end-2023 data;
Barclays chaired PCAF's fluctuation-analysis working group. Methodology PDFs located, not
opened: HSBC (Feb 2026), Scotiabank (2025), Barclays (2023), Triodos (2022) — which EEIO
database each names is unverified. Levers cited across the market: emissions data
requested in covenants at origination, SME questionnaires, engaging the largest borrowers
by attributed emissions first, vendor data for listed names. ISSA 5000 (IAASB, Nov 2024)
governs assurance of GHG statements for periods beginning on or after 15 Dec 2026,
replacing ISAE 3410 (https://ifacweb.blob.core.windows.net/publicfiles/2025-08/IAASB-ISSA-5000-FAQ-Applicability-ISAE-3000-3410.pdf).

### 1.6 Regional baseline authorities — the shapes to copy (`secondary_reported`)

| Authority | The loop it runs | Why it matters here |
|---|---|---|
| Singapore BCA Building Energy Benchmarking Report | statutory annual submission of building energy data since 2013 → published EUI by type | exactly what CRE/mortgages Option 2b needs and Sri Lanka lacks — https://www1.bca.gov.sg/docs/default-source/docs-corp-buildsg/sustainability/bca-building-energy-benchmarking-report-2023.pdf |
| Malaysia Energy Commission grid emission factor | annual official GEF by region, provisional/final status, forward projection | the vintage discipline our manifests mirror — https://myenergystats.st.gov.my/documents/d/guest/grid-emission-factor-gef-in-malaysia |
| India BEE | statutory sector baselines (PAT) and a building star-rating on kWh/m² | a label that would lift CRE from score 4 to 3 under fn 129 — https://beeindia.gov.in/en/baseline-energy-audit-reports |
| UK DESNZ conversion factors | one annual, versioned, methodology-noted national set every reporter quotes; PCAF cites Defra (p.48) | the model for a Sri Lankan national factor set |
| Sri Lanka SLSEA/DNA grid factor | an OM/BM/CM series exists (§3.1) — currency to verify | corrects the repo note that no Sri Lankan operating-margin series is published |

### 1.7 The practice this register adopts

1. Classify by the substance of the financed asset, as for any bank; apply that class's own score table.
2. Per exposure: verified reported → reported → physical (supplier-specific first) → economic (sector-specific, then economy-wide).
3. Per figure: Sri Lankan official → regional → global, tier printed beside the figure.
4. Most recent vintage, year mismatch stated; source, period and publication date on every factor.
5. Inflation-adjust score 4–5 economic factors with a disclosed DCS index; report the uncorrected figure as the minimum.
6. DQ weighted by outstanding, per class and sector, scope 3 apart; coverage over total loans and investments; exclusions justified.
7. Base-year policy and significance threshold recorded; fluctuation analysis published.
8. Avoided emissions on their own line, never netted.
9. Capture at origination: the CR for vehicles, the valuation's floor area for property, the borrower's utility account with consent.
10. Improvement narrative in the disclosure; aim at limited assurance and say the level; evidence trail = source, date, geography, index, verification level per factor.
11. The Sri Lankan gaps (no building label, no national EEIO, a grid series to keep current) are a baseline-authority gap — the position CarbonIQ is built to hold — and fn 51 anticipates it.
12. The clock: Direction 05/2022 already binds; SLFRS S2 reaches all main-board listed entities for 2026 and all listed for periods from 1 Jan 2027.

---

## 2. The baseline × asset-class matrix

| Baseline | Metric key (registry) | §5.1 Listed eq. & bonds | §5.2 Business loans | §5.3 Project finance | §5.4 CRE | §5.5 Mortgages | §5.6 Motor vehicles | §5.7 UoP | §5.9 Sovereign | Part B | Part C |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Grid emission factor — average (location-based) | `grid_emission_factor_kgCO2e_kWh` | Opt 2a | Opt 2a | scope 2 | 1b·2a·2b·3 | 1b·2a·2b·3 | EV | look-through | — | Opt 2a | A5.2 site electricity |
| Grid displacement factor — OM / BM / CM | `grid_displacement_factor_tCO2e_MWh` | — | — | avoided emissions | — | — | — | green-bond impact | — | — | — |
| Fuel combustion factors (diesel, petrol, LPG, kerosene, furnace oil) | `fuel_emission_factor_kgCO2e_kWh` | Opt 2a | Opt 2a | scope 1 | 1a·1b | 1a·1b | 1a–3b | — | — | Opt 2a | A5.2 diesel |
| Global warming potential set | `gwp_100yr` | all | all | all | all | all | all | all | all | all | all |
| Sector intensity per revenue / per assets (EEIO) | `sector_emission_intensity_per_revenue` | Opt 3a·3b·3c | Opt 3a·3b·3c | — | — | — | — | — | — | Opt 3 | — |
| Sector intensity plausibility bands | `sector_intensity_tCO2e_per_million_revenue` | check | check | — | — | — | — | — | — | check | — |
| Building energy intensity by type (kWh/m²/yr) | `building_energy_intensity_kWh_m2` | — | — | — | Opt 2b | Opt 2b | — | — | — | — | — |
| Building energy per building / per dwelling (kWh/yr) | `building_energy_per_dwelling_kWh` | — | — | — | Opt 3 | Opt 3 | — | — | — | — | — |
| Vehicle fuel economy by class (L/100 km, kWh/100 km) | `vehicle_fuel_economy_l_per_100km` | — | — | — | — | — | Opt 2b·3a·3b | — | — | — | — |
| Vehicle annual distance by class (km/yr) | `vehicle_annual_distance_km` | — | — | — | — | — | Opt 2b·3a·3b | — | — | — | — |
| Sovereign inventory (with / without LULUCF) + PPP GDP | `sovereign_dataset` | — | — | — | — | — | — | — | Opt 1–3 | — | — |
| Currency rates and deflators | `currency_lkr_per_usd_annual_average` | vintage rule | vintage rule | — | — | — | — | — | — | vintage rule | — |
| Carbon price (shadow) | `carbon_price_usd_tCO2e` | risk | risk | risk | — | — | — | — | — | — | — |
| Construction intensity screen | `construction_intensity_kgCO2e_m2` | — | — | — | — | — | — | taxonomy | — | — | — |
| NDC 3.0 targets — reduction and removal, two ledgers | `ndc3_targets` | — | — | NDC contribution | — | — | — | NDC contribution | — | — | — |
| Data-quality target score | `data_quality_target_score` | plan | plan | plan | plan | plan | plan | plan | plan | plan | plan |

Keys marked in backticks that are not yet in `src/domains/baseline/domain/metrics.js` are
the additions Part 2 makes.

---

## 3. The families

### 3.1 Electricity grid emission factor — Sri Lanka

**Read by:** every class with a scope 2 figure (§5.1/§5.2 Option 2a, §5.3, §5.4/§5.5 all
options, §5.6 EVs, Part B, Part C A5.2). Two *different* quantities, never interchanged:

- **Grid average (location-based)** — a borrower's, building's or vehicle's own scope 2.
  PCAF Part A Third Edition fn 127/136 (pp.79, 85): "average emission factors, which are
  non-supplier-specific emission factors, are the same as location-based emission factors"
  (`primary`, repository PDF).
- **Displacement factor (OM / BM / CM)** — avoided emissions of a financed renewable only.
  PCAF's Dec 2025 supplement (repository PDF, pp.24–25, Table A.1, `primary`) ranks the
  counterfactual A. operating margin → B. traded fossil mix → C. produced fossil mix →
  D. average mix "as a last resort", and requires avoided emissions to be reported apart
  from scope 1/2/3 (Part A p.15; Disclosure Checklist p.5 citing p.126).

#### 3.1.1 Sri Lanka official series — SLSEA / DNA (CDM Tool 07 margins)

Publisher: Sri Lanka Sustainable Energy Authority, in the annual *Sri Lanka Energy
Balance*, with the Climate Change Secretariat (DNA), using the UNFCCC "Tool to calculate
the emission factor for an electricity system". Republished at
http://www.climatechange.lk/DNA/Grid_Emission_Factors.html.

| Year | Simple OM | BM | CM | Unit | Document | URL | Verification |
|---|---|---|---|---|---|---|---|
| 2017 | **0.6993** | **0.9224** | **0.8108** | tCO2/MWh | Energy Balance 2017 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2017.pdf | `secondary_reported` (excerpt quotes the sentence verbatim) |
| 2018 | ? | ? | ? | | Energy Balance 2018 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2018.pdf | `not_found` — document exists, host blocked |
| 2019 | ? | ? | ? | | Energy Balance 2019 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2019-lq.pdf | `not_found` |
| 2020 | **0.7084** | **0.7940** | **0.7512** | kgCO2/kWh | Energy Balance 2020 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2020.pdf | `secondary_reported` |
| 2021 | ? | ? | ? | | Energy Balance 2021 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2021.pdf | `not_found` |
| 2022 | **0.7123** | **0.5841** | **0.6482** | kgCO2/kWh | Energy Balance 2022 | https://www.energy.gov.lk/images/energy-balance/energy-balance-2022.pdf | `secondary_reported` — **latest evidenced year** |
| 2023, 2024 | | | | | not indexed | https://www.energy.gov.lk/en/knowledge/resources/downloads | `not_found` |

Arithmetic check (ours): 0.5 × OM + 0.5 × BM reproduces every published CM, so SLSEA
weights the margins 50/50. CDM Tool 07 v7.0 (`secondary_reported`; cdm.unfccc.int
blocked) prescribes **0.75/0.25 for wind and solar**, 0.5/0.5 for other projects in the
first crediting period — so a strict Tool 07 CM for a 2022 solar loan is 0.75 × 0.7123 +
0.25 × 0.5841 = **0.6803**, not the published 0.6482. State which is used.

**The Simple OM is the fossil-dispatch factor, not the average.** It excludes low-cost /
must-run plant (hydro, solar, wind), which is why it is ~0.71 while the all-generation
average is ~0.41. It must never be used for a borrower's scope 2.

**Correction to what the repository holds.** `data/pcaf-parta/country-config.json` labels
0.9224 as the 2017 *operating* margin and holds the build margin as null. **0.9224 is the
build margin; the 2017 OM is 0.6993.** The file's own arithmetic note (0.5 × 0.6993 + 0.5 ×
0.9224 = 0.81085) proves it. Part 2 relabels the field, adds the 2020 and 2022 sets as a
dated series, and retires 2017 as superseded.

#### 3.1.2 Sri Lanka grid average — open datasets (`primary`)

No SLSEA/CEB publication of a plain generation-weighted average could be evidenced; the
CEB LTGEP 2023–2042 infographic states the average "will be reduced" from **0.5 to 0.2
kg/kWh by 2042** (https://www.ceb.lk/front_img/img_reports/1677831657LTGEP_Infographic_Final2.pdf,
`secondary_reported`) — a rounded planning figure, not an annual factor.

**Ember — Yearly Electricity Data**, file `yearly_full_release_long_format.csv` (Ember
public bucket, last modified 23 Jun 2026; methodology PDF p.83: Sri Lanka generation from
IRENA, emissions from IPCC factors, generation-based, CO2 only, no T&D adjustment). Read
directly — **`primary`**:

| Year | gCO2/kWh | Power-sector MtCO2 | Generation TWh | Hydro | Coal | Oil/other fossil | Solar | Wind | Fossil share |
|---|---|---|---|---|---|---|---|---|---|
| 2019 | 518.30 | 8.64 | 16.67 | 28.9 % | 35.5 % | 30.7 % | 2.0 % | 2.1 % | 66.2 % |
| 2020 | 512.73 | 8.46 | 16.50 | 30.2 % | 38.6 % | 25.9 % | 2.8 % | 2.0 % | 64.4 % |
| 2021 | 418.05 | 7.32 | 17.51 | 41.3 % | 34.9 % | 15.7 % | 3.7 % | 3.7 % | 50.6 % |
| 2022 | 410.15 | 6.87 | 16.75 | 40.4 % | 34.2 % | 15.5 % | 5.0 % | 4.4 % | 49.7 % |
| 2023 | 417.33 | 6.84 | 16.39 | 36.5 % | 31.4 % | 20.0 % | 6.1 % | 5.0 % | 51.4 % |
| 2024 | **375.73** | 6.41 | 17.06 | 41.1 % | 32.6 % | 11.8 % | 8.0 % | 5.1 % | 44.4 % |
| 2025 | 321.16 | 5.54 | 17.25 | 38.2 % | 26.8 % | 10.5 % | 17.6 % | 5.4 % | 37.3 % |

Earlier: 2015 417.87 · 2016 522.01 · 2017 533.24 · 2018 448.66. Sources:
https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/yearly_full_release_long_format.csv
· methodology https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/ember_electricity_data_methodology.pdf
· landing https://ember-energy.org/data/yearly-electricity-data/ (licence CC BY 4.0 per
site, `secondary_reported`; the methodology PDF states none).

Our World in Data `owid-energy-data.csv` (`primary`, GitHub raw) carries the same series
from Ember's 24 Apr 2026 release — 2024 = 378.44, 2025 = 329.28 — the difference being
Ember's June revision; **cite the file vintage used**. OWID README: CC BY 4.0 for OWID's
work, third-party terms pass through.

#### 3.1.3 International compilations (Sri Lanka row)

| Source | Figure | Vintage | URL | Verification | Access |
|---|---|---|---|---|---|
| UNFCCC / IFI Harmonised Grid Emission Factor dataset (the set PCAF's own reference list cites, Part A p.188) | not read | v3.x, 2021+ | https://unfccc.int/documents/198197 · XLSX https://unfccc.int/sites/default/files/resource/Harmonized_Grid_Emission_factor_data_set.xlsx | `not_found` (blocked) | free |
| IFI interim dataset as cited by ADB guidelines | LK 0.7350 / 0.746 tCO2/MWh | July 2016 | https://www.adb.org/sites/default/files/institutional-document/296466/guidelines-estimating-ghg.pdf | `secondary_reported` | free |
| IGES List of Grid Emission Factors | the SLSEA/DNA series | periodic | https://www.iges.or.jp/en/pub/list-grid-emission-factor/en | `not_found` | free |
| IEA Emissions Factors 2025 | LK covered, 1990–2022 | 2025 | https://www.iea.org/data-and-statistics/data-product/emissions-factors-2025 | `secondary_reported` for coverage | **paid** |
| Electricity Maps zone `LK.yaml` | no LK-specific factors (IPCC AR5 lifecycle defaults); reads CEB live feed | — | https://raw.githubusercontent.com/electricitymaps/electricitymaps-contrib/master/config/zones/LK.yaml | `primary` | open source |

#### 3.1.4 Adopted baseline (proposed for release in Part 2)

| Use | Adopt | Tier | Vintage | Verification | Caveats printed with it |
|---|---|---|---|---|---|
| Scope 2 of financed buildings, companies, EVs (location-based) | **Ember Sri Lanka CO2 intensity: FY2024 = 0.3757 tCO2/MWh** (FY2023 0.4173; FY2022 0.4102; FY2025 provisional 0.3212) | open data, LK-specific | 2024 (file 23 Jun 2026) | `primary` | CO2 not CO2e (CH4/N2O ≈ +1 %, stated not adjusted); generation not consumption (T&D loss not applied); not a government figure — replaced by a CEB/SLSEA average on release; grid decarbonising fast (518 → 321, 2019–2025), so **update yearly, staleness 1 year** |
| Avoided emissions of financed renewables — PCAF-preferred | **SLSEA Simple OM 2022 = 0.7123 tCO2/MWh** | LK official | 2022 | `secondary_reported` → verify | Fossil-dispatch margin; report avoided apart from the inventory |
| Avoided emissions — CDM/IFI method | SLSEA CM 2022 = 0.6482 (50/50) or 0.6803 at Tool 07 wind/solar weights | LK official | 2022 | `secondary_reported` | State the weights |
| Retire | `a5-defaults.json` gridEF 0.53 placeholder; LTGEP rounded 0.5; 2017 CM 0.8108 | | | | 0.53 now sits ~40 % above the evidenced average |

Registry shape needed: a `basis` field — `average | operating_margin | build_margin |
combined_margin` with the OM/BM weights recorded — so no consumer can read a margin as an
average.

#### 3.1.5 Improvement path

1. Open Energy Balance 2018, 2019, 2021 and any 2023/2024 (energy.gov.lk, info.energy.gov.lk); record OM/BM/CM per year with page cites — closes a three-year vintage gap.
2. Obtain or compute a published national average: CEB Transmission & Generation Planning for the year-specific figure behind the LTGEP 0.5, or compute from the CEB Statistical Digest (GWh by plant/fuel) with IPCC factors and release it as the LK country baseline.
3. Monthly/hourly: PUCSL daily generation statistics and monthly reports; the CEB live feed Electricity Maps already parses (`CEB.fetch_production`). PCAF's supplement asks for hourly/monthly "if possible".
4. Market-based: I-REC(E) issuer for Sri Lanka is the Green Certificate Company (I-TRACK, `secondary_reported`); no residual mix exists, so unmatched load defaults to location-based; recognise only redeemed I-RECs or direct-line PPAs meeting the Scope 2 Quality Criteria.
5. Governance: every factor on the registry with year, basis, weights, publisher, URL, verification and a staleness rule; a change is a superseding release with a reason.

---

### 3.2 Fuel combustion emission factors and GWP set

**Read by:** every class with a scope 1 figure (§5.1/§5.2 Option 2a, §5.3, §5.4/§5.5
Options 1a/1b, §5.6 all options, Part B, Part C A5.2 diesel).

**What PCAF requires — `primary`, read from the repository's Third Edition PDF.**
p.162: "Financial institutions shall account for the seven gases under the Kyoto Protocol
… CO2, CH4, N2O, HFCs, PFCs, SF6, and NF3 … converted to carbon dioxide equivalents (CO2e)
using the 100-year time horizon global warming potentials published by the IPCC — either
the AR5 values published by the GHG Protocol or the IPCC's most recently published
assessment report." Glossary p.176: "As a baseline, PCAF recommends using 100-year Global
Warming Potentials **without climate-carbon feedback** from the most recent IPCC
Assessment report." p.162: "Biogenic CO2 emissions … shall not be included in the scopes
but shall be included and separately reported." p.167: describe "emission factors, and
all relevant publication dates"; Box 6.1-5 (inflation indices) applies to *economic*
factors only. p.31: use the most recent data even if years differ, and say so.

#### 3.2.1 IPCC 2006 Guidelines Vol. 2 — the Tier 1 defaults (the standard's value wins; registry holds the citation)

Documents (all blocked this session — `secondary_reported`): Ch.1
https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_1_Ch1_Introduction.pdf ·
Ch.2 …/V2_2_Ch2_Stationary_Combustion.pdf · Ch.3 …/V2_3_Ch3_Mobile_Combustion.pdf · 2019
Refinement …/2019rf/pdf/2_Volume2/19R_V2_2_Ch02_Stationary_Combustion.pdf. A snippet
confirms the 2019 Refinement made no methodological update to stationary combustion.

| Fuel | NCV TJ/Gg (Table 1.2) | CO2 kg/TJ (Table 1.4) | Derived kgCO2/kWh (net CV) | Verification |
|---|---|---|---|---|
| Motor gasoline | 44.3 (snippet-confirmed) | 69,300 | 0.2495 | `secondary_reported` |
| Other kerosene | 43.8 (snippet-confirmed) | 71,900 | 0.2588 | `secondary_reported` |
| Gas/diesel oil | 43.0 (snippet-confirmed) | 74,100 | 0.2668 | `secondary_reported` |
| Residual fuel oil (furnace oil) | 40.4 (snippet-confirmed) | 77,400 | 0.2786 | `secondary_reported` |
| LPG | 47.3 | 63,100 | 0.2272 | `secondary_reported` |
| Natural gas | 48.0 | 56,100 | 0.2020 | `secondary_reported` |
| Other bituminous coal (Norochcholai) | 25.8 | 94,600 | 0.3406 | `secondary_reported` |
| Wood / biomass | 15.6 | 112,000 — **biogenic, reported separately** | — | `secondary_reported` |

Per-kWh figures are exact arithmetic on the kg/TJ values (1 TJ = 277,777.8 kWh).
**Per-litre factors need a density, which Vol. 2 does not table** — take it from the SLSEA
Energy Balance conversion appendix or the CPC product specification (neither opened). At
0.84 kg/l diesel ≈ 2.68 kgCO2/l, which is the figure `a5-defaults.json` already carries
labelled "DEFRA-aligned". CH4/N2O (Tables 2.2–2.5, 3.2.2; e.g. liquid fuels 3/0.6 kg/TJ
industrial, 10/0.6 commercial) add ≈ 0.25–0.5 % to CO2 at AR6 GWPs.

#### 3.2.2 UK DESNZ conversion factors 2025 (the practitioner's per-litre table)

Collection https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting
(Open Government Licence v3.0; 2025 set released 10 June 2025) — blocked; only
"diesel, average biofuel blend ≈ 2.51 kgCO2e/l" and "WTT ≈ 0.62" surfaced
(`secondary_reported`). **Sri Lanka has no biofuel blending mandate** (a Feb 2026 Ceylon
Today analysis; a search summary attributing a 5 % biodiesel mandate to Sri Lanka is
South Africa's Notice R.671 — disregard), so the **"100 % mineral" diesel and petrol rows
are the correct UK proxy**, not the "average blend" rows, which embed 3.02 % / 8.37 % UK
biofuel volumes. CPC introduced Euro 4 petrol and Super Diesel (10 ppm S) on 2 July 2018
(`secondary_reported`, ft.lk / economynext).

#### 3.2.3 GWP sets

| Gas | AR4 | AR5 (no feedback) | AR6 (Table 7.15) | Verification |
|---|---|---|---|---|
| CH4 non-fossil / fossil | 25 | 28 / 30 | 27.0 (27.2) / 29.8 | `secondary_reported` — open AR5 Table 8.A.1, AR6 Table 7.15 |
| N2O | 298 | 265 | 273 | `secondary_reported` |
| HFC-32 · HFC-125 · HFC-134a | 675 · 3,500 · 1,430 | 677 · 3,170 · 1,300 | 771 · 3,740 · 1,530 | `secondary_reported` |
| R-410A · R-404A · R-407C (blends) | 2,088 · 3,922 · 1,774 | 1,924 · 3,943 · 1,624 | 2,256 · 4,728 · 1,908 | `secondary_reported` |
| SF6 · NF3 | 22,800 · 17,200 | 23,500 · 16,100 | 25,200 (check) · 17,400 | `secondary_reported` |

GHG Protocol *Global Warming Potential Values* (Aug 2024) recommends the latest AR and
requires the basis be disclosed (`secondary_reported`, ghgprotocol.org blocked). ISO
14064-1:2018 asks for the latest IPCC report and that it be named (paid; not opened).
Sri Lanka's NC3 (2022) is 2006-Guidelines Tier 1 for 2000–2010; BTR1 (Dec 2024) covers
2011–2021 and, under decision 18/CMA.1 para 37, should be on AR5 — **read the inventory
chapter to confirm the GWP set before quoting a sovereign figure**.

#### 3.2.4 Adopted baseline (proposed)

- **GWP set: IPCC AR6, 100-year, without climate-carbon feedback**, named on every
  document; AR5 restatement available. Fossil CH4 (29.8) for fuel combustion, non-fossil
  for biomass. **Caveat:** Part C's `refrigerant-gwp.json` is fixed at AR5 and disclosed —
  moving it to AR6 restates R-410A 1,924 → 2,256 and needs a recorded reason.
- **Fuel factors: IPCC Table 1.4 CO2 × Table 1.2 NCV × a Sri Lankan density** (SLSEA
  Energy Balance appendix), no biofuel deduction, CH4/N2O by sector; DESNZ "100 % mineral"
  as the cross-check. Tier: global standard (the standard's value wins), density LK.
- Every row carries table, edition, publication date, GWP basis, NCV basis (net), density
  source and checksum — the `MANIFEST.json` pattern already in place.

Improvement path: Tier 1 default → Sri Lankan NCV/density (Energy Balance, CPC/LIOC
specifications) → supplier certificates of quality per batch (the only route to Option 1a
verified, score 1).

---

### 3.3 Sector-average (EEIO) emission intensities — Option 3

**Read by:** §5.1 and §5.2 Options 3a (per revenue, score 4), 3b (per assets, score 5),
3c (asset turnover, score 5); Part B; loans to financial institutions (economy-wide
average, score 5).

**What PCAF requires — `primary`.** Definition p.45/p.59; scores Table 5.1-2 p.46 and
Table 5.2-1 p.60 (3a = 4, 3b = 5, 3c = 5); equations Annex Table 10.1-2 p.192 (fn 212: an
alternative financial indicator may replace revenue, transparently, without moving the
score); "for a business loan to a paddy rice farmer … a sector-specific average emission
factor for the paddy rice sector and not … agriculture in general" (p.48, p.62); named
sources "EXIOBASE, CEDA, GTAP, or WIOD" (fn 62–65, 96–99); limitations p.64 (sectors
rarely map one-to-one; EEIO factors "often encompass only scope 1 and 2"); production-based
factors preferred over revenue-based because "less sensitive to fluctuations in exchange
rates" (p.47); **uncorrected absolute emissions reported as the minimum**, corrections
(FX, inflation, market) optional and separate (p.65); Box 6.1-5 inflation adjustment
*may* be applied to score 4–5 economic factors and the method *shall* be disclosed
(p.167); the DQ score weighted by outstanding, scope 3 apart (Box 6.1-6). PCAF's own
emission-factor database is "currently available only to PCAF signatories" (p.48, p.62).
The proxy-region ladder (one level above = 4, two above = 5, p.198) exists **only for
sovereign debt**, not for corporate Option 3.

#### 3.3.1 The sources, and where Sri Lanka sits in each

| Source | Sri Lanka | Sectors · base | Licence | Verification | URL |
|---|---|---|---|---|---|
| **Open CEDA 2025 (Watershed)** — **opened and read** | **Named row `LKA`** among 149 | 400 US BEA/NAICS-derived sectors · base year 2023, USD producer price · release 2025-11-11 | **CC BY-SA 4.0** — commercial use permitted, share-alike on derivatives | **`primary`** | https://open-ceda.s3.amazonaws.com/data/Open%20CEDA%202025%20by%20Watershed.xlsx · https://registry.opendata.aws/open-ceda/ |
| PCAF Emission Factor Database | inference: CEDA-based since 2025 (PCAF news, `secondary_reported`) → LK named; legacy EXIOBASE mapping → "RoW Asia and Pacific" | factors carry PCAF DQS 3–5; updated March/September | signatory-only (p.48 `primary`); joining reported free | `secondary_reported` | https://carbonaccountingfinancials.com/files/database/PCAF-2025Database-2Pager-R2.pdf |
| EXIOBASE 3 | **`WA` — RoW Asia and Pacific** (62-country bucket with Bangladesh, Pakistan, Nepal, Vietnam…; India and Indonesia are named) | 200 products / 163 industries with ISIC Rev.4 flags · 1995–2023, 2024+ nowcast · current 3.10.2 | **current releases CC BY-NC-ND 4.0**; **3.8.2 (Zenodo 5589597) CC BY-SA** — the only version a commercial tool may use without a licence from XIO-SA | `primary` (GitHub classification files, org README) | https://github.com/EXIOBASE/00-class · https://zenodo.org/records/5589597 |
| Eora / Eora26 | **own national table `LKA`** | Eora26 = 26 sectors; open data 1990–2016 only | free academic; **commercial ~USD 11.8k single-use** (`secondary_reported`) | concordance `primary`; terms `secondary_reported` | https://worldmrio.com/licensing.jsp |
| GTAP 11 | individual region `LKA` | 65 sectors · 2004–2017 | paid, per-licensee | `secondary_reported` | https://www.gtap.agecon.purdue.edu/databases/regions.aspx?Version=11.141 |
| US EPA Supply Chain Factors v1.3 | US only | 1,016 NAICS-6 commodities · 2022 USD · AR5 | public domain; EPA stopped updating (Watershed/Stanford successor) | format `primary`; figures `secondary_reported` | https://github.com/USEPA/supply-chain-factors |
| ADB MRIO | **named Asian economy** — 35 sectors, 2007–2022 | economic tables only, **no GHG extension** | free | README `primary`; LK inclusion `secondary_reported` | https://kidb.adb.org/mrio |
| WIOD | RoW | 56 sectors · 2000–2014 | free | `primary` (PCAF glossary) | too old |

**Open CEDA 2025 — sample Sri Lanka factors, kgCO2e per 2023 USD producer price (`primary`):**
grain farming 0.853 · electric power 3.506 · cement 8.487 · ready-mix concrete 2.282 ·
iron and steel 2.428 · apparel 0.304 · accommodation 0.275 · sugar and confectionery 0.481
(USA comparators 2.169 / 3.400 / 7.603 / 1.543 / 1.548 / 0.152 / 0.155 / 0.538). Three
things read off the workbook itself: (i) one GHG total per sector — **not split into
scope 1 and scope 2**, which p.64 warns about; (ii) the country→region sheet labels Sri
Lanka **"Central Asia"** (UN M49: Southern Asia) — override before any regional fallback;
(iii) its LKR conversion uses a **US** sector price index and an Openexchangerates FX
series (LKR/USD 2018 161.34 · 2019 178.59 · 2020 185.40 · 2021 197.57 · 2022 316.53 ·
2023 330.38 · 2024 305.25 · 2025 298.40) — replace with CBSL annual averages and a DCS
deflator and disclose (Box 6.1-5).

#### 3.3.2 Sri Lanka's national statistical basis (for a Sri Lanka-specific EEIO)

DCS Supply-Use and Symmetric I-O tables exist for **reference year 2010** only
(http://www.statistics.gov.lk/NationalAccounts/StaticalInformation/SNA_Accounts);
national accounts base year **2015**, SNA 2008; **SLSIC is the localised ISIC Rev.4** —
the pivot for every concordance; SLSEA Energy Balance 2022 for sectoral energy; BTR1
(2011–2021) for the inventory numerator; CBSL monthly-average exchange-rate workbook and
the Annual Economic Review statistical appendix for annual averages (all
`secondary_reported`, hosts blocked).

#### 3.3.3 Adopted hierarchy (every tier is score 4/5 — the tier changes representativeness, not the score)

| Tier | Source | Caveats printed on the factor |
|---|---|---|
| **A — adopt now** | **Open CEDA 2025 `LKA` rows**, concorded SLSIC → CEDA-400 | US sector structure; establish the scope 1/2 split before using as a scope-1+2 factor; re-base with CBSL FX + DCS deflator, disclosed; "Central Asia" label overridden |
| B | PCAF EF Database (once a signatory) | confirm the Sri Lanka row is country-level, not RoW |
| C — cross-check | EXIOBASE **3.8.2** region `WA`, per M€ | the only open MRIO that separates scope-1 direct intensity from the scope-2 electricity path; 62-country aggregate |
| D | Eora `LKA` | genuinely national but 26 sectors; commercial licence |
| E — last resort | US EPA v1.3 / UK ONS per-£ | foreign grid and technology; disclose the whole re-basing chain |
| **Target** | **Sri Lanka-specific EEIO**: DCS SIOT 2010 (or ADB-MRIO LKA 35 sectors, 2022) × BTR1 sectoral inventory × Energy Balance 2022, CBSL FX, DCS deflators — released and superseded under baseline governance, verified by Datum's ISO 14064 lead verifier | what fn 51/84 invites: "national agencies … statistical offices … may assist"; 3–6 months |

**Consequence for the repository:** `data/pcaf-parta/sector-factors.json` is "global
EEIO order-of-magnitude at an indicative rate". Tier A replaces every row with a Sri
Lanka-named factor under an open licence, and the plausibility bands in
`data/baselines/seed.json` (¼–4× those rows) are re-derived from it.

Vendors for listed names (`secondary_reported`): S&P Trucost (PCAF Principal Founding
Data Partner, Feb 2024), MSCI, ISS ESG (Industry Average Emission Intensity set following
PCAF, Aug 2024), Bloomberg (PCAF reliability score per estimate), LSEG (EXIOBASE 3 for
top-down estimates), CDP for reported data (p.47 fn 56, `primary`).

---

### 3.4 Building energy intensity — §5.4 CRE and §5.5 mortgages

**Read by:** CRE and mortgages Options 2b (type-and-location statistics × floor area,
score 4) and 3 (statistics per building × number of buildings, score 5); Option 2a
(official energy label × floor area, score 3) is **not reachable on a Sri Lankan book** —
there is no national building energy label — unless the FI adopts an "equivalent
certificate" under fn 129/139 and can defend the equivalence.

**What PCAF requires — `primary`, read from the repository's Third Edition PDF.**
Attribution = outstanding ÷ **property value at origination** (pp.78, 84; fns 124/125/134),
value includes land, building and improvements; latest value fixed where origination value
is not obtainable; a modified CRE loan with a new valuation updates the origination value.
Financed emissions = Σ (outstanding ÷ origination value) × energy consumption × emission
factor (pp.79, 84); supplier-specific first, average otherwise. Data quality — Tables 5.4-1
(p.80) and 5.5-1 (p.86), Annex 10.1-4/10.1-5 (pp.194–195): 1a metered × supplier-specific
= 1 · 1b metered × average = 2 · 2a label × floor area = 3 · 2b type/location statistics ×
floor area = 4 · 3 statistics × number of buildings = 5. Floor-area basis (net / usable /
gross) must match the factor's basis (fn 130, p.81). Collect size, use, climate zone, year
built at origination (p.79). "Easily accessible data for many countries is currently
between score 4 and 5" (p.85). PCAF's web emission-factor database is for committed
signatories only (fn 137, p.85).

#### 3.4.1 Sri Lankan sources

| Building type | Figure | Unit | Year | Publisher · title | URL | Verification | Notes |
|---|---|---|---|---|---|---|---|
| Commercial, hospitality, apparel, tea | benchmarks "developed and available" — values not captured | — | — | SLSEA, *Introducing Standards* | https://energy.gov.lk/en/energy-management/introducing-standards | `secondary_reported` | **Gazette Extraordinary 2339/09 of 4 July 2023** brings energy-usage benchmarks to three ISIC sectors with a Schedule II report to the Authority |
| All benchmarked sectors | not captured | — | — | SLSEA, *Energy Consumption Benchmark Analysis* | https://www.energy.gov.lk/images/energy-management/energy-consumption-benchmark-analysis.pdf | `not_found` (blocked) | **The document most likely to settle office/hotel per-m² — first to open** |
| Benchmark regulation | not captured | — | 2024 | SLSEA (S. Kithsiri) at ADB ACEF, *Introduction to the Energy Consumption Benchmark Regulation in Sri Lanka* | https://asiacleanenergyforum.adb.org/wp-content/uploads/2024/06/Sanath-Kithsiri.pdf | `not_found` | |
| Supermarkets; banks | NEBP "starting with supermarkets and the financial sector" | — | 2024 | USAID + SLSEA, National Energy Benchmarking Portal | https://lk.usembassy.gov/usaid-and-sri-lanka-sustainable-energy-authority-slsea-collaborate-to-empower-businesses-with-innovative-energy-efficiency-solution/ | `secondary_reported` | A bank-branch benchmark may exist here |
| Hotels | EnPI **per guest-night** (not per m²); energy ≈ 18 % of operating cost; benchmarks for 5-star and boutique | kWh/guest-night | 2025 | SLSEA + PEEB (GIZ/AFD), workshop 4 Nov 2025 | https://peeb.build/news/advancing-energy-benchmarking-for-a-competitive-hotel-sector-in-sri-lanka/ | `secondary_reported` | Unit mismatch with PCAF — needs occupancy and area to convert |
| Hotels (90-hotel study) | 5-star/boutique highest; 3/4-star similar — values unseen | | c.2011–13 | EU SWITCH-Asia *Greening Sri Lanka Hotels* | https://eturbonews.com/first-sri-lanka-hotel-energy-and-water-consumption-study-complet/ | `secondary_reported` | |
| **Supermarket — total floor area** | **465.4** | kWh/m²/yr | 2022 | IEEE / Univ. of Moratuwa, *Benchmarking Energy and Water Consumption of Supermarkets in Sri Lanka* (n = 101) | https://ieeexplore.ieee.org/document/9906145/ · thesis https://dl.lib.uom.lk/items/54ac1906-6416-43e2-9041-9fd3f26d81ba | `secondary_reported` | **Strongest Sri Lankan per-m² evidence found**; sales-floor basis 780.0 |
| **Modern office, Colombo (3 cases)** | **337.29 · 210.99 · 382.5** | kWh/m²/yr | 2023 | MDPI *Architecture* 3(3):19 | https://doi.org/10.3390/architecture3030019 | `secondary_reported` | Case study, n = 3 |
| Adaptive-reuse historic office, Galle (3) | 143.74 · 156.34 · 209.39 | kWh/m²/yr | 2023 | as above | as above | `secondary_reported` | Naturally ventilated lower bound |
| Office, Colombo aggregate | **~250**, BEI range **235–285**; 87 multi-storey offices, ~73,000 m² | kWh/m²/yr | 2010s | IESL SLEN *Building Energy Standards/Codes* and/or UoM thesis | https://iesl.lk/SLEN/46/Energy.php · http://dl.lib.uom.lk/handle/123/12434 | `secondary_reported` — **attribution unconfirmed** | Open both to confirm which carries which number |
| Energy Efficiency Building Code 2021 (rev. of 2008 code) | design code; whether it carries EUI values unverified | — | 2021 | SLSEA under s.36(2)(f), Act 35 of 2007 | https://www.energy.gov.lk/images/resources/downloads/energy-efficiency-building-code.pdf | `not_found` | Not a label scheme |
| GREENSL v2.1 (Feb 2022) energy credit | relative to **ASHRAE 90.1-2016** — no absolute kWh/m² baseline | — | 2022 | GBCSL | https://www.srilankagbc.org/wp-content/uploads/2022/08/Green-Building-Rating-System-Version-2.1-FINAL-25-02-2022-1.pdf | `secondary_reported` | GREENSL-EB v1.0 (2022) is the likeliest fn-129 candidate **only if** it states a measured EUI |

#### 3.4.2 Residential Sri Lanka (feeds §5.5 Option 3 / 2b)

| Item | Figure | Unit | Year | Source | URL | Verification |
|---|---|---|---|---|---|---|
| Domestic sales ÷ domestic accounts — the Option 3 per-dwelling figure | not captured | kWh/account/yr | 2023 / 2024 | CEB Statistical Digest | https://www.ceb.lk/publication-media/statistical-reports/128/en (2023) · /141/en (2024) | `not_found` (blocked) — **the digest's sales-by-tariff and consumers-by-category tables give it directly** |
| Distribution shape | 75 % of ~5 M domestic consumers use 1–90 units/month | kWh/month | 2013 | CEB via Sunday Times | https://www.pressreader.com/sri-lanka/sunday-times-sri-lanka/20130324/281651072555669 | `secondary_reported`, old |
| Household share of national electricity | ~40 % | % | HIES 2019 basis | Kumara & Nimal, SSRN | https://papers.ssrn.com/sol3/Delivery.cfm/060b8b8e-14dc-4363-bff4-97724d1055d3-MECA.pdf?abstractid=4870731 | `secondary_reported` |
| **RECON-SL** | 4,063 households (LECO), Oct 2022–Jan 2025; 1,438 smart-metered; 3 survey waves with housing attributes | — | 2025 | LIRNEasia / IEEE DataPort (open access) | https://ieee-dataport.org/open-access/residential-electricity-consumption-dataset-sri-lanka-recon-sl | `secondary_reported` | **Best route to a Sri Lankan per-dwelling and possibly per-m² baseline** |
| HIES 2019 | energy expenditure items exist; not captured | — | 2019 | DCS | https://www.statistics.gov.lk/Resource/en/IncomeAndExpenditure/HouseholdIncomeandExpenditureSurvey2019FinalResults.pdf | `not_found` |
| Average dwelling floor area | not found — census records rooms/type/materials, floor area unclear | — | 2012/2024 | DCS | http://www.statistics.gov.lk/ | `not_found` |
| LPG per household | not found | | | | | `not_found` |

#### 3.4.3 Regional / global fallbacks

| Source | Coverage / figure | Unit | Vintage | URL | Verification | Access |
|---|---|---|---|---|---|---|
| **CRREM Global Pathways v2.05** | 44 countries, 18 property types; Asia-Pacific: Australia, China, Hong Kong, India, Japan, Malaysia, Philippines, Singapore, South Korea (± New Zealand — count to confirm). **Sri Lanka and Thailand not covered.** | kWh/m²/yr and kgCO2e/m²/yr pathways 2020–2050 | 30 Apr 2026 | https://crrem.org/pathways/ · FAQ https://www.crrem.eu/frequently-asked-questions/ | `secondary_reported` | Open for use; **commercial embedding needs a CRREM License Partner agreement** — relevant to CarbonIQ. Proxy candidates for LK: India, Malaysia, Singapore |
| US EIA CBECS 2018 | all commercial **70.6 kBtu/ft² ≈ 222.7 kWh/m²** site; per-type table not captured | kBtu/ft²/yr | 2018 | https://www.eia.gov/consumption/commercial/pba/overview.php | `secondary_reported` | public domain |
| US EIA RECS 2020, Table CE1.1 | 76.8 MMBtu/household ≈ 22,500 kWh; 42.2 kBtu/ft² ≈ 133 kWh/m² | | 2020 | https://www.eia.gov/consumption/residential/data/2020/c&e/pdf/ce1.1.pdf | `secondary_reported` | poor climate proxy — archetype only |
| ASHRAE 100-2018 Table 7-2a | office targets 29–60 kBtu/ft² by climate zone (targets, not averages) | | 2018 | addendum c PDF | `secondary_reported` | paid standard |
| IEA Energy Efficiency Indicators | per-m² residential/services; LK coverage unknown | | annual | https://www.iea.org/data-and-statistics/data-tools/energy-efficiency-indicators-data-explorer | `not_found` | mixed |
| PCAF European Building EF Database | Europe only | | 2022– | https://carbonaccountingfinancials.com/financing-towards-net-zero-buildings | `secondary_reported` | not a LK proxy |
| Tropical hotel review | 143.6 (1-star) – 621.14 (4-star) | kWh/m²/yr | 2021 | https://www.mdpi.com/2071-1050/13/4/1754 | `secondary_reported` | regional fallback |

Unit conventions: 1 m² = 10.7639 ft²; 1 kBtu/ft² = 3.1546 kWh/m²; 1 MMBtu = 293.07 kWh.
Sri Lankan valuations quote **floor area in ft²** and **land in perches (1 perch = 272.25
ft² = 25.29 m²)**, side by side — a register must accept ft² or m² for floor area and
**refuse a perch value in the floor-area field**.

#### 3.4.4 Adopted baseline candidates (none released; every row re-read before release)

| Building type | Candidate | Unit | Tier | Vintage | Status |
|---|---|---|---|---|---|
| Office, air-conditioned (Colombo) | ~250 (235–285); cases 211–383 | kWh/m²/yr | LK | 2010s–2023 | `secondary_reported` — open IESL/UoM |
| Office, naturally ventilated | 144–209 | kWh/m²/yr | LK | 2023 | n = 3 |
| Supermarket / food retail (gross) | **465.4** | kWh/m²/yr | LK | 2022 | strongest LK evidence |
| General retail / mall | none LK | | regional | | CRREM India/Malaysia/Singapore; CBECS |
| Hotel | SLSEA per guest-night (unseen); tropical 144–621 | | LK / regional | 2025 / 2021 | open SLSEA PDF |
| Hospital, industrial, warehouse | none LK | | global | 2018 | CBECS by type — not captured |
| Bank branch | NEBP benchmark reported to exist | | LK | 2024 | not captured |
| Residential per dwelling (Opt 3) | CEB domestic sales ÷ accounts | kWh/yr | LK | 2023/24 | open digest; RECON-SL |
| Residential per m² (Opt 2b) | none LK | | derive | | from RECON-SL |

**Consequence for the repository's provisional set** (`data/pcaf-parta/real-estate/energy-statistics.json`):
office 160 kWh/m² is **low** against every Sri Lankan office figure found; retail 210 is
**under half** the supermarket benchmark; hotel 290 has no LK support; residential 95/110
have no LK evidence. Nothing changes until re-read from source — logged here first.

#### 3.4.5 Improvement path (score 5 → 4 → 2/1)

1. **5 → 4:** capture floor area in ft² at origination (the valuation report carries it) and building type; convert; PCAF p.79/87.
2. **4 → 3:** only via an fn-129 equivalent certificate — a GREENSL-EB certificate stating a measured EUI, or an SLSEA benchmark-regulation Schedule II report. Do not claim 3 until one is shown to carry a per-m² figure.
3. **4 → 2:** CEB/LECO account data with borrower consent (a consent clause in the facility agreement plus bill upload) — Option 1b with the national average; **score 1 requires a supplier-specific factor CEB does not issue today** (fn 128).
4. **Statutory lever (`secondary_reported`):** SLSEA Act 35 of 2007 ss.36/38 and Gazette 1715/12 (20 Jul 2011) require large consumers **above 600,000 kWh/yr** to appoint an accredited Energy Manager and report consumption; Gazette 2339/09 (2023) adds benchmark reporting. Any CRE borrower above 600 MWh/yr already holds metered annual consumption in a statutory report — asking for it costs nothing and moves the exposure to score 2.
5. **Mortgages:** consented billing data via LECO/CEB; failing that, digest sales ÷ accounts (score 5) or a per-m² figure derived from RECON-SL and released as a baseline (score 4).

---

### 3.5 Motor vehicle loans — §5.6

**Read by:** vehicle facilities and leases — a large retail class on a Sri Lankan bank's
book after home finance.

**What PCAF requires — `primary`, Third Edition pp.90–96, Annex Table 10.1-6 p.196.**
Attribution = outstanding ÷ **total value at origination** (p.91); denominator unknown →
"assume 100 % attribution" (p.91). Emissions = Σ attribution × distance × efficiency ×
fuel factor, or fuel consumption × factor (p.92). **Table 5.6-1 (p.94): 1a = 1 · 1b = 1 ·
2a = 2 · 2b = 3 · 3a = 4 · 3b = 5** — the only Part A class where two options score 1.
**fn 146: "local" statistics = province/state or small-country level → a Sri-Lanka-wide
annual-km statistic is *local*, so make/model efficiency × a Sri Lankan km statistic is
Option 2a, score 2**; an Indian/South-Asian statistic is *regional* → 2b, score 3.
Lowest-score-in-the-mix per borrower (p.93). Hybrids: manufacturer split, else geography
split, else combustion 100 % (p.96); non-plug-in HEVs consume petrol only. EV grid factor:
borrower locality → branch → country, supplier-specific preferred (p.96, fn 151). The FI
defines the vehicle types included and explains exclusions (p.90). PCAF's own per-model
database is signatory-only (p.95). No DCL item is vehicle-specific.

#### 3.5.1 Fleet and registrations

NTC *National Transport Statistics 2020–21* stock, read in full from Team Watchdog's
transcription (https://raw.githubusercontent.com/team-watchdog/databank-sri-lanka/… —
`secondary_reported (mirror)`): 2020 — motor cars 896,885 · tricycles 1,182,227 ·
motorcycles 4,819,708 · buses 112,583 · dual purpose 448,552 · lorries 379,441 · tractors
381,626 · total 8,297,852 (cumulative registrations, not netted for scrappage — say so).
DMT *Vehicle Population 2014–2025* (https://dmt.gov.lk/images/2026/Vehicle_Population_2014-2025.pdf,
blocked; snippet) 2024: cars 905,329 · tricycles 1,184,510 · motorcycles 4,922,268 · buses
114,099. New registrations (CBSL 2022 via mirror): 2018 480,799 → 2019 367,303 → 2020
202,628 → 2021 33,850 — the import ban (2020 to Gazette 2421/44, 1 Feb 2025). 2024 total
74,410; 2025 to November 312,317; EVs 15 % of brand-new registrations, dominated by
electric two-wheelers (July 2025: 3,802 of 4,292 EV registrations; Yadea 2,473); BYD leads
brand-new cars (Sunday Times 11 Jan 2026; EconomyNext via mirror — `secondary_reported`).
**No stock-level fuel split and no published fleet age were found.**

#### 3.5.2 Annual distance

| Class | km/yr | Tier | Vintage | Source | Verification |
|---|---|---|---|---|---|
| Car, petrol | 8,274 | LK (local → 2a) | **2000 fleet** | World Bank/ESMAP *Sustainable Transport Options for Sri Lanka* ESM262 | `secondary_reported` https://documents1.worldbank.org/curated/en/503521468105868544/txt/ESM2620v10CE0S1e0Transport01public1.txt |
| Car, diesel | 16,759 | LK | 2000 | same | `secondary_reported` |
| Three-wheeler, petrol | 19,676 | LK | 2000 | same | `secondary_reported` |
| Motorcycle 4-stroke / 2-stroke | 5,171 / 5,533 | LK | 2000 | same | `secondary_reported` |
| SLTB bus, per fleet bus | 61,509 (2019) | LK | 2019 | derived: NTC operated km ÷ average fleet (mirror) | derived |
| Motorcycle, India | 8,800 (TRD 2015) · 6,300 (CEEW) | regional → 2b | 2015 | urbanemissions.info; CEEW | `secondary_reported` |
| Vans, lorries | not verified | | | ESM262 likely carries them; ICAT transport MRV protocol 2019 | `not_found` |

The only Sri Lankan per-class set is 25 years old; a bank using it says so and states
the check it applied. The ICAT *MRV protocol of transport sector in Sri Lanka* (2019,
https://climateactiontransparency.org/wp-content/uploads/2019/04/Measurement-reporting-and-verification-protocol-of-transport-sector-in-Sri-Lanka.pdf)
is the likeliest current source — not opened.

#### 3.5.3 Fuel economy

No Sri Lankan fuel-economy labelling exists (CEA 2018 gazettes set Euro 4 exhaust limits,
not CO2 — `not_found`, not proven absent). GFEI lists Sri Lanka as a supported country
(snippet). Model-level (`secondary_reported`, cycle recorded): Toyota Aqua 33.6 km/L WLTC
(Toyota Global Newsroom); Honda Vezel HEV 27.0 km/L JC08 (2013 — JC08 overstates
real-world by roughly a quarter); Bajaj RE three-wheeler ~40 km/L (unofficial); Nissan
Leaf 40 kWh 14.0 kWh/100 km WLTP; BYD Atto 3 13.8 kWh/100 km WLTP. Wagon R, Prius, Grace,
Hilux, Honda/TVS motorcycles — `not_found`. PCAF names fueleconomy.gov (US EPA) and the EEA
WLTP csv as make/model sources (p.95). The VET programme (2008–, Laugfs Eco Sri and CleanCo)
measures CO/HC/opacity, not CO2 — its value is the **annual vehicle-by-vehicle touchpoint
tied to the revenue licence**; whether it records the odometer is unverified.

#### 3.5.4 Adopted baseline (provisional, by DMT class) and the improvement path

| Class | Fuel | Annual km (option) | Efficiency | Status |
|---|---|---|---|---|
| Car petrol / HEV | petrol | 8,274 LK 2000 (2a) | make/model from CR; class figure `not_found` | provisional, vintage disclosed |
| Car diesel | diesel | 16,759 LK 2000 (2a) | `not_found` | provisional |
| Tricycle | petrol | 19,676 LK 2000 (2a) | Bajaj RE ~40 km/L | provisional |
| Motorcycle | petrol / electric | 5,171 LK 2000 (2a); 8,800 India (2b) | `not_found` | provisional |
| Dual purpose van · lorry | diesel | `not_found` | `not_found` | gap |
| Bus | diesel | SLTB 61,509 (2019) | `not_found` | partial |
| EV car · e-two-wheeler | electricity (grid average, §3.1) | as ICE class | Leaf 14.0 · Atto 3 13.8 kWh/100 km | provisional |

1. Today, class field only → **3a, score 4** (3b only where even the class is unknown, which a CR-based file never is).
2. **Free step to score 2:** the vehicle finance file already holds the DMT Certificate of Registration (make, model, year, engine cc, fuel, class) and a valuation — make/model efficiency plus a Sri Lankan km statistic is **2a = 2**; the valuation gives the denominator, so the 100 % fallback is never needed.
3. **Score 1 from the odometer:** the lessor owns the asset and inspects it at origination, insurance renewal and (if recorded) the annual VET — two readings a year apart give actual distance → 1b = 1; a fleet borrower supplies fuel invoices → 1a.
4. Record the option per line; apply lowest-in-mix per borrower; disclose excluded types (tractors, trailers) and the year-end convention.

**Consequence for the repository:** `data/factors/vehicle-ef.json` assumes 0.19 kWh/km ×
0.53 kgCO2/kWh ≈ 100 gCO2/km with no citation — a placeholder to replace, not evidence.

---

### 3.6 Sovereign debt, sub-sovereign, project finance, use of proceeds, carbon price, currency and deflators

#### 3.6.1 Sovereign debt — §5.9

**What PCAF requires — `primary`, pp.140–148, Annex 10.1 Table 10.1-7 p.197, Annex 10.3
pp.201–206.** Scope 1 = domestic territorial emissions; "financial institutions **shall**
report scope 1 emissions including and excluding LULUCF" as two separate figures (Table
5.9-2, p.141–142) — never summed; scope 2 and 3 are *should*. Attribution = exposure ÷
**PPP-adjusted GDP** (p.144); Table 5.9-6 (p.147): 1a verified UNFCCC-reported = 1 ·
1b unverified = 2 · 2 physical activity = 3 · 3a sectoral revenue = 4 · 3b similar-country
proxy = 5. Worked example Table 10.3-2: Singapore 106 and Hong Kong 91 tCO2e per USD 1 M
(p.202, emissions excl. LULUCF, source EDGAR). Named data sources Table 10.3-4 (pp.205–206):
UNFCCC di.unfccc.int, Climate Watch, EDGAR, OECD TeCO2, World Bank PPP-GDP — and fn 230:
the World Bank "changes historic data retrospectively", so record the retrieval date and
ICP round. Sri Lanka is non-Annex I; a BTR1 figure is technically expert-reviewed, not
"verified" in the Annex I sense (fn 178, p.147) — **the conservative reading is 1b, score
2, until a review report is published.**

**Sri Lanka's inventory (`secondary_reported`, unfccc.int blocked):**

| Item | Figure | Year | Source |
|---|---|---|---|
| NC3 total **excl. LULUCF** | **22,084.62 Gg CO2e** (22.08 Mt) | 2010 | Third National Communication (1 Dec 2022) https://unfccc.int/sites/default/files/resource/Third%20National%20Communication%20of%20Sri%20Lanka.pdf |
| NC3 LULUCF gross emissions / removals | 21,460.13 / **−39,826.3 Gg** → net LULUCF **−18,366 Gg (a sink)** | 2010 | same |
| NC3 total **incl. LULUCF, net** | **3,718.45 Gg** (3.72 Mt) — derived 43,544.75 − 39,826.3 | 2010 | same |
| NC3 sectors | Energy 14,154.16 · IPPU 448.57 · Agriculture 6,505.67 · Waste 976.22 (Gg) | 2010 | same |
| NC3 GWP set | `not_found` — read the inventory chapter | | |
| **BTR1** — submitted **Dec 2024**, inventory **2011–2021**, 2006 Guidelines with refinements | totals `not_found` — **the document to open first; it supersedes NC3** | 2021 | https://unfccc.int/sites/default/files/resource/First%20Biennial%20Transparancy%20Report%20-%20Sri%20Lanka%20-%202024.pdf · annex https://unfccc.int/documents/646726 |
| EDGAR 2024 report | **22 MtCO2eq** (excl. LULUCF) | 2023 | https://edgar.jrc.ec.europa.eu/report_2024 |
| PPP GDP `NY.GDP.MKTP.PP.CD` | `not_found` (api.worldbank.org blocked) | 2020–24 | https://api.worldbank.org/v2/country/LKA/indicator/NY.GDP.MKTP.PP.CD?format=json&date=2020:2024 (CC BY 4.0) |

**Correction to what the repository holds.** `data/pcaf-parta/sovereign/dataset.json`
ships Sri Lanka provisional scope 1 as **35 Mt excl. LULUCF and 30 Mt incl. (2018)** and
PPP GDP 296,600 M int$ "approximate". The excl. figure is ~60 % above NC3-2010 and
EDGAR-2023, and **the LULUCF term has the wrong sign** — the including-LULUCF figure is of
the order of 4 Mt, not 30. Part 2 replaces both with BTR1/WDI values carrying retrieval
dates.

#### 3.6.2 Sub-sovereign — §5.10

`primary` pp.150–158: sovereign-like issuers use the territorial method with exposure ÷
sub-sovereign PPP-GDP (national PPP factor × regional nominal GDP, capped at 1, p.154;
Bavaria example p.205); corporate-like issuers use the §5.2 method; scope 1 **shall**
exclude and **should** include LULUCF (the reverse emphasis from §5.9); Table 5.10-5
(p.156): Option 4a one level above = 5, 4b two levels above = 5. **No Sri Lankan
provincial or municipal inventory was found**; the Climate Change Secretariat's *Manual of
GHG Inventory for Cities* (2024, GPC-based, https://www.climatechange.lk/CCS2024/Manual_GHGI%20for%20Cities.pdf)
is a method, not a result. Adopt: absent, with the three inputs named; route municipal
exposures to the §5.2 corporate-like path.

#### 3.6.3 Project finance — §5.3

`primary` pp.66–75, p.163: scope 1 and 2 of the project *shall*; removals *shall* be
reported separately from absolute emissions and from credits generated and retired (four
lines, never netted); "avoided emissions are no longer covered in this Standard" — moved
to the supplement; lifetime scope 1+2 *should* be reported **separately in the year of
contracting** (capacity × load factor × lifetime × fuel carbon content); PCAF's
balance-sheet accounting and the IFI combined-margin approach are "complementary". Sri
Lankan project baselines (`secondary_reported`): CDM DNA page CID=200 with registered
projects (Mampuri wind, Kithulgala hydro, PowerGen 10.5 MW wind); the **Sri Lanka Carbon
Crediting Scheme** (2016, Sri Lanka Climate Fund, unit SCER, ISO 14064 verification —
https://www.climatefund.lk/slccs.html); no Gold Standard/Verra project surfaced. Grid
displacement factors: §3.1.

#### 3.6.4 Use of proceeds — §5.7 and Sri Lankan labelled issuance

`primary` pp.98–102: labelled green bonds are *integrated* structures; double attribution;
emissions on allocated **and** unallocated amounts (unallocated on issuer-level data);
separate structures are zero until allocated; sustainability-linked instruments are not
UoP. The SLGFT (repo PDF, `primary`) carries no bond-impact provisions. `secondary_reported`:
ICMA *Harmonised Framework for Impact Reporting* June 2024
(https://www.icmagroup.org/assets/documents/Sustainable-finance/2024-updates/Handbook-Harmonised-Framework-for-Impact-Reporting-June-2024.pdf)
— core indicators not read; CSE GSS+ framework effective March 2025; **DFCC green bond
LKR 2.5 bn, Sept 2024, first in Sri Lanka**, proceeds to solar, allocation within 18
months (impact report and grid factor not yet obtained); Alliance Finance Feb 2025;
Commercial Bank up to LKR 15 bn Aug 2025; BOC sustainability bond LKR 10 bn Dec 2025;
**no Sri Lankan green sukuk located**; ICMA/IsDB/LSEG *Guidance on Green, Social and
Sustainability Sukuk* April 2024 points impact reporting at the ICMA Principles.

#### 3.6.5 Carbon price

**Sri Lanka has no carbon tax and no ETS** — OECD *Pricing Greenhouse Gas Emissions: Key
Findings for Sri Lanka* (2024): 0 % of emissions under a positive net effective carbon
rate; fuel excise covers 28.9 % (https://www.oecd.org/tax/tax-policy/carbon-pricing-sri-lanka.pdf,
`secondary_reported`). Explicit price baseline = **0, recordable now**. Shadow prices
(`secondary_reported`): World Bank *State and Trends 2025* average ~USD 19/t across 43
taxes and 37 ETSs; NGFS Phase V Net Zero 2050 ~USD 300/t by 2035 (dollar base year not
obtained); ADB social cost USD 36.30 (2016) + 2 %/yr real; World Bank 2024 shadow-price
guidance note exists (values not obtained). SCER prices under the SLCCS: `not_found`.

#### 3.6.6 Currency and deflators (the Box 6.1-5 inputs)

`not_found` — CBSL *Sri Lanka Socio-Economic Data 2025* folder carries the annual averages
for USD/EUR/GBP/JPY in one table
(https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/publications/otherpub/publication_sri_lanka_socio_economic_data_folder_2025_e.pdf);
WDI `PA.NUS.FCRF` (official annual average) and `NY.GDP.DEFL.ZS` are the machine-readable
fallbacks. Year-end 2023 ≈ 324, 2024 ≈ 293 LKR/USD (FocusEconomics, `secondary_reported` —
end-period, never used to re-base a flow). CCPI and NCPI rebased to **2021 = 100** from
Jan/Feb 2023; GDP base year **2015**. The CEDA Openexchangerates series (§3.3) is a sanity
check only.

#### 3.6.7 NDC 3.0 (September 2025)

Headline **20.09 % cumulative reduction vs BAU 2026–2035 = 8.11 % unconditional + 11.98 %
conditional — confirmed** across several `secondary_reported` sources (UNDP Climate
Promise, climate-laws.org). Sector shares: 75 % renewables and efficiency, 7.5 %
agriculture, 7 % industry, 6.3 % mobility. **The removal line (4.49 % = 0.96 % + 3.53 %)
was not reproduced by any independent source** — `data/gcf/ndc3.json` already asks for a
check against the registry PDF; that check stays open. One secondary source claims
"carbon neutrality by 2050"; the repo holds that NDC 3.0 states no net-zero year — resolve
from the registry document (https://unfccc.int/ndc-3.0).

---

## 4. Corrections this research implies for what the repository holds today

| File | Held today | Finding | Action (Part 2) |
|---|---|---|---|
| `data/pcaf-parta/country-config.json` LK | `operating_margin: 0.9224 (2017)`, `build_margin: null` | 0.9224 is the **build** margin; OM 2017 = 0.6993 | Relabel; add OM; add 2020 and 2022 sets as a dated series; mark 2017 superseded |
| same | `grid_average: 0.5 (LTGEP 2023)` | rounded planning figure | Replace with Ember 2024 0.3757 (`primary`) carrying its caveats; staleness 1 year |
| `data/factors/a5-defaults.json` | `gridEF: 0.53` "Sri Lanka grid placeholder" | ~40 % above the evidenced 2024 average | Resolve from the registry's `grid_emission_factor_kgCO2e_kWh`; keep provisional until CEB/SLSEA releases an average |
| `data/pcaf-parta/real-estate/energy-statistics.json` | office 160 · retail 210 · hotel 290 · residential 95/110 kWh/m² | office low, retail under half the LK benchmark, hotel and residential unsupported | Re-read sources; release LK values where evidenced; regional/global elsewhere, tier printed |
| `data/pcaf-parta/sovereign/dataset.json` LK | scope 1 excl. 35 Mt / incl. 30 Mt (2018); PPP GDP 296,600 "approximate" | excl. ~60 % above NC3/EDGAR; **LULUCF sign wrong** (net sink −18 Mt → incl. ≈ 4 Mt) | Replace with BTR1 2021 and WDI PPP-GDP with retrieval dates; option 1b, score 2 |
| `data/pcaf-parta/sector-factors.json` | global EEIO order-of-magnitude at an indicative LKR rate | Sri Lanka is a named row in Open CEDA 2025 (CC BY-SA) | Replace every row from CEDA `LKA` via an SLSIC→CEDA concordance; re-derive the plausibility bands |
| `data/factors/vehicle-ef.json` | EV ≈ 100 gCO2/km from 0.19 kWh/km × 0.53 | no citation; grid figure superseded | Resolve grid from the registry; hold per-model WLTP kWh/100 km with the cycle named |
| `data/factors/refrigerant-gwp.json` | AR5 basis, disclosed | bank-wide AR6 adoption restates R-410A 1,924 → 2,256 | Decide once for the whole product; record the reason |
| `data/baselines/seed.json` | sector-intensity bands at ¼–4× the provisional sector factor | the factor rows they derive from are replaced | Re-derive the bands from the adopted Open CEDA LKA rows and release |
| `data/gcf/ndc3.json` | removal 4.49 % (0.96/3.53) | not reproduced by any independent source | Verify against the NDC registry PDF page; strike or cite |
| `country-config.json` LK | `stale_after_years: 3` | grid intensity fell 518 → 321 in six years | 1 year for the grid average |
| `docs/PCAF-PART-A-RESEARCH.md` §7 | "no Sri Lankan commercial bank is yet a full PCAF signatory" | a PCAF-hosted CBK-2024 disclosure and LB Finance's membership contradict it | Verify on the signatory list; amend §7 |
| `CLAUDE.md` north star | "~USD 13,500/yr" PCAF programme fee; programme term to be confirmed | fee unsourced; PCAF's own wording is "Accredited Partner" | Print no term or fee until the partners page is read |
| registry `metrics.js` | 5 metrics; grid EF declared `wired: false` | | Add the keys in §2; wire every engine to resolve from the registry |

---

## 5. Verification worklist — `secondary_reported` and `not_found` rows to promote

Open each from a network that reaches it; re-read the figure; record page/table; promote to
`primary` in this document and in `data/baselines/baseline-register.json`.

**Grid**
- [ ] Energy Balance 2017 / 2020 / 2022 — confirm OM/BM/CM and the weighting stated — energy.gov.lk
- [ ] Energy Balance 2018 / 2019 / 2021 / 2023 / 2024 — fill the gaps — energy.gov.lk, info.energy.gov.lk
- [ ] UNFCCC/IFI Harmonised Grid EF dataset — the Sri Lanka row — unfccc.int/documents/198197
- [ ] LTGEP 2025-2044 "environmental implications" chapter — projected average factor — ceb.lk
- [ ] CDM Tool 07 v7.0 — the OM/BM default weights — cdm.unfccc.int
- [ ] Ember licence page (CC BY 4.0) — ember-energy.org
- [ ] I-REC issuer for Sri Lanka (Green Certificate Company) — trackingstandard.org

**Buildings**
- [ ] SLSEA *Energy Consumption Benchmark Analysis* PDF — the per-type figures
- [ ] Gazette 2339/09 (4 Jul 2023) — the three ISIC sectors and Schedule II
- [ ] Gazette 1715/12 (20 Jul 2011) — the 600,000 kWh threshold
- [ ] IESL SLEN / UoM thesis — which document carries the 235–285 BEI and the 87-building study
- [ ] IEEE 9906145 / UoM thesis — supermarket 465.4 / 780.0
- [ ] MDPI Architecture 3(3):19 — the six office figures
- [ ] CEB Statistical Digest 2023 and 2024 — domestic GWh and account counts
- [ ] RECON-SL DataPort page — licence and whether floor area is in the survey
- [ ] GREENSL-EB v1.0 — whether a certificate states a measured EUI
- [ ] CRREM FAQ — the exact APAC country list and the License Partner terms
- [ ] CBECS 2018 per-PBA table — office, lodging, retail, health, warehouse EUIs

**Fuels and GWP**
- [ ] IPCC 2006 Vol. 2 Tables 1.2, 1.3, 1.4, 2.2–2.5, 3.2.1, 3.2.2 — confirm every kg/TJ and NCV
- [ ] SLSEA Energy Balance 2022 conversion-factor appendix — densities and NCVs for CPC fuels
- [ ] DESNZ 2025 condensed set — the "100 % mineral" diesel and petrol rows, per litre and per kWh net CV
- [ ] IPCC AR5 Table 8.A.1 and AR6 Table 7.15 — the GWP columns; SF6 AR6 value
- [ ] GHG Protocol *Global Warming Potential Values* (Aug 2024) — the recommendation wording
- [ ] Sri Lanka BTR1 inventory chapter — the GWP set used

**Sector factors**
- [ ] PCAF 2025 Database 2-pager — model, regions, whether LK is a country row
- [ ] EXIOBASE 3.8.2 Zenodo record 5589597 — the CC BY-SA licence text
- [ ] Eora licensing page — commercial terms and price
- [ ] DCS SUT/SIOT 2010 and any later SUT; CBSL Socio-Economic Data 2025 exchange-rate table
- [ ] HSBC (Feb 2026), Scotiabank (2025), Barclays (2023) methodology PDFs — which EEIO database each names

**Vehicles**
- [ ] DMT *Vehicle Population 2014–2025* — every class, 2021–2025
- [ ] World Bank ESM262 — the full per-class km table incl. vans, buses, lorries
- [ ] ICAT transport MRV protocol (2019) — current per-class km assumptions
- [ ] NTC *National Transport Statistics 2024* — km/day and occupancy assumptions
- [ ] GFEI *Trends in the global vehicle fleet 2023* — whether a Sri Lanka line exists
- [ ] Manufacturer WLTC/WLTP figures: Wagon R, Prius, Grace, Hilux, Raize, Bajaj RE, Honda/TVS/Yadea two-wheelers
- [ ] DMT / Eco Sri — whether the VET record captures the odometer

**Sovereign, project finance, UoP, carbon price, currency**
- [ ] BTR1 (Dec 2024) — 2021 totals with and without LULUCF, GWP set, sector split, review status
- [ ] WDI `NY.GDP.MKTP.PP.CD` and `PA.NUS.FCRF` for LKA 2020–2024, with retrieval date
- [ ] EDGAR 2025 report — 2020–2023 series
- [ ] CDM DNA page CID=200 — registered projects and approved baseline factors; SLCCS methodology list
- [ ] ICMA Harmonised Framework June 2024 — renewable-energy core indicators and grid-factor guidance
- [ ] DFCC green bond first allocation/impact report — the grid factor used
- [ ] World Bank 2024 shadow price of carbon note; NGFS Phase V price table with $-base year
- [ ] CBSL Socio-Economic Data 2025 — annual-average USD/LKR and EUR/LKR 2021–2025; DCS GDP deflator series
- [ ] NDC 3.0 registry PDF — page cites for 20.09 % and the 4.49 % removal line; net-zero statement

**Market practice and peers**
- [ ] PCAF signatory list filtered to Sri Lanka; PCAF partners page — the programme's exact name and fee
- [ ] `CBK-2024.pdf` — confirm the institution; read totals, coverage, DQ scores, factor vendor
- [ ] Amana Bank Annual Report 2025 — financing by product, sector concentration, sukuk/treasury holdings, any GHG statement
- [ ] CBSL Direction 05/2022 — clause numbers, reporting format, any GHG requirement; Roadmap 2.0 text
- [ ] CA Sri Lanka SLFRS S1/S2 roadmap and guidebook — transition reliefs; whether Amana is in the 2025 tranche
- [ ] IFSB GN-11 — whether it addresses financed emissions

---

## 6. The data-quality improvement programme (outline — to be completed after Monday)

Per asset class: the score the book starts on, what moves it one step, what it costs, who
collects it (the bank at origination vs Datum in assurance and baseline maintenance), and
the statutory levers that make some steps free. Every projected score is a *scenario*,
never presented as the reported score.

---

## 7. Change log

| Date | Sections | Change | Source |
|---|---|---|---|
| 2026-09-16 | §3.5, §2 | Part 4: `vehicle_annual_distance_km` seeded for LK from the adopted ESMAP 2000 candidate (car petrol 8,274 · car diesel 16,759 · three-wheeler 19,676 · motorcycle 5,171 · SLTB bus 61,509), `secondary_reported`, provisional; read by the §5.6 engine through `application/vehicle-factors.js`. Fuel economy stays unseeded — the adopted candidate is model-level figures with their cycles, not class averages — and the engine's class fallback is a provisional table that says so. |
| 2026-09-16 | 0, 2, 3.1, 3.4, 4, 5 | First compilation: the register's rules and the grid and building families; the OM/BM relabel finding; the verification worklist | Seven-family research run; PCAF Third Edition (repo copy); Ember/OWID open data |
| 2026-09-16 | 0, 2, 4 | **Part 2.** Registry metrics added for every family (table metrics may be sparse); the adopted grid average, fuel factors and building intensities seeded, provisional, with verification in the source text; `country-config.json` relabelled (0.9224 is the 2017 build margin) and moved to the 2022 SLSEA set with Ember's 2024 average; the sovereign dataset's LK row corrected in level and LULUCF sign; the property engine resolves grid, fuel and intensity from the registry and names the baseline on the trace; the per-class route and screen panel; the Islamic-instrument layer removed — classification is by the financed asset as for any bank | `src/domains/baseline/domain/metrics.js`, `data/baselines/seed.json`, `application/property-factors.js`, `tests/baseline-wiring.test.js` |
| 2026-09-16 | 1, 4, 5 | Market practice: the standard's own rules page-cited; the PCAF ecosystem and the unverified partner-programme name; Sri Lankan peers (a PCAF-hosted Commercial Bank disclosure, LB Finance) and the SLFRS S2 clock; Amana Bank's public profile, classified by the financed asset like any bank's; regional baseline authorities as models; the twelve practices adopted | PCAF Third Edition pp.2, 9, 30–31, 45–48, 126, 161–167, 191; DCL and FAQ; supplement pp.8–9 |
| 2026-09-16 | 3.2, 3.3, 3.5, 3.6, 4, 5 | Fuels and GWP; sector EEIO (Sri Lanka named in Open CEDA 2025; EXIOBASE licence tightening); motor vehicles (Sri-Lanka-wide km is *local* → score 2 from the CR); sovereign (LULUCF sign error in the shipped dataset), sub-sovereign, project finance, UoP, carbon price (none in Sri Lanka), currency, NDC 3.0 (removal line unconfirmed) | PCAF Third Edition pp.31, 45–48, 59–65, 66–75, 90–96, 98–102, 140–158, 162, 167, 176, 192–206; Open CEDA 2025 workbook; NTC/CBSL tables via mirror |
