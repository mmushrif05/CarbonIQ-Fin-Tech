// @ts-check
/**
 * Joi validation for the PCAF Part A §5.4 / §5.5 real-estate endpoint.
 *
 * Thin, like the other Part A schemas: the engine refuses what the standard
 * refuses — a listed owner (→ §5.1), a property-secured loan for another
 * purpose (→ §5.2), a HEL/HELOC or construction mortgage, a missing origination
 * value, an attribution factor above 1, a building type or label not held —
 * with the clause and the remedy. The schema only shapes the request.
 */

'use strict';

const Joi = require('joi');

const realEstateRequestSchema = Joi.object({
  class: Joi.string().valid('commercial-real-estate', 'mortgages').required(),
  country: Joi.string().length(2).uppercase().default('LK'),
  buildingType: Joi.string().max(60).optional(),

  /* Boundary flags — each redirects out of the class rather than being assessed here. */
  borrowerListed: Joi.boolean().optional(),
  securedForOtherPurpose: Joi.boolean().optional(),
  productType: Joi.string().valid('purchase', 'refinance', 'construction', 'renovation', 'hel', 'heloc').optional(),

  exposure: Joi.object({
    outstanding: Joi.number().min(0).required(),
    currency: Joi.string().max(10).default('LKR'),
    asOf: Joi.string().max(40).optional(),
  }).required(),

  /* The origination-value denominator, in its three states. Supply one. */
  value: Joi.object({
    atOrigination: Joi.number().positive().optional(),
    latest: Joi.number().positive().optional(),
    modification: Joi.object({
      newValuation: Joi.number().positive().required(),
      date: Joi.string().max(40).optional(),
    }).optional(),
  }).or('atOrigination', 'latest', 'modification').required(),

  /* How the building's energy is known — one of these paths. */
  energy: Joi.object({
    electricity_kWh: Joi.number().min(0).optional(),
    fuel_kWh: Joi.number().min(0).optional(),
    fuelSource: Joi.string().valid('diesel', 'lpg').optional(),
    emissionFactorBasis: Joi.string().valid('supplier', 'average').default('average'),
    electricityFactor: Joi.number().min(0).optional(),
    fuelFactor: Joi.number().min(0).optional(),
  }).or('electricity_kWh', 'fuel_kWh').optional(),
  label: Joi.string().max(4).optional(),
  floorArea_m2: Joi.number().positive().optional(),
  buildingCount: Joi.number().integer().positive().optional(),

  developerConstructionEmissions_tCO2e: Joi.number().min(0).optional(),
}).unknown(false);

module.exports = { realEstateRequestSchema };
