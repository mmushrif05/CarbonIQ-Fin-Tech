/**
 * CarbonIQ FinTech — Green Loan Covenant Schema
 *
 * Validates input for the /v1/covenants endpoint.
 * Banks define carbon covenants for green loans; CarbonIQ evaluates compliance.
 */

const Joi = require('joi');

const covenantRuleSchema = Joi.object({
  metric: Joi.string().valid(
    'embodied_carbon_intensity',
    'operational_carbon_intensity',
    'total_carbon_intensity',
    'recycled_content_pct',
    'carbon_finance_score',
    'taxonomy_alignment'
  ).required(),
  operator: Joi.string().valid('lt', 'lte', 'gt', 'gte', 'eq', 'between').required(),
  value: Joi.number().required()
    .description('Threshold value (or lower bound for "between")'),
  upperValue: Joi.number().optional()
    .description('Upper bound — required when operator is "between"'),
  unit: Joi.string().trim().max(50).optional(),
  description: Joi.string().trim().max(500).optional(),
});

const covenantRequestSchema = Joi.object({
  loan: Joi.object({
    id: Joi.string().trim().max(100).required(),
    borrower: Joi.string().trim().max(300).optional(),
  }).required(),

  project: Joi.object({
    name: Joi.string().trim().min(1).max(300).required(),
    type: Joi.string().valid(
      'residential', 'commercial', 'industrial', 'infrastructure',
      'mixed-use', 'renovation', 'demolition'
    ).required(),
    grossFloorArea: Joi.number().positive().required(),
    location: Joi.object({
      country: Joi.string().length(2).uppercase().required(),
    }).required(),
  }).required(),

  currentMetrics: Joi.object({
    embodiedCarbonIntensity: Joi.number().min(0).optional()
      .description('kgCO2e/m2'),
    operationalCarbonIntensity: Joi.number().min(0).optional()
      .description('kgCO2e/m2/year'),
    totalCarbonIntensity: Joi.number().min(0).optional(),
    recycledContentPct: Joi.number().min(0).max(100).optional(),
    carbonFinanceScore: Joi.number().min(0).max(100).optional(),
    taxonomyAlignment: Joi.object({
      aligned: Joi.boolean().optional(),
      taxonomies: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }).required(),

  covenants: Joi.array().items(covenantRuleSchema).min(1).max(20).required()
    .description('List of covenant rules to evaluate'),

  options: Joi.object({
    includeRemediation: Joi.boolean().default(true)
      .description('Include suggestions if covenants are breached'),
    reportingPeriod: Joi.string().valid('monthly', 'quarterly', 'annual').default('quarterly'),
  }).default(),
});

module.exports = { covenantRequestSchema, covenantRuleSchema };
