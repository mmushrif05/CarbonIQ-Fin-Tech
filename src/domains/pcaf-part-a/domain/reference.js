// @ts-check
/**
 * Part A's reference tables, loaded once and checked.
 *
 * Two of these decide a **data-quality score that is disclosed**, and one
 * carries the grid factors that decide an avoided-emissions figure. All three
 * were required straight into the arithmetic.
 *
 * The schema enforces the finding that matters most about Part A, and it
 * cannot be enforced by the shape alone: **the option-to-score mapping is not
 * uniform across asset classes.** Option 2b is score 2 in one class and score
 * 3 in another; Option 3 is 3 in one and 4 in another. So there is no global
 * option lookup anywhere, each table declares its own asset class, and the
 * check below refuses a table that does not — because a table without one is a
 * table that could be applied to the wrong class, which produces a wrong
 * disclosed score and no error at all.
 *
 * It also pins the direction of the scale in the file's own words, because
 * 1 being *best* is the thing a reader who has not opened the standard gets
 * backwards, and a score is a category, never a mark out of five.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber, sectorVocabularySchema, sectorFactorTableSchema } = require('../../../shared/reference-data');

/** One row of a PCAF option table. */
const optionSchema = Joi.object({
  option: Joi.string().max(10).required(),
  score: strictNumber.integer().min(1).max(5).required(),
  family: Joi.string().max(200).required(),
  when: Joi.string().max(4000).required(),
  note: Joi.string().max(4000).optional(),
  /* Listed equity and corporate bonds carry three more per-option facts the
     project-finance table has no use for: which GHG scopes the option covers,
     whether an attribution factor applies, and what the emissions rest on. */
  scopes: Joi.array().items(Joi.string().valid('1', '2', '3')).optional(),
  attributionFactor: Joi.boolean().optional(),
  emissionsBasis: Joi.array().items(Joi.string().max(60)).optional(),
  footnote: Joi.string().max(4000).optional(),
}).unknown(false);

const dqTableSchema = Joi.object({
  table: Joi.string().max(40).required(),
  /* Required, and the whole point: a table that does not name its asset class
     is a table that can be applied to the wrong one. */
  assetClass: Joi.string().max(80).required(),
  standard: Joi.string().max(600).required(),
  section: Joi.string().max(200).required(),
  status: Joi.string().max(60).required(),
  note: Joi.string().max(4000).optional(),
  scale: Joi.string().max(600).required(),
  options: Joi.array().items(optionSchema).min(1).required(),
}).unknown(true).custom((table, helpers) => {
  /* 1 is the highest quality. Stated in the file so the document can quote it,
     and checked here so it cannot be reworded into the inversion. */
  if (!/1 is the highest/i.test(table.scale)) {
    return helpers.error('any.custom', {
      error: new Error('scale must state that 1 is the highest data quality'),
    });
  }
  const seen = new Set();
  for (const row of table.options) {
    if (seen.has(row.option)) {
      return helpers.error('any.custom', {
        error: new Error(`option ${row.option} is declared twice in ${table.assetClass}`),
      });
    }
    seen.add(row.option);
  }
  return table;
});

/**
 * A grid factor, and how well it is evidenced.
 *
 * `value` is strict, so a quoted number is a fault rather than a coercion:
 * this figure multiplies a generation volume into an avoided-emissions claim.
 */
const gridFactorSchema = Joi.object({
  value: strictNumber.min(0).required(),
  unit: Joi.string().max(40).required(),
  year: strictNumber.integer().min(1900).max(2100).required(),
  source: Joi.string().max(2000).required(),
}).unknown(true);

const countryConfigSchema = Joi.object({
  $comment: Joi.string().max(4000).optional(),
  schema_version: strictNumber.integer().min(1).required(),
  unit: Joi.string().max(40).required(),
  stale_after_years: strictNumber.integer().min(1).required(),
  verification_levels: Joi.object().pattern(Joi.string(), Joi.string().max(2000)).required(),
  /* Which factor answers which question. The combined margin is the
     counterfactual a new renewable displaces and belongs to avoided emissions
     only; using it for an inventory would report a reduction as an emission. */
  grid_factor_uses: Joi.object().pattern(Joi.string(), Joi.string().max(2000)).required(),
  countries: Joi.object().pattern(
    Joi.string().length(2),
    Joi.object({
      name: Joi.string().max(120).required(),
      /* A factor is either a figure with its source, or **`null` with a stated
         reason beside it**. Absence is an answer here: a country with no build
         margin published says so, rather than carrying a global default that
         would read as that country's own figure. The check below insists on
         the pairing — a bare `null` would be indistinguishable from a field
         nobody filled in, which is the difference this file exists to keep. */
      grid_factors: Joi.object().pattern(
        Joi.string(),
        Joi.alternatives().try(gridFactorSchema, Joi.valid(null), Joi.string().max(2000)),
      ).required(),
    }).unknown(true),
  ).min(1).required(),
  /* Geography, never basis: a country with no value for a basis may fall back
     to a global default **of the same basis**, and the data-quality option
     drops to say so. Falling back across bases would swap one counterfactual
     for another without changing the number's label. */
  fallback_rule: Joi.string().max(4000).required(),
}).unknown(true).custom((config, helpers) => {
  for (const [code, country] of Object.entries(config.countries)) {
    for (const [basis, factor] of Object.entries(/** @type {any} */ (country).grid_factors)) {
      if (basis.endsWith('_absent_reason')) continue;
      if (factor !== null) continue;
      const reason = /** @type {any} */ (country).grid_factors[`${basis}_absent_reason`];
      if (typeof reason !== 'string' || !reason.trim()) {
        return helpers.error('any.custom', {
          error: new Error(
            `${code}.grid_factors.${basis} is absent with no ${basis}_absent_reason: `
            + 'an unstated absence cannot be told from a field nobody filled in'),
        });
      }
    }
  }
  return config;
});

const DQ_PROJECT_FINANCE = Object.freeze(checked('data/pcaf-parta/dq-project-finance.json',
  require('../../../../data/pcaf-parta/dq-project-finance.json'), dqTableSchema));
const DQ_LISTED_EQUITY = Object.freeze(checked('data/pcaf-parta/dq-listed-equity-corporate-bonds.json',
  require('../../../../data/pcaf-parta/dq-listed-equity-corporate-bonds.json'), dqTableSchema));
/* §5.2's table carries the same scores as §5.1's, and it is held separately
   anyway. Sharing one file would encode "these two are the same" as a fact
   about the standard, which it is not: the real-estate tables put Option 2a at
   3 and Option 3 at 5 on the same labels. A later edition moving one of these
   two would then move both, silently. */
const DQ_BUSINESS_LOANS = Object.freeze(checked('data/pcaf-parta/dq-business-loans-unlisted-equity.json',
  require('../../../../data/pcaf-parta/dq-business-loans-unlisted-equity.json'), dqTableSchema));
/* §5.9's table has its own shape — no Option 2b, no 3c, Option 2 at score 3 —
   and the denominator behind it is PPP-adjusted GDP rather than equity plus
   debt. Held apart for the same reason as every other class table: the
   option→score mapping is a fact about this chapter, not the standard. */
const DQ_SOVEREIGN = Object.freeze(checked('data/pcaf-parta/dq-sovereign.json',
  require('../../../../data/pcaf-parta/dq-sovereign.json'), dqTableSchema));
const COUNTRY_CONFIG = Object.freeze(checked('data/pcaf-parta/country-config.json',
  require('../../../../data/pcaf-parta/country-config.json'), countryConfigSchema));

/* The sector vocabulary and the Option 3 factor library keyed to it. The
   baseline registry reads the same vocabulary file for the intensity bands,
   so a band cannot name a sector the library does not hold. */
const SECTORS = Object.freeze(checked('data/pcaf-parta/sectors.json',
  require('../../../../data/pcaf-parta/sectors.json'), sectorVocabularySchema));
const SECTOR_FACTORS = Object.freeze(checked('data/pcaf-parta/sector-factors.json',
  require('../../../../data/pcaf-parta/sector-factors.json'), sectorFactorTableSchema));

module.exports = {
  DQ_PROJECT_FINANCE, DQ_LISTED_EQUITY, DQ_BUSINESS_LOANS, DQ_SOVEREIGN, COUNTRY_CONFIG,
  SECTORS, SECTOR_FACTORS,
  dqTableSchema, countryConfigSchema,
};
