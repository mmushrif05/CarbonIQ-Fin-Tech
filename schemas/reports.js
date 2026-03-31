/**
 * CarbonIQ FinTech — Report Generation Validation Schema
 */

const Joi = require('joi');

const reportGenerateSchema = Joi.object({
  type: Joi.string()
    .valid('pcaf', 'gri305', 'tcfd', 'ifrs-s2', 'slgft')
    .required()
    .messages({
      'any.only': 'type must be one of: pcaf, gri305, tcfd, ifrs-s2, slgft',
      'any.required': 'Report type is required.',
    }),

  period: Joi.string()
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'period must be a 4-digit year, e.g. "2025".',
      'any.required': 'Reporting period (year) is required.',
    }),

  format: Joi.string()
    .valid('json', 'pdf')
    .default('json'),

  orgName: Joi.string()
    .min(2)
    .max(120)
    .default('Your Organisation'),

  // Optional pre-computed portfolio summary; if omitted, demo data is used.
  portfolioData: Joi.object({
    totalProjects:         Joi.number().integer().min(0),
    coverage_pct:          Joi.number().min(0).max(100),
    totalEmissions_tCO2e:  Joi.number().min(0),
    weightedDQ:            Joi.number().min(1).max(5),
    totalPortfolioValue_M: Joi.number().min(0),
    taxonomyDist:          Joi.object(),
    dqDistribution:        Joi.object(),
    assetClasses:          Joi.array(),
    yoy:                   Joi.object(),
  }).optional(),

  // SLGFT-specific data — used only when type = 'slgft'
  slgftData: Joi.object({
    totalLKProjects:        Joi.number().integer().min(0).optional(),
    totalLKEmissions_tCO2e: Joi.number().min(0).optional(),
    ndcContribution_pct:    Joi.number().min(0).max(100).optional(),
    dnshStatus:             Joi.string().valid('Pass', 'Conditional', 'Fail').optional(),
    ndcKeyDrivers:          Joi.array().items(Joi.string()).optional(),
    taxonomyDistribution:   Joi.object({
      green:      Joi.object({ count: Joi.number(), pct: Joi.number(), financed_emissions_tCO2e: Joi.number() }).optional(),
      transition: Joi.object({ count: Joi.number(), pct: Joi.number(), financed_emissions_tCO2e: Joi.number() }).optional(),
      not_aligned: Joi.object({ count: Joi.number(), pct: Joi.number(), financed_emissions_tCO2e: Joi.number() }).optional(),
    }).optional(),
  }).optional(),
});

module.exports = { reportGenerateSchema };
