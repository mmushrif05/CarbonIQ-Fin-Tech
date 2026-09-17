// @ts-check
/**
 * What would raise a §5.2 exposure's data-quality score — read off Table
 * 5.2-1, never invented.
 *
 * A score is a measurement of what the bank held about the borrower, and the
 * question a relationship manager asks the moment a loan scores 4 or 5 is
 * what to go back to the borrower for. The table already answers it: every
 * option with a lower score is one the loan could reach, and each row says
 * what it needs. This module lists them in the order a bank climbs — the
 * nearest step first — with the sentence a manager can put to the borrower.
 *
 * The needs are the standard's, phrased for the desk. Nothing here changes a
 * score: the score is set by the option the data earned, in
 * `../data-quality`, and this is the list of options it did not earn.
 */

'use strict';

const dataQuality = require('../data-quality');

const ASSET_CLASS = 'business-loans-unlisted-equity';

/** What each better option needs from the borrower, in the desk's words. */
const NEEDS = Object.freeze({
  '1a': 'The borrower\'s own scope 1 and 2 figures, calculated in line with the GHG Protocol and verified by a named third-party auditor.',
  '1b': 'The borrower\'s own scope 1 and 2 figures as it calculated them, unverified — its energy bills priced with the grid and fuel factors, or a figure from its own inventory.',
  '2a': 'The borrower\'s energy consumption by source over the year — grid electricity, diesel, furnace oil — and its process emissions; the factors in force price each.',
  '2b': 'The borrower\'s production over the year in physical units — tonnes of cement, litres of milk — and an emission factor for that product.',
  '3a': 'The borrower\'s revenue over the year and the held sector factor per unit of revenue.',
  '3b': 'Only the outstanding amount and the held sector factor per unit of assets.',
  '3c': 'Only the outstanding amount, the sector\'s asset turnover and the held sector factor per unit of revenue.',
});

/**
 * The options with a strictly better score than the one earned, nearest first.
 *
 * @param {string|null|undefined} option  the option the exposure earned, e.g. '3a'
 * @returns {{ from: {option: string, score: number}|null, steps: Array<{option: string, score: number, family: string, needs: string, when: string}> }}
 */
function waysToRaise(option) {
  if (!option) return { from: null, steps: [] };
  const here = dataQuality.score(ASSET_CLASS, option);
  const steps = dataQuality.optionsFor(ASSET_CLASS)
    .filter(o => o.option !== 'alt' && Number(o.score) < Number(here.score))
    .sort((a, b) => Number(b.score) - Number(a.score) || String(b.option).localeCompare(String(a.option)))
    .map(o => ({ option: o.option, score: o.score, family: o.family, needs: NEEDS[o.option] || o.when, when: o.when }));
  return { from: { option: here.option, score: here.score }, steps };
}

module.exports = { waysToRaise, NEEDS };
