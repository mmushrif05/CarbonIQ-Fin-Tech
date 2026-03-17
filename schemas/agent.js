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

// ---------------------------------------------------------------------------
// Monitoring Agent — POST /v1/agent/monitor
// ---------------------------------------------------------------------------

const covenantItemSchema = Joi.object({
  metric: Joi.string().valid(
    'total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'
  ).required().description('KPI metric key'),
  operator: Joi.string().valid('lt', 'lte', 'gt', 'gte', 'eq').required(),
  threshold: Joi.number().required().description('Agreed threshold value'),
  label: Joi.string().max(100).optional().description('Human-readable label, e.g. "Carbon Intensity"')
});

const currentMetricsSchema = Joi.object({
  totalBaseline_tCO2e: Joi.number().positive().required()
    .description('Total embodied carbon measured to date (tCO2e)'),
  reductionPct: Joi.number().min(0).max(100).optional().default(0)
    .description('Carbon reduction achieved vs baseline (%)'),
  epdCoveragePct: Joi.number().min(0).max(100).optional().default(0)
    .description('EPD data coverage of significant materials sourced to date (%)'),
  substitutionRate: Joi.number().min(0).max(100).optional().default(0)
    .description('Material substitution rate achieved (%)')
});

const monitoringRequestSchema = Joi.object({
  projectName: Joi.string().max(300).optional()
    .description('Project name for the monitoring report'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type for benchmark trajectory'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark calculations'),

  covenants: Joi.array().items(covenantItemSchema).min(1).max(10).required()
    .description('The agreed covenant package from the facility agreement'),

  currentMetrics: currentMetricsSchema.required()
    .description('Current carbon metrics measured at this construction stage'),

  projectComplete_pct: Joi.number().min(0).max(100).required()
    .description('How far through construction the project currently is (%)'),

  drawdownRequested: Joi.boolean().optional().default(false)
    .description('Whether this assessment is triggering a drawdown request'),

  drawdownAmount: Joi.number().positive().optional()
    .description('Amount of drawdown being requested (if applicable)'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none').description('Current external verification status'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years')
});

// ---------------------------------------------------------------------------
// Portfolio Reporting Agent — POST /v1/agent/portfolio
// ---------------------------------------------------------------------------

const portfolioAssetItemSchema = Joi.object({
  loanId: Joi.string().max(100).optional()
    .description('Loan reference ID'),

  projectName: Joi.string().max(300).optional()
    .description('Project name'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type'),

  buildingArea_m2: Joi.number().positive().optional()
    .description('Gross floor area (m²)'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region'),

  totalTCO2e: Joi.number().positive().optional()
    .description('Total embodied carbon from underwriting/monitoring assessment (tCO2e)'),

  reductionPct: Joi.number().min(0).max(100).optional()
    .description('Carbon reduction % vs baseline'),

  epdCoveragePct: Joi.number().min(0).max(100).optional()
    .description('EPD data coverage (%)'),

  loanAmount: Joi.number().positive().optional()
    .description('Outstanding loan balance (local currency)'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value (local currency)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Achieved or target certification'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().description('External verification status')
});

const portfolioReportRequestSchema = Joi.object({
  portfolioName: Joi.string().max(300).optional()
    .description('Portfolio name for the report header'),

  reportingEntity: Joi.string().max(300).optional()
    .description('Bank or reporting entity name'),

  reportingPeriod: Joi.string().max(50).optional()
    .description('Reporting period, e.g. "2025 Q4" or "FY2025"'),

  assets: Joi.array().items(portfolioAssetItemSchema).min(1).max(50).required()
    .description('Array of loan assets in the portfolio')
});

module.exports = {
  underwritingRequestSchema,
  screeningRequestSchema,
  covenantsRequestSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema
};
