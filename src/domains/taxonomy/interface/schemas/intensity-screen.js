// @ts-check
'use strict';

const Joi = require('joi');

const intensityScreenSchema = Joi.object({
  intensity_kgCO2e_m2: Joi.number().min(0).required().description('Embodied carbon per square metre'),
  country: Joi.string().length(2).uppercase().default('LK'),
}).options({ stripUnknown: true });

module.exports = { intensityScreenSchema };
