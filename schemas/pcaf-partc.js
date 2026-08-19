/**
 * CarbonIQ FinTech — PCAF Part C Request Schemas
 *
 * Validates the insurance-associated-emissions endpoints. Distinct from
 * schemas/pcaf.js, which covers A1-A3 financed emissions for lending.
 */

'use strict';

const Joi = require('joi');

const UNITS = ['m3', 'm2', 'm', 'MT', 'kg', 'Nr'];
const POLICY_TYPES = ['CAR', 'EAR', 'IDI', 'Property'];
const BASES = ['motor', 'project_specific', 'annual', 'treaty'];

const materialSchema = Joi.object({
  id:       Joi.string().trim().max(120).optional(),
  name:     Joi.string().trim().max(300).required(),
  sourceText: Joi.string().trim().max(2000).optional(),
  quantity: Joi.number().min(0).required(),
  unit:     Joi.string().valid(...UNITS).required(),
  densityKey:          Joi.string().trim().max(120).allow(null, '').optional(),
  massFactorKey:       Joi.string().trim().max(120).allow(null, '').optional(),
  massFactor:          Joi.number().min(0).optional(),
  wasteCategory:       Joi.string().trim().max(200).allow(null, '').optional(),
  serviceLifeCategory: Joi.string().trim().max(200).allow(null, '').optional(),
  confidence:          Joi.string().valid('high', 'medium', 'low').optional(),
  correctedByClient:   Joi.boolean().optional(),
  distance: Joi.object({
    road: Joi.number().min(0).default(0),
    sea:  Joi.number().min(0).default(0),
    rail: Joi.number().min(0).default(0),
    air:  Joi.number().min(0).default(0)
  }).optional()
});

const policySchema = Joi.object({
  policyType:  Joi.string().valid(...POLICY_TYPES).required(),
  basis:       Joi.string().valid(...BASES).default('project_specific'),
  premium:     Joi.number().min(0).optional(),
  currency:    Joi.string().trim().max(8).optional(),
  projectCost: Joi.number().min(0).optional(),
  revenue:     Joi.number().min(0).optional(),
  tco:         Joi.number().min(0).optional(),
  ceded:        Joi.number().min(0).optional(),
  grossPremium: Joi.number().min(0).optional(),
  reinsuranceCeded: Joi.number().min(0).optional(),
  yearsOfCover: Joi.number().min(0).max(100).optional(),
  precision:    Joi.number().integer().min(0).max(12).optional()
    .description('Round the attribution factor to this many decimals before use. Omit to carry the exact ratio.'),
  insurer: Joi.string().trim().max(200).optional(),
  insured: Joi.string().trim().max(200).optional(),
  reportingYear: Joi.number().integer().min(1900).max(2200).optional()
}).unknown(true);

const siteInputsSchema = Joi.object({
  gifa_m2:         Joi.number().min(0).required(),
  demolitionKm:    Joi.number().min(0).optional(),
  wasteDisposalKm: Joi.number().min(0).optional(),
  demolitionItems: Joi.array().items(materialSchema).default([]),
  demolitionMass_t: Joi.number().min(0).optional(),
  previousProject: Joi.object({
    area_m2:         Joi.number().min(0).optional(),
    fuel_L:          Joi.number().min(0).optional(),
    electricity_kWh: Joi.number().min(0).optional(),
    durationMonths:  Joi.number().min(0).optional()
  }).allow(null).optional()
});

const useStageSchema = Joi.object({
  equipmentType:   Joi.string().trim().max(120).optional(),
  refrigerant:     Joi.string().trim().max(60).optional(),
  chargeKg:        Joi.number().min(0).optional(),
  capacityKW:      Joi.number().min(0).optional(),
  hvacServiceLifeYears: Joi.number().min(1).max(100).optional(),
  occupants:       Joi.number().min(0).optional(),
  annualVolume_m3: Joi.number().min(0).optional()
});

const assessRequestSchema = Joi.object({
  projectName: Joi.string().trim().max(200).optional(),
  policy:      policySchema.required(),
  materials:   Joi.array().items(materialSchema).default([]),
  distances:   Joi.object().pattern(Joi.string(), Joi.object({
    road: Joi.number().min(0).default(0),
    sea:  Joi.number().min(0).default(0),
    rail: Joi.number().min(0).default(0),
    air:  Joi.number().min(0).default(0)
  })).default({}),
  siteInputs:  siteInputsSchema.required(),
  useStage:    useStageSchema.default({}),
  beyondPcaf:  Joi.object({
    b2Allowance: Joi.number().min(0).optional(),
    b5Allowance: Joi.number().min(0).optional(),
    b8Manual:    Joi.number().min(0).optional()
  }).default({}),
  options: Joi.object({ evUsedOnSite: Joi.boolean().default(false) }).default({}),
  hasEPD:  Joi.boolean().default(false),
  context: Joi.object({
    region:      Joi.string().trim().max(100).default('Sri Lanka'),
    projectType: Joi.string().trim().max(100).optional()
  }).default({}),
  persist: Joi.boolean().default(true)
});

const formRequestSchema = Joi.object({
  policy:    Joi.object({ policyType: Joi.string().valid(...POLICY_TYPES).optional() }).unknown(true).default({}),
  materials: Joi.array().items(materialSchema).default([]),
  prefill:   Joi.object().unknown(true).default({})
});

const reportRequestSchema = assessRequestSchema.keys({
  format: Joi.string().valid('pdf', 'docx', 'json').default('pdf'),
  includeWlcaAnnex: Joi.boolean().default(false),
  memo: Joi.string().max(50000).allow('').optional(),
  meta: Joi.object({
    insurer: Joi.string().trim().max(200).optional(),
    insured: Joi.string().trim().max(200).optional(),
    orgName: Joi.string().trim().max(200).optional()
  }).default({})
});

const mappingRequestSchema = Joi.object({
  boqContent: Joi.string().max(500000).required(),
  boqFormat:  Joi.string().valid('text', 'csv', 'json', 'markdown').default('text'),
  projectName: Joi.string().trim().max(200).optional()
});

const intakeRequestSchema = Joi.object({
  documentText: Joi.string().max(500000).required(),
  documentNote: Joi.string().max(2000).optional(),
  projectName:  Joi.string().trim().max(200).optional()
});

module.exports = {
  assessRequestSchema, formRequestSchema, reportRequestSchema,
  mappingRequestSchema, intakeRequestSchema,
  materialSchema, policySchema
};
