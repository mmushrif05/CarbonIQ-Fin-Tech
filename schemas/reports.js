/**
 * CarbonIQ FinTech — Report Generation Validation Schema
 */

const Joi = require('joi');

const reportGenerateSchema = Joi.object({
  type: Joi.string()
    .valid('pcaf', 'gri305', 'tcfd', 'ifrs-s2')
    .required()
    .messages({
      'any.only': 'type must be one of: pcaf, gri305, tcfd, ifrs-s2',
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
});

module.exports = { reportGenerateSchema };
