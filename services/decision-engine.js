/**
 * CarbonIQ FinTech — Tiered Decision Engine
 *
 * Deterministic classifier that routes each green loan application to the
 * appropriate decision track WITHOUT making an AI call. This keeps the
 * 70–85% of straightforward cases fast and cost-free, reserving AI
 * processing for genuinely borderline or complex applications.
 *
 * TIER 1 — Auto-Decision (≈70–85% of applications)
 *   Clear approve: high CFS, adequate data quality, standard loan size
 *   Clear decline: very low CFS, no credible green pathway
 *   No AI call required — decision is deterministic.
 *
 * TIER 2 — AI-Assisted Review (≈10–20% of applications)
 *   Borderline CFS, missing key data, or moderate complexity.
 *   Triggers the Decision Review Agent (decision-review.js) which
 *   produces an 8-section Decision Review Memo for the loan officer.
 *
 * TIER 3 — Manual Review (≈5–10% of applications)
 *   High-value loans, data-poor applications, or regulatory complexity
 *   that requires a human credit officer and specialist ESG review.
 *
 * Routing logic is calibrated to APAC green loan market norms:
 *   - GLP 2021/2025 eligibility requirements
 *   - MAS ENRM, HKMA CRMF thresholds
 *   - PCAF v3 data quality requirements
 *
 * IMPORTANT: This engine classifies the tier and verdict but does NOT make
 * the final lending decision. Tier 1 auto-approvals are pending covenant
 * agreement. Tier 3 manual reviews are always resolved by a human officer.
 */

'use strict';

const { CFS_THRESHOLDS } = require('../config/constants');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DECISION_TIERS = {
  AUTO:   1,   // Auto-Decision (approve or decline without human review)
  AI:     2,   // AI-Assisted Review (AI memo + loan officer sign-off)
  MANUAL: 3    // Manual Review (full credit officer escalation)
};

const DECISION_VERDICTS = {
  AUTO_APPROVE:  'auto_approve',
  AUTO_DECLINE:  'auto_decline',
  AI_RECOMMEND:  'ai_recommend',
  MANUAL_REVIEW: 'manual_review'
};

// Loan thresholds (SGD-equivalent; applied regardless of currency denomination)
const AUTO_APPROVE_LOAN_LIMIT  = 50_000_000;   // ≤ SGD 50M → eligible for auto-approval
const MANUAL_REVIEW_LOAN_LIMIT = 100_000_000;  // > SGD 100M → always manual

// Expected tier distribution for portfolio analytics
const TIER_DISTRIBUTION = {
  [DECISION_TIERS.AUTO]: {
    label:         'Auto-Decision',
    expectedShare: '70–85%',
    description:   'Clear approve or decline based on CFS, taxonomy, and data quality thresholds. No human review required.'
  },
  [DECISION_TIERS.AI]: {
    label:         'AI-Assisted Review',
    expectedShare: '10–20%',
    description:   'Borderline cases — AI generates a detailed review memo; loan officer makes the final decision.'
  },
  [DECISION_TIERS.MANUAL]: {
    label:         'Manual Review',
    expectedShare: '5–10%',
    description:   'Complex, high-value, or data-poor cases requiring full credit officer and sustainability team review.'
  }
};

// ---------------------------------------------------------------------------
// Taxonomy alignment helper
// ---------------------------------------------------------------------------

/**
 * Determine whether any taxonomy alignment result counts as "aligned".
 * Accepts both boolean flags and string classification labels from
 * the check_taxonomy_alignment tool output.
 *
 * @param {Object|null} taxonomyAlignments
 * @returns {boolean}
 */
function _anyTaxonomyAligned(taxonomyAlignments) {
  if (!taxonomyAlignments || typeof taxonomyAlignments !== 'object') return false;
  const ALIGNED_VALUES = new Set(['true', 'aligned', 'green', 'transition', 'light_green', 'dark_green', 'transitioning']);
  return Object.values(taxonomyAlignments).some(v => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return ALIGNED_VALUES.has(v.toLowerCase());
    return false;
  });
}

// ---------------------------------------------------------------------------
// Core tier classification
// ---------------------------------------------------------------------------

/**
 * Classify a green loan application into the appropriate decision tier.
 *
 * @param {Object}  params
 * @param {number}  params.cfsScore                 - Carbon Finance Score 0–100
 * @param {string}  [params.cfsClassification]      - 'green' | 'transition' | 'brown'
 * @param {Object}  [params.taxonomyAlignments]     - Per-taxonomy results from check_taxonomy_alignment
 * @param {number}  [params.pcafDataQualityScore]   - PCAF score 1–5 (1=Audited, 5=Unknown)
 * @param {number}  [params.loanAmount]             - Loan amount in local currency
 * @param {number}  [params.buildingArea_m2]        - Gross floor area (guards against missing data)
 * @param {number}  [params.epdCoveragePct]         - EPD data coverage (0–100)
 * @param {boolean} [params.forceManualReview]      - Override — always escalate to Tier 3
 *
 * @returns {Object} {
 *   tier, tierLabel, verdict, confidence, autoDecision,
 *   reasons: string[],
 *   conditions: string[],
 *   escalationNote: string|null,
 *   thresholds: { autoApproveLoanLimit, manualReviewLoanLimit }
 * }
 */
function classifyDecisionTier({
  cfsScore,
  cfsClassification,
  taxonomyAlignments,
  pcafDataQualityScore,
  loanAmount,
  buildingArea_m2,
  epdCoveragePct,
  forceManualReview
}) {
  // -------------------------------------------------------------------------
  // Guard: forceManualReview override → always Tier 3
  // -------------------------------------------------------------------------
  if (forceManualReview) {
    return _tier3({
      reasons:       ['Manual review explicitly requested by submitter'],
      conditions:    [],
      escalationNote: 'Escalated by request flag. Assign to green lending officer for full review.'
    });
  }

  // -------------------------------------------------------------------------
  // Guard: missing floor area → Tier 3 (carbon intensity cannot be assessed)
  // -------------------------------------------------------------------------
  if (!buildingArea_m2 || buildingArea_m2 < 50) {
    return _tier3({
      reasons: ['Gross floor area is missing or implausibly small — carbon intensity cannot be reliably assessed'],
      conditions: ['Borrower must provide verified gross floor area before re-triage'],
      escalationNote: 'Missing critical project data. Use /v1/agent/coach to guide the borrower.'
    });
  }

  // -------------------------------------------------------------------------
  // Guard: loan > MANUAL_REVIEW_LOAN_LIMIT → always Tier 3
  // -------------------------------------------------------------------------
  if (loanAmount && loanAmount > MANUAL_REVIEW_LOAN_LIMIT) {
    return _tier3({
      reasons: [
        `Loan amount (${loanAmount.toLocaleString()}) exceeds the SGD 100M threshold for automated or AI-assisted decision`
      ],
      conditions:    [],
      escalationNote: 'High-value facility. Requires senior credit officer + sustainability team sign-off before proceeding.'
    });
  }

  // -------------------------------------------------------------------------
  // Guard: PCAF Score 5 (no project-specific data at all) → Tier 3
  // -------------------------------------------------------------------------
  if (pcafDataQualityScore === 5) {
    return _tier3({
      reasons: [
        'PCAF data quality score 5 (Unknown) — only sector-level averages available, no project-specific data'
      ],
      conditions: [
        'Borrower must submit a full BOQ or independent carbon assessment before a decision can be issued'
      ],
      escalationNote: 'Insufficient data quality for AI or automated decision. Request BOQ from borrower before re-triage.'
    });
  }

  const anyAligned      = _anyTaxonomyAligned(taxonomyAlignments);
  const isGreenCFS      = cfsScore >= CFS_THRESHOLDS.green;        // ≥ 70
  const isTransitionCFS = cfsScore >= CFS_THRESHOLDS.transition && cfsScore < CFS_THRESHOLDS.green; // 40–69
  const isBrownCFS      = cfsScore < CFS_THRESHOLDS.transition;    // < 40
  const poorData        = pcafDataQualityScore && pcafDataQualityScore >= 4;
  const goodData        = !pcafDataQualityScore || pcafDataQualityScore <= 3;
  const withinAutoLimit = !loanAmount || loanAmount <= AUTO_APPROVE_LOAN_LIMIT;
  const aboveAutoLimit  = loanAmount && loanAmount > AUTO_APPROVE_LOAN_LIMIT && loanAmount <= MANUAL_REVIEW_LOAN_LIMIT;

  // -------------------------------------------------------------------------
  // Tier 1 — Auto-Decline
  // Brown CFS AND no taxonomy alignment → clear decline
  // -------------------------------------------------------------------------
  if (isBrownCFS && !anyAligned) {
    return _tier1({
      verdict: DECISION_VERDICTS.AUTO_DECLINE,
      reasons: [
        `Carbon Finance Score ${cfsScore}/100 is Brown (<40) — below the minimum green loan threshold`,
        'No taxonomy alignment found across ASEAN v3, EU 2024, HK GCF, or Singapore TSC'
      ],
      conditions:    [],
      escalationNote: 'Application does not meet minimum green loan criteria. Can be offered a standard loan product.'
    });
  }

  // Very low CFS (< 30) even with partial taxonomy alignment — still decline
  if (cfsScore < 30) {
    return _tier1({
      verdict: DECISION_VERDICTS.AUTO_DECLINE,
      reasons: [
        `Carbon Finance Score ${cfsScore}/100 is critically low — well below the Brown/Transition boundary of 40`
      ],
      conditions:    [],
      escalationNote: 'Score is far below the minimum threshold. Recommend standard loan or full application rework before re-submission.'
    });
  }

  // -------------------------------------------------------------------------
  // Tier 1 — Auto-Approve
  // Green CFS + taxonomy aligned + good data + within loan limit
  // -------------------------------------------------------------------------
  if (isGreenCFS && anyAligned && goodData && withinAutoLimit) {
    const conditions = [
      'Green loan covenants required via the Covenant Design workflow before first drawdown',
      'Quarterly carbon KPI reporting obligation applies for the full loan term'
    ];
    if (pcafDataQualityScore && pcafDataQualityScore === 3) {
      conditions.push('Submit full BOQ for PCAF Score 2 upgrade within 90 days of drawdown');
    }

    return _tier1({
      verdict: DECISION_VERDICTS.AUTO_APPROVE,
      reasons: [
        `Carbon Finance Score ${cfsScore}/100 — Green classification (≥70 threshold met)`,
        'At least one green taxonomy confirmed aligned',
        `PCAF data quality score ${pcafDataQualityScore || 'N/A'} — sufficient for automated decision`,
        loanAmount
          ? `Loan amount ${loanAmount.toLocaleString()} is within the SGD 50M auto-approval limit`
          : 'No loan amount specified — defaulting to within auto-approval limit'
      ],
      conditions,
      escalationNote: null
    });
  }

  // -------------------------------------------------------------------------
  // Tier 3 — Borderline CFS with poor data (too uncertain for AI-assisted)
  // -------------------------------------------------------------------------
  if (isTransitionCFS && poorData) {
    return _tier3({
      reasons: [
        `Carbon Finance Score ${cfsScore}/100 is in the Transition zone (40–69) — borderline eligibility`,
        `PCAF data quality score ${pcafDataQualityScore} — insufficient data for a confident AI-assisted recommendation`
      ],
      conditions: [
        'Request full BOQ from borrower to improve PCAF data quality to Score 2–3',
        'Consider commissioning an independent carbon consultant review'
      ],
      escalationNote: 'Low-data borderline case. Senior analyst must assess whether the conditions precedent are achievable before any indicative offer.'
    });
  }

  // -------------------------------------------------------------------------
  // Tier 2 — AI-Assisted Review (all remaining cases)
  // -------------------------------------------------------------------------
  const reasons    = [];
  const conditions = [];
  let   confidence = 'medium';

  if (isTransitionCFS) {
    reasons.push(`Carbon Finance Score ${cfsScore}/100 is in the Transition zone (40–69) — AI analysis needed to assess the pathway to Green classification`);
  } else if (isGreenCFS && aboveAutoLimit) {
    reasons.push(`Carbon Finance Score ${cfsScore}/100 qualifies as Green, but loan amount (${loanAmount.toLocaleString()}) exceeds the SGD 50M auto-approval limit`);
    confidence = 'medium-high';
  } else if (isGreenCFS && !anyAligned) {
    reasons.push(`Carbon Finance Score ${cfsScore}/100 is Green, but no taxonomy alignment confirmed — AI will assess the most viable taxonomy pathway`);
    confidence = 'medium';
  }

  if (aboveAutoLimit && !isGreenCFS) {
    reasons.push(`Loan amount ${loanAmount.toLocaleString()} is above the SGD 50M auto-approval limit — AI review required`);
  }

  if (poorData) {
    reasons.push(`PCAF data quality score ${pcafDataQualityScore} — AI will assess whether conditions can bridge the data quality gap`);
    conditions.push('Borrower must submit BOQ or third-party carbon assessment within 60 days of AI recommendation');
  }

  if (!anyAligned && !isBrownCFS) {
    reasons.push('No confirmed taxonomy alignment — AI will identify the most viable taxonomy pathway and conditions to achieve it');
    conditions.push('Borrower must confirm target taxonomy framework and provide supporting technical documentation');
  }

  conditions.push('Green loan covenants required via the Covenant Design workflow before facility agreement');

  return {
    tier:          DECISION_TIERS.AI,
    tierLabel:     TIER_DISTRIBUTION[DECISION_TIERS.AI].label,
    verdict:       DECISION_VERDICTS.AI_RECOMMEND,
    confidence,
    autoDecision:  false,
    reasons,
    conditions,
    escalationNote: 'AI review memo generated. Loan officer sign-off required before final credit decision.',
    thresholds:    { autoApproveLoanLimit: AUTO_APPROVE_LOAN_LIMIT, manualReviewLoanLimit: MANUAL_REVIEW_LOAN_LIMIT }
  };
}

// ---------------------------------------------------------------------------
// Tier builder helpers
// ---------------------------------------------------------------------------

function _tier1({ verdict, reasons, conditions, escalationNote }) {
  return {
    tier:          DECISION_TIERS.AUTO,
    tierLabel:     TIER_DISTRIBUTION[DECISION_TIERS.AUTO].label,
    verdict,
    confidence:    'high',
    autoDecision:  true,
    reasons,
    conditions,
    escalationNote,
    thresholds:    { autoApproveLoanLimit: AUTO_APPROVE_LOAN_LIMIT, manualReviewLoanLimit: MANUAL_REVIEW_LOAN_LIMIT }
  };
}

function _tier3({ reasons, conditions, escalationNote }) {
  return {
    tier:          DECISION_TIERS.MANUAL,
    tierLabel:     TIER_DISTRIBUTION[DECISION_TIERS.MANUAL].label,
    verdict:       DECISION_VERDICTS.MANUAL_REVIEW,
    confidence:    'n/a',
    autoDecision:  false,
    reasons,
    conditions,
    escalationNote,
    thresholds:    { autoApproveLoanLimit: AUTO_APPROVE_LOAN_LIMIT, manualReviewLoanLimit: MANUAL_REVIEW_LOAN_LIMIT }
  };
}

/**
 * Compatibility alias for origin/main's classifyApplication interface.
 * Maps the alternate parameter names to classifyDecisionTier.
 */
function classifyApplication(params) {
  return classifyDecisionTier({
    cfsScore:             params.cfsScore,
    taxonomyAlignments:   params.taxonomyAlignments,
    pcafDataQualityScore: params.pcafDataQualityScore,
    loanAmount:           params.loanAmount,
    buildingArea_m2:      params.buildingArea_m2,
    epdCoveragePct:       params.epdCoveragePct,
    forceManualReview:    params.forceManualReview
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  classifyDecisionTier,
  classifyApplication,   // compatibility alias
  DECISION_TIERS,
  DECISION_VERDICTS,
  TIER_DISTRIBUTION,
  AUTO_APPROVE_LOAN_LIMIT,
  MANUAL_REVIEW_LOAN_LIMIT
};
