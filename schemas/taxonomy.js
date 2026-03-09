/**
 * CarbonIQ FinTech — Taxonomy Alignment Schema
 *
 * Validates input for the /v1/taxonomy endpoint.
 * Checks a project's alignment against regional green taxonomies
 * (ASEAN, EU, HK, SG).
 */

const Joi = require('joi');

const taxonomyRequestSchema = Joi.object({
  project: Joi.object({
    name: Joi.string().trim().min(1).max(300).required(),
    type: Joi.string().valid(
      'residential', 'commercial', 'industrial', 'infrastructure',
      'mixed-use', 'renovation', 'demolition'
    ).required(),
    grossFloorArea: Joi.number().positive().required(),
    location: Joi.object({
      country: Joi.string().length(2).uppercase().required(),
      city: Joi.string().trim().max(200).optional(),
    }).required(),
  }).required(),

  carbonIntensity: Joi.object({
    embodied: Joi.number().min(0).required()
      .description('kgCO2e/m2 — embodied carbon intensity'),
    operational: Joi.number().min(0).optional()
      .description('kgCO2e/m2/year — operational carbon intensity'),
  }).required(),

  taxonomies: Joi.array().items(
    Joi.string().valid('ASEAN', 'EU', 'HK', 'SG')
  ).min(1).max(4).required()
    .description('Which taxonomies to check against'),

  certifications: Joi.array().items(
    Joi.object({
      scheme: Joi.string().valid(
        'LEED', 'BREEAM', 'GREEN_MARK', 'BEAM_PLUS', 'EDGE', 'NABERS', 'OTHER'
      ).required(),
      level: Joi.string().trim().max(50).required(),
      year: Joi.number().integer().min(2000).max(2100).optional(),
    })
  ).optional().default([]),

  options: Joi.object({
    includeThresholds: Joi.boolean().default(true),
    includeGapAnalysis: Joi.boolean().default(true),
  }).default(),
});

module.exports = { taxonomyRequestSchema };
