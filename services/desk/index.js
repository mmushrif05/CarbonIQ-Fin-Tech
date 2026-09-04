/**
 * CarbonIQ FinTech — the Fund Desk
 *
 * One screen over two books: the capital book (what the bank holds and has
 * paid) and the GCF pipeline (what is waiting, how it screens, how it ranks,
 * and how far each candidate is from a submission). Nothing here computes a
 * figure of its own — see `position.js` for why that is a rule rather than a
 * habit.
 */

'use strict';

const { read, effectiveBook, position, rowsFor, pipelineWaiting, DELIVERY_STATES } = require('./position');
const { adoptCandidate, investmentIdFor } = require('./adopt');
const { candidates } = require('./candidates');
const { readiness } = require('./readiness');

module.exports = {
  read, effectiveBook, position, rowsFor, pipelineWaiting,
  adoptCandidate, investmentIdFor,
  candidates, readiness,
  DELIVERY_STATES,
};
