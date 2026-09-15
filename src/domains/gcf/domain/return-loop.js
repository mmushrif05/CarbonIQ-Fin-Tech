// @ts-check
/**
 * The return-to-sponsor loop — Phase 1 Stage 6.
 *
 * An assessor who signs an assessment off with conditions, or against it, is
 * not the end of the road for the project — it is the start of a conversation
 * with the sponsor. This module turns that recommendation into three things a
 * sponsor can act on:
 *
 *   • a **gap list** — what the record is missing and what the assessor rated
 *     weak, each with the sentence that would clear it;
 *   • the input to a **return letter** — the document the sponsor receives;
 *   • a **resubmission comparison** — once the sponsor has resubmitted, what
 *     changed against the version that was returned.
 *
 * ── The gap list is derived, never invented ────────────────────────────────
 *
 * Every gap is read off what is already recorded: the engine's evidence
 * coverage of the six criteria (a sub-criterion the record does not hold), and
 * the assessor's own ratings (a criterion rated weak). Nothing here judges the
 * project afresh — it collects what the assessment already established and
 * names the remedy, the same discipline the Part A improvement plan follows.
 *
 * ── The comparison needs a fixed point, so a return is a recorded event ─────
 *
 * "What changed since it was returned" cannot be answered from the live record
 * alone — the returned state has to have been captured. So recording a return
 * snapshots the gap list at that instant into `validation.returns[]`; the
 * comparison reads the last snapshot and sorts today's gaps into resolved,
 * still-outstanding and newly-raised. A comparison with no return to compare
 * against says so rather than inventing a baseline.
 */

'use strict';

const criteria = require('./criteria');
const validation = require('./validation');

const RETURNABLE = Object.freeze(['recommend_with_conditions', 'not_recommend']);
const RATING_WEAK = 'weak';

/** A stable key for a gap, so the same gap in two snapshots compares equal. */
function gapKey(g) {
  return g.kind === 'rating' ? `rating:${g.criterionId}` : `evidence:${g.criterionId}:${g.subId}`;
}

/**
 * The gaps in an assessment: sub-criteria the record does not hold, and
 * criteria the assessor rated weak. Derived from what is recorded; each gap
 * carries a remedy.
 * @param {any} project
 */
function gaps(project) {
  const crit = criteria.assess(project);
  const val = validation.current(project);
  const items = [];

  for (const c of crit.criteria) {
    for (const s of c.sub) {
      if (s.status === 'absent' || s.status === 'partial') {
        items.push({
          kind: 'evidence',
          criterionId: c.id,
          criterion: c.label,
          subId: s.id,
          detail: s.label,
          status: s.status,
          remedy: s.status === 'absent'
            ? `Record ${s.label.toLowerCase()}.`
            : `Complete ${s.label.toLowerCase()} — it is only partly held.`,
        });
      }
    }
    const r = val.ratings[c.id];
    if (r && r.rating === RATING_WEAK) {
      items.push({
        kind: 'rating',
        criterionId: c.id,
        criterion: c.label,
        detail: c.label,
        rating: RATING_WEAK,
        remedy: `Strengthen the evidence behind ${c.label} — the assessor rated it weak${r.note ? `: ${r.note}` : '.'}`,
      });
    }
  }

  return {
    items,
    count: items.length,
    recommendation: val.recommendation,
    returnable: RETURNABLE.includes(val.recommendation) && val.state === 'validated',
  };
}

/**
 * The comparison between the last returned version and the record as it stands
 * now — resolved, still-outstanding and newly-raised gaps.
 * @param {any} project
 */
function comparison(project) {
  const val = validation.current(project);
  const returns = val.returns || [];
  const last = returns.length ? returns[returns.length - 1] : null;
  const current = gaps(project).items;
  const currentByKey = new Map(current.map(g => [gapKey(g), g]));

  if (!last) {
    return {
      hasReturn: false,
      note: 'This assessment has not been returned to the sponsor, so there is nothing to compare against.',
      returnedAt: null, resolved: [], outstanding: [], raised: [],
    };
  }

  const prior = last.gaps || [];
  const priorByKey = new Map(prior.map(g => [gapKey(g), g]));

  const resolved = prior.filter(g => !currentByKey.has(gapKey(g)));
  const outstanding = prior.filter(g => currentByKey.has(gapKey(g)));
  const raised = current.filter(g => !priorByKey.has(gapKey(g)));

  return {
    hasReturn: true,
    returnedAt: last.at,
    returnedBy: last.by || null,
    recommendation: last.recommendation || null,
    resolved,
    outstanding,
    raised,
    note: raised.length
      ? 'Some gaps were cleared; some were newly raised by the resubmission.'
      : (outstanding.length ? 'Some gaps remain outstanding since the return.' : 'Every gap raised at the return has been resolved.'),
  };
}

/**
 * The return-event snapshot to append to `validation.returns`. Pure: it does
 * not persist. The gap list is captured whole so the comparison has a fixed
 * point that a later edit cannot move.
 * @param {any} project
 * @param {{by?: string|null, at?: string}} [ctx]
 */
function snapshot(project, { by = null, at = new Date().toISOString() } = {}) {
  const g = gaps(project);
  return {
    at,
    ...(by ? { by } : {}),
    recommendation: g.recommendation,
    gaps: g.items,
  };
}

module.exports = { RETURNABLE, gaps, comparison, snapshot, gapKey };
