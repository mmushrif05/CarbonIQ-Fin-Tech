// @ts-check
/**
 * §5.2's binding of the shared Annex 10.1 equations
 * (`../corporate/estimate.js`). Table 10.1-2 is this chapter's annex.
 */

'use strict';

const { build } = require('../corporate/estimate');

const { estimate, inflate } = build({
  reference: 'PCAF Part A Third Edition Annex Table 10.1-2',
  tableName: 'Table 5.2-1',
  noFactorFootnote: '73',
  indicatorFootnote: '88',
});

module.exports = { estimate, inflate };
