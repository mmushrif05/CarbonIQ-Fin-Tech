// @ts-check
/**
 * Monitoring and portfolio report requests.
 */

'use strict';

const Joi = require('joi');
const { covenantItemSchema, currentMetricsSchema } = require('./covenants');

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
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
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
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
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

module.exports = { monitoringRequestSchema, portfolioAssetItemSchema, portfolioReportRequestSchema };
