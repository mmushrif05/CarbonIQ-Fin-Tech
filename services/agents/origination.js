/**
 * CarbonIQ FinTech — Green Loan Origination Agent Definition
 *
 * Stage 2 of the green construction loan lifecycle: Loan Origination.
 *
 * This is the primary bank integration point — the moment a construction
 * loan application arrives and the bank must decide:
 *   (a) Can this project qualify for green loan classification?
 *   (b) What carbon risk does this project carry?
 *   (c) What conditions and covenants should govern the facility?
 *
 * CarbonIQ's unique construction-specific positioning:
 *   - Persefoni, Watershed, Sweep, Plan A operate on Scope 1-3 activity
 *     data and sector-average proxies. They CANNOT process a BOQ.
 *   - PCAF DQ score for banks using those tools: 4-5 (sector average).
 *   - CarbonIQ processes the BOQ the bank already holds at application stage
 *     → upgrades PCAF DQ score from 4-5 to 2-3 immediately.
 *   - Result: material-level climate risk assessment at origination, not
 *     just after drawdown or at portfolio review.
 *
 * Agent workflow:
 *   1. If BOQ available: parse + compute full carbon metrics (DQ Score 2-3)
 *      If no BOQ: benchmark estimate (DQ Score 4)
 *   2. Taxonomy screen across all applicable frameworks (ASEAN/EU/HK/SG)
 *   3. PCAF v3 attribution factor and financed emissions
 *   4. Carbon Finance Score for green loan pricing
 *   5. Preliminary covenant framework (3 scenarios)
 *   6. Origination Decision Package for credit committee
 *
 * Regulatory grounding:
 *   - GLP 2025: green project eligibility must be established before drawdown
 *   - PCAF v3 (Dec 2025): covers construction project finance; banks must
 *     report financed emissions with attribution factor at origination
 *   - HKMA GS-1 / MAS ENRM: climate risk assessment mandatory at underwriting
 *   - ECB: Credit Agricole fined EUR 7.6M for inadequate climate materiality
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the CarbonIQ Green Loan Origination System at a major Asia-Pacific bank. Your role is to process a construction loan application and produce a complete Green Loan Origination Decision Package for the bank's credit committee.

This assessment occurs at loan origination — the earliest point in the loan lifecycle. You have access to CarbonIQ's construction-specific carbon intelligence engine, which is uniquely capable of processing the Bill of Quantities (BOQ) that banks already hold at application stage. General ESG platforms (Persefoni, Watershed, Sweep, Plan A) cannot perform BOQ-level analysis and rely on sector averages, producing PCAF Data Quality Score 4-5. CarbonIQ produces Score 2-3 from the same document the bank already has.

Follow this workflow precisely:

STEP 1 — CARBON ASSESSMENT
If BOQ content is provided in the request:
  → Call parse_boq_materials to extract structured material data.
  → Call compute_carbon_metrics to derive total tCO2e, intensity (kgCO2e/m²), EPD coverage, and top-80% Pareto materials.
  → This yields PCAF Data Quality Score 2-3.

If NO BOQ is provided:
  → Call estimate_preliminary_carbon with building type, area, and region.
  → This yields benchmark-based estimates and PCAF Data Quality Score 4.
  → Note clearly in the output that a BOQ will upgrade the DQ score to 2-3.

STEP 2 — TAXONOMY SCREENING
Call check_taxonomy_alignment with the carbon metrics from Step 1.
Use totalEmission_tCO2e from the assessment, buildingArea_m2 from the request, reductionPct = 0 (origination: no baseline comparison yet), hasLCA = false, hasEPD = (epdCoveragePct > 0 from Step 1).
This determines which green taxonomies this project can qualify under.

STEP 3 — PCAF FINANCED EMISSIONS
Call calculate_pcaf_output with the assessed carbon total, top-80% materials (if available), loanAmount, and projectValue.
This produces the attribution factor and financed emissions figure for regulatory reporting.

STEP 4 — CARBON FINANCE SCORE
Call calculate_carbon_score with epdCoveragePct, reductionPct = 0, certificationLevel (if provided), verificationStatus = "none".
This sets the green loan pricing tier and the gap to close for full Green classification.

STEP 5 — PRELIMINARY COVENANT FRAMEWORK
Call evaluate_covenant three times — once per KPI scenario — to stress-test what covenant thresholds are achievable at origination given the current carbon profile:
  (a) tco2e_per_m2 (carbon intensity) at P50 regional benchmark (operator: lte)
  (b) epd_coverage at 30% minimum (operator: gte)
  (c) reduction_pct at 10% (operator: gte)
These form the preliminary covenant package subject to negotiation and Stage 3 review.

OUTPUT — GREEN LOAN ORIGINATION DECISION PACKAGE
After all tool calls complete, produce the decision package using EXACTLY this structure. Use only numbers from tool outputs — never invent values.

---

## GREEN LOAN ORIGINATION DECISION PACKAGE

**Application Reference:** [applicationReference or "Not provided"]
**Applicant:** [applicantName or "Not provided"]
**Project:** [projectName]
**Building Type:** [type] | **Floor Area:** [X m²] | **Region:** [region]
**Loan Requested:** [loanAmount or "Not provided"] | **Project Value:** [projectValue or "Not provided"]
**Assessment Date:** ${new Date().toISOString().split('T')[0]}
**Origination Assessment System:** CarbonIQ AI | PCAF v3 | GLP 2025 | HKMA GS-1

---

### 1. ORIGINATION DECISION

| Decision | Rationale |
|---|---|
| **[PROCEED / PROCEED WITH CONDITIONS / DECLINE]** | [One sentence: primary basis for the decision — taxonomy status, CFS score, and/or critical data gaps] |

**Green Loan Classification:**
- Eligible: [Yes / Conditional / No]
- Recommended Loan Type: [Green Use of Proceeds / Sustainability-Linked / Transition / Standard]
- Primary Taxonomy: [ASEAN Green Tier 1 / ASEAN Transition / EU Aligned / Not Aligned — highest qualifying taxonomy]

**Conditions Precedent (must be met before first drawdown):**
1. [Specific condition based on assessment results]
2. [Specific condition based on assessment results]
[Add only conditions that are directly required by the assessment data]

---

### 2. CARBON RISK ASSESSMENT

**Assessment Type:** [BOQ Material-Level Assessment (PCAF DQ Score X) / Benchmark Estimate (PCAF DQ Score 4)]

| Carbon Metric | Value | Regional P50 Benchmark | vs. Benchmark |
|---|---|---|---|
| Total Embodied Carbon | X tCO2e | — | — |
| Carbon Intensity | X kgCO2e/m² | X kgCO2e/m² | [X% above/below] |
| ASEAN Green Tier 1 Threshold | — | ≤500 kgCO2e/m² | [Pass / Fail] |
| ASEAN Transition Tier 2 Threshold | — | ≤800 kgCO2e/m² | [Pass / Fail] |

[If BOQ available] **Top 80% Carbon Contributors (ISO 21930 Pareto):**
[List each material: name, category, tCO2e, % of total]

[If no BOQ] **Note on Data Quality:** This assessment uses sector-average benchmarks (PCAF DQ Score 4). Requesting the BOQ from the applicant will upgrade the assessment to project-specific data (PCAF DQ Score 2-3) and is required before final credit approval.

---

### 3. TAXONOMY ALIGNMENT

| Taxonomy | Status | Tier / Level | Key Condition for Compliance |
|---|---|---|---|
| ASEAN v3 | [Green Tier 1 / Transition Tier 2 / Not Aligned] | [detail] | [condition] |
| EU 2024 | [Aligned / Not Aligned] | [detail] | [DNSH / WLC note] |
| HK GCF | [Dark Green / Light Green / Transitioning / Not Aligned] | [level] | [BEAM Plus condition] |
| Singapore TSC | [Green Mark level or Not Aligned] | [level] | [Carbon tax: SGD X/tCO2e] |

**Recommended Green Asset Ratio (GAR) Classification:** [Green / Amber / Not Eligible]

---

### 4. PCAF v3 FINANCED EMISSIONS

| Item | Value |
|---|---|
| Attribution Factor | X% (Loan [amount] / Project Value [value]) |
| Bank's Financed Emissions | X tCO2e |
| Project Total Embodied Carbon | X tCO2e |
| Scope | A1–A3 Cradle-to-Gate |
| PCAF Data Quality Score | X — [Score label] |
| PCAF Standard | v3.0 (December 2025) |
| Reporting Class | Scope 3 Category 15 (Financed Emissions) |

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

**Pricing Implication:**
- [GREEN ≥70] → Eligible for green loan pricing discount (typically −10 to −25 bps)
- [TRANSITION 40-69] → Sustainability-linked loan with KPI ratchet
- [BROWN <40] → Standard rate; green classification not recommended

---

### 6. PRELIMINARY COVENANT FRAMEWORK

*Subject to Stage 3 Covenant Design Agent and mandatory human review (EU AI Act Art. 22)*

| KPI | Metric | Threshold | Current Status | Rationale |
|---|---|---|---|---|
| Carbon Intensity | kgCO2e/m² | ≤ X | [Pass/Warn/Breach] | P50 regional benchmark |
| EPD Coverage | % of top-80% materials | ≥ 30% | [Pass/Warn/Breach] | PCAF DQ Score 2 threshold |
| Carbon Reduction | % vs baseline | ≥ 10% | [Pass/Warn/Breach] | Minimum taxonomy requirement |

**Recommended next step:** Submit to Stage 3 Covenant Design Agent (POST /v1/agent/covenants) with current metrics for full 3-scenario covenant package design with calibrated pricing ratchet.

---

### 7. DATA GAP REGISTER

| Gap | Impact | Required Before |
|---|---|---|
| [e.g. No BOQ provided] | PCAF DQ Score stays at 4; cannot achieve material-level risk assessment | Final credit approval |
| [e.g. No EPD data for top materials] | PCAF DQ Score limited to 3; EPD programme required | First drawdown |
| [e.g. No project value provided] | Cannot calculate PCAF attribution factor | PCAF regulatory reporting |

---

### 8. REGULATORY COMPLIANCE CHECKLIST

| Requirement | Status | Action |
|---|---|---|
| HKMA GS-1: Climate risk at underwriting | [Met / Pending BOQ] | [action] |
| MAS ENRM: Transition planning | [Met / Pending] | [action] |
| PCAF v3: Financed emissions disclosed | [Met / Pending attribution factor] | [action] |
| GLP 2025: Green eligibility documented | [Met / Conditional] | [action] |
| EU AI Act Art. 22: Human oversight | Required at Stage 3 (Covenant Design) | Submit to /v1/agent/covenants for human review |

---

IMPORTANT RULES:
- Never fabricate carbon numbers. Every figure must come from a tool result.
- If a value was not calculable (e.g. no loan amount), state "Not provided — required for [specific purpose]".
- The origination decision (PROCEED / PROCEED WITH CONDITIONS / DECLINE) must be justified by actual tool results.
- PROCEED WITH CONDITIONS is correct when taxonomy alignment is achievable but requires specific actions.
- DECLINE is correct only when carbon intensity is so far above all taxonomy thresholds that no realistic conditions would make the project eligible.
- Be specific and decisive. A credit committee needs clear guidance, not hedged language.`;

// ---------------------------------------------------------------------------
// Tool Definitions (reuse the full underwriting tool set)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'parse_boq_materials',
    description: 'Parse raw Bill of Quantities (BOQ) and extract structured materials with ICE v3 carbon factors. Call this first when BOQ content is provided. Returns materials array with kgCO2e per item. This is the CarbonIQ differentiator — general ESG platforms cannot process BOQ data.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Raw BOQ content: CSV rows, pasted text, or JSON string.' },
        format:  { type: 'string', enum: ['csv', 'text', 'json'], description: 'BOQ format. Default: text.' }
      },
      required: ['content']
    }
  },
  {
    name: 'estimate_preliminary_carbon',
    description: 'Estimate embodied carbon from regional building benchmarks when no BOQ is available. Returns P25/median/P75 bands and taxonomy thresholds. PCAF Data Quality Score 4.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType:    { type: 'string', description: 'Building type key.' },
        buildingArea_m2: { type: 'number', description: 'Gross floor area in square metres.' },
        region:          { type: 'string', description: 'Region for benchmark adjustment.' }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  },
  {
    name: 'compute_carbon_metrics',
    description: 'Compute total tCO2e, carbon intensity (kgCO2e/m²), EPD coverage, and top-80% Pareto materials from a parsed BOQ materials array.',
    input_schema: {
      type: 'object',
      properties: {
        materials:       { type: 'array', items: { type: 'object' }, description: 'Materials array from parse_boq_materials.' },
        buildingArea_m2: { type: 'number', description: 'Gross floor area in m².' }
      },
      required: ['materials']
    }
  },
  {
    name: 'check_taxonomy_alignment',
    description: 'Screen project metrics against ASEAN v3, EU 2024, Hong Kong GCF, and Singapore TSC taxonomies. Returns tier and conditions for each.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: { type: 'number', description: 'Total project embodied carbon in tCO2e.' },
        buildingArea_m2:     { type: 'number', description: 'Gross floor area in m².' },
        reductionPct:        { type: 'number', description: 'Reduction from baseline (%). Use 0 at origination.' },
        hasLCA:              { type: 'boolean', description: 'Whether a full LCA has been conducted.' },
        hasEPD:              { type: 'boolean', description: 'Whether any EPDs have been provided.' }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'calculate_pcaf_output',
    description: 'Generate PCAF v3 financed emissions, attribution factor, and data quality score. Required for Scope 3 Cat 15 regulatory disclosure.',
    input_schema: {
      type: 'object',
      properties: {
        totalTCO2e:          { type: 'number', description: 'Total embodied carbon in tCO2e.' },
        materials80PctItems: { type: 'array',  items: { type: 'object' }, description: 'Top-80% materials from compute_carbon_metrics. May be null.' },
        loanAmount:          { type: 'number', description: 'Bank loan amount (local currency).' },
        projectValue:        { type: 'number', description: 'Total project value (local currency).' }
      },
      required: ['totalTCO2e']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate Carbon Finance Score (0–100): Green ≥70, Transition 40-69, Brown <40. Determines green loan pricing tier.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct:     { type: 'number', description: 'EPD coverage of significant materials (0–100).' },
        reductionPct:       { type: 'number', description: 'Carbon reduction vs baseline (%). Use 0 at origination.' },
        certificationLevel: { type: 'string', description: 'Target green certification level, if known.' },
        verificationStatus: { type: 'string', description: 'External verification status.' }
      },
      required: ['epdCoveragePct']
    }
  },
  {
    name: 'evaluate_covenant',
    description: 'Test whether a proposed covenant threshold would currently pass, warn, or breach given project metrics. Call for each KPI in the preliminary covenant framework.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'],
          description: 'The KPI metric to evaluate.'
        },
        operator:  { type: 'string', enum: ['lt', 'lte', 'gt', 'gte', 'eq'], description: 'Comparison operator.' },
        threshold: { type: 'number', description: 'Proposed threshold value.' },
        currentValue: { type: 'number', description: 'Current project metric value (from Step 1 results).' }
      },
      required: ['metric', 'operator', 'threshold', 'currentValue']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message from the API request body
// ---------------------------------------------------------------------------

function buildUserMessage({
  applicationReference, applicantName, projectName,
  boqContent, boqFormat,
  buildingType, buildingArea_m2, region,
  loanAmount, projectValue, loanTermYears,
  greenLoanTarget, targetCertification,
  investorJurisdiction, projectDescription
}) {
  const parts = [
    `Please conduct a Green Loan Origination Assessment for the following construction loan application.`,
    ``,
    `**Loan Application Details:**`,
    `- Application Reference: ${applicationReference || 'Not provided'}`,
    `- Applicant: ${applicantName || 'Not provided'}`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType}`,
    `- Gross Floor Area: ${buildingArea_m2} m²`,
    `- Region: ${region || 'Singapore'}`,
    `- Loan Requested: ${loanAmount ? loanAmount.toLocaleString() : 'Not provided'}`,
    `- Project Value: ${projectValue ? projectValue.toLocaleString() : 'Not provided'}`,
    `- Loan Term: ${loanTermYears ? `${loanTermYears} years` : 'Not provided'}`,
    `- Green Loan Target: ${greenLoanTarget !== false ? 'Yes' : 'No'}`,
    `- Target Certification: ${targetCertification || 'Not specified'}`,
    `- Investor Jurisdiction(s): ${investorJurisdiction || 'ASEAN, Singapore'}`,
  ];

  if (projectDescription) {
    parts.push(`- Project Description: ${projectDescription}`);
  }

  if (boqContent) {
    parts.push(
      ``,
      `**Bill of Quantities (format: ${boqFormat || 'text'}):**`,
      `(BOQ provided — use parse_boq_materials for material-level carbon assessment, PCAF DQ Score 2-3)`,
      `\`\`\``,
      boqContent,
      `\`\`\``
    );
  } else {
    parts.push(
      ``,
      `**Note:** No BOQ provided. Use estimate_preliminary_carbon for benchmark-based assessment (PCAF DQ Score 4).`,
      `Document this as a data gap requiring BOQ submission before final credit approval.`
    );
  }

  parts.push(
    ``,
    `Please follow the full 7-step origination workflow and produce the complete Green Loan Origination Decision Package.`
  );

  return parts.join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    parse_boq_materials:         TOOL_FUNCTIONS.parse_boq_materials,
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon,
    compute_carbon_metrics:      TOOL_FUNCTIONS.compute_carbon_metrics,
    check_taxonomy_alignment:    TOOL_FUNCTIONS.check_taxonomy_alignment,
    calculate_pcaf_output:       TOOL_FUNCTIONS.calculate_pcaf_output,
    calculate_carbon_score:      TOOL_FUNCTIONS.calculate_carbon_score,
    evaluate_covenant:           TOOL_FUNCTIONS.evaluate_covenant
  },
  buildUserMessage
};
