// @ts-check
/**
 * CarbonIQ FinTech — the PCAF Part A §5.9 sample sovereign book.
 *
 * A few holdings for the preview organisation, FY2024, shaped so a visitor
 * sees what the sovereign register exists to show rather than identical rows:
 *
 *   · Singapore and Hong Kong, from the dataset, reproducing the standard's
 *     own worked example (106 and 91 tCO2e per $1M) — and each raising the
 *     emissions-lag and one-sided-LULUCF findings, because the shipped figures
 *     are EDGAR 2018 excl. LULUCF only
 *   · Sri Lanka, the provisional country, recorded at Option 3b because a
 *     provisional figure earns no option on its own — the proxy/lowest-quality
 *     line the improvement plan ranks first
 *
 * The book total is shared with the §5.2 lending book and is stated by that
 * seed, so this one does not touch it. Every figure is illustrative and the
 * screen says so; a released dataset replaces it entirely.
 */

'use strict';

const YEAR = 2024;

/** In the shape POST /v1/pcaf/part-a/sovereign/exposures takes. */
const HOLDINGS = [
  { reportingYear: YEAR, country: 'SG', instrument: 'sovereign-bond',
    exposure: { amount: 4e6, currency: 'USD' }, identifiers: { accountNumber: 'SAMPLE-SG-2024' } },
  { reportingYear: YEAR, country: 'HK', instrument: 'sovereign-bond',
    exposure: { amount: 2.5e6, currency: 'USD' }, identifiers: { accountNumber: 'SAMPLE-HK-2024' } },
  { reportingYear: YEAR, country: 'LK', instrument: 'sovereign-loan',
    exposure: { amount: 12e6, currency: 'USD' }, dataQualityOption: '3b', identifiers: { accountNumber: 'SAMPLE-LK-2024' } },
];

/**
 * Install the sample sovereign book. Each holding goes through
 * `sovereignRegister.record`, so the engine runs on each and a refusal would
 * surface here rather than in a silent bad row. Idempotent: a year already
 * holding sovereign exposures is left alone.
 *
 * @param {{ record: Function, years: Function }} sovereignRegister
 * @param {string} orgId
 */
async function seedSovereignBook(sovereignRegister, orgId) {
  const years = await sovereignRegister.years(orgId);
  if (years.some(y => String(y.reportingYear) === String(YEAR))) return { seeded: 0, skipped: true };
  const holdings = [];
  for (const h of HOLDINGS) holdings.push(await sovereignRegister.record(orgId, h));
  return { seeded: holdings.length, year: YEAR };
}

module.exports = { seedSovereignBook, HOLDINGS, YEAR };
