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
 * The reporting entity's recalculation protocol (Chapter 6). Every field is
 * optional so a caller can set one without restating the rest; `baseYear`
 * accepts null, because clearing a base year back to unstated is a legitimate
 * act and different from leaving it unchanged.
 */
const personSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  role: Joi.string().trim().allow('').max(200).optional(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().description('YYYY-MM-DD'),
}).allow(null);

const settingsSchema = Joi.object({
  baseYear: Joi.number().integer().min(2000).max(2100).allow(null),
  significanceThresholdPct: Joi.number().min(0).max(100)
    .description('Movement in a reported figure that triggers a recalculation, per the GHG Protocol Scope 3 Standard'),
  recalculationTriggers: Joi.array().items(Joi.string().trim().max(300)).max(20),
  recalculationPolicy: Joi.string().allow('').max(4000),

  /* The reporting entity and its boundary — facts only the entity can state,
     printed on the face of every Part A document and answered by its checklist. */
  reportingEntity: Joi.string().trim().max(200).allow(null).description('The legal name of the reporting financial institution'),
  consolidationApproach: Joi.string().valid('operational_control', 'financial_control', 'equity_share').allow(null)
    .description('The GHG Protocol consolidation approach the inventory boundary follows'),
  boundaryNote: Joi.string().allow('').max(2000).description('What the organisational boundary includes and excludes'),
  fiscalYearEnd: Joi.string().pattern(/^\d{2}-\d{2}$/).allow(null).description('MM-DD; the position is taken at this date in the reporting year'),
  gwpBasis: Joi.string().trim().max(120).allow(null).description('The IPCC assessment report and horizon the CO2e rests on, e.g. "IPCC AR6, 100-year"'),
  preparedBy: personSchema.description('Who prepared the disclosure'),
  approvedBy: personSchema.description('Who approved the disclosure, and on what date'),
  assetClassesNotReported: Joi.array().items(Joi.object({
    assetClass: Joi.string().max(60).required(),
    reason: Joi.string().trim().max(500).required(),
  })).max(12).description('Part A asset classes the entity does not report, each with its reason (Chapter 6, p.162)'),
}).unknown(false);

/**
 * A recomputation takes no body: the input is the one already held, which is
 * what makes it a recomputation rather than a change. Closed rather than
 * absent, so a caller that sends a body is told it was not used instead of
 * assuming it was.
 */
const noBodySchema = Joi.object({}).unknown(false);

const reportRequestSchema = Joi.object({
  format: Joi.string().valid('json', 'pdf', 'docx').default('json'),
  insurer: Joi.string().max(200).optional(),
}).unknown(false);

const disclosureQuerySchema = Joi.object({
  format: Joi.string().valid('json', 'pdf', 'docx').default('json'),
  insurer: Joi.string().max(200).optional(),
  currency: Joi.string().max(10).optional(),
  country: Joi.string().length(2).optional(),
}).unknown(false);


module.exports = { registerExposureSchema, bookSchema, positionQuerySchema, noBodySchema, reportRequestSchema, disclosureQuerySchema, settingsSchema };
