// @ts-check
/**
 * Joi validation for the PCAF Part A §5.2 endpoints.
 *
 * Thin, deliberately. The engine refuses what the standard refuses, and it
 * refuses with the clause and the remedy; a schema restating those rules would
 * be a second place to keep in step and would answer with a generic message
 * where the engine answers with the reason.
 *
 * What the schema does own is shape: a field misspelled in a payload should be
 * a named 400 and not a silently ignored key, because an institution whose
 * `averageOutstanding` never arrived would see the footnote 71 check quietly
 * not run and conclude the feature does not work.
 */

'use strict';

const Joi = require('joi');

const SECTOR_KEYS = Object.keys(require('../../domain/reference').SECTORS.sectors);

const money = Joi.number().min(0);

const scopeEntry = Joi.object({
  value: Joi.number().min(0).optional(),
  basis: Joi.string().max(60).required(),
  period: Joi.alternatives(Joi.number(), Joi.string().max(20)).optional(),
  source: Joi.string().max(300).optional(),
  verifier: Joi.string().max(200).optional(),
  provider: Joi.string().max(200).optional(),
  providerMethod: Joi.string().max(60).optional(),
  justification: Joi.string().max(1000).optional(),
  method: Joi.string().max(200).optional(),
  alreadyAttributed: Joi.boolean().optional(),
  /* The inputs an estimation option needs. Left open because Annex 10.1 gives
     a different shape per option and the engine names what is missing. */
  activity: Joi.object().unknown(true).optional(),
}).unknown(false);

const outstanding = Joi.object({
  amount: money.optional(),
  disbursed: money.optional(),
  repayments: money.optional(),
  /* Unlisted equity. */
  sharesHeld: Joi.number().min(0).optional(),
  totalShares: Joi.number().positive().optional(),
  investeeTotalEquity: Joi.number().optional(),
  /* Footnote 71 — what the facility actually carried through the year. */
  averageOutstanding: money.optional(),
  peakOutstanding: money.optional(),
  asOf: Joi.string().max(30).required(),
  currency: Joi.string().max(10).optional(),
}).unknown(false);

const denominator = Joi.object({
  marketCapOrdinary: Joi.number().optional(),
  marketCapPreferred: Joi.number().optional(),
  totalDebtInterestBearing: Joi.number().optional(),
  totalDebtNonInterestBearing: Joi.number().optional(),
  minorityInterests: Joi.number().optional(),
  totalEquity: Joi.number().optional(),
  totalDebt: Joi.number().optional(),
  totalAssets: Joi.number().optional(),
  customerDeposits: Joi.number().optional(),
  financialInstitution: Joi.boolean().optional(),
  asOf: Joi.string().max(30).optional(),
  currency: Joi.string().max(10).optional(),
  entity: Joi.string().max(200).optional(),
  issuer: Joi.string().max(200).optional(),
  recourseReason: Joi.string().max(1000).optional(),
}).unknown(false);

const exposureSchema = Joi.object({
  identifiers: Joi.object({
    id: Joi.string().max(120).optional(),
    lei: Joi.string().max(40).optional(),
    accountNumber: Joi.string().max(80).optional(),
  }).unknown(false).optional(),

  counterparty: Joi.object({
    name: Joi.string().max(200).optional(),
    country: Joi.string().max(80).optional(),
    sector: Joi.string().max(120).optional(),
    /* The held vocabulary (data/pcaf-parta/sectors.json). A key resolves the
       Option 3 factor and the intensity band; a free-text sector is mapped by
       name and the mapping recorded, or reported not held. */
    sectorKey: Joi.string().valid(...SECTOR_KEYS).optional(),
    naceL2: Joi.string().max(20).optional(),
    financialInstitution: Joi.boolean().optional(),
  }).unknown(false).optional(),

  reportingYear: Joi.number().integer().min(2000).max(2100).optional(),

  instrument: Joi.string().max(40).required(),
  borrowerListed: Joi.boolean().optional(),
  borrowerType: Joi.string().valid('company', 'nonprofit', 'state-owned-enterprise', 'government', 'sovereign', 'municipality').optional(),
  isInvestmentFund: Joi.boolean().optional(),
  onBalanceSheetAtYearEnd: Joi.boolean().optional(),
  offBalanceSheet: Joi.boolean().optional(),
  useOfProceedsKnown: Joi.boolean().optional(),
  proceedsPurpose: Joi.string().max(60).optional(),

  outstanding: outstanding.required(),
  denominator: denominator.optional(),
  attributionOverrideJustification: Joi.string().max(1000).optional(),

  emissions: Joi.object({
    scope1: scopeEntry.optional(),
    scope2: scopeEntry.optional(),
    scope3: scopeEntry.optional(),
    scope3AbsentReason: Joi.string().max(1000).optional(),
  }).unknown(false).optional(),

  dataQualityClaims: Joi.object({
    scope12: Joi.string().max(6).optional(),
    scope3: Joi.string().max(6).optional(),
    justification: Joi.string().max(1000).optional(),
  }).unknown(false).optional(),

  removals: Joi.object({ value: Joi.number().min(0).required(), period: Joi.alternatives(Joi.number(), Joi.string().max(20)).optional(), basis: Joi.string().max(120).optional() }).unknown(false).optional(),
  creditsRetired: Joi.object({ value: Joi.number().min(0).required(), period: Joi.alternatives(Joi.number(), Joi.string().max(20)).optional(), basis: Joi.string().max(120).optional() }).unknown(false).optional(),
  creditsGenerated: Joi.object({ value: Joi.number().min(0).required(), period: Joi.alternatives(Joi.number(), Joi.string().max(20)).optional(), basis: Joi.string().max(120).optional() }).unknown(false).optional(),

  deflator: Joi.object({ ratio: Joi.number().positive().required(), index: Joi.string().max(200).optional() }).unknown(false).optional(),

  /* What the run checks the data against. Absent, the checks that need it say
     they did not run rather than passing. */
  plausibility: Joi.object({
    revenue: Joi.number().min(0).optional(),
    /* A band supplied here stands over the registry's, and says so on the
       finding. Absent, the band in force for the borrower's sector is read
       from the baseline registry on the way into the engine. */
    sectorBand: Joi.object({
      low: Joi.number().min(0).required(), high: Joi.number().min(0).required(),
      basis: Joi.string().max(400).optional(),
    }).unknown(false).optional(),
  }).unknown(false).optional(),

  /* CarbonIQ's thresholds, settable per run because they are ours and not
     PCAF's — every finding that uses one says so. */
  thresholds: Joi.object({
    fluctuationPct: Joi.number().min(0).max(1000).optional(),
    emissionsLagYears: Joi.number().integer().min(0).max(20).optional(),
    factorVintageYears: Joi.number().integer().min(0).max(30).optional(),
  }).unknown(false).optional(),
}).unknown(false);

const portfolioRequestSchema = Joi.object({
  exposures: Joi.array().items(exposureSchema).min(1).max(2000).required(),
  totalLoansAndInvestments: Joi.number().min(0).optional(),
  improvementTarget: Joi.number().integer().min(1).max(5).optional(),
}).unknown(false);

module.exports = { exposureSchema, portfolioRequestSchema };
