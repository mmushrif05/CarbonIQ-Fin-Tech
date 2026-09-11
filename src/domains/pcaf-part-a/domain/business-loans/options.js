// @ts-check
/**
 * §5.2's binding of the shared option machinery (`../corporate/options.js`):
 * Table 5.2-1 and this chapter's footnote numbers.
 */

'use strict';

const { build } = require('../corporate/options');

const table = require('../reference').DQ_BUSINESS_LOANS;

const REF = 'PCAF Part A Third Edition §5.2, Table 5.2-1 (p.60) and p.61 (data providers)';

const bound = build(table, {
  reference: REF,
  scope2aFootnote: '87',
  alternativePage: 'p.62',
});

module.exports = {
  optionForScope: bound.optionForScope,
  deriveOptions: bound.deriveOptions,
  reconcileClaim: bound.reconcileClaim,
  TABLE: table,
};
