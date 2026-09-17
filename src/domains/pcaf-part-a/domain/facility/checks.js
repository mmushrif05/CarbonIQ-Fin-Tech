// @ts-check
/**
 * What the facility says about the numerator — refusals and findings.
 *
 * The rule is the one `corporate/findings.js` states: a refusal is for an
 * input that would make the figure wrong or uncitable, a finding is for an
 * input that yields a correct figure a reader has to be told something about.
 * A balance larger than the facility is refused — no loan owes more than was
 * sanctioned. A balance taken from the schedule rather than the ledger is a
 * **material** finding: the figure is arithmetically right and the standard
 * asks for the debt actually owed (§5.2, p.56), so the ledger's balance must
 * replace it before the disclosure is filed. A keyed balance that differs
 * from the schedule is **advisory**: a prepayment, an arrear or a restructure
 * changes no figure and a reader is told. The one threshold here — a tenth —
 * is CarbonIQ's and the finding says so.
 */

'use strict';

const { register } = require('../corporate/findings');

const OFF_SCHEDULE_PCT = 10;

function refuse(code, message, remedy) {
  const err = /** @type {import('../../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = 400; err.code = code; if (remedy) err.remedy = remedy;
  return err;
}

/**
 * @param {Object} o
 * @param {ReturnType<import('./schedule').terms>} o.terms
 * @param {number} o.recordedOutstanding
 * @param {{value: number, asOf: string, matured: boolean}} o.scheduled
 * @param {string|null} o.exposureCurrency
 */
function refusals(o) {
  const { terms: t, recordedOutstanding: out } = o;
  if (t.currency && o.exposureCurrency && t.currency !== o.exposureCurrency) {
    throw refuse('CURRENCY_MISMATCH', `The facility is in ${t.currency} and the exposure in ${o.exposureCurrency}; the commitment, the balance and the denominator are one currency.`);
  }
  if (Number(out) > t.committed + 0.005) {
    throw refuse('OUTSTANDING_EXCEEDS_COMMITMENT',
      `The outstanding at year-end (${out}) exceeds the facility’s commitment (${t.committed}). No borrower owes more than was sanctioned (§5.2, p.56).`,
      'Correct the balance, or the commitment if the facility was increased.');
  }
  if (Number(out) > t.disbursed + 0.005) {
    throw refuse('OUTSTANDING_EXCEEDS_DISBURSED',
      `The outstanding at year-end (${out}) exceeds what has been drawn (${t.disbursed}); the outstanding amount is disbursed debt minus repayments (§5.2, p.56).`,
      'Record the drawn amount as it stands at the position date.');
  }
}

/**
 * @param {Object} o
 * @param {ReturnType<import('./schedule').terms>} o.terms
 * @param {number} o.recordedOutstanding
 * @param {{value: number, asOf: string, matured: boolean}} o.scheduled
 */
function findings(o) {
  const { terms: t, recordedOutstanding: out, scheduled: s } = o;
  const found = register();
  const larger = Math.max(Number(out), s.value);
  const variancePct = larger > 0 ? +((Math.abs(Number(out) - s.value) / larger) * 100).toFixed(2) : 0;

  found.when(t.outstandingBasis === 'scheduled', {
    code: 'OUTSTANDING_SCHEDULED_NOT_ACTUAL', severity: 'material', field: 'outstanding.amount',
    statement: `The year-end balance (${out}) was taken from the repayment schedule, not from the loan account.`,
    effect: 'The figure is what the schedule expects the ledger to show at the position date. The standard attributes on the debt actually owed, so the disclosed figure must rest on the ledger’s balance.',
    remedy: 'Replace the balance with the loan account’s balance at the year-end and record the basis as ledger.',
    reference: 'PCAF Part A Third Edition §5.2, p.56; p.33 (a fixed point in time)',
    observed: { scheduled: s.value, asOf: s.asOf },
  });
  found.when(t.outstandingBasis === 'ledger' && variancePct > OFF_SCHEDULE_PCT, {
    code: 'OUTSTANDING_OFF_SCHEDULE', severity: 'advisory', field: 'outstanding.amount',
    statement: `The year-end balance (${out}) differs from the scheduled balance (${s.value}) by ${variancePct}% — more than the ${OFF_SCHEDULE_PCT}% CarbonIQ threshold.`,
    effect: 'Nothing changes: the ledger’s balance is the numerator. A prepayment, an arrear or a restructure is the usual cause, and the life-of-loan projection follows the recorded profile rather than what happened.',
    remedy: 'Confirm the balance against the loan account, and update the repayment profile if the facility was restructured.',
    reference: 'CarbonIQ threshold, stated here; PCAF Part A Third Edition §5.2, p.56',
    observed: { scheduled: s.value, recorded: Number(out), variancePct },
  });
  found.when(s.matured && Number(out) > 0, {
    code: 'FACILITY_MATURED', severity: 'advisory', field: 'facility.maturityDate',
    statement: `The facility matured on ${t.maturity.toISOString().slice(0, 10)} and still carries ${out} at the position date.`,
    effect: 'Nothing changes: a balance owed after maturity is still debt owed, and the attribution stands on it.',
    remedy: 'Record the extension if the facility was rolled, or leave it: an overdue balance is an overdue balance.',
    reference: 'PCAF Part A Third Edition §5.2, p.56',
    observed: { maturity: t.maturity.toISOString().slice(0, 10), recorded: Number(out) },
  });
  return { ...found.result(), variancePct };
}

module.exports = { refusals, findings, OFF_SCHEDULE_PCT };
