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
 * says so in the facility reference and the book total's note.
 *
 * The entity facts that only the bank can state — who prepared, who approved,
 * the base year — used to be left unstated so the disclosure would ask for
 * them. That was right for a form and wrong for a first screen: a chief
 * executive shown a cover reading "Not stated" three times reads a product
 * that is not finished, not a bank that has not finished. So the starter now
 * states illustrative ones, the way the S2 pack states illustrative paragraphs,
 * and one press loads that pack too, so the whole file reads from the first
 * day. Nothing already recorded is ever overwritten, and every illustrative
 * statement is marked as such wherever the document prints it.
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
/**
 * The bank's own SLFRS S2 classification of a starter exposure.
 *
 * Written out per row rather than defaulted, and two rows are left with none
 * at all — the overdraft and the three-wheeler — so the screen shows a real
 * unassessed share rather than a book that classifies itself.
 */
const cl = (transition, tHorizon, physical, pHorizon, opportunity, taxonomyCode) => ({
  transitionRisk: { verdict: transition, horizon: tHorizon },
  physicalRisk: { verdict: physical, horizon: pHorizon },
  opportunity: { verdict: opportunity, taxonomyCode },
});

const EXPOSURES = [
  /* §5.2 — business loans and unlisted equity */
  { assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    identifiers: { accountNumber: 'ST-BL-25-001' },
    climate: cl('vulnerable', 'medium', 'not_vulnerable', null, 'not_aligned', null),
    counterparty: { name: 'Kelani Garments (Pvt) Ltd', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
    outstanding: { amount: 650_000_000, asOf, currency },
    denominator: { totalEquity: 2_400_000_000, totalDebt: 1_900_000_000, asOf, currency },
    emissions: reported(9_800, 2_900, 21_000),
    plausibility: { revenue: 6_100_000_000 } },
  { assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR, instrument: 'business-loan', borrowerListed: true,
    identifiers: { accountNumber: 'ST-BL-25-002' },
    climate: cl('vulnerable', 'short', 'not_vulnerable', null, 'not_aligned', null),
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
    climate: cl('vulnerable', 'long', 'not_assessed', null, 'not_aligned', null),
    counterparty: { name: 'Ceylon Conglomerate Holdings PLC', naceL2: '70' },
    outstanding: { amount: 420_000_000, basis: 'market-value', asOf, currency },
    denominator: { marketCapOrdinary: 96_000_000_000, totalDebtInterestBearing: 41_000_000_000, minorityInterests: 3_000_000_000, asOf, currency },
    emissions: reported(58_000, 31_000, 210_000) },
  { assetClass: 'listed-equity-corporate-bonds', reportingYear: YEAR, instrument: 'corporate-bond', issuerListed: true, onBalanceSheetAtYearEnd: true,
    identifiers: { accountNumber: 'ST-CB-25-001' },
    climate: cl('not_vulnerable', 'long', 'not_vulnerable', null, 'not_aligned', null),
    counterparty: { name: 'Lanka Telecom Infrastructure PLC', naceL2: '61' },
    outstanding: { amount: 250_000_000, basis: 'book-value', asOf, currency },
    denominator: { marketCapOrdinary: 38_000_000_000, totalDebtInterestBearing: 22_000_000_000, asOf, currency },
    emissions: reported(14_200, 27_600, null) },

  /* §5.3 — project finance */
  { assetClass: 'project-finance', reportingYear: YEAR, identifiers: { accountNumber: 'ST-PF-25-001' },
    climate: cl('not_vulnerable', 'long', 'not_vulnerable', null, 'aligned', null),
    projectName: 'Hambantota 10 MW solar park', counterparty: 'Southern Solar (Pvt) Ltd', sector: 'Power', archetype: 'general',
    outstandingAmount: 1_200_000_000, totalProjectEquityPlusDebt: 2_800_000_000, currency,
    projectScope1_tCO2e: 12, projectScope2_tCO2e: 48, dataQualityOption: '2a' },
  { assetClass: 'project-finance', reportingYear: YEAR, identifiers: { accountNumber: 'ST-PF-25-002' },
    climate: cl('not_vulnerable', 'long', 'vulnerable', 'long', 'aligned', 'M4.5'),
    projectName: 'Kalu Ganga mini-hydro', counterparty: 'Ratnapura Hydro (Pvt) Ltd', sector: 'Power', archetype: 'general',
    outstandingAmount: 480_000_000, totalProjectEquityPlusDebt: 1_100_000_000, currency,
    projectScope1_tCO2e: 90, projectScope2_tCO2e: 15, dataQualityOption: '1b' },

  /* §5.4 — commercial real estate */
  { assetClass: 'commercial-real-estate', reportingYear: YEAR, identifiers: { accountNumber: 'ST-CRE-25-001' },
    climate: cl('vulnerable', 'medium', 'vulnerable', 'medium', 'not_aligned', null),
    counterparty: { name: 'Colombo 03 office tower' }, buildingType: 'office', productType: 'purchase',
    exposure: { outstanding: 760_000_000, currency, asOf }, value: { atOrigination: 2_400_000_000 },
    floorArea: { value: 48_000, unit: 'ft2' } },
  { assetClass: 'commercial-real-estate', reportingYear: YEAR, identifiers: { accountNumber: 'ST-CRE-25-002' },
    climate: cl('not_vulnerable', 'medium', 'vulnerable', 'long', 'not_aligned', null),
    counterparty: { name: 'Nugegoda retail arcade' }, buildingType: 'retail', productType: 'refinance',
    exposure: { outstanding: 310_000_000, currency, asOf }, value: { atOrigination: 900_000_000 },
    energy: { electricity_kWh: 412_000, fuel_kWh: 18_000, fuelSource: 'diesel', emissionFactorBasis: 'average' } },

  /* §5.5 — mortgages */
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-001' },
    climate: cl('not_vulnerable', 'long', 'not_vulnerable', null, 'not_aligned', null),
    counterparty: { name: 'Home purchase — Rajagiriya apartment' }, buildingType: 'residential_apartment', productType: 'purchase',
    exposure: { outstanding: 28_000_000, currency, asOf }, value: { atOrigination: 42_000_000 },
    energy: { electricity_kWh: 4_800, fuel_kWh: 900, fuelSource: 'lpg', emissionFactorBasis: 'average' } },
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-002' },
    climate: cl('not_vulnerable', 'long', 'not_vulnerable', null, 'not_aligned', null),
    counterparty: { name: 'Home purchase — Kandy house' }, buildingType: 'residential_house', productType: 'purchase',
    exposure: { outstanding: 19_500_000, currency, asOf }, value: { atOrigination: 31_000_000 },
    floorArea: { value: 2_400, unit: 'ft2' } },
  { assetClass: 'mortgages', reportingYear: YEAR, identifiers: { accountNumber: 'ST-HL-25-003' },
    climate: cl('not_vulnerable', 'long', 'vulnerable', 'medium', 'not_aligned', null),
    counterparty: { name: 'Home purchase — Negombo house' }, buildingType: 'residential_house', productType: 'refinance',
    exposure: { outstanding: 12_000_000, currency, asOf }, value: { atOrigination: 25_000_000 },
    buildingCount: 1 },

  /* §5.6 — motor vehicle loans */
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-001' },
    climate: cl('vulnerable', 'long', 'not_vulnerable', null, 'not_aligned', null),
    counterparty: { name: 'Lease — Toyota Aqua (private)' }, productType: 'lease',
    exposure: { outstanding: 5_400_000, currency, asOf }, value: { atOrigination: 9_800_000 },
    vehicles: [{ vehicleClass: 'car_hybrid', makeModel: 'Toyota Aqua 2021', efficiency: { value: 33.6, unit: 'km/L', cycle: 'WLTC' } }] },
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-002' },
    counterparty: { name: 'Hire purchase — three-wheeler' }, productType: 'hire-purchase',
    exposure: { outstanding: 900_000, currency, asOf }, value: { atOrigination: 1_450_000 },
    vehicles: [{ vehicleClass: 'three_wheeler' }] },
  { assetClass: 'motor-vehicle-loans', reportingYear: YEAR, identifiers: { accountNumber: 'ST-VL-25-003' },
    climate: cl('vulnerable', 'medium', 'not_vulnerable', null, 'not_aligned', null),
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
  /* Illustrative, and replaced from the entity form: a name printed on the
     cover has to be somebody's, and until the bank names its own these say
     whose role each is. */
  preparedBy: { name: 'Head of Sustainability (illustrative)', role: 'Sustainability and climate reporting' },
  approvedBy: { name: 'Chief Financial Officer (illustrative)', role: 'Finance', date: `${YEAR + 1}-03-31` },
  /* The first year reported is the base year until the entity states another. */
  baseYear: YEAR,
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
 * @param {{ register: any, sovereign: any, store: any, settings?: any }} deps
 *   `settings` is the Part A settings service; when handed in, the same press
 *   records the illustrative SLFRS S2 pack unless the entity has already
 *   recorded climate facts, in which case they stand and the pack is skipped.
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
  let settings = Object.keys(merged).length ? await register.saveSettings(orgId, merged) : current;
  /* The S2 pack rides on the same press. Its own refusal — CLIMATE_NOT_EMPTY,
     the facts the entity already recorded stand — is the only reason to skip
     it, and it is reported rather than swallowed. */
  let illustrative = 0;
  if (deps.settings && typeof deps.settings.installIllustrativeClimate === 'function') {
    try {
      const r = await deps.settings.installIllustrativeClimate(orgId);
      illustrative = r.installed; settings = r.settings;
    } catch (/** @type {any} */ err) {
      if (!err || err.code !== 'CLIMATE_NOT_EMPTY') throw err;
    }
  }
  return {
    reportingYear: YEAR,
    installed: { exposures: exposures.length, sovereign: holdings.length, classes: [...new Set(exposures.map(e => e.assetClass))].length + 1, illustrative },
    book, settings,
    note: 'Illustrative starter book: every figure is a placeholder to replace with the facility\'s own. Each row was computed by its engine on the way in.',
  };
}

/**
 * One illustrative loan, filled in, for the walkthrough to record live.
 *
 * The presenter's step is "a loan comes in": the record form opens with every
 * field already filled so the room sees what is collected without watching
 * it typed, changes a figure if it wants to, and presses Record. The shape is
 * the starter's own first business loan, so it is one the engine accepts; the
 * borrower, the amounts and the facility reference are its own, and the
 * reference carries a short random suffix so a rehearsal can record it more
 * than once without the register refusing the second as the same loan.
 *
 * @param {string|number} [reportingYear]
 */
function exampleExposure(reportingYear, variant = 'reported') {
  const y = Number(reportingYear) || YEAR;
  const base = /** @type {any} */ (EXPOSURES[0]);
  const at = `${y}-12-31`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  /* The borrower that does not know its emissions — the common case on a
     Sri Lankan book. Nothing reported: its industry is a held sector and its
     revenue is known, so the engine prices it under Option 3a on the held
     factor per unit of revenue, at score 4, and names the factor set. With
     the revenue cleared it falls to Option 3b on the outstanding alone, at
     score 5. The figures are illustrative and the name says nothing real. */
  if (variant === 'sector') {
    return {
      ...base,
      reportingYear: y,
      identifiers: { accountNumber: `WT-RICE-${suffix}` },
      counterparty: { name: 'Ruhunu Rice Millers (Pvt) Ltd', sector: 'Rice milling', sectorKey: 'agriculture_rice' },
      outstanding: { amount: 180000000, asOf: at, currency: 'LKR' },
      denominator: { totalEquity: 420000000, totalDebt: 380000000, asOf: at, currency: 'LKR' },
      plausibility: { revenue: 1500000000 },
      emissions: {
        scope1: { basis: 'revenue-sector', activity: { revenue: 1500000000, currency: 'LKR' } },
        scope2: { basis: 'revenue-sector', activity: { revenue: 1500000000, currency: 'LKR' } },
        scope3AbsentReason: 'The borrower holds no emissions figures of its own.',
      },
      climate: cl('vulnerable', 'medium', 'vulnerable', 'long', 'not_aligned', null),
    };
  }
  return {
    ...base,
    reportingYear: y,
    identifiers: { accountNumber: `WT-TEX-${suffix}` },
    counterparty: { ...base.counterparty, name: 'Lanka Textiles (Pvt) Ltd', sector: 'Textiles and apparel', financialInstitution: undefined },
    outstanding: { ...base.outstanding, amount: 250000000, asOf: at },
    denominator: { ...base.denominator, totalEquity: 900000000, totalDebt: 600000000, asOf: at },
    emissions: reported(1840, 1260, null, String(y)),
    climate: cl('vulnerable', 'medium', 'not_vulnerable', null, 'not_aligned', null),
  };
}

module.exports = { installStarterBook, exampleExposure, EXPOSURES, HOLDINGS, BOOK, SETTINGS, YEAR };
