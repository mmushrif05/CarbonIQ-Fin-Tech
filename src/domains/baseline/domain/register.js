// @ts-check
/**
 * The Baseline Register — every figure a financed-emissions disclosure rests
 * on, linked to the asset classes that read it, with its evidence.
 *
 * `data/baselines/baseline-register.json` is the machine-readable half of
 * `docs/BASELINE-REGISTER.md`: one entry per baseline, the PCAF asset classes
 * and options that read it, every candidate value with its publisher, URL,
 * vintage and verification level, the candidate proposed for release, and the
 * improvement step. The governed registry (`./baseline.js`) is seeded from the
 * adopted candidates; this module is how the product answers "which baselines
 * does this asset class read, and where did each come from" — so that when a
 * user selects a class, the baselines behind its figures can be shown with
 * their tier, vintage and verification.
 *
 * Three rules the schema enforces rather than leaves to convention:
 *   • a candidate with no publisher or no URL is refused — a figure nobody can
 *     go and check is not evidence;
 *   • the verification level is one of three declared words, never free text;
 *   • a candidate not read from its source (`secondary_reported`, `not_found`)
 *     must be marked provisional, because a disclosure may not rest on it
 *     until it is re-read — and an adopted candidate is never `not_found`;
 *     where nothing adoptable exists yet the entry says so with a reason
 *     rather than adopting a figure it does not have.
 */

'use strict';

const Joi = require('joi');
const { checked } = require('../../../shared/reference-data');

const VERIFICATION = ['primary', 'secondary_reported', 'not_found'];

const candidateSchema = Joi.object({
  id: Joi.string().pattern(/^[a-z0-9_]+$/).required(),
  scope: Joi.string().valid('global', 'regional', 'country').required(),
  country: Joi.string().length(2).allow(null).required(),
  value: Joi.alternatives().try(Joi.number(), Joi.object(), Joi.array()).allow(null).required(),
  vintage: Joi.number().integer().allow(null).required(),
  tier: Joi.string().min(1).required(),
  publisher: Joi.string().min(1).required(),
  title: Joi.string().min(1).required(),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  page: Joi.string().allow('').required(),
  verification: Joi.string().valid(...VERIFICATION).required(),
  licence: Joi.string().allow('').required(),
  provisional: Joi.boolean().required(),
  notes: Joi.string().allow('').required(),
}).custom((c, helpers) => {
  if (c.verification !== 'primary' && c.provisional !== true) {
    return helpers.message({ custom: `candidate "${c.id}" was not read from its source and must be provisional` });
  }
  return c;
});

const appliesToSchema = Joi.object({
  assetClass: Joi.string().pattern(/^[a-z0-9-]+$/).required(),
  options: Joi.array().items(Joi.string().min(1)).min(1).required(),
});

const baselineSchema = Joi.object({
  key: Joi.string().pattern(/^[a-z0-9_]+$/).required(),
  label: Joi.string().min(1).required(),
  metricKey: Joi.string().pattern(/^[A-Za-z0-9_]+$/).required(),
  shape: Joi.string().min(1).required(),
  unit: Joi.string().min(1).required(),
  basis: Joi.string().optional(),
  appliesTo: Joi.array().items(appliesToSchema).min(1).required(),
  standardRule: Joi.string().min(1).required(),
  candidates: Joi.array().items(candidateSchema).min(1).required(),
  adopted: Joi.string().allow(null).required(),
  absentReason: Joi.string().min(1).optional(),
  stalenessYears: Joi.number().integer().min(1).allow(null).required(),
  improvement: Joi.array().items(Joi.string()).required(),
  correctsRepo: Joi.array().items(Joi.string()).required(),
}).custom((b, helpers) => {
  if (b.adopted === null) {
    if (!b.absentReason) return helpers.message({ custom: `baseline "${b.key}" adopts nothing and must say why (absentReason)` });
    return b;
  }
  const adopted = b.candidates.find(c => c.id === b.adopted);
  if (!adopted) return helpers.message({ custom: `baseline "${b.key}" adopts "${b.adopted}", which is not one of its candidates` });
  if (adopted.verification === 'not_found') {
    return helpers.message({ custom: `baseline "${b.key}" adopts "${b.adopted}", which was not found — adopt nothing and say why instead` });
  }
  return b;
});

const registerSchema = Joi.object({
  _meta: Joi.object({
    title: Joi.string().required(),
    document: Joi.string().valid('docs/BASELINE-REGISTER.md').required(),
    compiledOn: Joi.string().isoDate().required(),
    purpose: Joi.string().required(),
    rule: Joi.string().required(),
    hierarchy: Joi.string().required(),
    verificationLevels: Joi.object().pattern(Joi.string().valid(...VERIFICATION), Joi.string()).length(3).required(),
    sessionConstraint: Joi.string().required(),
    noAdoptedRowIsInvented: Joi.boolean().valid(true).required(),
    classification: Joi.string().required(),
  }).required(),
  assetClasses: Joi.array().items(Joi.object({
    id: Joi.string().pattern(/^[a-z0-9-]+$/).required(),
    label: Joi.string().required(),
    part: Joi.string().valid('A', 'B', 'C').required(),
    section: Joi.string().required(),
    engine: Joi.string().valid('built', 'not built').required(),
  })).min(1).required(),
  baselines: Joi.array().items(baselineSchema).min(1).required(),
}).custom((r, helpers) => {
  const classes = new Set(r.assetClasses.map(c => c.id));
  for (const b of r.baselines) {
    for (const a of b.appliesTo) {
      if (!classes.has(a.assetClass)) {
        return helpers.message({ custom: `baseline "${b.key}" applies to "${a.assetClass}", which is not a declared asset class` });
      }
    }
  }
  return r;
});

const REGISTER = Object.freeze(checked('data/baselines/baseline-register.json',
  require('../../../../data/baselines/baseline-register.json'), registerSchema));

/** The whole register, validated once at load. */
function register() {
  return REGISTER;
}

/** @param {string} key */
function baseline(key) {
  return REGISTER.baselines.find(b => b.key === key) || null;
}

/**
 * The baselines an asset class reads, each with the options that read it and
 * the candidate proposed for release — what a screen shows beside a figure
 * when the class is selected.
 *
 * @param {string} assetClass
 */
function baselinesFor(assetClass) {
  return REGISTER.baselines
    .filter(b => b.appliesTo.some(a => a.assetClass === assetClass))
    .map(b => ({
      key: b.key,
      metricKey: b.metricKey,
      label: b.label,
      unit: b.unit,
      options: (b.appliesTo.find(a => a.assetClass === assetClass) || { options: [] }).options,
      adopted: b.adopted ? b.candidates.find(c => c.id === b.adopted) : null,
      absentReason: b.absentReason || null,
      stalenessYears: b.stalenessYears,
    }));
}

/** @param {string} assetClass */
function isAssetClass(assetClass) {
  return REGISTER.assetClasses.some(c => c.id === assetClass);
}

module.exports = { register, baseline, baselinesFor, isAssetClass, VERIFICATION, registerSchema };
