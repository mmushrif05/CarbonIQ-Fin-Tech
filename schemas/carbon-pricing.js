/**
 * CarbonIQ FinTech — Carbon Pricing Request Validation Schema
 */

const Joi = require('joi');

const carbonPricingSchema = Joi.object({
  emissions_tCO2e: Joi.number()
    .positive()
    .required()
    .messages({ 'any.required': 'emissions_tCO2e is required.' }),

  loanAmount: Joi.number()
    .positive()
    .required()
    .messages({ 'any.required': 'loanAmount (bank outstanding exposure) is required.' }),

  projectValue: Joi.number()
    .positive()
    .required()
    .messages({ 'any.required': 'projectValue (total project value) is required.' }),

  region: Joi.string()
    .valid('SG', 'EU', 'MY', 'HK')
    .default('SG')
    .messages({ 'any.only': 'region must be one of: SG, EU, MY, HK' }),

  cfsScore: Joi.number()
    .min(0)
    .max(100)
    .default(50)
    .messages({ 'number.min': 'cfsScore must be between 0 and 100.' }),

  buildingArea_m2: Joi.number()
    .positive()
    .optional()
    .allow(null),

  loanTerm_years: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(5),
});

module.exports = { carbonPricingSchema };
