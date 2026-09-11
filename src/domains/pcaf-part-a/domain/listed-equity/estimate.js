/**
 * §5.1's binding of the shared Annex 10.1 equations
 * (`../corporate/estimate.js`). Table 10.1-1 is this chapter's annex; the
 * footnote numbers are this chapter's too.
 */

'use strict';

const { build } = require('../corporate/estimate');

const { estimate, inflate } = build({
  reference: 'PCAF Part A Third Edition Annex Table 10.1-1 (p.191)',
  tableName: 'Table 5.1-2',
  noFactorFootnote: '41',
  indicatorFootnote: '55',
});

module.exports = { estimate, inflate };
