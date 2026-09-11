/**
 * §5.1's binding of the shared company-value rules
 * (`../corporate/denominator.js`): EVIC for a listed company, total equity
 * plus debt for a bond to a private one, on this chapter's pages and footnote
 * numbers.
 */

'use strict';

const { build } = require('../corporate/denominator');

const { evic, equityPlusDebt, denominator } = build({
  evicRef: 'PCAF Part A Third Edition §5.1, p.42 (EVIC definition and footnotes 43–46)',
  edRef: 'PCAF Part A Third Edition §5.1, p.42 (bonds to private companies; footnotes 42, 44)',
  evicPage: '§5.1, p.42',
  depositsPage: '§5.1, p.43',
  numeratorPage: '§5.1, p.41',
  footnotes: {
    negativeEquity: '42', totalDebt: '43', fallback: '44',
    nonInterestBearing: '45', omission: '46', subsidiary: '48',
  },
});

module.exports = { evic, equityPlusDebt, denominator };
