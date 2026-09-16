// @ts-check
/**
 * The review lifecycle of an exposure on the Part A register.
 *
 * Every row used to be "recorded", and nothing distinguished a number keyed
 * this morning from one the reporting entity had reviewed and stood behind.
 * So an exposure moves recorded → under review → approved through one state
 * machine, one step at a time; back to recorded from review; back to review
 * from approved only with a recorded reason, because the disclosure may
 * already rest on the figure as it stood. Every move is dated and
 * attributed on the exposure's own trail.
 *
 * Approving is the `lock` scope's act — a different authority from recording,
 * exactly as a Part C lock is; `platform/auth/scopes.js` resolves it from the
 * body. An approved exposure is frozen: `assertNotApproved()` refuses a
 * change, a recomputation or a removal until somebody reopens it.
 *
 * Pure: no store, no clock beyond the instant of a move. `register.js` owns
 * the read and the write around it.
 */

'use strict';

const STATUS = Object.freeze({ RECORDED: 'recorded', UNDER_REVIEW: 'under_review', APPROVED: 'approved' });

/* There is no path from recorded straight to approved. */
const TRANSITIONS = Object.freeze({
  [STATUS.RECORDED]: [STATUS.UNDER_REVIEW],
  [STATUS.UNDER_REVIEW]: [STATUS.APPROVED, STATUS.RECORDED],
  [STATUS.APPROVED]: [STATUS.UNDER_REVIEW],
});

const label = (/** @type {string|undefined|null} */ s) => String(s || STATUS.RECORDED).replace(/_/g, ' ');
const now = () => new Date().toISOString();

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 * @param {string} [remedy]
 * @returns {import('../../../shared/types').AppError}
 */
function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {import('../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/**
 * An approved exposure is frozen. A figure the reporting entity has stood
 * behind must not move underneath the disclosure, so it cannot be changed,
 * recomputed or removed until somebody reopens it with a reason.
 *
 * @param {{exposureId?: string, status?: string}} existing
 * @param {string} verb  what was attempted — changed, recomputed, removed
 */
function assertNotApproved(existing, verb) {
  if ((existing.status || STATUS.RECORDED) === STATUS.APPROVED) {
    throw refuse('APPROVED_FROZEN',
      `Exposure ${existing.exposureId} is approved and cannot be ${verb} while it stands: a figure the reporting `
      + 'entity has stood behind must not move underneath the disclosure.',
      409,
      'Reopen it first — POST /v1/pcaf/part-a/exposures/:id/status with { "status": "under_review", "reason": "…" } '
      + `— and it can then be ${verb} against that reason.`);
  }
}

/**
 * The record's status and approval trail after one move, dated and attributed.
 *
 * @param {{status?: string, approval?: any}} existing
 * @param {string} to
 * @param {{by?: string|null, reason?: string|null}} [opts]
 */
function withMove(existing, to, opts = {}) {
  const from = existing.status || STATUS.RECORDED;
  const at = now();
  const prior = (existing.approval && existing.approval.history) || [];
  const approving = to === STATUS.APPROVED;
  return {
    status: to,
    approval: {
      status: to,
      approvedAt: approving ? at : null,
      approvedBy: approving ? (opts.by || null) : null,
      lastApprovedAt: approving ? at : ((existing.approval && existing.approval.lastApprovedAt) || null),
      history: [...prior, { from, to, at, by: opts.by || null, reason: opts.reason || null }],
    },
  };
}

/**
 * One move through review, checked against where the exposure stands.
 *
 * @param {{exposureId?: string, status?: string, approval?: any}} existing
 * @param {{status: string, reason?: string|null, actor?: string|null}} move
 * @returns {{status: string, approval: any}}
 */
function move(existing, move) {
  const { status, reason, actor } = move;
  const from = existing.status || STATUS.RECORDED;
  if (from === status) throw refuse('STATUS_UNCHANGED', `Exposure ${existing.exposureId} is already ${label(status)}.`, 409);
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(status)) {
    throw refuse('ILLEGAL_TRANSITION',
      `An exposure cannot move from ${label(from)} to ${label(status)}. From ${label(from)} it can move to: `
      + `${allowed.map(label).join(', ') || 'nothing'}.`,
      409, 'Move it one step at a time: recorded → under review → approved, and back to under review with a reason.');
  }
  if (from === STATUS.APPROVED && !(reason && String(reason).trim())) {
    throw refuse('REASON_REQUIRED',
      'Reopening an approved exposure needs the reason recorded: the disclosure may already rest on the figure as it stood.',
      400, 'Send { "status": "under_review", "reason": "…" }.');
  }
  return withMove(existing, status, { by: actor, reason });
}

/**
 * How many of a class's exposures stand approved, from the projection's own
 * status. The share is computed here, once, so no screen has to.
 *
 * @param {Array<{status?: string}>} rows
 */
function approvalOf(rows) {
  const total = rows.length;
  const count = (/** @type {string} */ s) => rows.filter(r => (r.status || STATUS.RECORDED) === s).length;
  const approved = count(STATUS.APPROVED);
  return {
    total, approved, underReview: count(STATUS.UNDER_REVIEW), recorded: count(STATUS.RECORDED),
    approvedPct: total ? +((approved / total) * 100).toFixed(2) : null,
    note: 'An approved exposure is frozen until it is reopened with a recorded reason; the disclosure prints how many stand approved.',
  };
}

module.exports = { STATUS, TRANSITIONS, assertNotApproved, withMove, move, approvalOf };
