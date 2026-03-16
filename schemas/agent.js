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

// ---------------------------------------------------------------------------
// Screening Agent — POST /v1/agent/screen
// ---------------------------------------------------------------------------

const screeningRequestSchema = Joi.object({
  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Free-text project description: building purpose, design intent, sustainability goals'),

  projectName: Joi.string().max(300).optional()
    .description('Project name for the eligibility memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type — required for benchmark lookup'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres — required for carbon estimate'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification if known'),

  investorJurisdiction: Joi.string().max(200).optional()
    .description('Investor jurisdiction(s) for taxonomy selection, e.g. "ASEAN, Singapore"'),

  loanAmount: Joi.number().positive().optional()
    .description('Indicative loan amount for context'),
});

// ---------------------------------------------------------------------------
// Covenant Design Agent — POST /v1/agent/covenants
// ---------------------------------------------------------------------------

const covenantsRequestSchema = Joi.object({
  projectName: Joi.string().max(300).optional()
    .description('Project name for the covenant report'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type for benchmark anchoring'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  // Current underwritten carbon metrics (from prior underwriting assessment)
  currentTCO2e: Joi.number().positive().optional()
    .description('Total embodied carbon from underwriting assessment (tCO2e)'),

  currentIntensity_kgCO2e_m2: Joi.number().positive().optional()
    .description('Carbon intensity from underwriting assessment (kgCO2e/m²)'),

  reductionPct: Joi.number().min(0).max(100).optional()
    .description('Current carbon reduction vs baseline (%)'),

  epdCoveragePct: Joi.number().min(0).max(100).optional()
    .description('EPD data coverage of significant materials (%)'),

  // Loan parameters
  loanAmount: Joi.number().positive().optional()
    .description('Loan amount for pricing ratchet context'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years — used for covenant trajectory design'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),
});

module.exports = { underwritingRequestSchema, screeningRequestSchema, covenantsRequestSchema };
