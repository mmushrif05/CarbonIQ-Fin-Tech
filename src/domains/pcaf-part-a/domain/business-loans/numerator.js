// @ts-check
/**
 * The outstanding amount — and §5.2 defines it twice, differently (p.56).
 *
 * For a **business loan** it is the value of the debt the borrower owes: the
 * debt disbursed less any repayments, adjusted annually, declining to zero
 * when the loan is repaid. That last clause is the reason this is a module and
 * not a field: a fully repaid loan carries no financed emissions, and a book
 * keyed on the facility limit rather than the drawn balance would report the
 * bank's emissions as flat for the life of every loan on it.
 *
 * For **unlisted equity** it is the institution's share of the investee
 * multiplied by the investee's total book equity — where the share is the
 * number of shares held divided by the total number of shares (footnote 74).
 * It is never the price paid. Two institutions holding the same 5% of the same
 * company report the same numerator whatever they paid for it, which is what
 * makes the attribution factor a property of the company rather than of the
 * deal.
 *
 * One rule is ours rather than the standard's, and it is recorded as such.
 * Footnote 75 sets total equity to zero in the *denominator* where the balance
 * sheet shows it negative, so that every emission is attributed to debt and
 * none to equity. The unlisted-equity numerator is a share of that same total
 * equity. Applying the same rule there gives an equity holder in a company
 * with negative book equity a numerator of zero — the same answer read from
 * the other side. The standard does not say so in as many words, so the
 * assumption travels on the trace rather than being applied silently.
 */

'use strict';

const { traced } = require('../provenance');

const REF = 'PCAF Part A Third Edition §5.2, p.56 (outstanding amount) and footnote 74';

function refuse(code, message) {
  const err = /** @type {import('../../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = 400;
  err.code = code;
  return err;
}

const num = v => (v === undefined || v === null || v === '') ? undefined : Number(v);

/**
 * A business loan: disbursed debt minus repayments.
 *
 * @param {Object} [o]
 * @param {number} [o.amount]       the outstanding balance, where the book already holds it
 * @param {number} [o.disbursed]    total debt disbursed
 * @param {number} [o.repayments]   repayments to date
 * @param {string} [o.asOf]
 * @param {string} [o.currency]
 */
function businessLoanOutstanding(o = {}) {
  if (!o.asOf) {
    throw refuse('OUTSTANDING_DATE_REQUIRED',
      'State the date the outstanding amount is taken at. An institution should use either the calendar or '
      + 'the financial year-end consistently, and say which (§5.2, p.56).');
  }

  const amount = num(o.amount);
  const disbursed = num(o.disbursed);
  const repayments = num(o.repayments);

  if (amount === undefined && disbursed === undefined) {
    throw refuse('OUTSTANDING_REQUIRED',
      'A business loan needs either its outstanding balance, or the debt disbursed and the repayments made. '
      + 'The outstanding amount is disbursed debt minus any repayments and declines to 0 when the loan is '
      + 'fully repaid (§5.2, p.56).');
  }

  if (amount !== undefined && disbursed !== undefined) {
    const derived = disbursed - (repayments || 0);
    if (Math.abs(derived - amount) > 0.005) {
      throw refuse('OUTSTANDING_INCONSISTENT',
        `The outstanding balance entered (${amount}) is not the disbursed debt less repayments `
        + `(${disbursed} − ${repayments || 0} = ${derived}). Supply one or the other, or reconcile them: a `
        + 'book holding two answers to this reports whichever the code happens to read.');
    }
  }

  const value = amount !== undefined ? amount : Number(disbursed) - (repayments || 0);

  if (!Number.isFinite(value) || value < 0) {
    throw refuse('OUTSTANDING_NEGATIVE',
      `The outstanding amount comes to ${value}. Repayments cannot exceed the debt disbursed; the amount `
      + 'declines to 0 and stops there (§5.2, p.56).');
  }

  return traced({
    value: +value.toFixed(2),
    unit: o.currency || '',
    equation: amount !== undefined && disbursed === undefined
      ? 'outstanding amount = debt owed by the borrower at the stated date'
      : 'outstanding amount = disbursed debt − repayments',
    inputs: { amount: value, disbursed: disbursed === undefined ? null : disbursed, repayments: repayments === undefined ? null : repayments, asOf: o.asOf },
    basis: 'Measured from the loan account',
    reference: REF,
    assumptions: value === 0
      ? ['The loan is fully repaid, so the attribution factor is 0 and no emissions are financed through it '
         + 'in this reporting year (§5.2, p.56).']
      : [],
  });
}

/**
 * Unlisted equity: the institution's share of the investee × its total equity.
 *
 * @param {Object} [o]
 * @param {number} [o.sharesHeld]
 * @param {number} [o.totalShares]
 * @param {number} [o.investeeTotalEquity]   from the investee's balance sheet
 * @param {string} [o.asOf]
 * @param {string} [o.currency]
 */
function unlistedEquityOutstanding(o = {}) {
  if (!o.asOf) {
    throw refuse('OUTSTANDING_DATE_REQUIRED',
      'State the balance-sheet date the shareholding and the investee equity are taken at (§5.2, p.56).');
  }

  const held = num(o.sharesHeld);
  const total = num(o.totalShares);
  let equity = num(o.investeeTotalEquity);

  if (!(Number(held) >= 0)) throw refuse('SHARES_HELD_REQUIRED', 'Number of shares the institution holds is required (footnote 74).');
  if (!(Number(total) > 0)) throw refuse('TOTAL_SHARES_REQUIRED', 'Total number of shares of the investee is required and must be positive (footnote 74).');
  if (Number(held) > Number(total)) {
    throw refuse('SHARES_EXCEED_TOTAL',
      `The institution is recorded holding ${held} of ${total} shares. A holding cannot exceed the company.`);
  }
  if (equity === undefined) {
    throw refuse('INVESTEE_EQUITY_REQUIRED',
      'The investee\'s total equity from its balance sheet is required. The outstanding amount for unlisted '
      + 'equity is the institution\'s relative share multiplied by that equity, not the price paid for the '
      + 'stake (§5.2, p.56).');
  }

  const assumptions = [];
  if (equity < 0) {
    assumptions.push(`The investee's total equity on its balance sheet is negative (${equity}). Footnote 75 `
      + 'sets total equity to 0 in the denominator so that every emission is attributed to debt and none to '
      + 'equity; the same figure is the basis of this numerator, so it is set to 0 here too and the '
      + 'attribution factor for this equity holding is 0. The standard states the rule for the denominator '
      + 'and not in terms for the numerator; this is the reading applied, recorded rather than assumed.');
    equity = 0;
  }

  const share = Number(held) / Number(total);
  const value = share * Number(equity);

  return traced({
    value: +value.toFixed(2),
    unit: o.currency || '',
    equation: 'outstanding amount = (shares held ÷ total shares) × investee total equity',
    inputs: { sharesHeld: held, totalShares: total, relativeShare: +share.toFixed(6), investeeTotalEquity: equity, asOf: o.asOf },
    basis: 'Measured from the share register and the investee\'s balance sheet',
    reference: REF,
    assumptions,
  });
}

/** Whichever numerator the classification calls for. */
function outstanding(kind, o) {
  if (kind === 'business-loan') return businessLoanOutstanding(o);
  if (kind === 'unlisted-equity') return unlistedEquityOutstanding(o);
  throw refuse('NUMERATOR_KIND_UNKNOWN', `No outstanding-amount rule for "${kind}".`);
}

module.exports = { businessLoanOutstanding, unlistedEquityOutstanding, outstanding };
