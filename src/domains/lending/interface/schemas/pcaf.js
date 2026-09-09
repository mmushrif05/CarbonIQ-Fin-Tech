/**
 * CarbonIQ FinTech — PCAF v3 Output Schema
 *
 * Validates input for the /v1/pcaf endpoint.
 * Banks submit loan + project data and receive PCAF-compliant emissions attribution.
 */

const Joi = require('joi');

const pcafRequestSchema = Joi.object({
  loan: Joi.object({
    id: Joi.string().trim().max(100).required()
      .description('Unique loan identifier'),
    amount: Joi.number().positive().required()
      .description('Outstanding loan amount'),
    currency: Joi.string().length(3).uppercase().default('USD'),
    originationDate: Joi.date().iso().optional(),
    maturityDate: Joi.date().iso().optional(),
  }).required(),

  property: Joi.object({
    value: Joi.number().positive().required()
      .description('Total property value at origination'),
    type: Joi.string().valid(
      'residential', 'commercial', 'industrial', 'infrastructure', 'mixed-use'
    ).required(),
    grossFloorArea: Joi.number().positive().required()
      .description('Gross floor area in m2'),
    location: Joi.object({
      country: Joi.string().length(2).uppercase().required(),
      city: Joi.string().trim().max(200).optional(),
    }).required(),
  }).required(),

  emissions: Joi.object({
    totalEmbodied: Joi.number().min(0).required()
      .description('Total embodied carbon in kgCO2e'),
    totalOperational: Joi.number().min(0).optional()
      .description('Annual operational carbon in kgCO2e'),
    dataQuality: Joi.number().integer().min(1).max(5).required()
      .description('PCAF data quality score (1=best, 5=worst)'),
    methodology: Joi.string().trim().max(500).optional()
      .description('Description of emissions calculation methodology'),
  }).required(),

  attributionFactor: Joi.number().min(0).max(1).optional()
    .description('Override default attribution factor (loan_amount / property_value)'),

  pcafVersion: Joi.string().valid('3.0').default('3.0'),

  options: Joi.object({
    includeFinancedEmissions: Joi.boolean().default(true),
    includeIntensityMetrics: Joi.boolean().default(true),
  }).default(),
});

module.exports = { pcafRequestSchema };
