// @ts-check
/**
 * Sri Lanka's NDC 3.0 commitments, loaded once and checked.
 *
 * This file is read by `src/shared/constants.js` and by the GCF contribution
 * engine, so it is loaded here — shared, which both may import — rather than
 * required separately in each place with nothing between it and the
 * arithmetic.
 *
 * **The rule the schema enforces is the one that is easiest to lose.** NDC 3.0
 * commits Sri Lanka to two separate things over 2026–2035: a 20.09% cumulative
 * reduction against BAU, and a 4.49% increase in net removal. They are two
 * commitments, never one, and there is no key anywhere holding their sum. So
 * each ledger carries its own unconditional, conditional and total, and the
 * schema checks that each `totalPct` equals its own two parts — which catches
 * a transcription error in a figure that reaches a regulatory submission, and
 * would catch the far worse mistake of a total that had quietly absorbed the
 * other ledger.
 *
 * The superseded 2021 NDC — which NDC 3.0 replaced, and which committed to
 * 4.5% unconditional / 14.5% conditional by 2030 and net zero 2050 — was still
 * cited by seven source files and three test files, including the Green Loan
 * Certificate, which printed it onto a document carrying a SHA-256 audit hash.
 * Nothing announced the drift, because the tests asserted the same superseded
 * figures the code produced.
 *
 * **NDC 3.0 states no net-zero year**, so none is asserted. An absent
 * commitment is reported absent rather than carried forward.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber } = require('./reference-data');

/** One ledger: a commitment, its two halves, and the sum of exactly those two. */
const ledgerSchema = Joi.object({
  basis: Joi.string().min(1).max(400).required(),
  unconditionalPct: strictNumber.min(0).max(100).required(),
  conditionalPct: strictNumber.min(0).max(100).required(),
  totalPct: strictNumber.min(0).max(100).required(),
  unit: Joi.string().valid('percent').required(),
  note: Joi.string().max(1000).optional(),
}).unknown(false).custom((ledger, helpers) => {
  const parts = ledger.unconditionalPct + ledger.conditionalPct;
  /* A hundredth of a point, because these are transcribed to two decimals. */
  if (Math.abs(parts - ledger.totalPct) > 0.005) {
    return helpers.error('any.custom', {
      error: new Error(
        `totalPct ${ledger.totalPct} is not unconditional ${ledger.unconditionalPct} `
        + `plus conditional ${ledger.conditionalPct} (${parts.toFixed(2)})`),
    });
  }
  return ledger;
});

const ndc3Schema = Joi.object({
  _meta: Joi.object().unknown(true).required(),
  reduction: ledgerSchema.required(),
  removal: ledgerSchema.required(),
  sectorCounts: Joi.object({
    mitigation: strictNumber.integer().min(0).required(),
    adaptation: strictNumber.integer().min(0).required(),
    crossCutting: Joi.array().items(Joi.string().max(200)).required(),
  }).unknown(false).required(),
  sectorTargets: Joi.array().items(Joi.object().unknown(true)).required(),
  gesi: Joi.any().optional(),
  nap: Joi.any().optional(),
  keySDGs: Joi.array().items(strictNumber.integer()).optional(),
}).unknown(true).custom((doc, helpers) => {
  /* There is no key holding the sum of the two ledgers, and there must not be
     one: a reduction and a removal are different claims about the atmosphere,
     and a single "climate ambition" percentage would belong to neither. */
  const forbidden = Object.keys(doc).filter(k => /^(combined|totalAmbition|overall)/i.test(k));
  if (forbidden.length) {
    return helpers.error('any.custom', {
      error: new Error(`${forbidden.join(', ')}: reduction and removal are never summed`),
    });
  }
  return doc;
});

/** NDC 3.0, validated at load. Frozen, because reference data is not state. */
const NDC3 = Object.freeze(
  checked('data/gcf/ndc3.json', require('../../data/gcf/ndc3.json'), ndc3Schema));

module.exports = { NDC3, ndc3Schema };
