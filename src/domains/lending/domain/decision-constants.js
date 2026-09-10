// @ts-check
/**
 * The tiers, verdicts, tracks, thresholds and limits a decision is expressed in.
 */

'use strict';

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

// The decision track, which is the vocabulary the API and its consumers use.
// It is not the same word list as DECISION_VERDICTS: a Tier 2 outcome is an
// 'ai_review' track carrying an 'ai_recommend' verdict.
const DECISION_TRACKS = {
  AUTO_APPROVE:  'auto_approve',
  AUTO_DECLINE:  'auto_decline',
  AI_REVIEW:     'ai_review',
  MANUAL_REVIEW: 'manual_review'
};

const TRACK_LABELS = {
  [DECISION_TRACKS.AUTO_APPROVE]:  'Auto-Approve',
  [DECISION_TRACKS.AUTO_DECLINE]:  'Auto-Decline',
  [DECISION_TRACKS.AI_REVIEW]:     'AI-Assisted Review',
  [DECISION_TRACKS.MANUAL_REVIEW]: 'Manual Review'
};

// Loan thresholds (SGD-equivalent; applied regardless of currency denomination)
const AUTO_APPROVE_LOAN_LIMIT  = 50_000_000;   // ≤ SGD 50M → eligible for auto-approval

const MANUAL_REVIEW_LOAN_LIMIT = 100_000_000;  // > SGD 100M → always manual

// EPD coverage at or above which the borrower's own product data is treated as
// evidence of the green claim in its own right. Below it the claim rests on the
// score alone, which is not enough to approve without a human or an AI reading.
const EPD_ADEQUATE_PCT = 20;

// Below this, an application carries too little product evidence for the
// score to be relied on unaided.
const EPD_THIN_PCT = 10;

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

module.exports = { DECISION_TIERS, DECISION_VERDICTS, DECISION_TRACKS, TRACK_LABELS, AUTO_APPROVE_LOAN_LIMIT, MANUAL_REVIEW_LOAN_LIMIT, EPD_ADEQUATE_PCT, EPD_THIN_PCT, TIER_DISTRIBUTION };
