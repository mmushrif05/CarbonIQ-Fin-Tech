// @ts-check
/**
 * Borrower coaching and decision triage requests.
 */

'use strict';

const Joi = require('joi');

// ---------------------------------------------------------------------------
// Borrower Coaching Agent — POST /v1/agent/coach
// ---------------------------------------------------------------------------

const borrowerCoachingRequestSchema = Joi.object({
  // Project identity
  projectName: Joi.string().max(300).optional()
    .description('Project name for the coaching report header'),

  // Core building data — both needed for preliminary carbon estimate
  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for carbon benchmarking'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Project region for benchmark and carbon tax calculations'),

  // Financial parameters
  loanAmount: Joi.number().positive().optional()
    .description('Requested loan amount in local currency'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value in local currency'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years'),

  // Carbon / green performance data
  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities if available: CSV, text, or JSON'),

  hasBOQ: Joi.boolean().optional().default(false)
    .description('Whether a Bill of Quantities has been submitted'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
  ).optional().description('Target green certification level'),

  reductionTarget: Joi.number().min(0).max(100).optional()
    .description('Target embodied carbon reduction vs baseline (%)'),

  hasLCA: Joi.boolean().optional().default(false)
    .description('Whether a Life Cycle Assessment has been commissioned'),

  hasEPD: Joi.boolean().optional().default(false)
    .description('Whether any Environmental Product Declarations exist for project materials'),

  verificationStatus: Joi.string()
    .valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none')
    .description('Current external verification status'),

  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Free-text project description for personalised coaching'),

  // Free-text borrower questions answered at the end of the coaching report
  borrowerQuestions: Joi.string().max(2000).optional()
    .description('Specific questions from the borrower — answered in the coaching report')
})
  // Every field is individually optional, because coaching an incomplete
  // application is the point of this endpoint. But a request naming neither a
  // building type nor a floor area describes no building at all: there is
  // nothing to benchmark, nothing to coach towards, and an AI call would be
  // spent producing generic advice. One of the two anchors the rest.
  .or('buildingType', 'buildingArea_m2')
  .messages({
    'object.missing': 'Provide at least a buildingType or a buildingArea_m2 so the coaching has a project to work from.'
  });

// ---------------------------------------------------------------------------
// Decision Triage — POST /v1/agent/triage
// ---------------------------------------------------------------------------

const decisionTriageRequestSchema = Joi.object({
  // Project context
  projectName: Joi.string().max(300).optional()
    .description('Project name for the review memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for covenant calibration context'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Project region'),

  // Financial parameters
  loanAmount: Joi.number().positive().optional()
    .description('Loan amount in local currency — used for tier threshold check'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value for PCAF attribution context'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years'),

  // Carbon Finance Score — used for tier classification
  cfsScore: Joi.number().min(0).max(100).optional()
    .description('Carbon Finance Score (0–100) from the underwriting or screening assessment'),

  cfsClassification: Joi.string().valid('green', 'transition', 'brown').optional()
    .description('CFS classification label corresponding to the cfsScore'),

  // CFS component breakdown for AI review context
  cfsComponents: Joi.object({
    epdCoveragePct:    Joi.number().min(0).max(100).optional(),
    reductionPct:      Joi.number().min(0).max(100).optional(),
    certificationLevel: Joi.string().optional(),
    verificationStatus: Joi.string().optional()
  }).optional().description('CFS score component values for AI review context'),

  // Taxonomy results — object with per-taxonomy alignment status
  taxonomyAlignments: Joi.object().optional()
    .description('Per-taxonomy alignment results from check_taxonomy_alignment tool'),

  // PCAF data
  pcafDataQualityScore: Joi.number().integer().min(1).max(5).optional()
    .description('PCAF data quality score 1–5 (1=Audited, 5=Unknown)'),

  pcafFinancedEmissions_tCO2e: Joi.number().positive().optional()
    .description('Bank\'s PCAF financed emissions in tCO2e'),

  // Carbon metrics for covenant calibration
  carbonIntensity_kgCO2e_m2: Joi.number().positive().optional()
    .description('Carbon intensity in kgCO2e/m² — used to calibrate covenant thresholds'),

  totalTCO2e: Joi.number().positive().optional()
    .description('Total project embodied carbon in tCO2e'),

  epdCoveragePct: Joi.number().min(0).max(100).optional().default(0)
    .description('EPD data coverage (%)'),

  reductionPct: Joi.number().min(0).max(100).optional().default(0)
    .description('Achieved carbon reduction vs baseline (%)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
  ).optional().description('Achieved or target green certification level'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
  ).optional().description('Target green certification level'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none').description('External verification status'),

  hasBOQ: Joi.boolean().optional().default(false)
    .description('Whether a BOQ has been submitted'),

  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Project description — used by AI review for Tier 2 decisions'),

  // Reference to prior agent run for traceability
  underwritingRunId: Joi.string().max(100).optional()
    .description('Run ID of the prior underwriting agent run (for cross-reference in the review memo)'),

  // Override flag — always escalate to manual regardless of other criteria
  forceManualReview: Joi.boolean().optional().default(false)
    .description('Set to true to force Tier 3 manual review regardless of scoring criteria')
});

module.exports = { borrowerCoachingRequestSchema, decisionTriageRequestSchema };
