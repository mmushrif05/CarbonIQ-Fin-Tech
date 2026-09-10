// @ts-check
/**
 * Underwriting, screening and origination requests.
 */

'use strict';

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
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
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
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
  ).optional().description('Target green certification if known'),

  investorJurisdiction: Joi.string().max(200).optional()
    .description('Investor jurisdiction(s) for taxonomy selection, e.g. "ASEAN, Singapore"'),

  loanAmount: Joi.number().positive().optional()
    .description('Indicative loan amount for context'),
});

// ---------------------------------------------------------------------------
// Loan Origination Agent — POST /v1/agent/originate  (Stage 2)
//
// Construction-specific loan origination. Unlike Persefoni/Watershed/Sweep/
// Plan A (general Scope 1-3 platforms that cannot process BOQs), this agent
// integrates directly at the point of loan application, processing the bill
// of quantities that the bank already holds and producing a complete Green
// Loan Origination Decision Package in a single API call.
// ---------------------------------------------------------------------------

const originationRequestSchema = Joi.object({
  applicationReference: Joi.string().max(100).optional()
    .description('Bank-internal loan application reference number'),

  applicantName: Joi.string().max(300).optional()
    .description('Borrower / applicant name'),

  projectName: Joi.string().max(300).optional()
    .description('Project name'),

  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities: CSV rows, pasted text, or JSON string. '
      + 'When supplied, CarbonIQ performs material-level embodied carbon assessment '
      + 'rather than sector-average proxies — upgrading PCAF DQ score from 4-5 to 2-3.'),

  boqFormat: Joi.string().valid('csv', 'text', 'json').default('text')
    .description('Format of the BOQ content'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type — required for benchmark lookup and taxonomy screening'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for regulatory taxonomy and carbon tax context'),

  loanAmount: Joi.number().positive().optional()
    .description('Requested loan amount (local currency)'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value for PCAF attribution factor'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years for covenant trajectory design'),

  greenLoanTarget: Joi.boolean().optional().default(true)
    .description('Whether the bank is targeting green loan classification'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
  ).optional().description('Borrower-stated target green certification'),

  investorJurisdiction: Joi.string().max(200).optional()
    .description('Taxonomies to screen against, e.g. "ASEAN, Singapore, EU"'),

  projectDescription: Joi.string().max(5000).optional()
    .description('Free-text project description for context'),
});

module.exports = { underwritingRequestSchema, screeningRequestSchema, originationRequestSchema };
