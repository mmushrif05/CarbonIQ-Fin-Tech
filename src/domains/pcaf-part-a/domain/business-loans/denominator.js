// @ts-check
/**
 * §5.2's binding of the shared company-value rules
 * (`../corporate/denominator.js`). Same rules as §5.1, different footnote
 * numbers — and a reviewer checking a business loan should be sent to the
 * chapter the loan was assessed under.
 */

'use strict';

const { build } = require('../corporate/denominator');

const { evic, equityPlusDebt, denominator } = build({
  evicRef: 'PCAF Part A Third Edition §5.2, p.57 (EVIC for a listed borrower; footnotes 78–79, 86)',
  edRef: 'PCAF Part A Third Edition §5.2, p.57 (private companies; footnotes 75–77)',
  evicPage: '§5.2, p.57',
  depositsPage: '§5.2, p.58',
  numeratorPage: '§5.2, p.56',
  footnotes: {
    negativeEquity: '75', totalDebt: '76', fallback: '77',
    nonInterestBearing: '79', omission: '79', subsidiary: '81',
  },
});

module.exports = { evic, equityPlusDebt, denominator };
