/**
 * CarbonIQ FinTech — Supervisor Pipeline Request Schemas
 *
 * Joi validation schemas for the supervisor/pipeline endpoints.
 */

'use strict';

const Joi = require('joi');
const { PIPELINE_TEMPLATES } = require('../models/pipeline');

const templateIds = Object.keys(PIPELINE_TEMPLATES);

// ---------------------------------------------------------------------------
// POST /v1/supervisor/pipeline — Create and run a multi-agent pipeline
// ---------------------------------------------------------------------------

const createPipelineSchema = Joi.object({
  templateId: Joi.string().valid(...templateIds).required()
    .description(`Pipeline template. Available: ${templateIds.join(', ')}`),

  // Shared input — matches the union of all agent input schemas
  projectName: Joi.string().max(300).optional(),
  projectDescription: Joi.string().min(10).max(5000).optional(),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type — required for all pipeline stages'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area (m²)'),

  region: Joi.string().max(100).optional().default('Singapore'),

  // BOQ (for origination/underwriting stages)
  boqContent: Joi.string().min(10).max(200000).optional(),
  boqFormat:  Joi.string().valid('csv', 'text', 'json').default('text'),

  // Financial parameters
  loanAmount:    Joi.number().positive().optional(),
  projectValue:  Joi.number().positive().optional(),
  loanTermYears: Joi.number().integer().min(1).max(30).optional(),

  // Origination fields
  applicationReference: Joi.string().max(100).optional(),
  applicantName:        Joi.string().max(300).optional(),
  greenLoanTarget:      Joi.boolean().optional().default(true),

  // Carbon metrics (for monitoring/covenant stages)
  currentTCO2e:             Joi.number().positive().optional(),
  currentIntensity_kgCO2e_m2: Joi.number().positive().optional(),
  reductionPct:             Joi.number().min(0).max(100).optional(),
  epdCoveragePct:           Joi.number().min(0).max(100).optional(),

  // Monitoring-specific
  covenants:        Joi.array().optional(),
  currentMetrics:   Joi.object().optional(),
  projectComplete_pct: Joi.number().min(0).max(100).optional(),
  drawdownRequested:   Joi.boolean().optional(),

  // Portfolio-specific
  assets:          Joi.array().optional(),
  portfolioName:   Joi.string().max(300).optional(),
  reportingEntity: Joi.string().max(300).optional(),
  reportingPeriod: Joi.string().max(50).optional(),

  // Certification / taxonomy
  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional(),
  investorJurisdiction: Joi.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// POST /v1/supervisor/pipeline/:pipelineId/resume — Resume a paused pipeline
// ---------------------------------------------------------------------------

const resumePipelineSchema = Joi.object({
  stageId: Joi.string().required()
    .description('The paused stage to resume (e.g. "covenants")'),

  decision: Joi.string().valid('approved', 'modified', 'rejected').required()
    .description('Human review decision for the paused stage'),

  reviewerId: Joi.string().min(1).max(300).required()
    .description('Reviewer identifier'),

  reason: Joi.string().max(2000).optional(),
  modifications: Joi.array().optional(),
});

module.exports = {
  createPipelineSchema,
  resumePipelineSchema,
};
