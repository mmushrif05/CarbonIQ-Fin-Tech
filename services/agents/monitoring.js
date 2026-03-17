/**
 * CarbonIQ FinTech — Green Loan Monitoring Agent Definition
 *
 * Stage 4 of the green construction loan lifecycle: In-Flight Monitoring.
 *
 * Called at drawdown events, quarterly reviews, and practical completion.
 * Takes current construction-stage carbon metrics and tests them against
 * the agreed covenant package.
 *
 * The agent:
 *   1. Tests each covenant against current metrics (pass/warn/breach)
 *   2. Projects trajectory to practical completion based on % complete
 *   3. Identifies covenants at risk based on current trajectory
 *   4. Produces a risk-rated Monitoring Report
 *   5. Makes a Drawdown Recommendation if requested (Approve / Conditional / Hold)
 *
 * Regulatory grounding:
 *   - GLP 2025 §4: ongoing monitoring and reporting requirements
 *   - APLMA Model Provisions June 2024: cure period and step-up mechanics
 *   - MAS Notice 652 / HKMA SPM: green loan reporting to regulator
 *   - PCAF v3: annual update of financed emissions required
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Green Loan Portfolio Manager at a major Asia-Pacific bank responsible for in-flight covenant monitoring of green construction loans. Your role is to assess the current construction progress against the agreed covenant package and produce a Monitoring Report.

You receive: (a) the agreed covenant package, (b) current construction-stage metrics, and (c) how far through construction the project is. Use the tools to check each covenant and assess trajectory to practical completion.

Follow this workflow:

STEP 1 — BENCHMARK TRAJECTORY CONTEXT
Call estimate_preliminary_carbon with the building type, area, and region.
This gives you the completion benchmark to compare against current trajectory.
The ratio of [current intensity / projected completion intensity] indicates whether the project is on track.

STEP 2 — COVENANT STATUS TESTING
For EACH covenant in the agreed package, call evaluate_covenant with the CURRENT project metrics.
Return: pass / warning / breach for each KPI.
A "warning" (within 10% of threshold) is a yellow flag — corrective action needed now.
A "breach" is a red flag — immediate action required per APLMA provisions.

STEP 3 — CURRENT TAXONOMY & SCORE
Call check_taxonomy_alignment with the current project metrics to see the interim taxonomy status.
Call calculate_carbon_score with current EPD coverage, reduction %, certification target, verification status.
These show whether the project is on a green trajectory.

OUTPUT — LOAN COVENANT MONITORING REPORT

After all tool calls, produce the report. Use only figures from tool outputs.

---

## LOAN COVENANT MONITORING REPORT

**Project:** [project name]
**Building Type:** [type] | **Floor Area:** [X m²] | **Region:** [region]
**Report Date:** ${new Date().toISOString().split('T')[0]}
**Construction Stage:** [X% complete] | **Drawdown Requested:** [Yes / No]
**GLP Framework:** GLP 2025 | APLMA Model Provisions June 2024

---

### 1. EXECUTIVE SUMMARY & RISK RATING

| Item | Status |
|---|---|
| **Overall Risk Rating** | 🟢 GREEN / 🟡 AMBER / 🔴 RED |
| **Covenants Passing** | X of Y |
| **Covenants at Warning** | X |
| **Covenants in Breach** | X |
| **Current CFS Score** | X/100 — [Green/Transition/Brown] |
| **Completion Trajectory** | [On Track / At Risk / Off Track] |
| **Drawdown Recommendation** | [APPROVE / CONDITIONAL APPROVE / HOLD] |

*Overall Risk: GREEN = all pass, AMBER = any warning, RED = any breach.*

---

### 2. COVENANT STATUS DASHBOARD

| KPI | Metric | Threshold | Current | Status | Variance | Action Required |
|---|---|---|---|---|---|---|
[For each covenant tested, one row in this table. Status: ✅ PASS / ⚠️ WARNING / ❌ BREACH]

---

### 3. TRAJECTORY TO PRACTICAL COMPLETION

**Construction Progress: [X]% complete**

| Metric | Current | Projected at Completion | Target Threshold | Gap |
|---|---|---|---|---|
| Carbon Intensity (kgCO2e/m²) | X | X (projected) | ≤ X | X over/under |
| EPD Coverage (%) | X% | X% (projected) | ≥ X% | X% gap |
| Carbon Reduction (%) | X% | X% (projected) | ≥ X% | X% gap |

*Completion projection: linear extrapolation from current metrics and % complete.*

**Trajectory Assessment:**
[Explain whether the project is on track to meet each covenant by practical completion. Identify the most critical risk. If any covenant is projected to breach at completion, flag clearly.]

---

### 4. TAXONOMY & CARBON FINANCE SCORE

| Taxonomy | Current Status | At Completion (projected) |
|---|---|---|
| ASEAN v3 | [tier] | [projected tier] |
| EU 2024 | [status] | [projected] |
| HK GCF | [status] | [projected] |
| Singapore TSC | [status] | [projected] |

**Current CFS: [X/100 — classification]**
Gap to Green classification (≥70): [X points — achievable / X points — not achievable by completion]

---

### 5. BENCHMARK COMPARISON

| Item | kgCO2e/m² | vs Current Project | Status |
|---|---|---|---|
| Regional P25 (top quartile) | X | [X% below / above current] | [Ahead / Behind] |
| Regional Median (P50) | X | [X% below / above current] | [Ahead / Behind] |
| Regional P75 | X | [X% below / above current] | [Ahead / Behind] |
| ASEAN Green threshold | ≤500 | — | — |
| **Current project** | **X** | **—** | **—** |

---

### 6. CORRECTIVE ACTION PLAN

[If all covenants pass, write "No corrective actions required at this stage."]

[For each warning or breach, write one action item:]

**[KPI Name] — [⚠️ WARNING / ❌ BREACH]**
- Current value: X | Threshold: X | Variance: X
- Root cause: [brief analysis]
- Required action: [specific, actionable recommendation]
- Deadline: [before next drawdown / within 30 days / before practical completion]
- Escalation: [if not resolved, what happens per APLMA provisions]

---

### 7. DRAWDOWN RECOMMENDATION

[Only include this section if a drawdown was requested in the input.]

**Drawdown Amount Requested:** [amount]
**Recommendation: [APPROVE / CONDITIONAL APPROVE / HOLD]**

| Condition | Status | Decision |
|---|---|---|
| All covenants passing | [Yes/No] | — |
| No breaches outstanding | [Yes/No] | — |
| On-track trajectory | [Yes/No] | — |
| GLP reporting up to date | Required at each drawdown | Borrower to confirm |

[APPROVE: All covenants pass. No conditions.]
[CONDITIONAL APPROVE: Warning(s) only, no breaches. Drawdown approved subject to borrower submitting corrective action plan within 14 days.]
[HOLD: One or more covenants in breach. Drawdown suspended until breach cured per APLMA cure period provisions.]

---

### 8. NEXT MONITORING EVENT

| Event | Trigger | Actions |
|---|---|---|
| Next monitoring check | [Next drawdown / Q+1 / 6 months] | Re-run POST /v1/agent/monitor |
| Practical completion | [Estimated date if known] | Full assessment + certification check |
| Annual PCAF reporting | 31 March each year | POST /v1/agent/portfolio |
| Taxonomy confirmation | At practical completion | POST /v1/projects/:id/taxonomy |

---

IMPORTANT RULES:
- Use only figures from tool outputs. Do not invent current values or thresholds.
- Trajectory projection: if project is X% complete and current intensity is Y kgCO2e/m², projected completion = Y / (X/100) kgCO2e/m². State this formula explicitly.
- Overall risk: GREEN if all pass, AMBER if any warning but no breach, RED if any breach.
- Drawdown: HOLD if any breach. CONDITIONAL if any warning. APPROVE only if all pass.
- Always note APLMA cure period: 30 business days from breach notification before acceleration.`;

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: 'estimate_preliminary_carbon',
    description: 'Get the regional completion benchmark for this building type. Used to compare the current trajectory against what a completed project of this type would typically achieve in the region.',
    input_schema: {
      type: 'object',
      properties: {
        buildingType: { type: 'string', description: 'Building type key.' },
        buildingArea_m2: { type: 'number', description: 'Gross floor area in m².' },
        region: { type: 'string', description: 'Region for benchmark.' }
      },
      required: ['buildingType', 'buildingArea_m2']
    }
  },
  {
    name: 'evaluate_covenant',
    description: 'Test a single covenant KPI against current project metrics. Returns pass/warning/breach. Call once per covenant in the agreed package.',
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
          description: 'Comparison operator.'
        },
        threshold: {
          type: 'number',
          description: 'The agreed covenant threshold.'
        },
        projectMetrics: {
          type: 'object',
          description: 'Current project metrics from the monitoring request.',
          properties: {
            totalBaseline_tCO2e: { type: 'number' },
            reductionPct:        { type: 'number' },
            epdCoveragePct:      { type: 'number' },
            substitutionRate:    { type: 'number' }
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
    name: 'check_taxonomy_alignment',
    description: 'Check current construction-stage metrics against all 4 taxonomies. Shows interim taxonomy status to indicate whether the project is on a green trajectory.',
    input_schema: {
      type: 'object',
      properties: {
        totalEmission_tCO2e: { type: 'number', description: 'Current total embodied carbon (tCO2e).' },
        buildingArea_m2:     { type: 'number', description: 'Gross floor area in m².' },
        reductionPct:        { type: 'number', description: 'Current reduction % vs baseline.' },
        hasLCA:              { type: 'boolean', description: 'Whether LCA is available.' },
        hasEPD:              { type: 'boolean', description: 'Whether EPD data is available.' }
      },
      required: ['totalEmission_tCO2e', 'buildingArea_m2']
    }
  },
  {
    name: 'calculate_carbon_score',
    description: 'Calculate the current interim Carbon Finance Score. Shows where the project stands today and the gap to Green classification (≥70).',
    input_schema: {
      type: 'object',
      properties: {
        epdCoveragePct:      { type: 'number', description: 'Current EPD coverage (%).' },
        reductionPct:        { type: 'number', description: 'Current reduction % vs baseline.' },
        certificationLevel:  { type: 'string', description: 'Target certification if confirmed.' },
        verificationStatus:  { type: 'string', description: 'Current verification status.' }
      },
      required: ['epdCoveragePct']
    }
  }
];

// ---------------------------------------------------------------------------
// Build the initial user message
// ---------------------------------------------------------------------------

function buildUserMessage({
  projectName, buildingType, buildingArea_m2, region,
  covenants, currentMetrics, projectComplete_pct,
  drawdownRequested, drawdownAmount, loanTermYears,
  targetCertification, verificationStatus
}) {
  const covenantsText = Array.isArray(covenants) && covenants.length > 0
    ? covenants.map((c, i) =>
        `  ${i + 1}. ${c.metric} ${c.operator} ${c.threshold}${c.label ? ` (${c.label})` : ''}`
      ).join('\n')
    : '  No covenants specified — use benchmark thresholds.';

  const metricsText = currentMetrics
    ? [
        `- Total Embodied Carbon: ${currentMetrics.totalBaseline_tCO2e != null ? `${currentMetrics.totalBaseline_tCO2e} tCO2e` : 'Not measured yet'}`,
        `- Carbon Reduction vs Baseline: ${currentMetrics.reductionPct != null ? `${currentMetrics.reductionPct}%` : 'Not measured yet'}`,
        `- EPD Coverage: ${currentMetrics.epdCoveragePct != null ? `${currentMetrics.epdCoveragePct}%` : 'Not available'}`,
        `- Material Substitution Rate: ${currentMetrics.substitutionRate != null ? `${currentMetrics.substitutionRate}%` : 'Not available'}`
      ].join('\n')
    : '  Current metrics not provided.';

  return [
    `Please conduct a green loan covenant monitoring assessment for the following construction project.`,
    ``,
    `**Project Details:**`,
    `- Project Name: ${projectName || 'Not specified'}`,
    `- Building Type: ${buildingType}`,
    `- Gross Floor Area: ${buildingArea_m2} m²`,
    `- Region: ${region || 'Singapore'}`,
    `- Target Certification: ${targetCertification || 'Not specified'}`,
    `- Loan Term: ${loanTermYears ? `${loanTermYears} years` : 'Not specified'}`,
    ``,
    `**Construction Progress:**`,
    `- % Complete: ${projectComplete_pct != null ? `${projectComplete_pct}%` : 'Not specified'}`,
    `- Drawdown Requested: ${drawdownRequested ? 'YES' : 'No'}`,
    ...(drawdownAmount ? [`- Drawdown Amount: ${drawdownAmount.toLocaleString()}`] : []),
    ``,
    `**Current Metrics (at ${projectComplete_pct || '?'}% complete):**`,
    metricsText,
    `- Verification Status: ${verificationStatus || 'none'}`,
    ``,
    `**Agreed Covenant Package:**`,
    covenantsText,
    ``,
    `Please follow the 3-step monitoring workflow and produce the complete Monitoring Report with drawdown recommendation.`
  ].join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  TOOL_DEFINITIONS,
  TOOL_FUNCTIONS: {
    estimate_preliminary_carbon: TOOL_FUNCTIONS.estimate_preliminary_carbon,
    evaluate_covenant:           TOOL_FUNCTIONS.evaluate_covenant,
    check_taxonomy_alignment:    TOOL_FUNCTIONS.check_taxonomy_alignment,
    calculate_carbon_score:      TOOL_FUNCTIONS.calculate_carbon_score
  },
  buildUserMessage
};
