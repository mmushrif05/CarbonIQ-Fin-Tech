// @ts-check
/**
 * The sovereign dataset — one record per country, and the release a figure
 * rests on.
 *
 * PCAF Part A §5.9 attributes a sovereign's emissions on `exposure ÷
 * PPP-adjusted GDP` (p.144), so the two figures a disclosure needs about a
 * country are its territorial (scope 1) emissions and its PPP-adjusted GDP.
 * Scope 1 is held **both including and excluding LULUCF**, because §5.9
 * requires both (p.141) and the LULUCF term can distort the trend of the
 * energy and industrial sectors; a country whose including-LULUCF figure is
 * not held says so with a reason rather than carrying a value nobody sourced.
 *
 * Two rules, each because the alternative is a figure a reader would trust
 * and should not:
 *
 *   Every figure carries its own source and vintage. A quoted number with no
 *   provenance is a number in a regulatory disclosure that leads nowhere.
 *
 *   Absence is an answer, never a zero. A missing emissions figure is held as
 *   `{ absent: true, reason }`, so "we have not sourced this" cannot be told
 *   apart from "this country emits nothing" only by looking closely.
 *
 * Every shipped country that says `provisional` is an order-of-magnitude
 * placeholder, not a released baseline; Singapore and Hong Kong carry the
 * standard's own worked-example figures (Table 10.3-2, p.202). A run that uses
 * the dataset names its version and checksum, so a disclosure names the
 * sovereign set it rests on.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber } = require('../../../../shared/reference-data');
const { checksum } = require('../../../../shared/checksum');

/** A sourced figure, or an absence with a stated reason — never a bare gap. */
const figureSchema = Joi.object({
  value: strictNumber.min(0).required(),
  unit: Joi.string().max(80).required(),
  year: strictNumber.integer().min(1900).max(2100).required(),
  basis: Joi.string().max(80).optional(),
  source: Joi.string().min(1).max(2000).required(),
}).unknown(false);

const absentSchema = Joi.object({
  absent: Joi.valid(true).required(),
  reason: Joi.string().min(1).max(2000).required(),
}).unknown(false);

const figureOrAbsent = Joi.alternatives().try(figureSchema, absentSchema);

const countrySchema = Joi.object({
  name: Joi.string().max(120).required(),
  iso3: Joi.string().length(3).uppercase().required(),
  provisional: Joi.boolean().required(),
  gap: Joi.string().max(2000).optional(),
  /* Scope 1 both ways — a §5.9 shall (p.141). Both keys are required so a
     missing one is a stated absence, not an omission. */
  scope1: Joi.object({
    exclLULUCF: figureOrAbsent.required(),
    inclLULUCF: figureOrAbsent.required(),
  }).unknown(false).required(),
  /* Scope 2 and 3 are §5.9 shoulds and usually absent; held when sourced. */
  scope2: figureOrAbsent.optional(),
  scope3: figureOrAbsent.optional(),
  exports: figureOrAbsent.optional(),
  /* The attribution denominator. Always required — an exposure cannot be
     attributed without it, and a country with no PPP-GDP is not in the set. */
  pppGdp: figureSchema.required(),
  population: figureSchema.optional(),
}).unknown(false).custom((country, helpers) => {
  /* A provisional country states its gap; a released one does not carry the
     word without the sentence, mirroring the factor-table discipline. */
  if (country.provisional && !country.gap) {
    return helpers.error('any.custom', {
      error: new Error(`${country.name} is provisional but states no gap`),
    });
  }
  return country;
});

const datasetSchema = Joi.object({
  table: Joi.string().max(60).required(),
  standard: Joi.string().max(600).required(),
  section: Joi.string().max(200).required(),
  version: Joi.string().max(20).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  status: Joi.string().valid('provisional', 'released').required(),
  unit: Joi.object().pattern(Joi.string(), Joi.string().max(120)).required(),
  note: Joi.string().max(4000).required(),
  sources: Joi.object().pattern(Joi.string(), Joi.string().max(2000)).required(),
  countries: Joi.object().pattern(
    Joi.string().length(2).uppercase(),
    countrySchema,
  ).min(1).required(),
}).unknown(false);

const DATASET = Object.freeze(checked('data/pcaf-parta/sovereign/dataset.json',
  require('../../../../../data/pcaf-parta/sovereign/dataset.json'), datasetSchema));

/** The whole dataset, for the reference/transparency endpoint. */
function dataset() { return DATASET; }

/** Every country code held. */
function codes() { return Object.keys(DATASET.countries); }

/**
 * One country's record by ISO alpha-2 code, or `null` when the set holds none.
 * The code is matched case-insensitively; the record is returned as held.
 *
 * @param {string} code
 * @returns {any|null}
 */
function countryFor(code) {
  if (!code || typeof code !== 'string') return null;
  const rec = DATASET.countries[code.trim().toUpperCase()];
  return rec ? { code: code.trim().toUpperCase(), ...rec } : null;
}

/** The held countries as a list a form can render. */
function countriesHeld() {
  return Object.entries(/** @type {Record<string, any>} */ (DATASET.countries)).map(([code, c]) => ({
    code, name: c.name, iso3: c.iso3, provisional: Boolean(c.provisional),
  }));
}

/**
 * The release a set of sovereign figures rests on: the dataset with its
 * version, effective date, status and a SHA-256 over its canonical form, and
 * the list of countries shipped provisional. The version says what was
 * intended; the checksum says what was there.
 */
function release() {
  const provisional = Object.entries(/** @type {Record<string, any>} */ (DATASET.countries))
    .filter(([, c]) => c.provisional).map(([code]) => code).sort();
  const table = {
    table: DATASET.table,
    version: DATASET.version,
    effectiveFrom: DATASET.effectiveFrom,
    status: DATASET.status,
    countryCount: Object.keys(DATASET.countries).length,
    provisionalCountries: provisional,
    checksum: checksum(DATASET),
  };
  return {
    tables: [table],
    checksum: checksum([[table.table, table.checksum]]),
    provisionalTables: DATASET.status === 'provisional' ? [table.table] : [],
    algorithm: 'SHA-256 over the canonical form (keys sorted at every level)',
  };
}

module.exports = { dataset, codes, countryFor, countriesHeld, release, datasetSchema };
