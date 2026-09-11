/**
 * §5.1's binding of the shared option machinery (`../corporate/options.js`).
 *
 * What is §5.1's and not §5.2's lives here: Table 5.1-2, the footnotes this
 * chapter numbers (53 restricting Option 2a to scope 1 and 2, 49 defining
 * verified) and the page permitting an alternative option. The logic is the
 * same in both chapters; the table and the citations are not, and a report
 * citing the wrong chapter's footnote is a report a reviewer cannot check.
 */

'use strict';

const { build } = require('../corporate/options');

const table = require('../reference').DQ_LISTED_EQUITY;

const REF = 'PCAF Part A Third Edition §5.1, Table 5.1-2 (p.46) and p.47 (data providers)';

const bound = build(table, {
  reference: REF,
  scope2aFootnote: '53',
  verifiedFootnote: '49',
  alternativePage: 'p.48',
});

module.exports = {
  optionForScope: bound.optionForScope,
  deriveOptions: bound.deriveOptions,
  reconcileClaim: bound.reconcileClaim,
  TABLE: table,
};
