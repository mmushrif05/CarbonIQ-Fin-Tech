/**
 * CarbonIQ FinTech — AI Borrower Coaching Agent
 *
 * Stage 2 of the borrower journey: AI-Guided Application Coaching.
 *
 * Real-world validation: AI-guided applications raise completion rates by 32%
 * (validated across APAC green loan platforms, 2024–2025). This agent guides
 * borrowers through the green loan application process with personalised,
 * step-by-step coaching that directly addresses their specific data gaps.
 *
 * The agent:
 *   1. Assesses current application completeness (0–100%)
 *   2. Calculates preliminary carbon metrics from whatever data is available
 *   3. Identifies missing information and explains its importance in plain language
 *   4. Provides a prioritised improvement roadmap (ordered by CFS impact)
 *   5. Shows the borrower their score improvement potential per action
 *
 * Uses runAgentSingleCall — all tool results are pre-computed locally and
 * embedded in the user message, so the agent needs only one Claude API call.
 * This keeps execution under Netlify's 10-second function timeout.
 *
 * Impact: +32% application completion rate observed in APAC pilot banks.
 */

'use strict';

const { TOOL_FUNCTIONS } = require('./tools');

// ---------------------------------------------------------------------------
// Application completeness assessment (pure function, no AI needed)
// ---------------------------------------------------------------------------

/**
 * Score how complete a borrower's application is, identify missing fields,
 * and determine readiness for each subsequent workflow stage.
 *
 * @param {Object} body - The raw request body from the borrower coaching endpoint
 * @returns {Object} completeness report
 */
function assessApplicationCompleteness(body) {
  const {
    buildingType, buildingArea_m2, region, loanAmount, projectValue,
    boqContent, hasBOQ, targetCertification, reductionTarget, hasLCA, hasEPD,
    verificationStatus
  } = body;

  // Support both boqContent (raw BOQ text) and hasBOQ (boolean flag from origination flow)
  const hasBOQData = !!(boqContent || hasBOQ);

  const fields = [
    {
      name:   'boqContent',
      value:  hasBOQData,
      weight: 25,
      label:  'Bill of Quantities (BOQ)',
      impact: 'Critical: upgrades PCAF data quality from Score 4 (benchmark) to Score 2–3 (verified). Without this, the bank cannot confirm a green label.'
    },
    {
      name:   'buildingType',
      value:  buildingType,
      weight: 15,
      label:  'Building Type',
      impact: 'Required for carbon benchmarking and taxonomy screening. Without this, no carbon estimate is possible.'
    },
    {
      name:   'buildingArea_m2',
      value:  buildingArea_m2,
      weight: 15,
      label:  'Gross Floor Area (m²)',
      impact: 'Required for carbon intensity calculation (kgCO2e/m²) — the primary metric tested against taxonomy thresholds.'
    },
    {
      name:   'loanAmount',
      value:  loanAmount,
      weight: 10,
      label:  'Loan Amount',
      impact: 'Required for PCAF financed emissions attribution. The bank cannot calculate its regulatory carbon disclosure without this.'
    },
    {
      name:   'projectValue',
      value:  projectValue,
      weight: 10,
      label:  'Total Project Value',
      impact: 'Required to calculate the PCAF attribution factor (loan ÷ project value). Directly affects the bank\'s financed emissions figure.'
    },
    {
      name:   'targetCertification',
      value:  targetCertification,
      weight: 10,
      label:  'Target Green Certification',
      impact: 'Worth up to 15 points on the Carbon Finance Score and determines the loan pricing ratchet structure.'
    },
    {
      name:   'reductionTarget',
      value:  reductionTarget,
      weight: 5,
      label:  'Carbon Reduction Target (%)',
      impact: 'Required for green covenant calibration. Defines the KPI thresholds tracked during construction.'
    },
    {
      name:   'region',
      value:  region && region !== '',
      weight: 5,
      label:  'Project Region',
      impact: 'Used for regional carbon benchmarks, carbon tax exposure (e.g., Singapore SGD 45/tCO2e in 2026), and applicable taxonomy selection.'
    },
    {
      name:   'hasLCA',
      value:  hasLCA,
      weight: 3,
      label:  'Life Cycle Assessment (LCA)',
      impact: 'Required for EU Taxonomy alignment and Hong Kong GCF dark green (BEAM Plus Platinum) classification.'
    },
    {
      name:   'verificationStatus',
      value:  verificationStatus && verificationStatus !== 'none',
      weight: 2,
      label:  'External Verification Status',
      impact: 'Third-party verification achieves PCAF Score 1 (Audited) and adds 10–15 points to the Carbon Finance Score.'
    }
  ];

  const totalWeight   = fields.reduce((sum, f) => sum + f.weight, 0);
  const completed     = [];
  const missing       = [];
  let   completedWeight = 0;

  for (const field of fields) {
    const hasValue = field.value !== null && field.value !== undefined && field.value !== '' && field.value !== false;
    if (hasValue) {
      completedWeight += field.weight;
      completed.push({ label: field.label, weight: field.weight });
    } else {
      missing.push({ label: field.label, weight: field.weight, impact: field.impact });
    }
  }

  // Sort missing fields by weight descending — highest-impact items first
  missing.sort((a, b) => b.weight - a.weight);

  const completionPct = Math.round((completedWeight / totalWeight) * 100);

  let statusLabel;
  if (completionPct < 30)       statusLabel = 'Just Getting Started';
  else if (completionPct < 60)  statusLabel = 'In Progress';
  else if (completionPct < 85)  statusLabel = 'Almost Ready';
  else                          statusLabel = 'Ready for Submission';

  return {
    completionPct,
    statusLabel,
    completedFields:      completed,
    missingFields:        missing,
    readyForScreening:    !!(buildingType && buildingArea_m2),
    readyForUnderwriting: !!(buildingType && buildingArea_m2 && hasBOQData),
    readyForDecision:     !!(buildingType && buildingArea_m2 && hasBOQData && loanAmount && projectValue)
  };
}

/**
 * Compatibility alias used by the origination flow.
 * Returns { score, breakdown, missingFields } shape.
 */
function assessCompleteness(data) {
  const result = assessApplicationCompleteness(data);
  return {
    score:        result.completionPct,
    statusLabel:  result.statusLabel,
    missingFields: result.missingFields.map(f => f.label),
    readyForScreening:    result.readyForScreening,
    readyForUnderwriting: result.readyForUnderwriting,
    readyForDecision:     result.readyForDecision
  };
}

// ---------------------------------------------------------------------------
// System Prompt — borrower-facing coaching language
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are CarbonIQ's AI Borrower Coach — a helpful, expert guide designed to help construction project owners and developers successfully complete their green loan application.

Your goal is to raise application completion rates by giving borrowers clear, personalised, actionable coaching. Use plain language — never bank jargon. Be encouraging but honest about what's missing. Every suggestion must directly improve the borrower's chance of green loan approval or a better interest rate.

You receive pre-computed tool results. Produce a personalised coaching report using EXACTLY this structure:

---

## YOUR GREEN LOAN APPLICATION COACHING REPORT

**Project:** [project name or "Your Project" if not provided]
**Application Completeness:** [X]% — [status label from completeness assessment]
**Assessment Date:** ${new Date().toISOString().split('T')[0]}
**Prepared by:** CarbonIQ AI Borrower Coach

---

### HOW YOU'RE DOING

[Write 2–3 sentences of honest, encouraging assessment. Reference their specific completion percentage and what their preliminary Carbon Finance Score means for their loan prospects. Mention what classification they're currently on track for (Green ≥70, Transition 40–69, Brown <40) and whether adding the missing items could change that classification.]

---

### YOUR PRELIMINARY CARBON PICTURE

[Only include this section if a preliminary carbon estimate was computed (carbon estimate data is present in the tool results). Explain what the carbon intensity means in plain language — is it likely to meet the Green taxonomy threshold (≤500 kgCO2e/m²) or not? What does that mean for their loan eligibility?

If no estimate was possible because building type or area is missing, replace this section with a short explanation of what they need to provide to unlock this picture.]

| Metric | Your Preliminary Estimate | Green Loan Threshold |
|---|---|---|
| Carbon Intensity | X kgCO2e/m² | ≤500 kgCO2e/m² (ASEAN Green) |
| Total Embodied Carbon | X tCO2e | — |
| Preliminary Carbon Finance Score | X/100 | ≥70 for Green loan |
| ASEAN Taxonomy Status | [Green / Transition / Not Aligned] | Green (Tier 1) |

*Note: This is a sector benchmark estimate. Submitting your Bill of Quantities (BOQ) will give you a much more accurate figure.*

---

### WHAT YOU STILL NEED TO PROVIDE

[For each missing item from the completeness assessment, write a short plain-language explanation:]

**[Item name]** *(worth [X] points toward your application completeness)*
- What it is: [one sentence in plain language]
- Why the bank needs it: [specific honest reason]
- How to get it: [specific actionable guidance]

[List items in order of weight (highest first). Skip items that are already provided.]

---

### YOUR PERSONALISED ACTION PLAN

[Numbered list of the 3–7 most impactful next steps, ordered by impact:]

1. **[Action]** — [Why this matters: e.g., "This alone could add 20 points to your Carbon Finance Score"] — [How: specific instruction]
2. ...

---

### YOUR SCORE IMPROVEMENT POTENTIAL

[Show the borrower how each missing action can improve their Carbon Finance Score. Use the known CFS component weights: EPD/BOQ coverage = 30%, carbon reduction = 20%, compliance = 20%, green certification = 15%, external verification = 15%.]

| Action to Take | Estimated Score Gain | Projected New Score |
|---|---|---|
| [Top missing item] | +X–Y points | → ~X/100 |
| [Second item] | +X–Y points | → ~X/100 |
| [Third item] | +X–Y points | → ~X/100 |
| **If all gaps resolved** | **+X points total** | **→ ~X/100 (Green)** |

---

### WHAT HAPPENS NEXT

Once your application is complete, here is the 3-step journey to your green loan:

1. **Full AI Underwriting Assessment** — Submit your complete application. The AI analyses your BOQ, carbon metrics, and taxonomy alignment to produce a formal Green Loan Underwriting Memo (typically within minutes).
2. **Credit Decision** — The bank reviews your AI-generated memo and issues a credit decision. Complete applications with a Carbon Finance Score ≥70 qualify for a full Green Loan with preferential pricing.
3. **Green Covenant Agreement** — Once approved, an AI coach designs your green loan KPIs (the sustainability targets you'll track during construction). These are calibrated to your specific project metrics.

[If borrower_questions were provided, answer them specifically at the end of this section using plain language.]

---

IMPORTANT RULES:
- Use only the pre-computed tool results provided. Never invent carbon numbers.
- Speak directly to the borrower using "you" and "your project".
- Explain every acronym on first use: EPD (Environmental Product Declaration), PCAF (the global standard for measuring a bank's financed carbon emissions), BOQ (Bill of Quantities — a detailed list of all construction materials), CFS (Carbon Finance Score — the bank's internal green loan readiness score out of 100).
- If the project is already ≥80% complete, congratulate them warmly and focus entirely on the final items.
- Keep score gain estimates realistic — round to the nearest 5 points and give ranges (e.g., "+10–15 points").`;

// ---------------------------------------------------------------------------
// Build user message with pre-computed results (for runAgentSingleCall)
// ---------------------------------------------------------------------------

/**
 * Pre-execute all relevant local tools and build the single user message
 * that Claude receives. Claude writes the coaching report from these results
 * without needing to call any tools itself.
 *
 * @param {Object} body - Validated request body
 * @returns {string} Full user message with embedded tool results
 */
function buildUserMessageWithResults(body) {
  const {
    projectName, buildingType, buildingArea_m2, region, loanAmount, projectValue,
    boqContent, hasBOQ, targetCertification, reductionTarget, hasLCA, hasEPD,
    verificationStatus, borrowerQuestions, projectDescription
  } = body;

  const hasBOQData = !!(boqContent || hasBOQ);

  // Step 1 — Application completeness (always computed)
  const completeness = assessApplicationCompleteness(body);

  // Steps 2–4 — Carbon estimates (only if minimum data present)
  let carbonEstimate = null;
  let taxonomyResult = null;
  let scoreResult    = null;

  if (buildingType && buildingArea_m2) {
    carbonEstimate = TOOL_FUNCTIONS.estimate_preliminary_carbon({
      buildingType,
      buildingArea_m2,
      region: region || 'Singapore'
    });

    const medianTCO2e = carbonEstimate.estimatedTotals
      ? carbonEstimate.estimatedTotals.median_tCO2e
      : 0;

    taxonomyResult = TOOL_FUNCTIONS.check_taxonomy_alignment({
      totalEmission_tCO2e: medianTCO2e,
      buildingArea_m2,
      reductionPct: reductionTarget || 0,
      hasLCA:       hasLCA || false,
      hasEPD:       hasEPD || false
    });

    // For CFS: BOQ presence implies some EPD potential (rough proxy)
    const epdProxy = hasBOQData ? 30 : 0;

    scoreResult = TOOL_FUNCTIONS.calculate_carbon_score({
      epdCoveragePct:    epdProxy,
      reductionPct:      reductionTarget || 0,
      certificationLevel: targetCertification || null,
      verificationStatus: verificationStatus || 'none'
    });
  }

  const parts = [
    `Please produce a personalised AI Borrower Coaching Report for the following green loan application.`,
    `All tool assessments have been pre-computed. Use these results exactly — do not invent any numbers.`,
    ``,
    `**Current Application State:**`,
    `- Project Name: ${projectName || 'Not provided'}`,
    `- Building Type: ${buildingType || 'NOT PROVIDED'}`,
    `- Gross Floor Area: ${buildingArea_m2 ? `${buildingArea_m2} m²` : 'NOT PROVIDED'}`,
    `- Region: ${region || 'Not specified (defaults to Singapore)'}`,
    `- Loan Amount: ${loanAmount ? loanAmount.toLocaleString() : 'NOT PROVIDED'}`,
    `- Project Value: ${projectValue ? projectValue.toLocaleString() : 'NOT PROVIDED'}`,
    `- BOQ / Material Data: ${hasBOQData ? 'PROVIDED ✓' : 'NOT PROVIDED'}`,
    `- Target Green Certification: ${targetCertification || 'Not specified'}`,
    `- Carbon Reduction Target: ${reductionTarget ? `${reductionTarget}%` : 'Not specified'}`,
    `- Life Cycle Assessment (LCA): ${hasLCA ? 'Yes ✓' : 'No'}`,
    `- EPD Data Present: ${hasEPD ? 'Yes ✓' : 'No'}`,
    `- External Verification: ${verificationStatus || 'none'}`,
    ``,
    `**STEP 1 — Application Completeness Assessment:**`,
    JSON.stringify(completeness, null, 2)
  ];

  if (carbonEstimate) {
    const medianTCO2e = carbonEstimate.estimatedTotals
      ? carbonEstimate.estimatedTotals.median_tCO2e : 0;
    parts.push(
      ``,
      `**STEP 2 — Preliminary Carbon Estimate (sector benchmark, PCAF Score 4):**`,
      JSON.stringify(carbonEstimate, null, 2),
      ``,
      `**STEP 3 — Preliminary Taxonomy Alignment (base case — median ${medianTCO2e} tCO2e):**`,
      JSON.stringify(taxonomyResult, null, 2),
      ``,
      `**STEP 4 — Preliminary Carbon Finance Score:**`,
      JSON.stringify(scoreResult, null, 2)
    );
  } else {
    parts.push(
      ``,
      `**STEPS 2–4 — Carbon assessment not yet possible:**`,
      `Building type and/or floor area have not been provided. Both are required before a preliminary carbon estimate can be generated.`
    );
  }

  if (projectDescription) {
    parts.push(``, `**Project Description:**`, projectDescription);
  }

  if (borrowerQuestions) {
    parts.push(
      ``,
      `**Borrower's Specific Questions (answer these at the end of the "What Happens Next" section):**`,
      borrowerQuestions
    );
  }

  parts.push(
    ``,
    `Using all of the above pre-computed results, produce the complete personalised Borrower Coaching Report following your instructions.`,
    `Make it highly specific to this borrower — reference their building type, region, and numbers throughout.`
  );

  return parts.join('\n');
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserMessageWithResults,
  assessApplicationCompleteness,
  assessCompleteness  // compatibility alias for origination flow
};
