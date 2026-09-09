/**
 * CarbonIQ FinTech — PCAF Part C Assessment Schemas
 *
 * An assessment is one PCAF calculation bound to a specific policy, a
 * specific BOQ revision and a specific reporting year. That binding is what
 * makes it auditable: a figure in an annual disclosure can be traced back to
 * the exact bill of quantities it was computed from.
 */

'use strict';

const Joi = require('joi');

const STATUSES = ['draft', 'under_review', 'locked', 'superseded'];

const createAssessmentSchema = Joi.object({
  projectId:      Joi.string().trim().max(80).required(),
  policyId:       Joi.string().trim().max(80).required(),
  boqRevisionId:  Joi.string().trim().max(80).required()
    .description('The revision this figure is computed from — the audit anchor'),
  siteInputs: Joi.object({
    demolitionKm:    Joi.number().min(0).optional(),
    wasteDisposalKm: Joi.number().min(0).optional(),
    previousProject: Joi.object({
      area_m2:         Joi.number().min(0).optional(),
      fuel_L:          Joi.number().min(0).optional(),
      electricity_kWh: Joi.number().min(0).optional(),
      durationMonths:  Joi.number().min(0).optional()
    }).allow(null).optional()
  }).default({}),
  useStage: Joi.object({
    equipmentType:   Joi.string().trim().max(120).optional(),
    refrigerant:     Joi.string().trim().max(60).optional(),
    chargeKg:        Joi.number().min(0).optional(),
    capacityKW:      Joi.number().min(0).optional(),
    occupants:       Joi.number().min(0).optional(),
    annualVolume_m3: Joi.number().min(0).optional(),
    hvacServiceLifeYears: Joi.number().min(1).max(100).optional()
  }).default({}),
  distances: Joi.object().pattern(Joi.string(), Joi.object({
    road: Joi.number().min(0).default(0),
    sea:  Joi.number().min(0).default(0),
    rail: Joi.number().min(0).default(0)
  })).default({}),
  /** Required when this supersedes a locked assessment materially. */
  restatementReason: Joi.string().trim().max(1000).allow('').optional(),
  hasEPD: Joi.boolean().default(false)
});

const statusChangeSchema = Joi.object({
  status: Joi.string().valid('draft', 'under_review', 'locked').required(),
  note:   Joi.string().trim().max(1000).allow('').optional()
});

module.exports = { createAssessmentSchema, statusChangeSchema, STATUSES };
