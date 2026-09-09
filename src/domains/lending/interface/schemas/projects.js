const Joi = require('joi');

const createProjectSchema = Joi.object({
  name:         Joi.string().min(2).max(120).required(),
  projectId:    Joi.string().max(40).optional().allow(''),
  type:         Joi.string().valid('Commercial','Residential','Industrial','Mixed-Use','Data Centre','Hospitality').default('Commercial'),
  region:       Joi.string().valid('SG','MY','HK','EU','TH','US','LK').default('SG'),
  phase:        Joi.string().valid('Construction','Operational','Demolition').default('Construction'),
  floorArea_m2: Joi.number().min(0).optional(),
  materials: Joi.array().items(Joi.object({
    name:     Joi.string().required(),
    category: Joi.string().required(),
    qty:      Joi.number().min(0).required(),
    unit:     Joi.string().valid('kg','tonnes').default('kg'),
  })).optional(),
  loan: Joi.object({
    outstanding: Joi.number().min(0).required(),
    equity:      Joi.number().min(0).required(),
    debt:        Joi.number().min(0).required(),
    currency:    Joi.string().max(5).default('USD'),
  }).optional(),
  totalEmbodiedCarbon_kgCO2e: Joi.number().min(0).optional(),
}).options({ stripUnknown: true });

const monitoringEntrySchema = Joi.object({
  year:        Joi.number().integer().min(2000).max(2100).required(),
  outstanding: Joi.number().min(0).required(),
  equity:      Joi.number().min(0).required(),
  debt:        Joi.number().min(0).required(),
  emissions:   Joi.number().min(0).required(),
  dq:          Joi.number().integer().min(1).max(5).default(2),
}).options({ stripUnknown: true });

module.exports = { createProjectSchema, monitoringEntrySchema };
