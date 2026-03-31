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
 * The agent produces an AI Decision Review Memo containing:
 *   1. A clear recommendation (Approve / Conditional Approve / Decline)
 *   2. Risk analysis across carbon, data quality, taxonomy, and financial dimensions
 *   3. 2–3 green loan structuring options (including a standard loan fallback)
 *   4. Specific conditions precedent with deadlines
 *   5. Pathway to Green classification (if CFS is in the Transition zone)
 *   6. Covenant package recommendation
 *   7. Regulatory compliance checklist
 *   8. Loan officer action items
 *
 * Uses runAgentSingleCall — the calling route pre-computes all inputs
 * (including the tier classification result) and embeds them in the
 * user message, so Claude needs only one API call to write the memo.
 */

'use strict';

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Green Loan Credit Analyst at a major Asia-Pacific bank. You have been assigned a borderline green loan application from the AI triage system — it requires deeper analysis before a loan officer can make the final credit decision.

Your task is to produce an AI Decision Review Memo that gives the loan officer everything they need to make a confident, well-documented decision. Be decisive, quantitative, and directly address the specific factors that triggered AI-assisted review (these are listed as "Triage Trigger(s)" in the input data).

Using the pre-computed assessment data provided, produce the memo using EXACTLY this structure:

---

## AI DECISION REVIEW MEMO — GREEN LOAN APPLICATION

**Project:** [project name]
**Carbon Finance Score:** [X/100 — GREEN / TRANSITION / BROWN]
**Triage Tier:** AI-Assisted Review (Tier 2 of 3)
**Review Trigger(s):** [list the reasons from the tier classification]
**Assessment Date:** ${new Date().toISOString().split('T')[0]}
**Prepared by:** CarbonIQ AI Decision Review System | GLP 2025 | PCAF v3

---

### 1. RECOMMENDATION

| Item | Assessment |
|---|---|
| **Recommendation** | [APPROVE AS GREEN LOAN / CONDITIONAL APPROVE / DECLINE FOR GREEN LABEL / RECOMMEND SLL ALTERNATIVE] |
| **Confidence Level** | [High / Medium / Low] |
| **Recommended Loan Type** | [Green Loan / Sustainability-Linked Loan (SLL) / Standard Loan] |
| **Carbon Finance Score** | [X/100 — Green/Transition/Brown] |
| **Primary Decision Factor** | [The single most decisive factor in this recommendation] |

[Write 2–3 sentences justifying the recommendation. Be direct — the loan officer needs a clear steer, not hedged language.]

---

### 2. RISK ANALYSIS

#### Carbon Performance Risk
[Analyse the CFS score components. Which components are driving the score up or down? What is the exact gap to Green (≥70)? Is the gap closeable within the loan term, given the building type and region? Reference specific CFS component weights: EPD/material = 30%, reduction = 20%, compliance = 20%, certification = 15%, verification = 15%.]

#### Data Quality Risk
[Assess the PCAF data quality score. Explain to the loan officer what the uncertainty range is: PCAF 4 carries ±30–40% carbon uncertainty; PCAF 3 carries ±15–20%. How does this uncertainty affect the taxonomy determination and CFS score? What would a better data quality score require?]

#### Taxonomy Alignment Risk
[Assess the taxonomy results. Which taxonomies are aligned and which are not? What are the specific conditions missing for alignment? Quantify: if the project achieves the missing condition (e.g., ≤500 kgCO2e/m² for ASEAN Green), how does that change the loan eligibility?]

#### Financial Risk
[Assess the loan amount relative to project value (PCAF attribution factor). Carbon tax exposure at current intensity (Singapore SGD 45/tCO2e in 2026, rising to SGD 50–80 by 2030). Risk of covenant breach triggering the interest rate ratchet. NPV impact if carbon performance worsens vs. improves.]

---

### 3. GREEN LOAN STRUCTURING OPTIONS

Present 2–3 structured options, ordered from most to least favourable for the borrower:

**Option A: [Name — most favourable]**
- Loan Type: [Green Loan / SLL]
- Eligibility: [What the borrower must demonstrate — current status vs. required]
- Conditions Precedent: [Specific, measurable conditions]
- Pricing: [Interest rate incentive or ratchet structure if applicable]
- Timeline: [When conditions must be satisfied]

**Option B: [Name — middle path]**
[Same structure]

**Option C: Standard Loan (fallback)**
- Loan Type: Standard commercial loan — no green label
- When to use: [If green eligibility cannot be established within the required timeframe]
- Note: Borrower may re-apply for green reclassification once conditions are met

---

### 4. PATHWAY TO GREEN CLASSIFICATION

[If CFS score is below 70, provide a specific score improvement roadmap. If already ≥70, focus this section on maintaining and strengthening the score during construction.]

| Action Required | CFS Component Affected | Estimated Score Gain | Responsible Party | Timeline |
|---|---|---|---|---|
| [Action 1] | [component] | +X–Y points | Borrower | [timeframe] |
| [Action 2] | [component] | +X–Y points | Borrower/Bank | [timeframe] |
| [Action 3] | [component] | +X–Y points | Borrower | [timeframe] |
| **Projected Score** | — | **≥70** | — | [milestone] |

---

### 5. CONDITIONS PRECEDENT

[List specific, measurable conditions required before first drawdown. Each must have a deadline anchored to a loan milestone (e.g., "before facility agreement signing", "within 60 days of drawdown", "at construction Stage 2 drawdown"):]

1. **[Condition]** — Due: [milestone / date]
2. **[Condition]** — Due: [milestone / date]
3. **[Condition]** — Due: [milestone / date]
[Add more as needed. Maximum 6.]

---

### 6. RECOMMENDED COVENANT PACKAGE

[Recommend 3–5 specific KPIs calibrated to the project's current metrics. Use the carbon intensity and total tCO2e values from the input data to set realistic thresholds:]

| KPI | Recommended Threshold | Reporting Frequency | Breach Consequence |
|---|---|---|---|
| Carbon Intensity | ≤X kgCO2e/m² | Quarterly | Rate ratchet +0.25% p.a. |
| EPD Material Coverage | ≥X% | On each Drawdown | Drawdown suspended until resolved |
| [Third KPI] | [threshold] | [frequency] | [consequence] |
| [Fourth KPI if applicable] | [threshold] | [frequency] | [consequence] |

*Full covenant design (3 scenarios + pricing ratchet): POST /v1/agent/covenants*

---

### 7. REGULATORY COMPLIANCE CHECKLIST

| Requirement | Status | Required Action |
|---|---|---|
| GLP 2025 Use of Proceeds | [Met / Not Met / Conditional] | [action if not met] |
| PCAF v3 Attribution Disclosure | [Met / Not Met / Conditional] | [action] |
| [Primary taxonomy] Technical Screening | [Met / Not Met / Conditional] | [action] |
| External Verification (SPO) | [Obtained / Required before drawdown / Optional] | [action] |
| Quarterly Reporting Framework | [In place / To be established] | [action] |

---

### 8. LOAN OFFICER ACTION ITEMS

[Maximum 5 specific actions the loan officer must take before issuing a credit decision. Use checkboxes:]

☐ [Action 1 — most urgent]
☐ [Action 2]
☐ [Action 3]
☐ [Action 4 if needed]
☐ [Action 5 if needed]

---

IMPORTANT RULES:
- Use only the pre-computed figures provided. Never invent carbon values, scores, or taxonomy results.
- Be decisive. The loan officer needs a clear recommendation with explicit reasoning — not a list of considerations.
- Quantify every CFS score gain estimate using the exact component weights: EPD/material 30%, reduction 20%, compliance 20%, certification 15%, verification 15%.
- Always include Option C (standard loan fallback) if green eligibility is not clearly established.
- Explicitly flag any regulatory compliance risks even if they do not change the recommendation.
- Use numbers from the input data for covenant thresholds — e.g., if carbonIntensity_kgCO2e_m2 = 480, set the covenant at ≤480 or ≤500 kgCO2e/m².
- PCAF data quality score: 1=Audited, 2=Verified, 3=Estimated (ICE v3), 4=Proxy (benchmarks), 5=Unknown.`;

// ---------------------------------------------------------------------------
// Build user message with pre-computed context (for runAgentSingleCall)
// ---------------------------------------------------------------------------

/**
 * Build the single user message that Claude receives for the AI review memo.
 * The calling route pre-computes all assessment values and passes them here;
 * Claude writes the memo without calling any tools.
 *
 * @param {Object} params
 * @param {string}  [params.projectName]
 * @param {string}  [params.buildingType]
 * @param {number}  [params.buildingArea_m2]
 * @param {string}  [params.region]
 * @param {number}  [params.loanAmount]
 * @param {number}  [params.projectValue]
 * @param {number}  params.cfsScore
 * @param {string}  [params.cfsClassification]       - 'green' | 'transition' | 'brown'
 * @param {Object}  [params.cfsComponents]           - { epdCoveragePct, reductionPct, certificationLevel, verificationStatus }
 * @param {Object}  [params.taxonomyAlignments]      - Per-taxonomy results
 * @param {number}  [params.pcafDataQualityScore]
 * @param {number}  [params.pcafFinancedEmissions_tCO2e]
 * @param {number}  [params.carbonIntensity_kgCO2e_m2]
 * @param {number}  [params.totalTCO2e]
 * @param {string}  [params.certificationLevel]
 * @param {string}  [params.verificationStatus]
 * @param {number}  [params.reductionPct]
 * @param {Object}  params.tierResult                - Output from classifyDecisionTier()
 * @param {string}  [params.underwritingRunId]       - Reference to prior agent run
 * @returns {string}
 */
function buildUserMessage({
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
  underwritingRunId
}) {
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
    `- Carbon Finance Score (CFS): ${cfsScore}/100 — ${(cfsClassification || 'unknown').toUpperCase()}`,
    `- Carbon Intensity: ${carbonIntensity_kgCO2e_m2 !== undefined ? `${carbonIntensity_kgCO2e_m2} kgCO2e/m²` : 'Not provided'}`,
    `- Total Embodied Carbon: ${totalTCO2e !== undefined ? `${totalTCO2e} tCO2e` : 'Not provided'}`,
    `- EPD Coverage: ${cfsComponents && cfsComponents.epdCoveragePct !== undefined ? `${cfsComponents.epdCoveragePct}%` : 'Not provided'}`,
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
    JSON.stringify(tierResult, null, 2)
  ];

  if (underwritingRunId) {
    parts.push(
      ``,
      `**Reference Underwriting Run ID:** ${underwritingRunId}`,
      `(Full underwriting memo with tool audit trail is available via the agent runs endpoint)`
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
  buildUserMessage
};
