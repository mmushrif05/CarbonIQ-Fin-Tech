/**
 * CarbonIQ FinTech — the Fund Desk
 *
 * One screen over two books: the capital book (what the bank holds and has
 * paid) and the GCF pipeline (what is waiting). Nothing here computes a figure
 * of its own — see `position.js` for why that is a rule rather than a habit.
 */

'use strict';

const { read, position, rowsFor, pipelineWaiting, DELIVERY_STATES } = require('./position');
const { adoptCandidate, investmentIdFor } = require('./adopt');

module.exports = { read, position, rowsFor, pipelineWaiting, adoptCandidate, investmentIdFor, DELIVERY_STATES };
