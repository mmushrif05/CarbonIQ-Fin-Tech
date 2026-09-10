// @ts-check
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
  /* The asset's own progress. A second axis from `status`, which is the
     bank's position. `origin` and `pledgedMitigation` are deliberately not
     accepted here: both are provenance, written only by the adoption path,
     and a caller able to assert them could claim a project came from a GCF
     record that never existed. */
  delivery: Joi.string().valid('not_started', 'under_construction', 'completed').optional(),
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
  /* The asset's own progress. A second axis from `status`, which is the
     bank's position. `origin` and `pledgedMitigation` are deliberately not
     accepted here: both are provenance, written only by the adoption path,
     and a caller able to assert them could claim a project came from a GCF
     record that never existed. */
  delivery: Joi.string().valid('not_started', 'under_construction', 'completed').optional(),
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

/**
 * The reader's questions, which every one of `/dashboard`, `/basket` and
 * `/compute` accepts on the query string or in the body.
 *
 * `readOptions()` in the route file is still the one validator for these — the
 * same rules in three places were three chances for one to drift, and one
 * already had. This schema exists so the **router carries the contract**: it
 * names the fields and their bounds, so the generated document describes the
 * request instead of shipping an operation a client has to guess at, and so
 * `stripUnknown` cannot remove a field `readOptions` then goes looking for.
 */
const assumptionFields = {
  carbonWeight: Joi.number().min(0).max(1).optional(),
  attributionBasis: Joi.string().valid('outstanding', 'commitment').optional(),
  horizonYears: Joi.number().min(0).max(30).optional(),
  gridDeclinePct: Joi.number().min(0).max(20).optional(),
  drawdownYears: Joi.number().min(0).max(15).optional(),
  portfolioId: Joi.string().max(60).optional(),
};

/**
 * An adjustment is neither a question nor a record: a value held by one reader,
 * applied over the book on the way into the engine and never written down.
 *
 * The overlay can only change what exists — it cannot invent a portfolio or an
 * investment — which the service enforces; the cap here is the second half of
 * that, so a hand-written body cannot turn one read into unbounded work.
 * Payments are **added** rather than edited, because a payment is an event and
 * the honest way to model "what if we drew another $25M" is another event.
 */
const computeSchema = Joi.object({
  ...assumptionFields,
  /* The same selection the basket takes. It is here because an adjusted
     dashboard has to be able to answer "and if we then wrote these?" against
     the book as adjusted — asking the two questions of two different books is
     the mismatch the shared resolver exists to prevent. */
  select: Joi.alternatives().try(
    Joi.array().items(Joi.string().max(60)).max(50),
    Joi.string().max(3000),
  ).optional(),
  overlay: Joi.object({
    portfolios:  Joi.object().pattern(Joi.string().max(60), Joi.object().unknown(true)).optional(),
    investments: Joi.object().pattern(Joi.string().max(60), Joi.object().unknown(true)).optional(),
    payments:    Joi.array().items(Joi.object().unknown(true)).max(500).optional(),
  }).unknown(false).optional(),
}).unknown(false);

/**
 * "If we wrote these, what changes?" A read: no id, nothing stored.
 *
 * `select` accepts an array or a comma-separated string because both reach it
 * — a browser sends the array, a link sends the string. Fifty is the cap
 * because a basket larger than that is not a decision anybody takes in one
 * sitting.
 */
const deskScenarioSchema = Joi.object({
  select: Joi.alternatives().try(
    Joi.array().items(Joi.string().max(60)).max(50),
    Joi.string().max(3000),
  ).optional(),
  attributionBasis: Joi.string().valid('outstanding', 'commitment').optional(),
  portfolioId: Joi.string().max(60).optional(),
}).unknown(false);

/**
 * Put a GCF candidate on the capital book.
 *
 * `recordId` is what the investment's frozen `origin` is written from, and it
 * is written once and never again: recomputing the pledge from the live record
 * would mean every later edit silently rewrote what a committee was told.
 */
const deskAdoptSchema = Joi.object({
  recordId: Joi.string().max(60).required(),
  portfolioId: Joi.string().max(60).optional(),
  commitment: Joi.number().min(0).optional(),
  startYear: Joi.number().integer().min(1900).max(2200).optional(),
  phasing: Joi.string().max(40).optional(),
  notes: Joi.string().max(1000).allow('').optional(),
}).unknown(false);

module.exports = {
  portfolioSchema, portfolioUpdateSchema,
  investmentSchema, investmentUpdateSchema,
  paymentSchema,
  computeSchema, deskScenarioSchema, deskAdoptSchema,
};
