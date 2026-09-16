// @ts-check
/**
 * Joi validation for a §5.6 motor vehicle facility. Thin, like the other Part A
 * schemas: the engine derives the option from what is supplied and refuses what
 * the standard refuses — a class it does not hold, an efficiency in kWh on a
 * combustion vehicle, an outstanding above the value at origination — with the
 * clause and the remedy. The schema shapes the request.
 */

'use strict';

const Joi = require('joi');

const vehicleSchema = Joi.object({
  id: Joi.string().max(80).optional(),
  vehicleClass: Joi.string().max(40).optional(),
  fuel: Joi.string().valid('petrol', 'diesel', 'electricity', 'hybrid', 'plug-in-hybrid').optional(),
  makeModel: Joi.string().max(120).optional(),
  registration: Joi.string().max(40).optional(),
  efficiency: Joi.object({
    value: Joi.number().positive().required(),
    unit: Joi.string().valid('L/100km', 'km/L', 'kWh/100km', 'km/kWh').default('L/100km'),
    basis: Joi.string().valid('make-model', 'class').default('make-model'),
    cycle: Joi.string().max(20).optional(),
    source: Joi.string().max(300).optional(),
  }).optional(),
  distance: Joi.object({
    value_km: Joi.number().min(0).required(),
    basis: Joi.string().valid('actual', 'local', 'regional').default('local'),
    source: Joi.string().max(300).optional(),
  }).optional(),
  fuelConsumed: Joi.object({
    petrol_L: Joi.number().min(0).optional(),
    diesel_L: Joi.number().min(0).optional(),
    electricity_kWh: Joi.number().min(0).optional(),
  }).or('petrol_L', 'diesel_L', 'electricity_kWh').optional(),
  electricShare: Joi.number().min(0).max(1).optional(),
  productionEmissions_tCO2e: Joi.number().min(0).optional(),
}).unknown(false);

const motorVehiclesRequestSchema = Joi.object({
  country: Joi.string().length(2).uppercase().default('LK'),
  productType: Joi.string().valid('vehicle-loan', 'lease', 'hire-purchase').optional(),
  exposure: Joi.object({
    outstanding: Joi.number().min(0).required(),
    currency: Joi.string().max(10).default('LKR'),
    asOf: Joi.string().max(40).optional(),
  }).required(),
  /* Optional on purpose: unknown → 100 % attribution, the standard's default (p.91). */
  value: Joi.object({ atOrigination: Joi.number().positive().optional() }).optional(),
  vehicles: Joi.array().items(vehicleSchema).min(1).max(500).required(),
}).unknown(false);

module.exports = { motorVehiclesRequestSchema, vehicleSchema };
