/**
 * A worked capital book, for demonstrating the dashboard.
 *
 * Every figure here is invented. What is not invented is the arithmetic: the
 * payments really do sum to the deployed figure, the commitments really do sum
 * to the committed figure, and the emission lines really are the ones the
 * roll-up reports. A demo book whose totals do not reconcile teaches a reader
 * to distrust the screen, which is the opposite of what a demo is for.
 *
 * The pipeline is chosen so the weighting slider visibly changes the answer.
 * Jaffna is the carbon pick, Kowloon the financial one, and Colombo sits
 * between them — so a reader who moves the weight from return to carbon sees
 * the order actually change rather than a control that appears to do nothing.
 * A demo where the interesting control is inert is worse than no demo.
 *
 * Ids are fixed, so seeding twice updates the same records rather than
 * doubling the book.
 */

'use strict';

const book = require('./capital-book');

const PORTFOLIOS = [
  {
    id: 'pf_green_buildings',
    name: 'Green Buildings — Asia Pacific',
    currency: 'USD',
    vintage: 2024,
    mandate: 'Retrofit and new-build commercial and residential, EU/ASEAN taxonomy aligned.',
    allocatedBudget: 500_000_000,
  },
  {
    id: 'pf_renewables_sa',
    name: 'Renewables — South Asia',
    currency: 'USD',
    vintage: 2025,
    mandate: 'Grid-connected generation and storage, NDC-aligned under the Sri Lanka taxonomy.',
    allocatedBudget: 250_000_000,
  },
];

/* Held: money is committed or out of the door. These are what the emissions
   ledger counts. */
const HELD = [
  {
    id: 'inv_marina_bay', portfolioId: 'pf_green_buildings',
    name: 'Marina Bay Tower Retrofit', sector: 'Commercial real estate',
    assetType: 'Office', country: 'SG', status: 'deployed',
    commitment: 185_000_000, projectCost: 620_000_000,
    expectedReturnPct: 7.2, tenorYears: 12, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 4210, forward_tCO2e: 1180, reduction_tCO2e: 620, avoided_tCO2e: 0,
      basis: 'Attributed embodied carbon from the tender BOQ plus metered operational energy.',
      dataQuality: { score: 2, option: '1b' },
    },
  },
  {
    id: 'inv_kl_eco', portfolioId: 'pf_green_buildings',
    name: 'KL Eco Residences', sector: 'Residential real estate',
    assetType: 'Residential', country: 'MY', status: 'deployed',
    commitment: 98_000_000, projectCost: 340_000_000,
    expectedReturnPct: 6.4, tenorYears: 10, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 3640, forward_tCO2e: 990, reduction_tCO2e: 410, avoided_tCO2e: 0,
      basis: 'Attributed embodied carbon; operational energy from a modelled benchmark.',
      dataQuality: { score: 3, option: '2b' },
    },
  },
  {
    id: 'inv_changi_hub', portfolioId: 'pf_green_buildings',
    name: 'Changi Business Hub', sector: 'Commercial real estate',
    assetType: 'Office', country: 'SG', status: 'committed',
    commitment: 142_000_000, projectCost: 480_000_000,
    expectedReturnPct: 6.9, tenorYears: 11, taxonomy: 'transition',
    emissions: {
      incurred_tCO2e: 3870, forward_tCO2e: 1420, reduction_tCO2e: 0, avoided_tCO2e: 0,
      basis: 'Attributed embodied carbon from the tender BOQ. Committed, not yet drawn.',
      dataQuality: { score: 3, option: '2b' },
    },
  },
  {
    id: 'inv_mannar_wind', portfolioId: 'pf_renewables_sa',
    name: 'Mannar Wind Phase 1', sector: 'Renewable generation',
    assetType: 'Onshore wind', country: 'LK', status: 'deployed',
    commitment: 62_000_000, projectCost: 148_000_000,
    expectedReturnPct: 9.1, tenorYears: 15, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 210, forward_tCO2e: 380, reduction_tCO2e: 0, avoided_tCO2e: 24_600,
      basis: 'Avoided against the Sri Lankan combined margin. Reported separately from the inventory.',
      dataQuality: { score: 2, option: '2a' },
    },
  },
  {
    id: 'inv_hambantota_solar', portfolioId: 'pf_renewables_sa',
    name: 'Hambantota Solar Extension', sector: 'Renewable generation',
    assetType: 'Solar PV', country: 'LK', status: 'deployed',
    commitment: 34_000_000, projectCost: 91_000_000,
    expectedReturnPct: 8.4, tenorYears: 20, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 120, forward_tCO2e: 260, reduction_tCO2e: 0, avoided_tCO2e: 11_400,
      basis: 'Avoided against the Sri Lankan combined margin. Reported separately from the inventory.',
      dataQuality: { score: 3, option: '2b' },
    },
  },
];

/* Waiting. Nothing here is in any total until it is committed. */
const PIPELINE = [
  {
    id: 'inv_colombo_cooling', portfolioId: 'pf_green_buildings',
    name: 'Colombo Port City District Cooling', sector: 'Infrastructure',
    assetType: 'District energy', country: 'LK', status: 'pipeline',
    commitment: 45_000_000, projectCost: 120_000_000,
    expectedReturnPct: 8.8, tenorYears: 14, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 0, forward_tCO2e: 2900, reduction_tCO2e: 3200, avoided_tCO2e: 0,
      basis: 'Reduction against the connected buildings\' own base year.',
      dataQuality: { score: 3, option: '2b' },
    },
  },
  {
    id: 'inv_jaffna_minigrid', portfolioId: 'pf_renewables_sa',
    name: 'Jaffna Solar Mini-grid', sector: 'Renewable generation',
    assetType: 'Solar PV', country: 'LK', status: 'pipeline',
    commitment: 12_000_000, projectCost: 28_000_000,
    expectedReturnPct: 7.5, tenorYears: 18, taxonomy: 'green',
    emissions: {
      incurred_tCO2e: 0, forward_tCO2e: 90, reduction_tCO2e: 0, avoided_tCO2e: 8600,
      basis: 'Avoided against the combined margin; diesel displacement in the off-grid segment.',
      dataQuality: { score: 3, option: '2b' },
    },
  },
  {
    id: 'inv_penang_logistics', portfolioId: 'pf_green_buildings',
    name: 'Penang Logistics Park Phase 2', sector: 'Industrial',
    assetType: 'Warehousing', country: 'MY', status: 'pipeline',
    commitment: 71_000_000, projectCost: 210_000_000,
    expectedReturnPct: 6.1, tenorYears: 9, taxonomy: 'transition',
    emissions: {
      incurred_tCO2e: 0, forward_tCO2e: 2180, reduction_tCO2e: 240, avoided_tCO2e: 0,
      basis: 'Attributed embodied carbon from the concept design.',
      dataQuality: { score: 4, option: '3a' },
    },
  },
  {
    id: 'inv_kowloon_refit', portfolioId: 'pf_green_buildings',
    name: 'Kowloon Gateway Refit', sector: 'Mixed-use real estate',
    assetType: 'Mixed-Use', country: 'HK', status: 'pipeline',
    commitment: 88_000_000, projectCost: 260_000_000,
    expectedReturnPct: 12.5, tenorYears: 8, taxonomy: 'transition',
    emissions: {
      incurred_tCO2e: 0, forward_tCO2e: 3120, reduction_tCO2e: 150, avoided_tCO2e: 0,
      basis: 'Attributed embodied carbon from the concept design.',
      dataQuality: { score: 4, option: '3a' },
    },
  },
  {
    /* Deliberately unpriced. It exercises the path where a candidate cannot be
       ranked, and proves the screen lists it unscored rather than placing it
       last — absent evidence is not low impact. */
    id: 'inv_trincomalee_biomass', portfolioId: 'pf_renewables_sa',
    name: 'Trincomalee Biomass', sector: 'Renewable generation',
    assetType: 'Biomass', country: 'LK', status: 'pipeline',
    commitment: 26_000_000, projectCost: 64_000_000,
    expectedReturnPct: null, tenorYears: 12, taxonomy: 'transition',
    emissions: {
      incurred_tCO2e: 0, forward_tCO2e: 140, reduction_tCO2e: 0, avoided_tCO2e: 5200,
      basis: 'Avoided against the combined margin. Return not yet priced.',
      dataQuality: null,
    },
  },
];

/* Disbursed 337M, repaid 15M, so 322M of the 750M allocated is deployed.
   Changi is committed and undrawn on purpose: a book can be two-thirds
   committed and well under half deployed, and the dashboard has to be able to
   say so. */
const PAYMENTS = [
  { id: 'pay_mb_1', investmentId: 'inv_marina_bay',        kind: 'disbursement', amount: 120_000_000, date: '2025-03-14', reference: 'Tranche 1' },
  { id: 'pay_mb_2', investmentId: 'inv_marina_bay',        kind: 'disbursement', amount: 65_000_000,  date: '2025-09-02', reference: 'Tranche 2' },
  { id: 'pay_mb_3', investmentId: 'inv_marina_bay',        kind: 'repayment',    amount: 15_000_000,  date: '2026-06-30', reference: 'Scheduled amortisation' },
  { id: 'pay_kl_1', investmentId: 'inv_kl_eco',            kind: 'disbursement', amount: 70_000_000,  date: '2025-05-21', reference: 'Tranche 1' },
  { id: 'pay_mw_1', investmentId: 'inv_mannar_wind',       kind: 'disbursement', amount: 62_000_000,  date: '2025-11-08', reference: 'Full drawdown' },
  { id: 'pay_hs_1', investmentId: 'inv_hambantota_solar',  kind: 'disbursement', amount: 20_000_000,  date: '2026-01-19', reference: 'Tranche 1' },
  { id: 'pay_fee_1', investmentId: 'inv_marina_bay',       kind: 'fee',          amount: 1_200_000,   date: '2025-03-14', reference: 'Arrangement fee' },
];

/**
 * Write the worked book. Idempotent — the ids are fixed, so a second call
 * refreshes rather than duplicates.
 */
async function seedCapitalDemo(orgId) {
  const created = { portfolios: 0, investments: 0, payments: 0 };

  for (const p of PORTFOLIOS) {
    const existing = await book.getPortfolio(orgId, p.id);
    if (existing) await book.updatePortfolio(orgId, p.id, p);
    else { await book.createPortfolio(orgId, p); created.portfolios += 1; }
  }

  for (const i of [...HELD, ...PIPELINE]) {
    const existing = await book.getInvestment(orgId, i.id);
    if (existing) await book.updateInvestment(orgId, i.id, i);
    else { await book.createInvestment(orgId, i); created.investments += 1; }
  }

  for (const pay of PAYMENTS) {
    await book.createPayment(orgId, pay);
    created.payments += 1;
  }

  return {
    seeded: created,
    note: 'A worked book with invented figures. Every total reconciles: payments sum to the '
      + 'deployed figure, commitments to the committed figure, and the emission lines to the '
      + 'roll-up. Replace it with your own portfolios whenever you are ready.',
  };
}

/**
 * The same book, assembled in memory and never written.
 *
 * A dashboard whose book is empty shows an empty-state note and no figures,
 * which is correct but leaves nothing on screen to look at — and on a
 * serverless deployment with no Firebase the seed endpoint is refused, so
 * there is no way to put figures there at all. Computing the worked book
 * through the real engine costs nothing, needs no storage, and is labelled a
 * sample on its own face, so it can never be mistaken for a position.
 *
 * The payments carry their portfolio, which the seeded path gets from the
 * stored investment.
 */
function sampleBook() {
  const investments = [...HELD, ...PIPELINE].map(i => ({ ...i }));
  const portfolioOf = (investmentId) =>
    (investments.find(i => i.id === investmentId) || {}).portfolioId || null;
  return {
    portfolios: PORTFOLIOS.map(p => ({ ...p })),
    investments,
    payments: PAYMENTS.map(pay => ({ ...pay, portfolioId: portfolioOf(pay.investmentId) })),
    storage: null,
  };
}

module.exports = { seedCapitalDemo, sampleBook, PORTFOLIOS, HELD, PIPELINE, PAYMENTS };
