// @ts-check
/**
 * Joi validation for the PCAF Part A §5.9 sovereign endpoint.
 *
 * Thin, like the other Part A schemas: the engine refuses what the standard
 * refuses — a non-USD exposure against a USD denominator, a factor above 1, an
 * unheld country, an emissions source that earns no data-quality option — with
 * the clause and the remedy. The schema only shapes the request.
 */

'use strict';

const Joi = require('joi');

const exposure = Joi.object({
  amount: Joi.number().min(0).required(),
  currency: Joi.string().max(10).default('USD'),
  asOf: Joi.string().max(40).optional(),
});

/* Explicit figures, for a country the dataset does not hold. Either this or a
   country code is supplied; the engine refuses both together. */
const sovereign = Joi.object({
  name: Joi.string().max(120).optional(),
  iso3: Joi.string().length(3).uppercase().optional(),
  scope1ExclLULUCF: Joi.number().min(0).required(),
  scope1InclLULUCF: Joi.number().min(0).optional(),
  scope2_tCO2e: Joi.number().min(0).optional(),
  scope3_tCO2e: Joi.number().min(0).optional(),
  pppGdp: Joi.number().positive().required(),
  emissionsYear: Joi.number().integer().min(1900).max(2100).optional(),
  pppGdpYear: Joi.number().integer().min(1900).max(2100).optional(),
  basis: Joi.string().max(80).optional(),
  source: Joi.string().max(2000).optional(),
});

const sovereignRequestSchema = Joi.object({
  reportingYear: Joi.number().integer().min(2000).max(2100).optional(),
  instrument: Joi.string().valid('sovereign-bond', 'sovereign-loan').default('sovereign-bond'),
  exposure: exposure.required(),

  /* Supply one: a held country code, or explicit figures. */
  country: Joi.string().length(2).uppercase().optional(),
  sovereign: sovereign.optional(),

  dataQualityOption: Joi.string().valid('1a', '1b', '2', '3a', '3b').optional(),
  dataQualityOverrideJustification: Joi.string().max(500).optional(),

  /* A second source for the country's emissions, so the independent-path check
     can report the divergence rather than say it could not run. */
  crossCheck: Joi.object({
    scope1ExclLULUCF: Joi.number().min(0).required(),
    source: Joi.string().max(200).optional(),
  }).optional(),

  /* The data-truth thresholds that are CarbonIQ's rather than PCAF's, settable
     per request; each is stated as ours on the finding it raises. */
  thresholds: Joi.object({
    emissionsLagYears: Joi.number().integer().min(0).max(50).optional(),
    gdpYearGapYears: Joi.number().integer().min(0).max(50).optional(),
    intensityLow: Joi.number().min(0).optional(),
    intensityHigh: Joi.number().positive().optional(),
    sourceDivergencePct: Joi.number().min(0).max(1000).optional(),
  }).optional(),
}).or('country', 'sovereign');

/**
 * The register form: the assess request plus what persistence needs — a
 * required reporting year (a row with no year belongs to no book) and the
 * bank's own reference for the holding, which carries the one-bond-once index.
 */
const sovereignExposureSchema = sovereignRequestSchema.keys({
  reportingYear: Joi.number().integer().min(2000).max(2100).required(),
  identifiers: Joi.object({
    accountNumber: Joi.string().max(120).optional(),
  }).optional(),
});

module.exports = { sovereignRequestSchema, sovereignExposureSchema };
