/**
 * CarbonIQ FinTech — PCAF Part C Registry Schemas
 *
 * The insurer's book: settings, clients, and the projects (with their
 * policies) that assessments are run against.
 *
 * Deliberately flat, per the agreed hierarchy: organisation → client →
 * project. No broker, reinsurer or class-of-business level. Policy details
 * live on the project rather than as a separate navigable entity, though a
 * project may hold several — a building typically carries CAR during
 * construction and then IDI for ten years afterwards.
 */

'use strict';

const Joi = require('joi');

const POLICY_TYPES  = ['CAR', 'EAR', 'IDI', 'Property'];
const PROJECT_TYPES = ['building', 'road', 'linear', 'structure', 'plant'];
const COVER_BASES   = ['project_specific'];   // annual/blanket deferred to a later phase
const WHO_PAYS      = ['OCIP', 'CCIP'];

const isoDate = Joi.string().isoDate();

/*
 * The default recalculation triggers, taken from the GHG Protocol Corporate
 * Value Chain (Scope 3) Standard and phrased for an insurance book. An entity
 * may extend them, but it may not publish a disclosure carrying none: a
 * recalculation protocol is a "shall" in the Part C checklist.
 */
const RECALCULATION_TRIGGERS = [
  'Structural change to the book — an acquisition, disposal or merger that moves policies into or out of the inventory.',
  'A change of calculation methodology, or of the emission factors relied on, that materially changes reported emissions.',
  'A change in the boundary of what is measured — a line of business, module or policy type entering or leaving the inventory.',
  'Discovery of a material error, or of several errors that are material in aggregate.',
  'A bill of quantities revision that moves a locked assessment by at least the restatement threshold.'
];

// ---------------------------------------------------------------------------
// Settings — one per insurer
// ---------------------------------------------------------------------------

const settingsSchema = Joi.object({
  insurerName:   Joi.string().trim().max(200).required(),
  reportingYear: Joi.number().integer().min(2000).max(2100).required(),
  currency:      Joi.string().trim().uppercase().length(3).default('LKR'),
  region:        Joi.string().trim().max(100).default('Sri Lanka'),
  premiumBasis:  Joi.string().valid('gross', 'net').default('gross')
    .description('net deducts reinsurance ceded to avoid double counting along the insurance chain'),
  restatementThresholdPct: Joi.number().min(0).max(100).default(5)
    .description('A recomputation moving the figure by at least this much restates a locked assessment'),
  reportingYearConvention: Joi.string().valid('inception').default('inception')
    .description('The construction figure lands in the year the policy incepts'),

  /* Base-year recalculation. PCAF Part C's disclosure checklist (RECALCULATION,
     p.99) makes a stated recalculation protocol and a stated significance
     threshold requirements, not recommendations: without them a reader cannot
     tell whether a moved base year reflects a changed book or a changed method.
     They belong to the reporting entity, not to any one assessment, so they are
     held here and printed in every report. */
  baseYear: Joi.number().integer().min(2000).max(2100).allow(null).default(null)
    .description('The inventory base year against which progress is measured'),
  significanceThresholdPct: Joi.number().min(0).max(100).default(5)
    .description('Cumulative change in base-year emissions that triggers a base-year recalculation, per the GHG Protocol Scope 3 Standard'),
  recalculationTriggers: Joi.array().items(Joi.string().trim().max(300)).max(20)
    .default(RECALCULATION_TRIGGERS)
    .description('The circumstances that trigger recalculation of base-year emissions'),
  recalculationPolicy: Joi.string().trim().max(2000).allow('').default('')
    .description('Any additional protocol the entity applies beyond the standard triggers')
});

// ---------------------------------------------------------------------------
// Client — the insured party
// ---------------------------------------------------------------------------

const clientSchema = Joi.object({
  name:    Joi.string().trim().min(2).max(200).required(),
  sector:  Joi.string().trim().max(120).allow('').optional(),
  country: Joi.string().trim().max(100).default('Sri Lanka'),
  contactName:  Joi.string().trim().max(200).allow('').optional(),
  contactEmail: Joi.string().email().allow('').optional(),
  notes:   Joi.string().trim().max(2000).allow('').optional()
});

const clientUpdateSchema = clientSchema.fork(['name'], f => f.optional()).min(1);

// ---------------------------------------------------------------------------
// Policy — held on the project
// ---------------------------------------------------------------------------

const policySchema = Joi.object({
  policyId:   Joi.string().trim().max(60).optional(),
  reference:  Joi.string().trim().max(80).allow('').optional()
    .description("The insurer's own policy number"),
  lineType:   Joi.string().valid(...POLICY_TYPES).required(),
  coverBasis: Joi.string().valid(...COVER_BASES).default('project_specific'),
  premium:    Joi.number().min(0).required(),
  reinsuranceCeded: Joi.number().min(0).default(0),
  inception:  isoDate.required(),
  expiry:     isoDate.required(),
  whoPays:    Joi.string().valid(...WHO_PAYS).allow('').optional(),
  yearsOfCover: Joi.number().min(0).max(100).optional()
    .description('Use-stage window for IDI/Property. Ignored for CAR/EAR by the scope gate.')
}).custom((value, helpers) => {
  if (new Date(value.expiry) <= new Date(value.inception)) {
    return helpers.message('expiry must be after inception');
  }
  return value;
});

// ---------------------------------------------------------------------------
// Project — the physical asset
// ---------------------------------------------------------------------------

const projectSchema = Joi.object({
  clientId: Joi.string().trim().max(60).required(),
  name:     Joi.string().trim().min(2).max(200).required(),
  projectType: Joi.string().valid(...PROJECT_TYPES).default('building'),
  gifa_m2:  Joi.number().greater(0).required()
    .description('Drives A5.2 site energy and the per-m2 factor, so it is required'),
  location: Joi.string().trim().max(200).allow('').optional(),
  projectCost: Joi.number().greater(0).required()
    .description('Denominator of the attribution factor for project-specific cover'),
  constructionStart: isoDate.optional(),
  constructionEnd:   isoDate.optional(),
  policies: Joi.array().items(policySchema).default([]),
  notes:    Joi.string().trim().max(2000).allow('').optional()
});

const projectUpdateSchema = projectSchema
  .fork(['clientId', 'name', 'gifa_m2', 'projectCost'], f => f.optional())
  .min(1);

module.exports = {
  settingsSchema, clientSchema, clientUpdateSchema,
  projectSchema, projectUpdateSchema, policySchema,
  POLICY_TYPES, PROJECT_TYPES, COVER_BASES, WHO_PAYS, RECALCULATION_TRIGGERS
};
