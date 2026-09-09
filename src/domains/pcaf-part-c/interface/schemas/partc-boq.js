/**
 * CarbonIQ FinTech — PCAF Part C: BOQ Revision Schemas
 *
 * A bill of quantities is never final. It arrives at tender, changes through
 * variation orders, and settles as-built. Each state is a revision, and an
 * assessment is always bound to exactly one of them.
 */

'use strict';

const Joi = require('joi');
const { materialSchema } = require('./pcaf-partc');

const REVISION_SOURCES = ['paste', 'pdf', 'agent', 'seed'];

const boqRevisionSchema = Joi.object({
  label: Joi.string().trim().max(40).optional()
    .description('R1, R2, R3 … assigned automatically when omitted'),
  note: Joi.string().trim().max(500).allow('').optional()
    .description('Why this revision exists — "VO-01 foundations", "as-built"'),
  source: Joi.string().valid(...REVISION_SOURCES).default('paste'),
  sourceRef: Joi.string().trim().max(200).allow('').optional()
    .description('Filename or Files API id the revision came from'),
  materials:       Joi.array().items(materialSchema).default([]),
  demolitionItems: Joi.array().items(materialSchema).default([]),
  createdBy: Joi.string().trim().max(120).allow('').optional()
}).custom((value, helpers) => {
  if ((value.materials || []).length === 0 && (value.demolitionItems || []).length === 0) {
    return helpers.message('A revision needs at least one material or demolition line.');
  }
  return value;
});

/**
 * Inputs held constant while two revisions are compared, so the delta is
 * attributable to the BOQ alone rather than to a changed site assumption.
 */
const compareRequestSchema = Joi.object({
  fromRevisionId: Joi.string().trim().max(80).optional()
    .description('Defaults to the revision immediately before "to"'),
  toRevisionId:   Joi.string().trim().max(80).required(),
  siteInputs: Joi.object({
    gifa_m2:         Joi.number().greater(0).optional(),
    demolitionKm:    Joi.number().min(0).optional(),
    wasteDisposalKm: Joi.number().min(0).optional(),
    previousProject: Joi.object({
      area_m2: Joi.number().min(0).optional(),
      fuel_L: Joi.number().min(0).optional(),
      electricity_kWh: Joi.number().min(0).optional(),
      durationMonths: Joi.number().min(0).optional()
    }).allow(null).optional()
  }).default({}),
  distances: Joi.object().pattern(Joi.string(), Joi.object({
    road: Joi.number().min(0).default(0),
    sea:  Joi.number().min(0).default(0),
    rail: Joi.number().min(0).default(0)
  })).default({}),
  policyId: Joi.string().trim().max(80).optional()
});

module.exports = { boqRevisionSchema, compareRequestSchema, REVISION_SOURCES };
