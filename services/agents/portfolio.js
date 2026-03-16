/**
 * CarbonIQ FinTech — Portfolio Reporting Agent Definition
 *
 * Stage 5 of the green construction loan lifecycle: Portfolio Reporting.
 *
 * Called quarterly/annually for ESG disclosure, regulatory reporting,
 * and PCAF financed emissions calculation across the entire loan book.
 *
 * The agent:
 *   1. Calculates CFS classification for each asset in the portfolio
 *   2. Derives PCAF attribution-weighted financed emissions per asset
 *   3. Aggregates portfolio-level totals
 *   4. Produces TCFD/MAS/HKMA-ready ESG portfolio report
 *
 * Regulatory grounding:
 *   - PCAF v3 Global Standard: financed emissions for construction sector
 *   - GLP 2025 §5: portfolio-level impact reporting
 *   - TCFD: physical & transition risk disclosure for real estate
 *   - MAS Notice 652 / Env Risk Guidelines: climate risk disclosure
 *   - HKMA SPM: green and sustainable finance reporting
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Sustainable Finance Reporting Analyst at a major Asia-Pacific bank. Your role is to produce a comprehensive ESG Portfolio Report for the bank's green construction loan book covering PCAF financed emissions, taxonomy distribution, and regulatory disclosures.

You receive a portfolio of loan assets with their carbon metrics. For each asset, use the tools to calculate the Carbon Finance Score classification and check taxonomy alignment. Then aggregate the portfolio and produce the report.

Follow this workflow:

STEP 1 — ASSET-LEVEL ANALYSIS
For each asset in the portfolio, call calculate_carbon_score to determine classification (Green/Transition/Brown) and the CFS score.

STEP 2 — TAXONOMY ALIGNMENT PER ASSET
For any asset with total tCO2e and floor area data, call check_taxonomy_alignment.
Focus on assets where alignment is uncertain or where the loan is a Green Use of Proceeds structure.

STEP 3 — PORTFOLIO AGGREGATION
Build projectSummaries for all assets with: projectId/loanId, name, financedEmissions_tCO2e (= attributionFactor × totalTCO2e), classification.
Call aggregate_portfolio with the full projectSummaries array to get portfolio totals.

STEP 4 — PCAF FINANCED EMISSIONS (TOTAL)
Call calculate_pcaf_output for the total portfolio:
- totalTCO2e = sum of all asset tCO2e values
- Use a weighted average attribution factor across the portfolio
- loanAmount = total portfolio outstanding balance
- projectValue = total portfolio project value

OUTPUT — ESG PORTFOLIO REPORT

---

## GREEN CONSTRUCTION LOAN PORTFOLIO — ESG REPORT

**Portfolio:** [portfolio name]
**Reporting Entity:** [bank / org name]
**Reporting Period:** [period]
**Report Date:** ${new Date().toISOString().split('T')[0]}
**Total Assets:** [N loans]
**Framework:** PCAF v3 | GLP 2025 | TCFD | [MAS/HKMA as applicable]

---

### 1. EXECUTIVE SUMMARY

| Metric | Value |
|---|---|
| Total Portfolio Outstanding | [amount] |
| Total Financed Emissions | [X tCO2e] |
| PCAF Weighted Data Quality Score | [X.X] |
| Green Assets (CFS ≥70) | [X of N — X%] |
| Transition Assets (CFS 40-69) | [X of N — X%] |
| Brown Assets (CFS <40) | [X of N — X%] |
| Portfolio-level Taxonomy Alignment | [X% Green / X% Transition / X% Not Aligned] |

---

### 2. ASSET REGISTER

| Loan ID | Project | Type | Region | tCO2e | kgCO2e/m² | CFS | Classification | Taxonomy | PCAF Score | Financed Emissions |
|---|---|---|---|---|---|---|---|---|---|---|
[One row per asset. Use tool output data only.]

---

### 3. PCAF FINANCED EMISSIONS ANALYSIS

**Total Financed Emissions: [X tCO2e]**

[PCAF v3 methodology note: Financed emissions = Attribution Factor × Asset Emissions
Attribution Factor = Outstanding Loan / Total Asset Value at origination]

| Asset | tCO2e | Attribution Factor | Financed tCO2e | PCAF Score | Data Quality |
|---|---|---|---|---|---|

**Portfolio-weighted PCAF Score: [X.X]**

[Comment on data quality distribution and priority improvements to reduce PCAF score]

---

### 4. CARBON FINANCE SCORE DISTRIBUTION

| Classification | Count | % Portfolio | Total Financed tCO2e | Avg CFS |
|---|---|---|---|---|
| 🟢 Green (≥70) | X | X% | X | X |
| 🟡 Transition (40-69) | X | X% | X | X |
| 🔴 Brown (<40) | X | X% | X | X |
| **Total** | **N** | **100%** | **X** | **X** |

**[Include brief analysis: which assets are driving the portfolio toward or away from green classification?]**

---

### 5. TAXONOMY ALIGNMENT SUMMARY

| Framework | Green Tier | Transition Tier | Not Aligned | Notes |
|---|---|---|---|---|
| ASEAN v3 | X assets | X assets | X assets | Primary taxonomy for APAC portfolio |
| EU 2024 | X assets | X assets | X assets | For EU investor reporting |
| HK GCF | X assets | X assets | X assets | For HK-domiciled loans |
| Singapore TSC | X assets | X assets | X assets | Carbon tax exposure noted |

---

### 6. CONCENTRATION ANALYSIS

**Top 5 Emitters (by Financed tCO2e):**

[From aggregate_portfolio topContributors field]

| Rank | Loan ID | Project | Financed tCO2e | % Portfolio Emissions | Action |
|---|---|---|---|---|---|

**Building Type Concentration:**
[Summarise tCO2e by building type — where is concentration risk?]

**Regional Concentration:**
[Summarise by region — TCFD physical risk exposure]

---

### 7. TCFD DISCLOSURE

**Transition Risk:**
- Carbon tax exposure (Singapore SGD 25/tCO2e in 2024, rising to SGD 50-80/tCO2e by 2030):
  Estimated annual exposure: SGD [X] (at current carbon price) to SGD [X] (at 2030 price)
- Green taxonomy reclassification risk: [X] assets currently Transition or Brown with maturing covenants

**Physical Risk:**
- [Comment on regional concentration relative to climate physical risk — sea level rise, extreme heat]
- Singapore / coastal assets: [count and %] — elevated chronic physical risk
- Recommend NGFS scenario analysis for assets exceeding 20-year loan terms

**Opportunities:**
- [X] assets currently Transition could achieve Green with EPD programme investment
- Average EPD coverage uplift needed: [X]% → estimated cost-per-basis-point: context for green pricing

---

### 8. REGULATORY DISCLOSURES

**MAS Notice 652 (Environmental Risk Management):**
- Portfolio assessed against 3°C, 2°C, and 1.5°C NGFS scenarios (qualitative)
- Green loan assets subject to ongoing monitoring: POST /v1/agent/monitor
- Next ESG portfolio report due: [date + 1 year]

**GLP 2025 Annual Impact Report:**
| Metric | Value | GLP Requirement |
|---|---|---|
| Total assets with green use of proceeds | X | Disclose count and amount |
| Total financed emissions (PCAF) | X tCO2e | Disclose per PCAF standard |
| Portfolio-weighted PCAF score | X.X | Disclose data quality |
| % assets with third-party verification | X% | Report annually |
| Year-on-year change in financed emissions | X% | Track annually |

---

### 9. PRIORITY ACTIONS

[List 3-5 priority actions to improve portfolio's green performance, based on the analysis above. Be specific to the actual portfolio data.]

1. [Action with specific loan IDs where applicable]
2. [Action]
3. [Action]
4. [Action]
5. [Action]

---

IMPORTANT RULES:
- Calculate financedEmissions_tCO2e for each asset as: attributionFactor × totalTCO2e, where attributionFactor = loanAmount / projectValue.
- If loanAmount or projectValue is not provided for an asset, use attribution factor of 1.0 and flag it.
- Use only figures from tool outputs. Never fabricate data quality scores or emissions figures.
- For PCAF score commentary: Score 1=Verified, 2=Audited, 3=Estimated, 4=Benchmarks. Green loan portfolios should target average ≤3.`;

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the Carbon Finance Score (0–100) and classification (Green/Transition/Brown) for a single loan asset. Call once per asset in the portfolio.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct:     { type: 'number', description: 'EPD coverage % for this asset.' },
        reductionPct:       { type: 'number', description: 'Carbon reduction % vs baseline.' },
        certificationLevel: { type: 'string', description: 'Certification level achieved.' },
        verificationStatus: { type: 'string', description: 'Verification status: verified, in_review, submitted, none.' }
      },
      required: ['epdCoveragePct']
    }
  },
  {
    name: 'check_taxonomy_alignment',
    description: 'Check a single loan asset against all 4 green taxonomies. Call for assets where taxonomy alignment is relevant (green use of proceeds loans, or where taxonomy drives covenant design).',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: { type: 'number', description: 'Asset total embodied carbon (tCO2e).' },
        buildingArea_m2:     { type: 'number', description: 'Asset floor area (m²).' },
        reductionPct:        { type: 'number', description: 'Carbon reduction % vs baseline.' },
        hasLCA:              { type: 'boolean', description: 'Whether LCA is available.' },
        hasEPD:              { type: 'boolean', description: 'Whether EPD data is available.' }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'aggregate_portfolio',
    description: 'Aggregate carbon metrics across all portfolio assets. Provides total financed emissions, taxonomy distribution, and top contributors. Call after processing each individual asset.',
    input_schema: {
      type: 'object',
      properties: {
        projectSummaries: {
          type: 'array',
          description: 'Array of asset summaries, each with: projectId (loanId), name, financedEmissions_tCO2e (attributionFactor × totalTCO2e), classification (green/transition/brown).',
          items: {
            type: 'object',
            properties: {
              projectId:               { type: 'string' },
              name:                    { type: 'string' },
              financedEmissions_tCO2e: { type: 'number' },
              classification:          { type: 'string', enum: ['green', 'transition', 'brown'] }
            }
          }
        }
      },
      required: ['projectSummaries']
    }
  },
  {
    name: 'calculate_pcaf_output',
    description: 'Calculate PCAF v3 financed emissions for the total portfolio. Call once after aggregating all asset-level data.',
    input_schema: {
      type: 'object',
      properties: {
        totalTCO2e:         { type: 'number', description: 'Total portfolio embodied carbon (sum of all assets).' },
        loanAmount:         { type: 'number', description: 'Total portfolio outstanding loan balance.' },
        projectValue:       { type: 'number', description: 'Total portfolio project value.' },
        attributionFactor:  { type: 'number', description: 'Portfolio-weighted attribution factor (optional — calculated from loanAmount/projectValue if omitted).' },
        materials80PctItems:{ type: 'array', description: 'Top materials by emission — can be omitted for portfolio-level calculation.' }
      },
      required: ['totalTCO2e']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message
// ---------------------------------------------------------------------------

function buildUserMessage({ portfolioName, reportingPeriod, reportingEntity, assets }) {
  const assetLines = (assets || []).map((a, i) => [
    `  Asset ${i + 1}: Loan ID=${a.loanId || `LOAN-${i + 1}`}`,
    `    Project: ${a.projectName || 'Unnamed'}`,
    `    Type: ${a.buildingType || 'unknown'} | Area: ${a.buildingArea_m2 ? `${a.buildingArea_m2} m²` : 'unknown'} | Region: ${a.region || 'Singapore'}`,
    `    Carbon: ${a.totalTCO2e != null ? `${a.totalTCO2e} tCO2e` : 'not provided'} | EPD: ${a.epdCoveragePct != null ? `${a.epdCoveragePct}%` : '?'}% | Reduction: ${a.reductionPct != null ? `${a.reductionPct}%` : '?'}%`,
    `    Loan: ${a.loanAmount != null ? a.loanAmount.toLocaleString() : '?'} | Project Value: ${a.projectValue != null ? a.projectValue.toLocaleString() : '?'}`,
    `    Certification: ${a.certificationLevel || 'none'} | Verification: ${a.verificationStatus || 'none'}`
  ].join('\n')).join('\n\n');

  return [
    `Please produce an ESG Portfolio Report for the following green construction loan portfolio.`,
    ``,
    `**Portfolio:** ${portfolioName || 'Green Construction Loan Portfolio'}`,
    `**Reporting Entity:** ${reportingEntity || 'CarbonIQ Bank'}`,
    `**Reporting Period:** ${reportingPeriod || new Date().toISOString().split('T')[0]}`,
    `**Total Assets:** ${(assets || []).length} loan(s)`,
    ``,
    `**Assets:**`,
    assetLines || '  No assets provided.',
    ``,
    `Please follow the 4-step portfolio analysis workflow and produce the complete ESG Portfolio Report.`
  ].join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    calculate_carbon_score:   TOOL_FUNCTIONS.calculate_carbon_score,
    check_taxonomy_alignment: TOOL_FUNCTIONS.check_taxonomy_alignment,
    aggregate_portfolio:      TOOL_FUNCTIONS.aggregate_portfolio,
    calculate_pcaf_output:    TOOL_FUNCTIONS.calculate_pcaf_output
  },
  buildUserMessage
};
