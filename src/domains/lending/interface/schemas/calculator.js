// @ts-check
/**
 * CarbonIQ FinTech — the lending calculator schemas
 *
 * `POST /v1/lending/attribution` and `POST /v1/lending/estimate`: the two
 * stateless questions the PCAF calculator and the new-project wizard ask.
 */

'use strict';

const Joi = require('joi');

const attributionRequestSchema = Joi.object({
  outstanding:     Joi.number().min(0).required().description('The bank\'s outstanding amount'),
  equity:          Joi.number().min(0).required().description('Project equity'),
  debt:            Joi.number().min(0).required().description('Project debt'),
  emissions_tCO2e: Joi.number().min(0).required().description('The project\'s annual emissions, tCO2e'),
  projectPhase:    Joi.string().valid('Construction', 'Operational').default('Operational'),
  projectType:     Joi.string().max(40).default('Commercial'),
  dqScore:         Joi.number().integer().min(1).max(5).optional(),
}).options({ stripUnknown: true });

const estimateRequestSchema = Joi.object({
  materials: Joi.array().max(500).items(Joi.object({
    name:     Joi.string().allow('').max(200).default(''),
    category: Joi.string().allow('').max(60).default(''),
    qty:      Joi.number().min(0).default(0),
    unit:     Joi.string().valid('kg', 'tonnes').default('kg'),
  })).default([]),
  floorArea_m2: Joi.number().min(0).optional(),
  loan: Joi.object({
    outstanding: Joi.number().min(0).optional(),
    equity:      Joi.number().min(0).optional(),
    debt:        Joi.number().min(0).optional(),
  }).optional(),
}).options({ stripUnknown: true });

module.exports = { attributionRequestSchema, estimateRequestSchema };
