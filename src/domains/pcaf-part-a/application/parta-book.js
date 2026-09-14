// @ts-check
/**
 * The book total — what coverage is a percentage of.
 *
 * One row per reporting year holding the entity's own total loans and
 * investments. It is a separate record from the settings because it is a
 * different fact with a different owner and a different cadence: the total is
 * a figure per year that only the entity can state, and folding it into a
 * settings blob would make "we have not stated it" and "it is zero"
 * indistinguishable — coverage against a zero book is unanswerable rather
 * than 100%. Shared by every Part A register: the §5.2 lending book and the
 * §5.9 sovereign book compute coverage against this one denominator.
 */

'use strict';

const store = require('../../../platform/database/store');
const repo = require('../infrastructure/store');

const _now = () => new Date().toISOString();

function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {import('../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/**
 * State the reporting year's total loans and investments.
 *
 * @param {string} orgId
 * @param {{ reportingYear: string|number, totalLoansAndInvestments: number, currency?: string, statedBy?: string, note?: string }} input
 */
async function stateBook(orgId, { reportingYear, totalLoansAndInvestments, currency, statedBy, note }) {
  if (!reportingYear) throw refuse('REPORTING_YEAR_REQUIRED', 'State which reporting year this book total is for.');
  const total = Number(totalLoansAndInvestments);
  if (!Number.isFinite(total) || total <= 0) {
    throw refuse('BOOK_TOTAL_INVALID',
      'Total loans and investments must be a positive number. Coverage is assessed outstanding over the '
      + 'whole book (PCAF Disclosure Checklist Part A, p.124); a book of zero has no coverage rather than '
      + 'full coverage.');
  }
  store.assertWritable();

  const now = _now();
  const existing = await repo.getBook(orgId, reportingYear);
  const record_ = {
    reportingYear: String(reportingYear),
    orgId: String(orgId),
    totalLoansAndInvestments: total,
    currency: currency || null,
    basis: 'declared',
    basisNote: 'Stated by the reporting entity. Nothing in this system can derive an institution\'s total '
      + 'loans and investments, so it is recorded as declared and travels with the coverage figure it '
      + 'produces.',
    statedBy: statedBy || null,
    note: note || null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  await repo.saveBook(orgId, record_);
  return record_;
}

async function getBook(orgId, reportingYear) {
  return repo.getBook(orgId, reportingYear);
}

module.exports = { stateBook, getBook };
