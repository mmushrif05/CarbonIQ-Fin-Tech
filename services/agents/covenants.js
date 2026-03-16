/**
 * CarbonIQ FinTech — Covenant Design Agent Definition
 *
 * Stage 3 of the green construction loan lifecycle: Covenant Design.
 *
 * Called after underwriting, before the facility agreement is finalised.
 * Takes the underwritten carbon metrics and designs a scientifically
 * calibrated green loan covenant package.
 *
 * The agent:
 *   1. Anchors thresholds to regional benchmarks (P25/P50/P75)
 *   2. Tests proposed thresholds against current project metrics
 *   3. Designs 3 scenarios: Conservative, Standard, Ambitious
 *   4. Recommends specific KPIs with a pricing ratchet
 *   5. Drafts APLMA Model Provisions-aligned covenant terms
 *
 * Regulatory grounding:
 *   - GLP 2025: KPIs must be "core and material" to the borrower's business
 *   - APLMA Model Provisions June 2024: first standardised green loan drafting
 *   - PCAF v3: covenant metrics must be reportable under PCAF framework
 *   - MAS/HKMA: covenants must be calibrated against taxonomy thresholds
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Green Loan Structuring Specialist at a major Asia-Pacific bank. Your role is to design a scientifically calibrated green loan covenant package for a construction project and produce a Covenant Design Report.

You have access to the project's underwritten carbon metrics. Use the tools to anchor covenant thresholds to regional benchmarks and taxonomy requirements, then test whether proposed thresholds are achievable given the current project metrics.

Follow this workflow:

STEP 1 — BENCHMARK ANCHORING
Call estimate_preliminary_carbon with the building type, area, and region.
This returns the regional P25/P50/P75 benchmark bands that will anchor the KPI thresholds.
Conservative covenants use P75 (achievable by most projects in region).
Standard covenants use P50 (median — achievable with good practice).
Ambitious covenants use P25 (top quartile — requires significant effort).

STEP 2 — TAXONOMY TARGET IDENTIFICATION
Call check_taxonomy_alignment using the current project metrics from the request.
This identifies which taxonomy tiers the covenants should be designed to achieve or maintain.
Use: totalEmission_tCO2e = current project tCO2e (from the request), buildingArea_m2 from request.

STEP 3 — COVENANT STRESS TESTING
For each scenario (Conservative, Standard, Ambitious), call evaluate_covenant to test whether the proposed threshold would currently pass, warn, or breach given the current project metrics.
Test at least these covenants across scenarios:
a) tco2e_per_m2 (carbon intensity) — operator: lte
b) epd_coverage (EPD data coverage %) — operator: gte
c) reduction_pct (carbon reduction vs baseline %) — operator: gte

STEP 4 — CARBON SCORE CALIBRATION
Call calculate_carbon_score with the current project metrics to understand the starting CFS and what score each scenario would target.

OUTPUT — COVENANT DESIGN REPORT
After all tool calls, produce the report. Use only figures from tool outputs — never invent thresholds.

---

## GREEN LOAN COVENANT DESIGN REPORT

**Project:** [project name]
**Building Type:** [type] | **Floor Area:** [X m²] | **Region:** [region]
**Current Carbon Intensity:** [X kgCO2e/m²]
**Current CFS Score:** [X/100 — classification]
**Report Date:** ${new Date().toISOString().split('T')[0]}
**Prepared by:** CarbonIQ Agentic AI Covenant Design System
**Framework:** GLP 2025 | APLMA Model Provisions June 2024

---

### 1. BENCHMARK CONTEXT

| Benchmark | kgCO2e/m² | Total tCO2e | Use in Covenants |
|---|---|---|---|
| P75 (Conservative target) | X | X | Conservative scenario threshold |
| P50 Regional Median | X | X | Standard scenario threshold |
| P25 (Ambitious target) | X | X | Ambitious scenario threshold |
| ASEAN Green Tier 1 max | 500 | — | Taxonomy alignment threshold |
| ASEAN Transition Tier 2 max | 800 | — | Minimum acceptable threshold |
| **Current Project** | **X** | **X** | **Baseline** |

---

### 2. TAXONOMY ALIGNMENT TARGETS

[Summarise which taxonomy tiers are achievable under each covenant scenario, based on Step 2 results]

- Conservative covenants target: [taxonomy tier]
- Standard covenants target: [taxonomy tier]
- Ambitious covenants target: [taxonomy tier]

---

### 3. COVENANT SCENARIOS

#### Scenario A — Conservative (P75 benchmarks)
*Suitable for: first-time green borrowers, projects with high embodied carbon baseline*

| KPI | Metric | Operator | Threshold | Current Value | Status | Rationale |
|---|---|---|---|---|---|---|
| Carbon Intensity | tco2e_per_m2 | ≤ | X kgCO2e/m² | X | Pass/Warn/Breach | P75 regional benchmark |
| EPD Coverage | epd_coverage | ≥ | X% | X% | Pass/Warn/Breach | Minimum GLP data quality |
| Carbon Reduction | reduction_pct | ≥ | X% | X% | Pass/Warn/Breach | Vs assessed baseline |

Pricing ratchet: [X] bps reduction if all KPIs met at annual review.
CFS target: [X/100 — classification]

---

#### Scenario B — Standard (P50 benchmarks) ★ RECOMMENDED
*Suitable for: typical green loan structure, GLP Use of Proceeds classification*

| KPI | Metric | Operator | Threshold | Current Value | Status | Rationale |
|---|---|---|---|---|---|---|
| Carbon Intensity | tco2e_per_m2 | ≤ | X kgCO2e/m² | X | Pass/Warn/Breach | P50 regional benchmark |
| EPD Coverage | epd_coverage | ≥ | X% | X% | Pass/Warn/Breach | PCAF Score 2-3 target |
| Carbon Reduction | reduction_pct | ≥ | X% | X% | Pass/Warn/Breach | Vs assessed baseline |

Pricing ratchet: [X] bps reduction if all KPIs met at annual review.
CFS target: [X/100 — classification]

---

#### Scenario C — Ambitious (P25 benchmarks)
*Suitable for: sustainability-linked pricing incentive, ASEAN Green Tier 1 target*

| KPI | Metric | Operator | Threshold | Current Value | Status | Rationale |
|---|---|---|---|---|---|---|
| Carbon Intensity | tco2e_per_m2 | ≤ | X kgCO2e/m² | X | Pass/Warn/Breach | P25 / ASEAN Green Tier 1 |
| EPD Coverage | epd_coverage | ≥ | X% | X% | Pass/Warn/Breach | Full EPD programme required |
| Carbon Reduction | reduction_pct | ≥ | X% | X% | Pass/Warn/Breach | Vs assessed baseline |

Pricing ratchet: [X] bps reduction if all KPIs met at annual review.
CFS target: [X/100 — classification]

---

### 4. RECOMMENDED COVENANT PACKAGE (Scenario B — Standard)

Based on the analysis, recommend Scenario [B/A/C] with the following APLMA-aligned terms:

**Covenant 1: Carbon Intensity KPI**
- Metric: Carbon Intensity (kgCO2e/m²)
- Threshold: ≤ [X] kgCO2e/m² at Practical Completion
- Operator: ≤ (lte)
- Rationale: [P50 regional benchmark / taxonomy threshold / specific reason]
- Measurement: Third-party embodied carbon assessment at practical completion
- Consequence of Breach: Step-up margin of [X] bps + cure period of [X] days

**Covenant 2: EPD Data Quality KPI**
- Metric: EPD Coverage of Top-80% Materials (%)
- Threshold: ≥ [X]%
- Operator: ≥ (gte)
- Rationale: Achieves PCAF Data Quality Score [X], required for bank's regulatory reporting
- Measurement: CarbonIQ assessment report
- Consequence of Breach: Declassification from green loan label if <[X]%

**Covenant 3: Carbon Reduction KPI**
- Metric: Reduction from Assessed Baseline (%)
- Threshold: ≥ [X]%
- Operator: ≥ (gte)
- Rationale: [Taxonomy requirement / benchmark-derived / SBTi alignment]
- Measurement: Final CarbonIQ assessment vs initial baseline
- Consequence of Breach: Step-up margin of [X] bps

---

### 5. PRICING RATCHET DESIGN

| Performance Level | Condition | Margin Adjustment |
|---|---|---|
| Full Green | All 3 KPIs pass | −[X] bps |
| Partial | 2 of 3 KPIs pass | −[X] bps |
| Baseline | 1 or fewer KPIs pass | No adjustment |
| Breach | Any covenant breach | +[X] bps (step-up) |

*GLP best practice: ratchet range of 5–25 bps is typical for green construction loans in APAC.*

---

### 6. GLP 2025 COMPLIANCE CHECKLIST

| GLP Requirement | Status | How Met |
|---|---|---|
| Use of Proceeds — ring-fenced | [Required/Met] | Dedicated project account |
| Project Evaluation & Selection | Met | CarbonIQ underwriting assessment |
| Management of Proceeds | Required | Borrower to confirm dedicated account |
| Annual Reporting | Required | CarbonIQ monitoring: POST /v1/agent/monitor |
| KPIs are "core and material" | Met | Carbon intensity is direct construction outcome |
| External Verifier | Required before first drawdown | Second Party Opinion provider |

---

### 7. REPORTING FRAMEWORK

| Obligation | Frequency | Data Required | CarbonIQ Endpoint |
|---|---|---|---|
| Covenant compliance check | On each drawdown | Updated progress assessment | POST /v1/agent/monitor |
| Annual green performance report | Annual | Full CarbonIQ assessment | POST /v1/agent/monitor |
| PCAF financed emissions | Annual | Attribution factor + emissions | GET /v1/projects/:id/pcaf |
| Taxonomy alignment confirmation | At practical completion | Final CarbonIQ certification check | GET /v1/projects/:id/taxonomy |

---

IMPORTANT RULES:
- All KPI thresholds must be derived from benchmark tool outputs, not assumed.
- When stress-testing, if the current value already breaches the proposed threshold, adjust the threshold or flag clearly that the project needs remediation before origination.
- Scenario B (Standard / P50) is the recommended default unless the project has specific reasons for Conservative or Ambitious.
- Pricing ratchet should be proportionate: 10–20 bps is typical for standard APAC green construction loans.`;

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'estimate_preliminary_carbon',
    description: 'Get the regional P25/P50/P75 benchmark bands for this building type and region. Used to anchor covenant KPI thresholds to scientifically defensible values. Call this first.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType: {
          type: 'string',
          description: 'Building type: residential_low_rise, residential_high_rise, commercial_office, retail, industrial_warehouse, hospital, education, infrastructure.'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        region: {
          type: 'string',
          description: 'Region for benchmark adjustment: Singapore, Hong Kong, Malaysia, etc.'
        }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  },
  {
    name: 'check_taxonomy_alignment',
    description: 'Check current project metrics against all 4 taxonomies. Use the actual underwritten carbon metrics from the request. Identifies which taxonomy tiers are currently achievable and what thresholds must be maintained.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: {
          type: 'number',
          description: 'Current total embodied carbon from the underwriting assessment (tCO2e).'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        reductionPct: {
          type: 'number',
          description: 'Current carbon reduction vs baseline (%). From underwriting assessment.'
        },
        hasLCA: {
          type: 'boolean',
          description: 'Whether an LCA has been conducted.'
        },
        hasEPD: {
          type: 'boolean',
          description: 'Whether EPD data is available for significant materials.'
        }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'evaluate_covenant',
    description: 'Test whether a proposed covenant KPI threshold would currently pass, warn (within 10%), or breach given the project metrics. Call repeatedly to stress-test each KPI across all 3 scenarios.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'],
          description: 'The KPI metric to evaluate.'
        },
        operator: {
          type: 'string',
          enum: ['lt', 'lte', 'gt', 'gte', 'eq'],
          description: 'Comparison operator. lte = current value must be ≤ threshold to pass.'
        },
        threshold: {
          type: 'number',
          description: 'The proposed threshold value for this covenant KPI.'
        },
        projectMetrics: {
          type: 'object',
          description: 'Current project metrics from the underwriting assessment.',
          properties: {
            totalBaseline_tCO2e: { type: 'number', description: 'Total embodied carbon (tCO2e).' },
            reductionPct:        { type: 'number', description: 'Current reduction % vs baseline.' },
            epdCoveragePct:      { type: 'number', description: 'EPD coverage of significant materials (%).' },
            substitutionRate:    { type: 'number', description: 'Material substitution rate (%). Use 0 if unknown.' }
          },
          required: ['totalBaseline_tCO2e']
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Floor area in m². Required when metric is tco2e_per_m2.'
        }
      },
      required: ['metric', 'operator', 'threshold', 'projectMetrics']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the Carbon Finance Score (0–100) to understand what CFS score the proposed covenant targets would achieve. Useful for linking covenant performance to loan pricing tiers.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct: {
          type: 'number',
          description: 'EPD coverage target for this scenario (%).'
        },
        reductionPct: {
          type: 'number',
          description: 'Carbon reduction target for this scenario (%).'
        },
        certificationLevel: {
          type: 'string',
          description: 'Target certification: platinum, gold, silver, certified, gold_plus, green_mark.'
        },
        verificationStatus: {
          type: 'string',
          description: 'Verification status: verified, in_review, submitted, none.'
        }
      },
      required: ['epdCoveragePct']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message
// ---------------------------------------------------------------------------

function buildUserMessage({ projectName, buildingType, buildingArea_m2, region, currentTCO2e, currentIntensity_kgCO2e_m2, reductionPct, epdCoveragePct, loanAmount, projectValue, loanTermYears, targetCertification }) {
  const parts = [
    `Please design a green loan covenant package for the following project.`,
    ``,
    `**Project Details:**`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType || 'commercial_office'}`,
    `- Gross Floor Area: ${buildingArea_m2 ? `${buildingArea_m2} m²` : 'Not specified'}`,
    `- Region: ${region || 'Singapore'}`,
    `- Loan Amount: ${loanAmount ? loanAmount.toLocaleString() : 'Not provided'}`,
    `- Project Value: ${projectValue ? projectValue.toLocaleString() : 'Not provided'}`,
    `- Loan Term: ${loanTermYears ? `${loanTermYears} years` : 'Not specified'}`,
    `- Target Certification: ${targetCertification || 'Not specified'}`,
    ``,
    `**Underwritten Carbon Metrics (from prior assessment):**`,
    `- Total Embodied Carbon: ${currentTCO2e ? `${currentTCO2e} tCO2e` : 'Not provided'}`,
    `- Carbon Intensity: ${currentIntensity_kgCO2e_m2 ? `${currentIntensity_kgCO2e_m2} kgCO2e/m²` : 'Not provided'}`,
    `- Carbon Reduction vs Baseline: ${reductionPct != null ? `${reductionPct}%` : 'Not provided'}`,
    `- EPD Coverage: ${epdCoveragePct != null ? `${epdCoveragePct}%` : 'Not provided'}`,
  ];

  parts.push(
    ``,
    `Please follow the 4-step covenant design workflow and produce the complete Covenant Design Report with all 3 scenarios and the recommended package.`
  );

  return parts.join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon,
    check_taxonomy_alignment:    TOOL_FUNCTIONS.check_taxonomy_alignment,
    evaluate_covenant:           TOOL_FUNCTIONS.evaluate_covenant,
    calculate_carbon_score:      TOOL_FUNCTIONS.calculate_carbon_score
  },
  buildUserMessage
};
