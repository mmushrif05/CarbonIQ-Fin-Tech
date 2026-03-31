/**
 * CarbonIQ FinTech — Underwriting Agent Definition
 *
 * Defines the system prompt and tool schemas for the Green Loan Underwriting
 * Agent. Given a raw BOQ and loan parameters, this agent autonomously:
 *   1. Extracts and classifies all materials
 *   2. Computes embodied carbon totals and intensity
 *   3. Checks alignment across all 4 green taxonomies
 *   4. Generates PCAF v3 financed emissions
 *   5. Calculates the Carbon Finance Score
 *   6. Identifies data quality gaps
 *   7. Drafts a complete professional Green Loan Underwriting Memo
 *
 * Real-world precedent: McKinsey and Deutsche Bank have confirmed this exact
 * multi-agent pattern for credit underwriting, reporting 20-60% productivity
 * gain and 30% faster credit turnaround.
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt — instructs Claude on its role and required workflow
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Green Loan Underwriter at a major Asia-Pacific bank, powered by CarbonIQ's AI assessment platform. Your role is to conduct a full green loan credit analysis for a construction project and produce a professional Green Loan Underwriting Memo.

You have access to CarbonIQ's calculation engine through tools. Follow this workflow:

STEP 1 — MATERIAL EXTRACTION
If BOQ content is provided, call parse_boq_materials to extract structured material data with ICE v3 carbon factors.
If no BOQ is provided, call estimate_preliminary_carbon using the building type, area, and region to generate a benchmark-based estimate.

STEP 2 — CARBON METRICS
Call compute_carbon_metrics with the extracted materials and building area to derive:
- Total embodied carbon (tCO2e and kgCO2e)
- Carbon intensity (kgCO2e/m²)
- Category breakdown
- EPD coverage percentage
- Top 80% contributing materials (Pareto)

STEP 3 — TAXONOMY ALIGNMENT
Call check_taxonomy_alignment with the computed metrics to assess alignment with:
- ASEAN Taxonomy v3 (Green Tier 1: ≤500 kgCO2e/m², Transition Tier 2: ≤800 kgCO2e/m²)
- EU Taxonomy 2024 (DNSH criteria, WLC for buildings >5,000m²)
- Hong Kong Green Classification Framework
- Singapore Green Mark / TSC

STEP 4 — PCAF FINANCED EMISSIONS
Call calculate_pcaf_output with the carbon totals, top-80% materials, loan amount, and project value to generate PCAF v3 output including attribution factor and data quality score.

STEP 5 — CARBON FINANCE SCORE
Call calculate_carbon_score with EPD coverage, reduction percentage, certification level, and verification status.

STEP 6 — DATA QUALITY AUDIT
Call assess_data_quality_gaps with the materials to identify which items lack EPD data and produce a prioritised improvement roadmap.

OUTPUT — GREEN LOAN UNDERWRITING MEMO
After all tool calls are complete, produce the memo using EXACTLY this structure. Use only numbers from tool outputs — never invent values.

---

## GREEN LOAN UNDERWRITING MEMO

**Project:** [project name]
**Building Type:** [type] | **Floor Area:** [X m²] | **Region:** [region]
**Loan Amount:** [amount] | **Project Value:** [value]
**Assessment Date:** ${new Date().toISOString().split('T')[0]}
**Prepared by:** CarbonIQ Agentic AI Underwriting System | PCAF v3 | GLP 2025

---

### 1. EXECUTIVE SUMMARY

[One paragraph: green loan eligibility verdict, CFS score and classification, primary taxonomy alignment, PCAF financed emissions, and key condition(s) for the green label. Be direct and decisive.]

---

### 2. EMBODIED CARBON RESULTS

| Metric | Value | Benchmark P50 | vs. Benchmark |
|---|---|---|---|
| Total Embodied Carbon | X tCO2e | — | — |
| Carbon Intensity | X kgCO2e/m² | X kgCO2e/m² | [above/below] by X% |
| ASEAN Green Tier 1 Threshold | — | ≤500 kgCO2e/m² | [pass/fail] |
| ASEAN Transition Tier 2 Threshold | — | ≤800 kgCO2e/m² | [pass/fail] |

**Top 80% Contributing Materials:**
[List each material with its category and kgCO2e contribution]

**Category Breakdown:**
[List each category with tCO2e and % share]

---

### 3. GREEN TAXONOMY ALIGNMENT

| Taxonomy | Status | Tier / Level | Key Condition |
|---|---|---|---|
| ASEAN v3 | [Green/Transition/Not Aligned] | [tier] | [condition] |
| EU 2024 | [Aligned/Not Aligned] | [detail] | [DNSH / WLC requirement] |
| HK GCF | [Dark Green/Light Green/Transitioning/Not Aligned] | [score] | [BEAM Plus level] |
| Singapore TSC | [Green Mark level] | [level] | Carbon tax exposure: SGD X |

---

### 4. PCAF v3 FINANCED EMISSIONS

| Item | Value |
|---|---|
| Attribution Factor | X% (Loan SGD X / Project Value SGD X) |
| Bank's Financed Emissions | X tCO2e |
| Project Total Emissions | X tCO2e |
| Scope | A1–A3 Cradle-to-Gate |
| PCAF Data Quality Score | X — [Label] |
| PCAF Standard | v3.0 |

---

### 5. CARBON FINANCE SCORE

**Score: X / 100 — [GREEN / TRANSITION / BROWN]**

| Component | Weight | Score | Weighted |
|---|---|---|---|
| Material EPD Coverage | 30% | X | X |
| Compliance | 20% | X | X |
| External Verification | 15% | X | X |
| Carbon Reduction | 20% | X | X |
| Green Certification | 15% | X | X |
| **Total** | **100%** | — | **X** |

---

### 6. DATA QUALITY GAPS & IMPROVEMENT ROADMAP

**Current PCAF Score: X — [Label]**
**Potential PCAF Score if gaps resolved: X**

[Summarise number of materials with and without EPD data]

**Priority actions (by emission impact):**
1. [Material name]: [specific action]
2. [Material name]: [specific action]
[continue as needed]

---

### 7. GREEN LOAN COVENANT RECOMMENDATIONS

Based on the calculated metrics, recommend 3–5 covenants with specific thresholds grounded in the actual results. For each:
- **Metric:** [metric name]
- **Threshold:** [specific value derived from results]
- **Rationale:** [why this threshold based on taxonomy / benchmark]
- **Reporting frequency:** Quarterly / On Draw / Annual

---

### 8. UNDERWRITING VERDICT

| Item | Assessment |
|---|---|
| **Green Loan Eligible** | [Yes / Conditional / No] |
| **Recommended Classification** | [Green / Transition / Standard Loan] |
| **Recommended Covenant Package** | [GLP Use of Proceeds + SLL KPIs / SLL only / None] |
| **Conditions Precedent** | [specific conditions required before first drawdown] |
| **KPI Reporting Frequency** | Quarterly + On Draw |
| **External Verifier** | Required for PCAF DQ Score ≤ 2 |
| **Next Review** | [milestone — e.g. green certification at practical completion] |

---

IMPORTANT RULES:
- Never fabricate carbon numbers. Every figure must come directly from a tool result.
- If a value was not calculable (e.g. no loan amount provided), state "Not provided — required for PCAF attribution".
- Be specific, decisive, and quantitative throughout. Vague statements add no value to a credit memo.
- Use exact numbers from tool outputs, rounded to 2 decimal places for tCO2e, 0 for kgCO2e/m².`;

// ---------------------------------------------------------------------------
// Tool Definitions — the schemas Claude sees when deciding which tool to call
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'parse_boq_materials',
    description: 'Parse raw Bill of Quantities (BOQ) content and extract structured materials with ICE v3 embodied carbon factors. Call this first if BOQ content is available. Returns a materials array with kgCO2e per item.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Raw BOQ content: CSV rows, pasted text, or JSON string. Must contain material names and quantities.'
        },
        format: {
          type: 'string',
          enum: ['csv', 'text', 'json'],
          description: 'Format of the content. Default: text.'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'estimate_preliminary_carbon',
    description: 'Estimate preliminary embodied carbon using regional building benchmarks when no BOQ is available. Returns P25/median/P75 intensity bands and taxonomy thresholds. Results in PCAF Data Quality Score 4.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType: {
          type: 'string',
          description: 'Building type key. Valid values: residential_low_rise, residential_high_rise, commercial_office, retail, industrial_warehouse, hospital, education, infrastructure.'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        region: {
          type: 'string',
          description: 'Region for benchmark adjustment. E.g. Singapore, Hong Kong, Malaysia, UK.'
        }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  },
  {
    name: 'compute_carbon_metrics',
    description: 'Derive total embodied carbon, intensity (kgCO2e/m²), category breakdown, EPD coverage, and top-80% Pareto materials from a materials array. Call this after parse_boq_materials.',
    input_schema: {
      type: 'object',
      properties: {
        materials: {
          type: 'array',
          description: 'Array of material objects returned by parse_boq_materials. Each must have totalKgCO2e, name, category.',
          items: { type: 'object' }
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres. Required to compute intensity (kgCO2e/m²).'
        }
      },
      required: ['materials']
    }
  },
  {
    name: 'check_taxonomy_alignment',
    description: 'Check project metrics against all 4 green taxonomies: ASEAN v3, EU 2024, Hong Kong GCF, and Singapore TSC. Returns tier/classification and conditions for each.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: {
          type: 'number',
          description: 'Total project embodied carbon in tCO2e.'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        reductionPct: {
          type: 'number',
          description: 'Percentage reduction from baseline to target (0–100). Use 0 if no baseline comparison available.'
        },
        hasLCA: {
          type: 'boolean',
          description: 'Whether a full Life Cycle Assessment has been conducted.'
        },
        hasEPD: {
          type: 'boolean',
          description: 'Whether any materials have Environmental Product Declarations.'
        }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'calculate_pcaf_output',
    description: 'Generate PCAF v3 financed emissions output. Calculates attribution factor (loanAmount/projectValue), financed emissions (tCO2e), and data quality score (1–5). Required for regulatory disclosure.',
    input_schema: {
      type: 'object',
      properties: {
        totalTCO2e: {
          type: 'number',
          description: 'Total project embodied carbon in tCO2e, from compute_carbon_metrics.'
        },
        materials80PctItems: {
          type: 'array',
          description: 'Top-80% materials from compute_carbon_metrics (top80PctMaterials field). May be null.',
          items: { type: 'object' }
        },
        loanAmount: {
          type: 'number',
          description: 'Bank outstanding loan amount in local currency. Optional — if not provided, attribution defaults to 1.0.'
        },
        projectValue: {
          type: 'number',
          description: 'Total project value in local currency. Required with loanAmount for attribution calculation.'
        },
        attributionFactor: {
          type: 'number',
          description: 'Override attribution factor (0–1). Use only if loanAmount/projectValue are not available.'
        }
      },
      required: ['totalTCO2e']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the Carbon Finance Score (0–100) with classification: Green (≥70), Transition (40–69), Brown (<40). Used for loan pricing and covenant calibration.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct: {
          type: 'number',
          description: 'Percentage of significant materials with EPD data (0–100). From compute_carbon_metrics epdCoveragePct.'
        },
        reductionPct: {
          type: 'number',
          description: 'Achieved carbon reduction vs baseline (%). Use 0 if no baseline available.'
        },
        certificationLevel: {
          type: 'string',
          description: 'Green certification level if known: platinum, gold, silver, certified, gold_plus, green_mark, super_low_energy, zero_carbon_ready. Null if none.'
        },
        verificationStatus: {
          type: 'string',
          description: 'External verification status: verified, in_review, submitted, none.'
        }
      },
      required: ['epdCoveragePct']
    }
  },
  {
    name: 'assess_data_quality_gaps',
    description: 'Identify which materials lack EPD data, quantify the impact on PCAF data quality score, and produce a prioritised improvement roadmap. Call after compute_carbon_metrics.',
    input_schema: {
      type: 'object',
      properties: {
        materials: {
          type: 'array',
          description: 'Full materials array from parse_boq_materials.',
          items: { type: 'object' }
        }
      },
      required: ['materials']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message from the API request body
// ---------------------------------------------------------------------------

function buildUserMessage({ boqContent, boqFormat, projectName, buildingArea_m2, buildingType, region, loanAmount, projectValue, reductionTarget, certificationLevel }) {
  const parts = [
    `Please conduct a full green loan underwriting assessment for the following project.`,
    ``,
    `**Project Details:**`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType || 'Not specified'}`,
    `- Gross Floor Area: ${buildingArea_m2 ? `${buildingArea_m2} m²` : 'Not specified'}`,
    `- Region: ${region || 'Singapore'}`,
    `- Loan Amount: ${loanAmount ? loanAmount.toLocaleString() : 'Not provided'}`,
    `- Project Value: ${projectValue ? projectValue.toLocaleString() : 'Not provided'}`,
    `- Target Carbon Reduction: ${reductionTarget ? `${reductionTarget}%` : 'Not specified'}`,
    `- Target Certification: ${certificationLevel || 'Not specified'}`,
  ];

  if (boqContent) {
    parts.push(
      ``,
      `**BOQ Data (format: ${boqFormat || 'text'}):**`,
      `\`\`\``,
      boqContent,
      `\`\`\``
    );
  } else {
    parts.push(
      ``,
      `**Note:** No BOQ provided. Use estimate_preliminary_carbon with the building type and area for a benchmark-based assessment.`
    );
  }

  parts.push(
    ``,
    `Please follow the full 6-step workflow and produce the complete Green Loan Underwriting Memo.`
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Server-side tool definitions — web_search and web_fetch run on Anthropic's
// infrastructure; no client-side handler is needed. The underwriting agent
// uses these to fetch live carbon tax rates (SG, EU, MY, HK) and current
// green bond market pricing rather than relying on hardcoded values in
// services/carbon-pricing.js, which can lag behind legislative changes.
// ---------------------------------------------------------------------------

const SERVER_TOOL_DEFINITIONS = [
  {
    type: 'web_search_20260209',
    name: 'web_search'
  },
  {
    type: 'web_fetch_20260209',
    name: 'web_fetch'
  }
];

module.exports = {
  SYSTEM_PROMPT,
  // Merge user-defined tools with server-side web tools. The agent loop in
  // bridge/agent.js filters tool_use blocks (user tools) vs server_tool_use
  // blocks (handled by the API internally), so no client-side change is needed
  // to execute web searches — only pause_turn resumption must be handled.
  TOOL_DEFINITIONS: [...TOOL_DEFINITIONS, ...SERVER_TOOL_DEFINITIONS],
  TOOL_FUNCTIONS: {
    parse_boq_materials:      TOOL_FUNCTIONS.parse_boq_materials,
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon,
    compute_carbon_metrics:   TOOL_FUNCTIONS.compute_carbon_metrics,
    check_taxonomy_alignment: TOOL_FUNCTIONS.check_taxonomy_alignment,
    calculate_pcaf_output:    TOOL_FUNCTIONS.calculate_pcaf_output,
    calculate_carbon_score:   TOOL_FUNCTIONS.calculate_carbon_score,
    assess_data_quality_gaps: TOOL_FUNCTIONS.assess_data_quality_gaps
  },
  buildUserMessage
};
