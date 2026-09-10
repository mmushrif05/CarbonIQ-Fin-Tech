// @ts-check
/**
 * The assurance posture behind a Part C document.
 *
 * The evidence is assembled once, in
 * `src/domains/baseline/application/assurance-position.js`, and read from here
 * so that both Part C document builders — the per-assessment report and the
 * annual disclosure — go through one function and cannot state different
 * postures for one book.
 */

'use strict';

const { positionFor } = require('../../baseline/application/assurance-position');

module.exports = { positionFor };
