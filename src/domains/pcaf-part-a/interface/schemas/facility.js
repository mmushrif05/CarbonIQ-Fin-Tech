// @ts-check
/**
 * The facility behind a loan exposure — what was sanctioned, what has been
 * drawn, when it matures and how it is repaid. One block for every loan
 * class; the engine (`domain/facility`) refuses what it cannot schedule from
 * and says which field, so the schema only closes the vocabulary.
 */

'use strict';

const Joi = require('joi');

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).description('YYYY-MM-DD');

const facilitySchema = Joi.object({
  committed: Joi.number().positive().required().description('The sanctioned amount — the total loan commitment'),
  disbursed: Joi.number().min(0).required().description('Drawn to date, gross'),
  originationDate: date.required(),
  maturityDate: date.required(),
  repayment: Joi.object({
    profile: Joi.string().valid('bullet', 'equal-principal', 'annuity', 'schedule').required(),
    frequency: Joi.string().valid('monthly', 'quarterly', 'semi-annual', 'annual').optional(),
    firstInstalment: date.optional(),
    graceMonths: Joi.number().integer().min(0).max(240).optional(),
    annualRatePct: Joi.number().min(0).max(100).optional().description('The annuity’s rate; the balance at a date depends on it'),
    schedule: Joi.array().items(Joi.object({ date: date.required(), principal: Joi.number().positive().required() }).unknown(false)).max(600).optional(),
  }).unknown(false).required(),
  utilisationFactor: Joi.number().min(0).max(1).optional().description('The §6.2 weighted figure’s factor — optional, reported only beside the unweighted one'),
  outstandingBasis: Joi.string().valid('ledger', 'scheduled').optional().description('Whether the year-end balance was read from the loan account or taken from the schedule'),
  currency: Joi.string().max(10).optional(),
}).unknown(false);

/** What the form asks before a balance is keyed: the schedule's own answer at a date. */
const scheduleRequestSchema = Joi.object({
  facility: facilitySchema.required(),
  asOf: date.required().description('The position date the balance is scheduled at'),
}).unknown(false);

module.exports = { facilitySchema, scheduleRequestSchema };
