/**
 * CarbonIQ FinTech — Carbon Finance Score Schema
 *
 * Validates input for the /v1/score endpoint.
 * A bank submits a construction project and receives a 0-100 carbon finance score.
 */

const Joi = require('joi');

const materialEntrySchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required()
    .description('Material name, e.g. "Concrete C30/37"'),
  category: Joi.string().valid(
    'concrete', 'steel', 'timber', 'aluminium', 'glass',
    'insulation', 'masonry', 'plastics', 'other'
  ).required(),
  quantity: Joi.number().positive().required()
    .description('Quantity in the specified unit'),
  unit: Joi.string().valid('kg', 'tonnes', 'm3', 'm2', 'units').required(),
  embodiedCarbon: Joi.number().min(0).optional()
    .description('kgCO2e per unit — if omitted, CarbonIQ estimates it'),
  recycledContent: Joi.number().min(0).max(100).optional()
    .description('Percentage of recycled content (0-100)'),
  epd: Joi.object({
    id: Joi.string().trim().optional(),
    source: Joi.string().trim().optional(),
  }).optional().description('Environmental Product Declaration reference'),
});

const scoreRequestSchema = Joi.object({
  project: Joi.object({
    name: Joi.string().trim().min(1).max(300).required(),
    id: Joi.string().trim().max(100).optional()
      .description('External project reference ID'),
    location: Joi.object({
      country: Joi.string().length(2).uppercase().required()
        .description('ISO 3166-1 alpha-2 country code'),
      city: Joi.string().trim().max(200).optional(),
      region: Joi.string().trim().max(200).optional(),
    }).required(),
    type: Joi.string().valid(
      'residential', 'commercial', 'industrial', 'infrastructure',
      'mixed-use', 'renovation', 'demolition'
    ).required(),
    grossFloorArea: Joi.number().positive().required()
      .description('Gross floor area in m2'),
    storeys: Joi.number().integer().min(1).max(200).optional(),
    constructionStart: Joi.date().iso().optional(),
    constructionEnd: Joi.date().iso().optional(),
  }).required(),

  materials: Joi.array().items(materialEntrySchema).min(1).max(500).required()
    .description('Bill of materials with carbon data'),

  benchmarkRegion: Joi.string().valid('ASEAN', 'EU', 'HK', 'SG', 'GLOBAL').default('GLOBAL')
    .description('Regional benchmark for scoring comparison'),

  loanAmount: Joi.number().positive().optional()
    .description('Loan amount in local currency — used for PCAF attribution'),

  currency: Joi.string().length(3).uppercase().default('USD'),

  options: Joi.object({
    includeBreakdown: Joi.boolean().default(true),
    includeBenchmark: Joi.boolean().default(true),
    includeRecommendations: Joi.boolean().default(false),
  }).default(),
});

module.exports = { scoreRequestSchema, materialEntrySchema };
