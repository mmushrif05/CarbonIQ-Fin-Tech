// @ts-check
/**
 * CarbonIQ FinTech — the PCAF Part A sample lending book.
 *
 * Six exposures for the preview organisation, FY2024, shaped so a visitor
 * sees the things the register exists to show rather than six identical rows:
 *
 *   · a term loan to a private manufacturer that reports its emissions —
 *     the clean case, Option 1b, no findings
 *   · an overdraft drawn to a quarter of its own annual average at year-end,
 *     so the footnote 71 finding is on screen with a real movement
 *   · an SME with no financial data at all, estimated under Option 3b at
 *     score 5 with no attribution factor — the floor the improvement plan
 *     ranks first
 *   · a loan to a listed company, attributed on EVIC rather than equity
 *     plus debt, so both denominators are in the book
 *   · a loan to another bank, rolled up apart as PCAF recommends
 *   · a borrower whose emissions figure is three years old, so the lag
 *     finding has something to say
 *
 * The book total is stated, so coverage is a real percentage. Every figure is
 * illustrative and the screen says so.
 */

'use strict';

const YEAR = 2024;
const asOf = '2024-12-31';
const currency = 'LKR';

const reported = (s1, s2, s3, period = '2024') => ({
  scope1: { value: s1, basis: 'reported-unverified', period },
  scope2: { value: s2, basis: 'reported-unverified', period },
  ...(s3 === null ? { scope3AbsentReason: 'The borrower does not measure its scope 3.' }
    : { scope3: { value: s3, basis: 'reported-unverified', period } }),
});

/** The six, in the shape POST /v1/pcaf/part-a/exposures takes. */
const EXPOSURES = [
  {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'TL-24-0117' },
    counterparty: { name: 'Lanka Apparel Manufacturing (Pvt) Ltd', sector: 'Textiles' },
    outstanding: { amount: 480_000_000, asOf, currency },
    denominator: { totalEquity: 1_900_000_000, totalDebt: 2_100_000_000, asOf, currency },
    emissions: reported(11_200, 3_400, 26_000),
  },
  {
    reportingYear: YEAR, instrument: 'overdraft', borrowerListed: false,
    identifiers: { accountNumber: 'OD-24-0442' },
    counterparty: { name: 'Ruhunu Rice Millers (Pvt) Ltd', sector: 'Food processing' },
    outstanding: { amount: 60_000_000, averageOutstanding: 240_000_000, asOf, currency },
    denominator: { totalEquity: 700_000_000, totalDebt: 500_000_000, asOf, currency },
    emissions: reported(2_900, 1_100, null),
  },
  {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'TL-24-0903' },
    counterparty: { name: 'Kandy Hardware Traders', sector: 'Wholesale' },
    outstanding: { amount: 25_000_000, asOf, currency },
    emissions: {
      scope1: { basis: 'assets-sector', activity: { factor: { value: 0.000032, unit: 'tCO2e/LKR', source: 'EXIOBASE v3.8', vintage: 2022 } } },
      scope2: { basis: 'assets-sector', activity: { factor: { value: 0.000011, unit: 'tCO2e/LKR', source: 'EXIOBASE v3.8', vintage: 2022 } } },
      scope3AbsentReason: 'No sector factor for scope 3 is held for this activity.',
    },
  },
  {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: true,
    identifiers: { accountNumber: 'TL-24-0031' },
    counterparty: { name: 'Ceylon Cement Holdings PLC', sector: 'Cement' },
    outstanding: { amount: 1_250_000_000, asOf, currency },
    denominator: { marketCapOrdinary: 18_400_000_000, totalDebtInterestBearing: 9_600_000_000,
      minorityInterests: 300_000_000, asOf, currency },
    emissions: reported(412_000, 38_000, 95_000),
  },
  {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'IB-24-0008' },
    counterparty: { name: 'Sabaragamuwa Development Finance Ltd', sector: 'Finance', financialInstitution: true },
    outstanding: { amount: 300_000_000, asOf, currency },
    denominator: { totalEquity: 2_000_000_000, totalDebt: 1_000_000_000, customerDeposits: 9_000_000_000,
      financialInstitution: true, asOf, currency },
    emissions: reported(180, 640, 41_000),
  },
  {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'TL-24-0210' },
    counterparty: { name: 'Nuwara Eliya Tea Estates (Pvt) Ltd', sector: 'Agriculture' },
    outstanding: { amount: 150_000_000, asOf, currency },
    denominator: { totalEquity: 900_000_000, totalDebt: 600_000_000, asOf, currency },
    emissions: reported(6_800, 900, 4_100, '2021'),
  },
];

const BOOK = { reportingYear: YEAR, totalLoansAndInvestments: 14_000_000_000, currency,
  statedBy: 'Sample book', note: 'Illustrative figure for the sample lending book.' };

/**
 * Install the sample lending book into an organisation.
 *
 * Every exposure goes through `register.record`, so the engine runs on each
 * and a row that the standard would refuse cannot be seeded — a sample book
 * that bypassed its own rules would demonstrate the wrong thing.
 *
 * @param {{ record: Function, stateBook: Function }} register
 * @param {string} orgId
 */
async function seedSampleBook(register, orgId) {
  const exposures = [];
  for (const e of EXPOSURES) exposures.push(await register.record(orgId, e));
  const book = await register.stateBook(orgId, BOOK);
  return { exposures, book };
}

module.exports = { seedSampleBook, EXPOSURES, BOOK, YEAR };
