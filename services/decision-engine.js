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
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// CFS thresholds
const CFS_GREEN       = 70;   // ≥70 → Green classification
const CFS_TRANSITION  = 40;   // 40–69 → Transition
const CFS_FLOOR       = 25;   // <25 → very unlikely green pathway, default decline

// Loan amount thresholds (in the reporting currency units provided)
const HIGH_VALUE_THRESHOLD   = 50_000_000;   // >50M → escalate to manual
const MEDIUM_VALUE_THRESHOLD = 10_000_000;   // >10M adds complexity to borderline

// Data quality minimums for auto-approval
const MIN_EPD_FOR_AUTO_APPROVE  = 20;  // At least 20% EPD coverage needed for auto-approve
const MIN_AREA_FOR_ANY_DECISION = 50;  // Floor area < 50 m² is suspicious

// ---------------------------------------------------------------------------
// Tier Classification
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TierResult
 * @property {1|2|3}       tier         - Decision tier
 * @property {string}      track        - 'auto_approve' | 'auto_decline' | 'ai_review' | 'manual_review'
 * @property {string}      reason       - Machine-readable reason code
 * @property {string}      rationale    - Human-readable explanation for the loan officer
 * @property {string[]}    flags        - Any additional risk flags
 * @property {Object}      inputs       - Echo of key inputs used for classification
 */

/**
 * Classify a loan application into a decision tier.
 *
 * @param {Object} params
 * @param {number}  params.cfsScore          - Carbon Finance Score (0–100)
 * @param {number}  [params.loanAmount]      - Loan amount (any currency)
 * @param {number}  [params.projectValue]    - Total project value
 * @param {number}  [params.buildingArea_m2] - Gross floor area
 * @param {number}  [params.epdCoveragePct]  - EPD data coverage (0–100)
 * @param {string}  [params.verificationStatus] - 'verified'|'in_review'|'submitted'|'none'
 * @param {string}  [params.region]          - Project region
 * @param {string}  [params.buildingType]    - Building type
 * @param {boolean} [params.hasBOQ]          - Whether a BOQ has been submitted
 * @param {number}  [params.reductionPct]    - Carbon reduction % vs baseline
 * @returns {TierResult}
 */
function classifyApplication({
  cfsScore,
  loanAmount,
  projectValue,
  buildingArea_m2,
  epdCoveragePct = 0,
  verificationStatus = 'none',
  region,
  buildingType,
  hasBOQ = false,
  reductionPct = 0,
}) {
  const flags = [];
  const inputs = {
    cfsScore, loanAmount, buildingArea_m2, epdCoveragePct,
    verificationStatus, hasBOQ, reductionPct,
  };

  // ── Data poverty checks ─────────────────────────────────────────────────
  if (cfsScore == null || cfsScore === undefined) {
    return _result(3, 'manual_review', 'NO_CFS_SCORE',
      'Carbon Finance Score is missing. A CFS cannot be computed without carbon data — manual ESG review required.',
      ['missing_cfs'], inputs);
  }

  if (!buildingArea_m2 || buildingArea_m2 < MIN_AREA_FOR_ANY_DECISION) {
    return _result(3, 'manual_review', 'MISSING_FLOOR_AREA',
      'Gross floor area is missing or suspiciously small. Carbon intensity cannot be reliably assessed without this — manual review required.',
      ['missing_area'], inputs);
  }

  // ── High-value escalation ───────────────────────────────────────────────
  const isHighValue = loanAmount && loanAmount > HIGH_VALUE_THRESHOLD;
  if (isHighValue) {
    flags.push('high_value_loan');
    if (cfsScore < CFS_GREEN) {
      // High value + not green → always manual
      return _result(3, 'manual_review', 'HIGH_VALUE_BELOW_GREEN',
        `Loan amount exceeds ${HIGH_VALUE_THRESHOLD.toLocaleString()} and CFS ${cfsScore}/100 is below the Green threshold (70). ` +
        'High-value non-green loans require specialist credit and ESG review.',
        flags, inputs);
    }
    // High value + green CFS → AI-assisted for senior review
    return _result(2, 'ai_review', 'HIGH_VALUE_GREEN',
      `Loan amount exceeds ${HIGH_VALUE_THRESHOLD.toLocaleString()}. Even with a Green CFS (${cfsScore}/100), ` +
      'high-value green loans require AI-assisted review memo for senior credit approval.',
      flags, inputs);
  }

  // ── Tier 1 — Auto-Decline (check before data-poor so clear declines are fast) ─
  const isClearBrownEarly = cfsScore < CFS_FLOOR && epdCoveragePct < 10 && reductionPct < 5;
  if (isClearBrownEarly) {
    return _result(1, 'auto_decline', 'CLEAR_BROWN',
      `CFS ${cfsScore}/100 is significantly below the minimum transition threshold (40) with negligible EPD data ` +
      `and no meaningful carbon reduction achieved (${reductionPct}%). ` +
      'No credible green pathway identified at this stage.',
      flags, inputs);
  }

  // ── Data-poor escalation ────────────────────────────────────────────────
  const isDataPoor = !hasBOQ && epdCoveragePct < 5 && cfsScore < CFS_GREEN;
  if (isDataPoor) {
    flags.push('data_poor');
    return _result(2, 'ai_review', 'DATA_POOR_BORDERLINE',
      `No BOQ and minimal EPD data (${epdCoveragePct}% coverage). CFS ${cfsScore}/100 is based on benchmarks only (PCAF Score 4). ` +
      'AI review required to assess pathway and structure conditions precedent.',
      flags, inputs);
  }

  // ── Verification status flags ───────────────────────────────────────────
  if (verificationStatus === 'in_review' || verificationStatus === 'submitted') {
    flags.push('verification_pending');
  }
  if (verificationStatus === 'verified') {
    flags.push('third_party_verified');
  }

  // ── Tier 1 — Auto-Approve ───────────────────────────────────────────────
  const isClearGreen = cfsScore >= CFS_GREEN;
  const hasAdequateEPD = epdCoveragePct >= MIN_EPD_FOR_AUTO_APPROVE || verificationStatus === 'verified';
  const isMediumValue = loanAmount && loanAmount > MEDIUM_VALUE_THRESHOLD;

  if (isClearGreen && hasAdequateEPD && !isMediumValue) {
    return _result(1, 'auto_approve', 'CLEAR_GREEN',
      `CFS ${cfsScore}/100 meets the Green threshold (≥70) with adequate EPD coverage (${epdCoveragePct}%). ` +
      'Standard green loan structure recommended. Subject to final documentation review.',
      flags, inputs);
  }

  // Green CFS but medium value or lower EPD — AI review for memo quality
  if (isClearGreen && isMediumValue) {
    flags.push('medium_value_loan');
    return _result(2, 'ai_review', 'GREEN_MEDIUM_VALUE',
      `CFS ${cfsScore}/100 meets Green threshold but loan amount warrants AI review memo ` +
      'for documented credit approval trail.',
      flags, inputs);
  }

  if (isClearGreen && !hasAdequateEPD) {
    flags.push('low_epd_coverage');
    return _result(2, 'ai_review', 'GREEN_LOW_EPD',
      `CFS ${cfsScore}/100 meets Green threshold but EPD coverage is only ${epdCoveragePct}% ` +
      `(minimum ${MIN_EPD_FOR_AUTO_APPROVE}% required for auto-approval). ` +
      'AI review required to assess data quality risk and structure EPD conditions.',
      flags, inputs);
  }

  // ── Tier 2 — AI-Assisted (borderline and remaining cases) ──────────────
  if (cfsScore >= CFS_TRANSITION) {
    return _result(2, 'ai_review', 'TRANSITION_ZONE',
      `CFS ${cfsScore}/100 is in the Transition zone (40–69). Qualifies for a Sustainability-Linked Loan. ` +
      'AI review will assess green pathway feasibility, covenant structure, and conditions to reach Green classification.',
      flags, inputs);
  }

  // CFS below transition but not clear decline — could have specific mitigants
  return _result(2, 'ai_review', 'BELOW_TRANSITION_WITH_CONTEXT',
    `CFS ${cfsScore}/100 is below the Transition threshold (40) but project context may contain mitigating factors. ` +
    'AI review required to assess whether a structured pathway or SLL with aggressive ratchet is viable.',
    flags, inputs);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function _result(tier, track, reason, rationale, flags, inputs) {
  const tierLabels = {
    1: 'Tier 1 — Auto-Decision',
    2: 'Tier 2 — AI-Assisted Review',
    3: 'Tier 3 — Manual Review',
  };

  const trackLabels = {
    auto_approve: 'Auto-Approve',
    auto_decline: 'Auto-Decline',
    ai_review:    'AI Decision Review',
    manual_review: 'Manual Credit Review',
  };

  return {
    tier,
    tierLabel:  tierLabels[tier],
    track,
    trackLabel: trackLabels[track],
    reason,
    rationale,
    flags:      flags || [],
    inputs,
    classifiedAt: new Date().toISOString(),
  };
}

module.exports = { classifyApplication };
