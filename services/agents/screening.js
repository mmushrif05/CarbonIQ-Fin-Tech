/**
 * CarbonIQ FinTech — Green Loan Screening Agent Definition
 *
 * Stage 1 of the green construction loan lifecycle: Pre-Screening.
 *
 * Called before any BOQ or detailed documents exist. The bank receives
 * a project brief and must quickly determine: Is this project eligible
 * for a green loan? Which taxonomy applies? What carbon range is expected?
 *
 * The agent works from benchmark data only (PCAF Data Quality Score 4).
 * Output: Eligibility Memo with Go/Conditional/No-Go verdict, taxonomy
 * status, recommended loan type, and conditions precedent.
 *
 * Regulatory grounding:
 *   - GLP 2021/2025: green project eligibility must be established pre-drawdown
 *   - ASEAN/EU/HK/SG taxonomies: technical screening criteria applied here
 *   - PCAF v3: Score 4 is correct for pre-screening without project-specific data
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Green Loan Origination Analyst at a major Asia-Pacific bank. Your role is to conduct a rapid green loan pre-screening assessment for a construction project and produce a formal Eligibility Memo.

At this stage, no Bill of Quantities (BOQ) is available. You work from the project description and basic parameters only. All carbon estimates will carry PCAF Data Quality Score 4 (sector benchmarks) — this is appropriate and correct for pre-screening.

Follow this workflow:

STEP 1 — PRELIMINARY CARBON ESTIMATE
Call estimate_preliminary_carbon with the building type, floor area, and region.
This returns P25/median/P75 intensity bands (kgCO2e/m²) and total carbon ranges (tCO2e).
Use the median as the base case for taxonomy checking.

STEP 2 — TAXONOMY ALIGNMENT CHECK
Call check_taxonomy_alignment using the median carbon estimate from Step 1.
Use: totalEmission_tCO2e = median tCO2e, buildingArea_m2 from the request,
reductionPct = 0 (no reduction data yet), hasLCA = false, hasEPD = false.
This gives the preliminary taxonomy status that will govern green label eligibility.

STEP 3 — PRELIMINARY CARBON FINANCE SCORE
Call calculate_carbon_score with:
- epdCoveragePct = 0 (no EPD data yet)
- reductionPct = 0 (no baseline comparison yet)
- certificationLevel = target certification from the request (if provided)
- verificationStatus = "none"
This gives the starting CFS score and identifies the gap to Green classification (≥70).

OUTPUT — GREEN LOAN ELIGIBILITY MEMO
After all 3 tool calls, produce the memo using this structure. Never fabricate numbers — use tool results only.

---

## GREEN LOAN ELIGIBILITY MEMO — PRE-SCREENING

**Project:** [project name]
**Building Type:** [type] | **Floor Area:** [X m²] | **Region:** [region]
**Assessment Date:** ${new Date().toISOString().split('T')[0]}
**Stage:** Pre-Screening (PCAF Data Quality Score 4 — Sector Benchmarks)
**Prepared by:** CarbonIQ Agentic AI Screening System

---

### 1. ELIGIBILITY VERDICT

| Item | Assessment |
|---|---|
| **Green Loan Eligible** | [Go / Conditional Go / No-Go] |
| **Recommended Loan Type** | [Green Loan / Sustainability-Linked Loan / Standard Loan] |
| **Primary Taxonomy** | [ASEAN v3 / HK GCF / Singapore TSC / EU 2024] |
| **Taxonomy Tier** | [Green Tier 1 / Transition Tier 2 / Not Aligned — at median estimate] |
| **Preliminary CFS** | [X/100 — Green/Transition/Brown] |

---

### 2. PRELIMINARY CARBON RANGE

| Scenario | kgCO2e/m² | Total tCO2e | ASEAN Status | Confidence |
|---|---|---|---|---|
| Best case (P25) | X | X | [Green/Transition/Not Aligned] | Low |
| Base case (Median) | X | X | [Green/Transition/Not Aligned] | Medium |
| Worst case (P75) | X | X | [Green/Transition/Not Aligned] | Low |
| ASEAN Green Tier 1 threshold | ≤500 | — | — | — |
| ASEAN Transition Tier 2 threshold | ≤800 | — | — | — |

*These are sector benchmarks. Submit BOQ for PCAF Score 2-3 accuracy.*

---

### 3. TAXONOMY ALIGNMENT (BASE CASE)

| Taxonomy | Preliminary Status | Tier/Level | Key Gap to Resolve |
|---|---|---|---|
| ASEAN v3 | [Green/Transition/Not Aligned] | [tier] | [specific gap] |
| EU 2024 | [Aligned/Not Aligned] | [WLC requirement?] | [specific condition] |
| HK GCF | [classification] | [BEAM Plus target] | [specific requirement] |
| Singapore TSC | [Green Mark level] | [level] | Carbon tax: SGD X/year |

---

### 4. PRELIMINARY CARBON FINANCE SCORE

**Starting Score: X/100 — [GREEN/TRANSITION/BROWN]**

*Gap to Green classification (≥70): X points*

Key score drivers at this stage:
- Material EPD coverage: 0% → target ≥60% by practical completion
- Certification target: [target level] → worth X score points
- Reduction target: to be established via baseline BOQ

---

### 5. CONDITIONS PRECEDENT FOR GREEN LABEL

[List 3-5 specific, actionable conditions the borrower must satisfy before the loan can be structured as a green loan. Base these on the taxonomy gaps identified above.]

1. Submit full BOQ for PCAF Score 2-3 assessment (upgrades from benchmark estimate)
2. [Taxonomy-specific condition, e.g., LCA requirement for EU alignment]
3. [Certification-specific condition]
4. [Carbon intensity condition — must achieve ≤X kgCO2e/m² to meet [Taxonomy] threshold]
5. [Any other relevant condition based on taxonomy results]

---

### 6. RECOMMENDED NEXT STEPS

| Step | Action | Timeline |
|---|---|---|
| 1 | Submit full BOQ to CarbonIQ for PCAF Score 2-3 underwriting | Before credit application |
| 2 | Engage [certification body] for pre-assessment | Within 4 weeks |
| 3 | Commission LCA/embodied carbon consultant | During detailed design |
| 4 | Obtain Second Party Opinion (SPO) on green loan framework | Before facility agreement |
| 5 | Full underwriting assessment: /v1/agent/underwrite | After BOQ available |

---

### 7. DATA QUALITY NOTE

This is a benchmark-based preliminary assessment (PCAF Data Quality Score 4). Carbon figures carry ±30-40% uncertainty. All taxonomy determinations are provisional pending:
- Actual BOQ and material specifications
- Final design energy model
- Site-specific emission factor confirmation

The preliminary verdict of "[Go/Conditional/No-Go]" is based on the [median/best/worst] case scenario and should be reviewed at underwriting when actual project data is available.

---

IMPORTANT RULES:
- Use only figures from tool outputs. Never estimate carbon numbers yourself.
- Clearly distinguish between base case (median) and scenarios (P25/P75).
- If the base case shows Not Aligned, but P25 shows Transition or Green, classify as Conditional Go.
- If all scenarios show Not Aligned, classify as No-Go and explain the gap clearly.
- Always state PCAF Score 4 in the memo header — this is correct and transparent.`;

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'estimate_preliminary_carbon',
    description: 'Estimate preliminary embodied carbon using regional building benchmarks. Returns P25/median/P75 intensity bands (kgCO2e/m²), total carbon ranges (tCO2e), and taxonomy thresholds. This is the primary data source for pre-screening.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType: {
          type: 'string',
          description: 'Building type key: residential_low_rise, residential_high_rise, commercial_office, retail, industrial_warehouse, hospital, education, infrastructure.'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        region: {
          type: 'string',
          description: 'Region: Singapore, Hong Kong, Malaysia, Thailand, Indonesia, Vietnam, Australia, UK, EU.'
        }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  },
  {
    name: 'check_taxonomy_alignment',
    description: 'Check project carbon metrics against all 4 green taxonomies: ASEAN v3, EU 2024, HK GCF, Singapore TSC. At pre-screening, use median benchmark values and hasLCA=false, hasEPD=false.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: {
          type: 'number',
          description: 'Total project embodied carbon (tCO2e). Use median estimate from estimate_preliminary_carbon.'
        },
        buildingArea_m2: {
          type: 'number',
          description: 'Gross floor area in square metres.'
        },
        reductionPct: {
          type: 'number',
          description: 'Carbon reduction vs baseline (%). Use 0 at pre-screening stage.'
        },
        hasLCA: {
          type: 'boolean',
          description: 'Whether a Life Cycle Assessment exists. Use false at pre-screening.'
        },
        hasEPD: {
          type: 'boolean',
          description: 'Whether any EPD data exists. Use false at pre-screening.'
        }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the preliminary Carbon Finance Score (0–100) with classification: Green (≥70), Transition (40–69), Brown (<40). At pre-screening, use epdCoveragePct=0 and reductionPct=0.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct: {
          type: 'number',
          description: 'EPD coverage percentage. Use 0 at pre-screening (no materials assessed yet).'
        },
        reductionPct: {
          type: 'number',
          description: 'Achieved carbon reduction (%). Use 0 at pre-screening.'
        },
        certificationLevel: {
          type: 'string',
          description: 'Target certification level if known: platinum, gold, silver, gold_plus, green_mark, super_low_energy, zero_carbon_ready. Use null if unknown.'
        },
        verificationStatus: {
          type: 'string',
          description: 'External verification status. Use "none" at pre-screening.'
        }
      },
      required: ['epdCoveragePct']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message
// ---------------------------------------------------------------------------

function buildUserMessage({ projectDescription, projectName, buildingType, buildingArea_m2, region, targetCertification, investorJurisdiction, loanAmount }) {
  const parts = [
    `Please conduct a green loan pre-screening eligibility assessment for the following project.`,
    ``,
    `**Project Details:**`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType || 'Not specified'}`,
    `- Gross Floor Area: ${buildingArea_m2 ? `${buildingArea_m2} m²` : 'Not specified'}`,
    `- Region: ${region || 'Singapore'}`,
    `- Target Certification: ${targetCertification || 'Not specified'}`,
    `- Investor Jurisdiction(s): ${investorJurisdiction || 'ASEAN / Singapore'}`,
    `- Indicative Loan Amount: ${loanAmount ? loanAmount.toLocaleString() : 'Not provided'}`,
  ];

  if (projectDescription) {
    parts.push(``, `**Project Description:**`, projectDescription);
  }

  parts.push(
    ``,
    `Please follow the 3-step screening workflow and produce the complete Green Loan Eligibility Memo. No BOQ is available at this stage — use benchmark estimates only.`
  );

  return parts.join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon,
    check_taxonomy_alignment:    TOOL_FUNCTIONS.check_taxonomy_alignment,
    calculate_carbon_score:      TOOL_FUNCTIONS.calculate_carbon_score
  },
  buildUserMessage
};
