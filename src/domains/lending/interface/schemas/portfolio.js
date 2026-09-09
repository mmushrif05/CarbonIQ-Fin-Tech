/**
 * CarbonIQ FinTech — Portfolio Aggregation Schema
 *
 * Validates input for the /v1/portfolio endpoint.
 * Banks submit multiple loans/projects for aggregated emissions reporting.
 */

const Joi = require('joi');

const portfolioAssetSchema = Joi.object({
  loanId: Joi.string().trim().max(100).required(),
  projectName: Joi.string().trim().max(300).required(),
  projectType: Joi.string().valid(
    'residential', 'commercial', 'industrial', 'infrastructure', 'mixed-use'
  ).required(),
  location: Joi.object({
    country: Joi.string().length(2).uppercase().required(),
    city: Joi.string().trim().max(200).optional(),
  }).required(),
  loanAmount: Joi.number().positive().required(),
  propertyValue: Joi.number().positive().required(),
  grossFloorArea: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().default('USD'),
  emissions: Joi.object({
    embodied: Joi.number().min(0).required()
      .description('Total embodied carbon in kgCO2e'),
    operational: Joi.number().min(0).optional()
      .description('Annual operational carbon in kgCO2e'),
    dataQuality: Joi.number().integer().min(1).max(5).required(),
  }).required(),
  carbonFinanceScore: Joi.number().min(0).max(100).optional(),
});

const portfolioRequestSchema = Joi.object({
  portfolio: Joi.object({
    name: Joi.string().trim().min(1).max(300).required(),
    id: Joi.string().trim().max(100).optional(),
    reportingDate: Joi.date().iso().required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
  }).required(),

  assets: Joi.array().items(portfolioAssetSchema).min(1).max(5000).required()
    .description('List of loans/projects in the portfolio'),

  options: Joi.object({
    groupBy: Joi.string().valid('country', 'projectType', 'dataQuality', 'none').default('none'),
    includeIntensityMetrics: Joi.boolean().default(true),
    includePcafAttribution: Joi.boolean().default(true),
    includeDistribution: Joi.boolean().default(true),
  }).default(),
});

module.exports = { portfolioRequestSchema, portfolioAssetSchema };
