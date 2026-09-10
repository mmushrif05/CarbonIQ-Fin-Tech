// @ts-check
/**
 * The shape of a decision at each tier.
 */

'use strict';

const { DECISION_TIERS, DECISION_VERDICTS, DECISION_TRACKS, TRACK_LABELS, AUTO_APPROVE_LOAN_LIMIT, MANUAL_REVIEW_LOAN_LIMIT, TIER_DISTRIBUTION } = require('./decision-constants');

// ---------------------------------------------------------------------------
// Tier builder helpers
// ---------------------------------------------------------------------------

/**
 * Fields every classification carries, whichever tier it lands in.
 *
 * `reason` is a stable code an integrator can branch on; `rationale` is the
 * same thing in a sentence, for a human. `reasons` (plural) stays as the full
 * list. Emitting both means a caller never has to parse prose to learn why a
 * decision was reached.
 */
function _common({ track, reason, rationale, flags }) {
  return {
    track,
    trackLabel:  TRACK_LABELS[track],
    reason,
    rationale,
    flags:       flags || [],
    classifiedAt: new Date().toISOString(),
    thresholds:  { autoApproveLoanLimit: AUTO_APPROVE_LOAN_LIMIT, manualReviewLoanLimit: MANUAL_REVIEW_LOAN_LIMIT }
  };
}

function _tier1({ verdict, reasons, conditions, escalationNote, reason, rationale, flags }) {
  return {
    tier:          DECISION_TIERS.AUTO,
    tierLabel:     TIER_DISTRIBUTION[DECISION_TIERS.AUTO].label,
    verdict,
    confidence:    'high',
    autoDecision:  true,
    reasons,
    conditions,
    escalationNote,
    ..._common({
      track: verdict === DECISION_VERDICTS.AUTO_APPROVE
        ? DECISION_TRACKS.AUTO_APPROVE : DECISION_TRACKS.AUTO_DECLINE,
      reason, rationale: rationale || reasons[0], flags
    })
  };
}

function _tier3({ reasons, conditions, escalationNote, reason, rationale, flags }) {
  return {
    tier:          DECISION_TIERS.MANUAL,
    tierLabel:     TIER_DISTRIBUTION[DECISION_TIERS.MANUAL].label,
    verdict:       DECISION_VERDICTS.MANUAL_REVIEW,
    confidence:    'n/a',
    autoDecision:  false,
    reasons,
    conditions,
    escalationNote,
    ..._common({
      track: DECISION_TRACKS.MANUAL_REVIEW,
      reason, rationale: rationale || reasons[0], flags
    })
  };
}

module.exports = { _common, _tier1, _tier3 };
