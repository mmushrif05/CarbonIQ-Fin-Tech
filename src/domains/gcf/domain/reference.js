// @ts-check
/**
 * The GCF reference set, loaded once and checked.
 *
 * Four files were required straight into the engines and the routes with
 * nothing between them and the arithmetic — the IRMF core indicators, the
 * results areas, the instrument catalogue and the shipped pipeline. Each was
 * required in two or three separate places besides.
 *
 * Loading them here does two things. It puts one copy behind one check, so a
 * malformed file fails at load with the field named rather than surfacing as a
 * missing barrier or an unmatched results area three screens later. And it
 * closes a class of mistake the shape alone would not catch: **the barrier
 * vocabulary is shared between the record schema and the instrument
 * catalogue**, and an instrument that answers a barrier no record can declare
 * is an instrument that never matches anything, silently, while reading as
 * coverage.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber } = require('../../../shared/reference-data');

const meta = Joi.object().unknown(true);

// ---------------------------------------------------------------------------
// The IRMF: what GCF measures, and how well a figure is evidenced
// ---------------------------------------------------------------------------

const irmfSchema = Joi.object({
  _meta: meta.required(),
  coreIndicators: Joi.array().items(Joi.object({
    id: Joi.string().max(40).required(),
    stream: Joi.string().valid('mitigation', 'adaptation', 'cross-cutting').required(),
    name: Joi.string().max(400).required(),
    unit: Joi.string().max(60).required(),
    field: Joi.string().max(120).required(),
    note: Joi.string().max(2000).optional(),
  }).unknown(false)).min(1).required(),
  supplementary: Joi.array().items(Joi.object().unknown(true)).required(),
  /* The four appraisal classes, ranked. They are deliberately **not** PCAF's
     1–5 data-quality scale: numerals here would be quoted as PCAF scores by
     the time they reached a submission. */
  evidenceTiers: Joi.array().items(Joi.object({
    tier: Joi.string().valid('measured', 'modelled', 'benchmark', 'declared').required(),
    rank: strictNumber.integer().min(1).required(),
    label: Joi.string().max(80).required(),
    note: Joi.string().max(1000).optional(),
  }).unknown(false)).length(4).required(),
  tierNote: Joi.string().max(2000).optional(),
}).unknown(false);

// ---------------------------------------------------------------------------
// The results areas
// ---------------------------------------------------------------------------

const resultsAreasSchema = Joi.object({
  _meta: meta.required(),
  areas: Joi.array().items(Joi.object({
    code: Joi.string().max(10).required(),
    name: Joi.string().max(200).required(),
    stream: Joi.string().valid('mitigation', 'adaptation', 'cross-cutting').required(),
  }).unknown(false)).min(1).required(),
}).unknown(false);

// ---------------------------------------------------------------------------
// Instruments, and the barriers they answer
// ---------------------------------------------------------------------------

const instrumentsSchema = Joi.object({
  _meta: meta.required(),
  barriers: Joi.array().items(Joi.object({
    id: Joi.string().max(60).required(),
    label: Joi.string().max(200).required(),
    detail: Joi.string().max(2000).optional(),
  }).unknown(false)).min(1).required(),
  instruments: Joi.array().items(Joi.object({
    id: Joi.string().max(80).required(),
    name: Joi.string().max(200).required(),
    summary: Joi.string().max(2000).required(),
    requiresGrantModality: Joi.boolean().required(),
  }).unknown(true)).min(1).required(),
}).unknown(false).custom((doc, helpers) => {
  const known = new Set(doc.barriers.map((/** @type {any} */ b) => b.id));
  for (const instrument of doc.instruments) {
    for (const id of instrument.answers || instrument.barriers || []) {
      if (!known.has(id)) {
        return helpers.error('any.custom', {
          error: new Error(
            `instrument "${instrument.id}" answers barrier "${id}", which no record can declare`),
        });
      }
    }
  }
  return doc;
});

// ---------------------------------------------------------------------------
// The shipped pipeline
// ---------------------------------------------------------------------------

/**
 * The seed is checked only for its envelope here. Every project in it is held
 * to the record schema by the store on the way through, which is the same
 * schema a recorded project satisfies — the shipped pipeline is illustrative
 * data, not an exemption from the rules the records are held to.
 */
const pipelineSeedSchema = Joi.object({
  _meta: meta.required(),
  projects: Joi.array().items(Joi.object().unknown(true)).min(1).required(),
}).unknown(false);

const IRMF = Object.freeze(
  checked('data/gcf/irmf.json', require('../../../../data/gcf/irmf.json'), irmfSchema));
const RESULTS_AREAS = Object.freeze(
  checked('data/gcf/results-areas.json', require('../../../../data/gcf/results-areas.json'), resultsAreasSchema));
const INSTRUMENT_CATALOGUE = Object.freeze(
  checked('data/gcf/instruments.json', require('../../../../data/gcf/instruments.json'), instrumentsSchema));
const PIPELINE_SEED = Object.freeze(
  checked('data/gcf/pipeline.seed.json', require('../../../../data/gcf/pipeline.seed.json'), pipelineSeedSchema));

module.exports = {
  IRMF, RESULTS_AREAS, INSTRUMENT_CATALOGUE, PIPELINE_SEED,
  irmfSchema, resultsAreasSchema, instrumentsSchema, pipelineSeedSchema,
};
