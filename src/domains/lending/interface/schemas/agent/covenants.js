// @ts-check
/**
 * Covenant drafting and review requests.
 */

'use strict';

const Joi = require('joi');

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
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready',
    'greensl_platinum', 'greensl_gold'
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

// ---------------------------------------------------------------------------
// Covenant Human Review — POST /v1/agent/covenants/:runId/review  (Stage 3)
//
// EU AI Act Article 22 + Annex III, point 5(b): AI systems used for
// creditworthiness assessment and credit scoring in financial services are
// classified as HIGH-RISK. Banks must maintain mandatory human oversight
// before AI-recommended covenant terms take legal effect. Enforcement begins
// August 2026. This schema validates the human reviewer's decision payload.
// ---------------------------------------------------------------------------

const covenantModificationSchema = Joi.object({
  metric: Joi.string().valid(
    'total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'
  ).required().description('KPI metric being overridden'),

  originalThreshold: Joi.number().required()
    .description('AI-recommended threshold'),

  revisedThreshold: Joi.number().required()
    .description('Human-approved threshold (override)'),

  justification: Joi.string().min(10).max(1000).required()
    .description('Documented reason for overriding the AI recommendation — required for EU AI Act audit trail')
});

const covenantReviewSchema = Joi.object({
  decision: Joi.string().valid('approved', 'modified', 'rejected').required()
    .description(
      'approved  — Accept all AI-recommended covenant terms as-is.\n'
      + 'modified  — Accept with specific threshold changes (requires modifications array).\n'
      + 'rejected  — Reject all recommendations; agent run must be re-submitted.\n'
      + 'This decision and its rationale are immutably recorded per EU AI Act Art. 22.'
    ),

  reviewerId: Joi.string().min(1).max(300).required()
    .description('Bank officer identifier (email or user ID) — recorded in audit trail'),

  reason: Joi.string().min(5).max(2000).when('decision', {
    is: Joi.valid('modified', 'rejected'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }).description('Required for modified/rejected decisions. Becomes part of the immutable audit record.'),

  modifications: Joi.array().items(covenantModificationSchema)
    .min(1).max(10)
    .when('decision', {
      is: 'modified',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .description('Required when decision is modified. Each entry documents an AI override with justification.')
});

module.exports = { covenantsRequestSchema, covenantItemSchema, currentMetricsSchema, covenantModificationSchema, covenantReviewSchema };
