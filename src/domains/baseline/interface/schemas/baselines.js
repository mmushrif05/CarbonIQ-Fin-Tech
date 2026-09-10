// @ts-check
/**
 * What a request to the baseline registry may say.
 *
 * Every write here is validated by the shared `validate()` middleware, so the
 * generated OpenAPI document describes these shapes without anyone writing
 * them out a second time.
 */

'use strict';

const Joi = require('joi');
const { KEYS } = require('../../domain/metrics');
const { SCOPES } = require('../../domain/baseline');

const isoDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('must be a date as YYYY-MM-DD');

const createBaselineSchema = Joi.object({
  metric: Joi.string().valid(...KEYS).required(),
  scope: Joi.string().valid(...SCOPES).required(),
  country: Joi.string().trim().uppercase().length(2)
    .description('ISO 3166-1 alpha-2. Required for a country or organisation baseline.')
    .when('scope', { is: 'global', then: Joi.forbidden(), otherwise: Joi.required() }),
  orgId: Joi.string().trim().max(80)
    .when('scope', { is: 'organisation', then: Joi.optional(), otherwise: Joi.forbidden() })
    .description('Defaults to the calling organisation; an organisation cannot govern another.'),
  values: Joi.object().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/, Joi.number().min(0)).required()
    .description('The fields the metric declares — bands, or a single value.'),
  effectiveFrom: isoDate.optional(),
  source: Joi.string().trim().min(3).max(2000).required()
    .description('The document or judgement this figure rests on. A baseline nobody can trace is not a baseline.'),
  authority: Joi.string().trim().max(200).optional()
    .description('Who stands behind it.'),
  note: Joi.string().trim().max(2000).optional(),
}).options({ stripUnknown: true });

const supersedeSchema = Joi.object({
  values: Joi.object().pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/, Joi.number().min(0)).required(),
  reason: Joi.string().trim().max(2000).optional()
    .description('Required where the movement reaches the restatement threshold.'),
  source: Joi.string().trim().min(3).max(2000).optional(),
  authority: Joi.string().trim().max(200).optional(),
  note: Joi.string().trim().max(2000).optional(),
  effectiveFrom: isoDate.optional(),
}).options({ stripUnknown: true });

const pledgeSchema = Joi.object({
  metric: Joi.string().valid(...KEYS).required(),
  targetPct: Joi.number().greater(0).max(100).required()
    .description('The reduction the entity committed to, against its baseline.'),
  baseYear: Joi.number().integer().min(1990).max(2100).required(),
  targetYear: Joi.number().integer().min(1990).max(2100).required(),
  basis: Joi.string().trim().max(500).optional()
    .description("What the percentage is of, in the entity's own words."),
  statedBy: Joi.string().trim().min(2).max(200).required()
    .description('A pledge belongs to whoever made it. This product does not make one.'),
  reference: Joi.string().trim().min(3).max(500).required()
    .description('Where a reader can go and find it.'),
}).options({ stripUnknown: true });

const listQuerySchema = Joi.object({
  metric: Joi.string().valid(...KEYS).optional(),
  scope: Joi.string().valid(...SCOPES).optional(),
  country: Joi.string().trim().uppercase().length(2).optional(),
  status: Joi.string().valid('draft', 'released', 'superseded').optional(),
}).options({ stripUnknown: true });

module.exports = { createBaselineSchema, supersedeSchema, pledgeSchema, listQuerySchema };
