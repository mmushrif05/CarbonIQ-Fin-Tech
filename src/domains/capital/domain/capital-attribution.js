/**
 * CarbonIQ FinTech — How much of a project's emissions this book carries
 *
 * Its own module because two things need it and they cannot depend on each
 * other: the roll-up reports the attributed position, and the forecast phases
 * it across the years. When only the roll-up knew about attribution, the curve
 * was drawn from the unattributed figures and stopped adding up to the total
 * printed above it — which is the one thing a curve must never do.
 *
 * PCAF Part A attributes on the **outstanding amount** over total project
 * equity and debt. The figures stored against an investment are attributed at
 * full commitment: the share the book would carry with the facility fully
 * drawn. Scaling them by outstanding ÷ commitment gives the standard's figure,
 * because both are the same project emissions over the same project cost:
 *
 *     stored     = project emissions x (commitment  / project cost)
 *     attributed = project emissions x (outstanding / project cost)
 *                = stored x (outstanding / commitment)
 *
 * Nothing is lost by the change. What the drawdown has not reached is reported
 * on its own line — the emissions that arrive as the money does.
 */

'use strict';

const BASES = ['outstanding', 'commitment'];

/**
 * The share of a facility that is actually outstanding.
 *
 * Fees are not a drawdown. Repayments reduce it. A commitment of zero has no
 * share to scale and attributes nothing rather than dividing by zero, and
 * over-drawing cannot attribute more than the whole share.
 */
function drawnShare(inv, payments = []) {
  const commitment = Number(inv.commitment) || 0;
  if (commitment <= 0) return { share: 0, outstanding: 0, commitment: 0 };
  const outstanding = payments
    .filter(p => p.investmentId === inv.id && p.kind !== 'fee')
    .reduce((t, p) => t + (p.kind === 'repayment' ? -p.amount : p.amount), 0);
  const clamped = Math.max(0, Math.min(commitment, outstanding));
  return { share: clamped / commitment, outstanding: clamped, commitment };
}

/** The factor to apply to a stored figure under a given basis. */
function factorFor(inv, payments, basis) {
  return basis === 'commitment' ? 1 : drawnShare(inv, payments).share;
}

/** One investment's four lines, split into attributed now and still to arrive. */
function splitEmissions(inv, payments, basis) {
  const e = inv.emissions || {};
  const f = factorFor(inv, payments, basis);
  const line = (v) => {
    const full = Number(v) || 0;
    return { attributed: full * f, pending: full * (1 - f), full };
  };
  return {
    incurred:  line(e.incurred_tCO2e),
    forward:   line(e.forward_tCO2e),
    reduction: line(e.reduction_tCO2e),
    avoided:   line(e.avoided_tCO2e),
    share: f,
  };
}

module.exports = { BASES, drawnShare, factorFor, splitEmissions };
