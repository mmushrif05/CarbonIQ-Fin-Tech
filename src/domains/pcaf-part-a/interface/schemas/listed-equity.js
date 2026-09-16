// @ts-check
/**
 * Joi validation for a §5.1 listed-equity or corporate-bond exposure on the
 * register.
 *
 * Thin, like the other Part A schemas: the engine refuses what the standard
 * refuses — a derivative, a bond whose issuer's listing is unstated, two sides
 * of the attribution factor on different dates or in different currencies, a
 * fund whose holdings are not known — with the clause and the remedy. The
 * schema shapes the request; the shared pieces (the scope entry, the
 * denominator, the outstanding block) are §5.2's, because the two chapters
 * share the corporate machinery and a second copy would drift.
 */

'use strict';

const Joi = require('joi');
const { scopeEntry, denominator, outstanding } = require('./business-loans');

const line = Joi.alternatives().try(
  Joi.number().min(0),
  Joi.object({ value: Joi.number().min(0).required(), period: Joi.alternatives(Joi.number(), Joi.string().max(20)).optional(), basis: Joi.string().max(120).optional() }).unknown(false),
);

const listedEquitySchema = Joi.object({
  identifiers: Joi.object({
    id: Joi.string().max(120).optional(),
    isin: Joi.string().max(20).optional(),
    lei: Joi.string().max(40).optional(),
    accountNumber: Joi.string().max(80).optional(),
  }).unknown(false).optional(),

  counterparty: Joi.object({
    name: Joi.string().max(200).optional(),
    country: Joi.string().max(80).optional(),
    naceL2: Joi.string().max(20).optional(),
    financialInstitution: Joi.boolean().optional(),
  }).unknown(false).optional(),

  reportingYear: Joi.number().integer().min(2000).max(2100).optional(),

  instrument: Joi.string().valid('listed-equity', 'corporate-bond').required(),
  issuerListed: Joi.boolean().optional(),
  onBalanceSheetAtYearEnd: Joi.boolean().optional(),
  heldForSale: Joi.boolean().optional(),
  useOfProceedsKnown: Joi.boolean().optional(),
  viaFund: Joi.object({
    fundName: Joi.string().max(200).optional(),
    fundWeight: Joi.number().min(0).max(1).required(),
    holdingsKnown: Joi.boolean().optional(),
  }).unknown(false).optional(),

  outstanding: outstanding.append({ basis: Joi.string().valid('market-value', 'book-value').optional() }).required(),
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

  removals: line.optional(),
  creditsRetired: line.optional(),
  creditsGenerated: line.optional(),

  deflator: Joi.object({ ratio: Joi.number().positive().required(), index: Joi.string().max(200).optional() }).unknown(false).optional(),
}).unknown(false);

module.exports = { listedEquitySchema };
