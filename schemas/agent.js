/**
 * CarbonIQ FinTech — Agent Request Schemas
 *
 * Joi validation schemas for all agent endpoints.
 * Each schema validates the request body before it reaches the agent.
 */

const Joi = require('joi');

// ---------------------------------------------------------------------------
// Underwriting Agent — POST /v1/agent/underwrite
// ---------------------------------------------------------------------------

const underwritingRequestSchema = Joi.object({
  // BOQ content — optional (preliminary estimates if omitted)
  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities: CSV rows, pasted text, or JSON string'),

  boqFormat: Joi.string().valid('csv', 'text', 'json').default('text')
    .description('Format of the BOQ content'),

  // Project details
  projectName: Joi.string().max(300).optional()
    .description('Project name for the underwriting memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for benchmarking'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  // Loan parameters for PCAF attribution
  loanAmount: Joi.number().positive().optional()
    .description('Outstanding loan amount (local currency) for PCAF attribution factor'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value (local currency) for PCAF attribution factor'),

  // Target green performance
  reductionTarget: Joi.number().min(0).max(100).optional()
    .description('Target embodied carbon reduction vs baseline (%)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),
});

module.exports = { underwritingRequestSchema };
