// @ts-check
/**
 * The entity's own declaration about external audit.
 *
 * This is what the **reporting entity says about its own auditors** — who
 * assured which scope, under what standard, to what level, over what period.
 * It is a declared statement in the `report-integrity` sense: this system
 * records it and attributes it, and does not confirm it.
 *
 * `level` is accepted only where the status is `assured`. A limited-assurance
 * level recorded against a scope nobody assured would read, in a disclosure,
 * as assurance that was never obtained — so the service drops it rather than
 * carrying it, and this schema says why the field is conditional.
 */

'use strict';

const Joi = require('joi');

const scopeDeclarationSchema = Joi.object({
  status: Joi.string().valid('assured', 'not_assured', 'not_declared').required(),
  provider: Joi.string().max(200).allow('', null).optional(),
  standard: Joi.string().max(200).allow('', null).optional(),
  level: Joi.string().valid('limited', 'reasonable').allow(null)
    .when('status', { is: 'assured', then: Joi.optional(), otherwise: Joi.optional() }),
  period: Joi.string().max(80).allow('', null).optional(),
  note: Joi.string().max(2000).allow('', null).optional(),
}).unknown(false);

const assuranceSaveSchema = Joi.object({
  scopes: Joi.object().pattern(Joi.string().max(60), scopeDeclarationSchema).optional(),
  declaredBy: Joi.string().max(160).allow('', null).optional(),
  declaredAt: Joi.string().max(40).allow('', null).optional(),
}).unknown(false);

module.exports = { assuranceSaveSchema, scopeDeclarationSchema };
