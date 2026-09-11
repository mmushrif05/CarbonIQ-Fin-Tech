// @ts-check
/**
 * PCAF Part C: the report's visual language.
 *
 * The furniture itself is generic PCAF report machinery and lives in
 * `src/platform/reporting/report-standard/theme`, so Part C and Part A render
 * through one theme without either domain importing the other. This barrel
 * keeps the name Part C's report code has always used.
 */

'use strict';

module.exports = require('../../../platform/reporting/report-standard/theme');
