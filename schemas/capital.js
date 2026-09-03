/**
 * Joi validation for the capital book.
 *
 * Thin on purpose. What the schema enforces is shape — a number is a number, a
 * status is one of the five the book recognises — and nothing else. The rules
 * that matter (a payment must be against an investment that exists, a write
 * must be able to persist) live in the service and the store, where they can
 * answer with the reason and the remedy rather than a generic message.
 *
 * Money is not constrained to be positive. A repayment is entered as its own
 * kind rather than a negative disbursement, and an allocation of zero is a
 * legitimate statement about a portfolio that has not been funded yet.
 */

'use strict';

const Joi = require('joi');

const money = Joi.number().min(0);

const portfolioSchema = Joi.object({
  id: Joi.string().max(60).optional(),
  name: Joi.string().max(160).required(),
  currency: Joi.string().max(8).optional(),
  mandate: Joi.string().max(400).allow('').optional(),
  vintage: Joi.alternatives(Joi.number().integer(), Joi.string().max(20)).allow(null).optional(),
  allocatedBudget: money.optional(),
  pledged: money.optional(),
});

const portfolioUpdateSchema = Joi.object({
  name: Joi.string().max(160).optional(),
  currency: Joi.string().max(8).optional(),
  mandate: Joi.string().max(400).allow('').optional(),
  vintage: Joi.alternatives(Joi.number().integer(), Joi.string().max(20)).allow(null).optional(),
  allocatedBudget: money.optional(),
  pledged: money.optional(),
}).min(1);

/* The four emission lines. Each is optional because a project at pipeline
   stage may have an avoidance estimate and nothing else, and refusing the
   record would mean refusing the only evidence there is. */
const emissionsSchema = Joi.object({
  incurred_tCO2e: Joi.number().min(0).optional(),
  forward_tCO2e: Joi.number().min(0).optional(),
  reduction_tCO2e: Joi.number().min(0).optional(),
  avoided_tCO2e: Joi.number().min(0).optional(),
  basis: Joi.string().max(400).allow('', null).optional(),
  dataQuality: Joi.object({
    score: Joi.number().min(1).max(5).required(),
    option: Joi.string().max(20).allow('', null).optional(),
  }).allow(null).optional(),
});

const investmentSchema = Joi.object({
  id: Joi.string().max(60).optional(),
  portfolioId: Joi.string().max(60).required(),
  name: Joi.string().max(160).required(),
  sector: Joi.string().max(80).optional(),
  assetType: Joi.string().max(80).allow('', null).optional(),
  country: Joi.string().max(80).allow('', null).optional(),
  status: Joi.string().valid('pipeline', 'committed', 'deployed', 'exited', 'declined').optional(),
  commitment: money.optional(),
  projectCost: money.optional(),
  expectedReturnPct: Joi.number().allow(null).optional(),
  tenorYears: Joi.number().min(0).allow(null).optional(),
  startYear: Joi.number().integer().min(1900).max(2200).allow(null).optional(),
  phasing: Joi.string().valid('construction', 'level', 'buildThenOperate').allow(null).optional(),
  taxonomy: Joi.string().max(40).allow('', null).optional(),
  emissions: emissionsSchema.optional(),
  notes: Joi.string().max(1000).allow('').optional(),
});

const investmentUpdateSchema = Joi.object({
  portfolioId: Joi.string().max(60).optional(),
  name: Joi.string().max(160).optional(),
  sector: Joi.string().max(80).optional(),
  assetType: Joi.string().max(80).allow('', null).optional(),
  country: Joi.string().max(80).allow('', null).optional(),
  status: Joi.string().valid('pipeline', 'committed', 'deployed', 'exited', 'declined').optional(),
  commitment: money.optional(),
  projectCost: money.optional(),
  expectedReturnPct: Joi.number().allow(null).optional(),
  tenorYears: Joi.number().min(0).allow(null).optional(),
  startYear: Joi.number().integer().min(1900).max(2200).allow(null).optional(),
  phasing: Joi.string().valid('construction', 'level', 'buildThenOperate').allow(null).optional(),
  taxonomy: Joi.string().max(40).allow('', null).optional(),
  emissions: emissionsSchema.optional(),
  notes: Joi.string().max(1000).allow('').optional(),
}).min(1);

const paymentSchema = Joi.object({
  id: Joi.string().max(60).optional(),
  portfolioId: Joi.string().max(60).optional(),
  investmentId: Joi.string().max(60).required(),
  kind: Joi.string().valid('disbursement', 'repayment', 'fee').optional(),
  amount: money.required(),
  date: Joi.string().max(30).optional(),
  reference: Joi.string().max(160).allow('').optional(),
});

module.exports = {
  portfolioSchema, portfolioUpdateSchema,
  investmentSchema, investmentUpdateSchema,
  paymentSchema,
};
