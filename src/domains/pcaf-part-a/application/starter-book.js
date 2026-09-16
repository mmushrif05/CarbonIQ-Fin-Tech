// @ts-check
/**
 * The starter book — an illustrative lending book across every built Part A
 * class, for a bank's own organisation to load with one press and then edit
 * to its real figures.
 *
 * On a serverless deployment there is no shell to run a recorder from, so a
 * bank's first book reaches the database the way the GCF starter projects do:
 * `POST /v1/pcaf/part-a/starter` (the `write` scope) records this book into
 * the signed-in organisation through the same services and the same engines
 * a keyed exposure goes through — every row is computed, and a row the
 * standard would refuse cannot be seeded. `npm run book:install -- --org <id>`
 * is the same installer from a shell.
 *
 * It is NOT the preview sample: the sample is the shared read-only book every
 * visitor sees; this is a bank's own starting point, recorded and editable,
 * and it refuses to load over a year that already holds exposures so it can
 * never overwrite a book somebody has begun. Every figure is illustrative and
 * says so in the facility reference and the book total's note; the entity
 * facts that only the bank can state — who prepared, who approved — are left
 * unstated so the disclosure asks for them rather than printing a default.
 *
 * Two or three exposures per class, chosen so that each shape the engines
 * can take is on the screen: a borrower that reports and one on the sector
 * factor; a listed holding on EVIC and a bond; a solar project; an office
 * keyed in square feet and a metered retail unit; a metered apartment, a house
 * on its floor area and one on the count alone; a hybrid on the registration
 * certificate, a three-wheeler on its class, a fleet on fuel invoices with an
 * electric car on its odometer; and two sovereign holdings.
 */

'use strict';

const YEAR = 2025;
const asOf = `${YEAR}-12-31`;
const currency = 'LKR';

const reported = (s1, s2, s3, period = String(YEAR)) => ({
  scope1: { value: s1, basis: 'reported-unverified', period },
  scope2: { value: s2, basis: 'reported-unverified', period },
  ...(s3 === null ? { scope3AbsentReason: 'The borrower does not measure its scope 3.' }
    : { scope3: { value: s3, basis: 'reported-unverified', period } }),
});

/** In the shape POST /v1/pcaf/part-a/exposures takes, class by class. */
const EXPOSURES = [
  /* §5.2 — business loans and unlisted equity */
  { assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'ST-BL-25-001' },
    counterparty: { name: 'Kelani Garments (Pvt) Ltd', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
    outstanding: { amount: 650_000_000, asOf, currency },
    denominator: { totalEquity: 2_400_000_000, totalDebt: 1_900_000_000, asOf, currency },
    emissions: reported(9_800, 2_900, 21_000),
    plausibility: { revenue: 6_100_000_000 } },
  { assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR, instrument: 'business-loan', borrowerListed: true,
    identifiers: { accountNumber: 'ST-BL-25-002' },
    counterparty: { name: 'Lanka Ceramics PLC', sector: 'Ceramics', sectorKey: 'manufacturing_cement' },
    outstanding: { amount: 900_000_000, asOf, currency },
    denominator: { marketCapOrdinary: 14_000_000_000, totalDebtInterestBearing: 6_500_000_000, minorityInterests: 200_000_000, asOf, currency },
    emissions: reported(146_000, 12_500, 38_000) },
  { assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR, instrument: 'overdraft', borrowerListed: false,
    identifiers: { accountNumber: 'ST-BL-25-003' },
    counterparty: { name: 'Galle Fresh Produce Traders', sector: 'Wholesale', sectorKey: 'wholesale_retail' },
    outstanding: { amount: 35_000_000, averageOutstanding: 60_000_000, asOf, currency },
    emissions: { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' },
      scope3AbsentReason: 'No scope 3 figure is held for this borrower.' } },

  /* §5.1 — listed equity and corporate bonds */
  { assetClass: 'listed-equity-corporate-bonds', reportingYear: YEAR, instrument: 'listed-equity', onBalanceSheetAtYearEnd: true,
    identifiers: { accountNumber: 'ST-EQ-25-001' },
    counterparty: { name: 'Ceylon Conglomerate Holdings PLC', naceL2: '70' },
    outstanding: { amount: 420_000_000, basis: 'market-value', asOf, currency },
    denominator: { marketCapOrdinary: 96_000_000_000, totalDebtInterestBearing: 41_000_000_000, minorityInterests: 3_000_000_000, asOf, currency },
    emissions: reported(58_000, 31_000, 210_000) },
  { assetClass: 'listed-equity-corporate-bonds', reportingYear: YEAR, instrument: 'corporate-bond', issuerListed: true, onBalanceSheetAtYearEnd: true,
    identifiers: { accountNumber: 'ST-CB-25-001' },
    counterparty: { name: 'Lanka Telecom Infrastructure PLC', naceL2: '61' },
    outstanding: { amount: 250_000_000, basis: 'book-value', asOf, currency },
    denominator: { marketCapOrdinary: 38_000_000_000, totalDebtInterestBearing: 22_000_000_000, asOf, currency },
    emissions: reported(14_200, 27_600, null) },

  /* §5.3 — project finance */
  { assetClass: 'project-finance', reportingYear: YEAR, identifiers: { accountNumber: 'ST-PF-25-001' },
    projectName: 'Hambantota 10 MW solar park', counterparty: 'Southern Solar (Pvt) Ltd', sector: 'Power', archetype: 'general',
    outstandingAmount: 1_200_000_000, totalProjectEquityPlusDebt: 2_800_000_000, currency,
    projectScope1_tCO2e: 12, projectScope2_tCO2e: 48, dataQualityOption: '2a' },
  { assetClass: 'project-finance', reportingYear: YEAR, identifiers: { accountNumber: 'ST-PF-25-002' },
    projectName: 'Kalu Ganga mini-hydro', counterparty: 'Ratnapura Hydro (Pvt) Ltd', sector: 'Power', archetype: 'general',
    outstandingAmount: 480_000_000, totalProjectEquityPlusDebt: 1_100_000_000, currency,
    projectScope1_tCO2e: 90, projectScope2_tCO2e: 15, dataQualityOption: '1b' },

  /* §5.4 — commercial real estate */
  { assetClass: 'commercial-real-estate', reportingYear: YEAR, identifiers: { accountNumber: 'ST-CRE-25-001' },
    counterparty: { name: 'Colombo 03 office tower' }, buildingType: 'office', productType: 'purchase',
    exposure: { outstanding: 760_000_000, currency, asOf }, value: { atOrigination: 2_400_000_000 },
    floorArea: { value: 48_000, unit: 'ft2' } },
  { assetClass: 'commercial-real-estate', reportingYear: YEAR, identifiers: { accountNumber: 'ST-CRE-25-002' },
    counterparty: { name: 'Nugegoda retail arcade' }, buildingType: 'retail', productType: 'refinance',
    exposure: { outstanding: 310_000_000, currency, asOf }, value: { atOrigination: 900_000_000 },
    energy: { electricity_kWh: 412_000, fuel_kWh: 18_000, fuelSource: 'diesel', emissionFactorBasis: 'average' } },

  /* §5.5 — mortgages */
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-001' },
    counterparty: { name: 'Home purchase — Rajagiriya apartment' }, buildingType: 'residential_apartment', productType: 'purchase',
    exposure: { outstanding: 28_000_000, currency, asOf }, value: { atOrigination: 42_000_000 },
    energy: { electricity_kWh: 4_800, fuel_kWh: 900, fuelSource: 'lpg', emissionFactorBasis: 'average' } },
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-002' },
    counterparty: { name: 'Home purchase — Kandy house' }, buildingType: 'residential_house', productType: 'purchase',
    exposure: { outstanding: 19_500_000, currency, asOf }, value: { atOrigination: 31_000_000 },
    floorArea: { value: 2_400, unit: 'ft2' } },
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-003' },
    counterparty: { name: 'Home purchase — Negombo house' }, buildingType: 'residential_house', productType: 'refinance',
    exposure: { outstanding: 12_000_000, currency, asOf }, value: { atOrigination: 25_000_000 },
    buildingCount: 1 },

  /* §5.6 — motor vehicle loans */
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-001' },
    counterparty: { name: 'Lease — Toyota Aqua (private)' }, productType: 'lease',
    exposure: { outstanding: 5_400_000, currency, asOf }, value: { atOrigination: 9_800_000 },
    vehicles: [{ vehicleClass: 'car_hybrid', makeModel: 'Toyota Aqua 2021', efficiency: { value: 33.6, unit: 'km/L', cycle: 'WLTC' } }] },
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-002' },
    counterparty: { name: 'Hire purchase — three-wheeler' }, productType: 'hire-purchase',
    exposure: { outstanding: 900_000, currency, asOf }, value: { atOrigination: 1_450_000 },
    vehicles: [{ vehicleClass: 'three_wheeler' }] },
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-003' },
    counterparty: { name: 'Fleet facility — Lanka Logistics (Pvt) Ltd' }, productType: 'vehicle-loan',
    exposure: { outstanding: 64_000_000, currency, asOf }, value: { atOrigination: 110_000_000 },
    vehicles: [
      { id: 'lorry-1', vehicleClass: 'lorry', fuelConsumed: { diesel_L: 14_200 } },
      { id: 'lorry-2', vehicleClass: 'lorry', fuelConsumed: { diesel_L: 12_900 } },
      { id: 'ev-1', vehicleClass: 'car_electric', makeModel: 'BYD Atto 3', efficiency: { value: 13.8, unit: 'kWh/100km', cycle: 'WLTP' }, distance: { value_km: 21_400, basis: 'actual', source: 'odometer at origination and year-end' } },
    ] },
];

/** In the shape POST /v1/pcaf/part-a/sovereign/exposures takes. */
const HOLDINGS = [
  { reportingYear: YEAR, country: 'LK', instrument: 'sovereign-bond', exposure: { amount: 24_000_000, currency: 'USD' },
    dataQualityOption: '3b', identifiers: { accountNumber: 'ST-SOV-25-001' } },
  { reportingYear: YEAR, country: 'LK', instrument: 'sovereign-loan', exposure: { amount: 9_000_000, currency: 'USD' },
    dataQualityOption: '3b', identifiers: { accountNumber: 'ST-SOV-25-002' } },
];

const BOOK = { reportingYear: YEAR, totalLoansAndInvestments: 125_000_000_000, currency,
  statedBy: 'Starter book — confirm from the audited statement of financial position',
  note: 'Illustrative starter figure; replace with total loans and investments at the fiscal year-end.' };

/* The entity's boundary and basis are started; who prepared and who approved
   are the entity's own claims and are left unstated so the disclosure asks
   for them rather than printing a default. */
const SETTINGS = {
  consolidationApproach: 'operational_control',
  boundaryNote: 'Starter boundary: the bank and its wholly owned subsidiaries. Confirm against the financial statements.',
  fiscalYearEnd: '12-31',
  gwpBasis: 'IPCC AR6, 100-year',
  assetClassesNotReported: [
    { assetClass: 'use-of-proceeds', reason: 'No labelled or allocated structures on the book.' },
    { assetClass: 'securitizations', reason: 'No securitised positions on the book.' },
    { assetClass: 'sub-sovereign-debt', reason: 'No sub-sovereign exposures on the book.' },
  ],
};

/** @param {string} code @param {string} message @param {number} statusCode @param {string} remedy */
function refuse(code, message, statusCode, remedy) {
  const err = /** @type {import('../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = statusCode; err.code = code; err.remedy = remedy;
  return err;
}

/**
 * Install the starter book into an organisation.
 *
 * Refuses when the year already holds exposures in either register, so it
 * never overwrites a book somebody has begun; refuses the preview
 * organisation, whose only book is the shared sample. Every exposure goes
 * through the services, so the engines run on each.
 *
 * @param {{ register: any, sovereign: any, store: any }} deps
 * @param {string} orgId
 * @param {{ by?: string|null, reportingEntity?: string|null }} [opts]
 */
async function installStarterBook(deps, orgId, opts = {}) {
  const { register, sovereign, store } = deps;
  if (String(orgId) === 'preview') {
    throw refuse('PREVIEW_NOT_A_BOOK', 'The preview organisation holds the shared sample book and takes no starter book.', 409,
      'Sign in to your own organisation and load the starter book there.');
  }
  store.assertWritable();
  const [years, sovYears] = await Promise.all([register.years(orgId), sovereign.years(orgId)]);
  const held = years.find(y => String(y.reportingYear) === String(YEAR));
  const heldSov = sovYears.find(y => String(y.reportingYear) === String(YEAR));
  if (held || heldSov) {
    const what = [held ? `${held.exposures} exposure(s) in the lending book` : null, heldSov ? 'sovereign holdings' : null].filter(Boolean).join(' and ');
    throw refuse('STARTER_NOT_EMPTY',
      `This organisation already holds ${what} for FY${YEAR}, so the starter book was not loaded — it would not overwrite a book you have begun.`,
      409, 'Edit the exposures you have, or remove them first if you meant to start over.');
  }
  const exposures = [];
  for (const e of EXPOSURES) exposures.push(await register.record(orgId, e));
  const holdings = [];
  for (const h of HOLDINGS) holdings.push(await sovereign.record(orgId, h));
  const book = await register.stateBook(orgId, { ...BOOK, statedBy: opts.by ? `${opts.by} (starter book)` : BOOK.statedBy });
  const current = await register.getSettings(orgId);
  /* The entity's own facts are never overwritten: a name or an approver
     already recorded stands, and only the unstated starter facts are added. */
  const merged = /** @type {any} */ ({ ...SETTINGS });
  for (const k of Object.keys(SETTINGS)) if (current && current[k] !== null && current[k] !== undefined && current[k] !== '' && !(Array.isArray(current[k]) && !current[k].length)) delete merged[k];
  if (opts.reportingEntity && !(current && current.reportingEntity)) merged.reportingEntity = opts.reportingEntity;
  const settings = Object.keys(merged).length ? await register.saveSettings(orgId, merged) : current;
  return {
    reportingYear: YEAR,
    installed: { exposures: exposures.length, sovereign: holdings.length, classes: [...new Set(exposures.map(e => e.assetClass))].length + 1 },
    book, settings,
    note: 'Illustrative starter book: every figure is a placeholder to replace with the facility\'s own. Each row was computed by its engine on the way in.',
  };
}

module.exports = { installStarterBook, EXPOSURES, HOLDINGS, BOOK, SETTINGS, YEAR };
