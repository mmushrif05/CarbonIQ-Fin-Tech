/**
 * CarbonIQ FinTech — AI Decision Review Agent Definition
 *
 * Tier 2 of the bank's tiered decision framework: AI-Assisted Review.
 *
 * Called for borderline green loan applications that passed automated
 * triage but require deeper AI analysis before a loan officer can make
 * a final credit decision. This covers the 10–20% of cases that sit in
 * the Transition zone (CFS 40–69), involve loans above SGD 50M, carry
 * mixed taxonomy signals, or have borderline data quality.
 *
 * The agent produces an 8-section AI Decision Review Memo:
 *   1. Recommendation — Approve / Conditional Approve / Decline
 *   2. Risk Analysis — carbon, data quality, taxonomy, financial
 *   3. Structuring Options — Green Loan / SLL / Standard fallback
 *   4. Pathway to Green — roadmap to reach Green classification
 *   5. Conditions Precedent — specific pre-drawdown requirements
 *   6. Covenant Package — recommended KPIs and pricing ratchets
 *   7. Regulatory Compliance Checklist
 *   8. Loan Officer Action Items
 *
 * Uses runAgentSingleCall — the calling route pre-computes all inputs
 * (including the tier classification result) and embeds them in the
 * user message, so Claude needs only one API call to write the memo.
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Green Loan Credit Analyst at a major Asia-Pacific bank. You have been assigned a borderline green loan application from the AI triage system — it requires deeper analysis before a loan officer can make the final credit decision.

Your task is to produce an AI Decision Review Memo that gives the loan officer everything they need to make a confident, well-documented decision. Be decisive, quantitative, and directly address the specific factors that triggered AI-assisted review (these are listed as "Triage Trigger(s)" in the input data).

Using the pre-computed assessment data provided, produce the memo using EXACTLY this structure:

---

## DECISION REVIEW MEMO — GREEN LOAN APPLICATION

**Project:** [project name]
**Carbon Finance Score:** [X/100 — GREEN / TRANSITION / BROWN]
**Triage Tier:** AI-Assisted Review (Tier 2 of 3)
**Review Trigger(s):** [list the reasons from the tier classification]
**Review Date:** ${new Date().toISOString().split('T')[0]}
**Prepared by:** CarbonIQ AI Decision Review System | GLP 2025 | PCAF v3

---

### 1. RECOMMENDATION

**DECISION: [APPROVE AS GREEN LOAN / CONDITIONAL APPROVE / DECLINE FOR GREEN LABEL / RECOMMEND SLL ALTERNATIVE]**
**Loan Classification: [Green Loan / Sustainability-Linked Loan / Standard Loan]**
**Confidence: [HIGH / MEDIUM / LOW]**
**Primary Decision Factor:** [The single most decisive factor]

[Write 2–3 sentences justifying the recommendation with specific reference to CFS, taxonomy status, and the key risk or strength. Be direct — the loan officer needs a clear steer, not hedged language.]

---

### 2. RISK ANALYSIS

| Risk Category | Rating | Key Finding |
|---|---|---|
| **Carbon Performance** | [LOW/MEDIUM/HIGH] | [specific finding with CFS component breakdown] |
| **Taxonomy Alignment** | [LOW/MEDIUM/HIGH] | [specific taxonomy gap or alignment status] |
| **Data Quality** | [LOW/MEDIUM/HIGH] | [PCAF score, EPD coverage, uncertainty range] |
| **Carbon Tax Exposure** | [LOW/MEDIUM/HIGH] | [regional carbon pricing impact at current intensity] |
| **Stranded Asset Risk** | [LOW/MEDIUM/HIGH] | [if intensity > 900 kgCO2e/m², note stranded asset risk] |

**Overall Risk Rating: [LOW / MEDIUM / HIGH]**

#### Carbon Performance Detail
[Analyse CFS components. Which components are driving the score? What is the exact gap to Green (≥70)? Is it closeable within the loan term? Reference component weights: EPD/material = 30%, reduction = 20%, compliance = 20%, certification = 15%, verification = 15%.]

#### Data Quality Detail
[PCAF 4 carries ±30–40% carbon uncertainty; PCAF 3 carries ±15–20%. How does this affect the taxonomy determination and CFS? What would a better PCAF score require?]

#### Taxonomy Alignment Detail
[Which taxonomies are aligned, which are not, and what specific conditions are missing? Quantify the impact — e.g., "achieving ≤500 kgCO2e/m² would unlock ASEAN Green Tier 1".]

---

### 3. GREEN LOAN STRUCTURING OPTIONS

**Option A: [Name — most favourable]**
- Loan Type: [Green Loan / SLL]
- Eligibility: [current status vs. required — be specific]
- Conditions Precedent: [specific measurable conditions]
- Pricing: [rate incentive or ratchet structure]
- Timeline: [when conditions must be satisfied]

**Option B: [Name — middle path]**
[Same structure]

**Option C: Standard Loan (fallback)**
- Loan Type: Standard commercial loan — no green label
- When to use: If green eligibility cannot be established within the required timeframe
- Note: Borrower may apply for green reclassification once conditions are met

---

### 4. PATHWAY TO GREEN CLASSIFICATION

[If CFS < 70, provide a specific score improvement roadmap. If ≥70, focus on maintaining the score during construction.]

| Action Required | CFS Component | Estimated Gain | Responsible Party | Timeline |
|---|---|---|---|---|
| [Action 1] | [component] | +X–Y points | Borrower | [timeframe] |
| [Action 2] | [component] | +X–Y points | Borrower/Bank | [timeframe] |
| [Action 3] | [component] | +X–Y points | Borrower | [timeframe] |
| **Projected Score** | — | **≥70** | — | [milestone] |

---

### 5. CONDITIONS PRECEDENT

[Specific, measurable conditions required before first drawdown. Each must have a deadline anchored to a loan milestone:]

1. **[Condition]** — Due: [milestone or date]
2. **[Condition]** — Due: [milestone or date]
3. **[Condition]** — Due: [milestone or date]

---

### 6. RECOMMENDED COVENANT PACKAGE

[3–5 KPIs calibrated to the project's actual carbon intensity and tCO2e figures from the input data:]

| KPI | Threshold | Reporting | Breach Consequence |
|---|---|---|---|
| Carbon Intensity | ≤X kgCO2e/m² | Quarterly | Rate ratchet +0.25% p.a. |
| EPD Material Coverage | ≥X% | On each Drawdown | Drawdown suspended |
| [Third KPI] | [threshold] | [frequency] | [consequence] |

*Full covenant design (3 scenarios + pricing ratchet): POST /v1/agent/covenants*

---

### 7. REGULATORY COMPLIANCE CHECKLIST

| Requirement | Status | Required Action |
|---|---|---|
| GLP 2025 Use of Proceeds | [Met / Not Met / Conditional] | [action] |
| PCAF v3 Attribution Disclosure | [Met / Not Met / Conditional] | [action] |
| [Primary taxonomy] Technical Screening | [Met / Not Met / Conditional] | [action] |
| External Verification / SPO | [Obtained / Required / Optional] | [action] |
| Quarterly Reporting Framework | [In place / To be established] | [action] |

---

### 8. LOAN OFFICER ACTION ITEMS

[Maximum 5 specific actions the loan officer must take before issuing a credit decision:]

☐ [Action 1 — most urgent]
☐ [Action 2]
☐ [Action 3]

---

IMPORTANT RULES:
- Use only the pre-computed figures provided. Never invent carbon values, scores, or taxonomy results.
- Be decisive. The loan officer needs a clear recommendation, not a list of considerations.
- Quantify every CFS score gain estimate using exact component weights: EPD/material 30%, reduction 20%, compliance 20%, certification 15%, verification 15%.
- Always include Option C (standard loan fallback) if green eligibility is not clearly established.
- Flag any regulatory compliance risks explicitly even if they do not change the recommendation.
- Use the actual carbonIntensity_kgCO2e_m2 value from input to set covenant thresholds.
- PCAF data quality: 1=Audited, 2=Verified, 3=Estimated (ICE v3), 4=Proxy (benchmarks), 5=Unknown.`;

// ---------------------------------------------------------------------------
// Tool definitions (available for runAgent full-loop mode if used)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'check_taxonomy_alignment',
    description: 'Check project metrics against all 4 green taxonomies: ASEAN v3, EU 2024, HK GCF, Singapore TSC.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: { type: 'number', description: 'Total project embodied carbon (tCO2e).' },
        buildingArea_m2:     { type: 'number', description: 'Gross floor area in square metres.' },
        reductionPct:        { type: 'number', description: 'Carbon reduction vs baseline (%).' },
        hasLCA:              { type: 'boolean', description: 'Whether a Life Cycle Assessment exists.' },
        hasEPD:              { type: 'boolean', description: 'Whether any EPD data exists.' }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the Carbon Finance Score (0–100). Green ≥70, Transition 40–69, Brown <40.',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct:    { type: 'number', description: 'EPD coverage percentage (0–100).' },
        reductionPct:      { type: 'number', description: 'Achieved carbon reduction vs baseline (%).' },
        certificationLevel: { type: 'string', description: 'Green certification level if known.' },
        verificationStatus: { type: 'string', description: 'External verification status.' }
      },
      required: ['epdCoveragePct']
    }
  },
  {
    name: 'estimate_preliminary_carbon',
    description: 'Estimate preliminary embodied carbon using regional building benchmarks.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType:    { type: 'string', description: 'Building type key.' },
        buildingArea_m2: { type: 'number', description: 'Gross floor area in square metres.' },
        region:          { type: 'string', description: 'Region for benchmark adjustment.' }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  }
];

// ---------------------------------------------------------------------------
// Build user message with pre-computed context (for runAgentSingleCall)
// ---------------------------------------------------------------------------

/**
 * Build the user message Claude receives for the AI review memo.
 * Supports both the named-params interface (HEAD) and the (body, tierResult)
 * interface (origin/main) for route compatibility.
 *
 * @param {Object} paramsOrBody
 * @param {Object} [tierResultOverride]  - When called as (body, tierResult)
 * @returns {string}
 */
function buildUserMessage(paramsOrBody, tierResultOverride) {
  // Normalise: support both (params) and (body, tierResult) call signatures
  const params = tierResultOverride
    ? { ...paramsOrBody, tierResult: tierResultOverride }
    : paramsOrBody;

  const {
    projectName,
    buildingType,
    buildingArea_m2,
    region,
    loanAmount,
    projectValue,
    cfsScore,
    cfsClassification,
    cfsComponents,
    taxonomyAlignments,
    pcafDataQualityScore,
    pcafFinancedEmissions_tCO2e,
    carbonIntensity_kgCO2e_m2,
    totalTCO2e,
    certificationLevel,
    verificationStatus,
    reductionPct,
    tierResult,
    underwritingRunId,
    projectDescription
  } = params;

  const parts = [
    `Please produce an AI Decision Review Memo for this borderline green loan application.`,
    `All assessment data has been pre-computed. Use these values exactly — do not recalculate or invent figures.`,
    ``,
    `**Application Details:**`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType || 'Not specified'}`,
    `- Gross Floor Area: ${buildingArea_m2 ? `${buildingArea_m2} m²` : 'Not provided'}`,
    `- Region: ${region || 'Singapore'}`,
    `- Loan Amount: ${loanAmount ? loanAmount.toLocaleString() : 'Not provided'}`,
    `- Project Value: ${projectValue ? projectValue.toLocaleString() : 'Not provided'}`,
    ``,
    `**Carbon Assessment:**`,
    `- Carbon Finance Score (CFS): ${cfsScore !== undefined ? `${cfsScore}/100` : 'Not provided'} — ${(cfsClassification || 'unknown').toUpperCase()}`,
    `- Carbon Intensity: ${carbonIntensity_kgCO2e_m2 !== undefined ? `${carbonIntensity_kgCO2e_m2} kgCO2e/m²` : 'Not provided'}`,
    `- Total Embodied Carbon: ${totalTCO2e !== undefined ? `${totalTCO2e} tCO2e` : 'Not provided'}`,
    `- EPD Coverage: ${cfsComponents && cfsComponents.epdCoveragePct !== undefined ? `${cfsComponents.epdCoveragePct}%` : params.epdCoveragePct !== undefined ? `${params.epdCoveragePct}%` : 'Not provided'}`,
    `- Carbon Reduction vs Baseline: ${reductionPct !== undefined ? `${reductionPct}%` : 'Not provided'}`,
    `- Target / Achieved Certification: ${certificationLevel || 'None specified'}`,
    `- External Verification Status: ${verificationStatus || 'none'}`,
    ``,
    `**PCAF Data:**`,
    `- PCAF Data Quality Score: ${pcafDataQualityScore !== undefined ? `${pcafDataQualityScore}/5` : 'Not provided'} (1=Audited, 2=Verified, 3=Estimated, 4=Proxy, 5=Unknown)`,
    `- PCAF Financed Emissions: ${pcafFinancedEmissions_tCO2e !== undefined ? `${pcafFinancedEmissions_tCO2e} tCO2e` : 'Not provided'}`,
    ``,
    `**Taxonomy Alignment Results:**`,
    JSON.stringify(taxonomyAlignments || {}, null, 2),
    ``,
    `**Triage Classification (why this is Tier 2 — AI-Assisted Review):**`,
    JSON.stringify(tierResult || {}, null, 2)
  ];

  if (projectDescription) {
    parts.push(``, `**Project Description:**`, projectDescription);
  }

  if (underwritingRunId) {
    parts.push(
      ``,
      `**Reference Underwriting Run ID:** ${underwritingRunId}`,
      `(Full underwriting memo with tool audit trail available via the agent runs endpoint)`
    );
  }

  parts.push(
    ``,
    `Using all of the above pre-computed data, produce the complete AI Decision Review Memo following your instructions.`
  );

  return parts.join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    check_taxonomy_alignment:    TOOL_FUNCTIONS.check_taxonomy_alignment,
    calculate_carbon_score:      TOOL_FUNCTIONS.calculate_carbon_score,
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon
  },
  buildUserMessage
};
