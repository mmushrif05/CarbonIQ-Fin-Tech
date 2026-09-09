/**
 * Joi validation for the PCAF Part A endpoints.
 *
 * Validation here is deliberately thin. The engine refuses what the standard
 * refuses — an attribution factor above 1, a missing counterfactual, a
 * prohibited estimation basis — and it refuses with the clause and the remedy.
 * Duplicating those rules in a schema would mean two places to keep in step,
 * and the schema would answer with a generic message where the engine answers
 * with the reason.
 */

'use strict';

const Joi = require('joi');

const reduction = Joi.object({
  baseYear: Joi.number().integer().required(),
  baseYearEmissions_tCO2e: Joi.number().min(0).required(),
  targetYear: Joi.number().integer().required(),
  targetYearEmissions_tCO2e: Joi.number().min(0).required(),
  asOfYear: Joi.number().integer().optional(),
});

const avoided = Joi.object({
  projectAvoided_tCO2e: Joi.number().min(0).optional(),
  annualAvoided_tCO2e: Joi.number().min(0).optional(),
  counterfactual: Joi.string().max(500).optional(),
  counterfactualSource: Joi.string().max(500).optional(),
  estimationBasis: Joi.string().max(60).optional(),
  years: Joi.number().integer().min(1).optional(),
  reportingPeriod: Joi.alternatives(Joi.number(), Joi.string()).optional(),
  counterpartyEmissionsPeriod: Joi.alternatives(Joi.number(), Joi.string()).optional(),
});

/* The renewable-generation path. Two fields carry it — what the plant makes in
   a year and where it stands — and the engine derives the scopes, the displaced
   emissions and the data quality option from a named factor. Capacity is
   optional and unlocks the physical check; metered auxiliary consumption is
   optional and replaces an assumption with a measurement. */
const generation = Joi.object({
  country: Joi.string().length(2).uppercase().required(),
  technology: Joi.string().valid('solar_pv', 'wind_on', 'hydro_ror').default('solar_pv'),

  /* Which figure drives which. Projected derives generation from capacity;
     metered takes the generation as given and never overwrites it. */
  basis: Joi.string().valid('projected', 'metered').default('projected'),
  installedCapacity_MW: Joi.number().positive().optional(),
  annualGeneration_MWh: Joi.number().positive().optional(),

  yieldBasis: Joi.string().valid('P50', 'P90').default('P50'),
  degradationRatePct: Joi.number().min(0).max(5).optional(),
  lifetimeYears: Joi.number().integer().min(1).max(60).optional(),
  auxiliaryConsumption_MWh: Joi.number().min(0).optional(),
});
const assessRequestSchema = Joi.object({
  projectName: Joi.string().max(200).required(),
  counterparty: Joi.string().max(200).allow('').optional(),
  sector: Joi.string().max(120).allow('').optional(),
  reportingYear: Joi.number().integer().min(2000).max(2100).optional(),

  assetClass: Joi.string().max(60).default('project-finance'),
  archetype: Joi.string().max(60).default('general'),

  outstandingAmount: Joi.number().min(0).required(),
  totalProjectEquityPlusDebt: Joi.number().required(),
  currency: Joi.string().max(10).default('USD'),
  attributionOverrideJustification: Joi.string().max(500).optional(),

  dataQualityOption: Joi.string().max(4).optional(),
  dataQualityOverrideJustification: Joi.string().max(500).optional(),

  projectScope1_tCO2e: Joi.number().optional(),
  projectScope2_tCO2e: Joi.number().optional(),
  projectScope3_tCO2e: Joi.number().optional(),
  scope3Relevant: Joi.boolean().optional(),
  removals_tCO2e: Joi.number().min(0).optional(),

  generation: generation.optional(),
  reduction: reduction.optional(),
  avoided: avoided.optional(),
});

module.exports = { assessRequestSchema };
