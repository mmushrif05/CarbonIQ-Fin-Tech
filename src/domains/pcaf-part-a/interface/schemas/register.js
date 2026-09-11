// @ts-check
/**
 * Joi validation for the PCAF Part A exposure register.
 *
 * The exposure body is §5.2's own schema with two register fields in front of
 * it: which asset class's engine should run, and the reporting year the row
 * belongs to. Both are the register's, not the engine's — `engineInputOf()` in
 * the service strips `assetClass` before the engine sees it, because the §5.2
 * schema is closed and a field the caller was right to send would otherwise be
 * a named 400.
 *
 * Everything else stays where it is. The engine refuses what the standard
 * refuses, with the clause and the remedy; restating those rules here would be
 * a second place to keep in step and would answer with a generic message.
 */

'use strict';

const Joi = require('joi');
const { exposureSchema } = require('./business-loans');

/* `assetClass` is optional and defaults in the service rather than here: a
   default written in two places is a default that can disagree with itself. */
const registerExposureSchema = exposureSchema.append({
  assetClass: Joi.string().max(60).optional(),
  reportingYear: Joi.number().integer().min(2000).max(2100).required(),
});

const bookSchema = Joi.object({
  reportingYear: Joi.number().integer().min(2000).max(2100).required(),
  /* Positive, and the service says why: a book of zero has no coverage rather
     than full coverage. */
  totalLoansAndInvestments: Joi.number().positive().required(),
  currency: Joi.string().max(10).optional(),
  statedBy: Joi.string().max(200).optional(),
  note: Joi.string().max(2000).optional(),
}).unknown(false);

const positionQuerySchema = Joi.object({
  improvementTarget: Joi.number().integer().min(1).max(5).optional(),
}).unknown(true);

/**
 * A recomputation takes no body: the input is the one already held, which is
 * what makes it a recomputation rather than a change. Closed rather than
 * absent, so a caller that sends a body is told it was not used instead of
 * assuming it was.
 */
const noBodySchema = Joi.object({}).unknown(false);

module.exports = { registerExposureSchema, bookSchema, positionQuerySchema, noBodySchema };
