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
    .description('The construction figure lands in the year the policy incepts')
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
  POLICY_TYPES, PROJECT_TYPES, COVER_BASES, WHO_PAYS
};
