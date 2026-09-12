// @ts-check
/**
 * The real-estate energy-statistics library — the estimation input the §5.4
 * (commercial real estate) and §5.5 (mortgages) engine reaches for when a
 * building's energy is not metered.
 *
 * PCAF estimates a building's emissions from its energy by source × an
 * emission factor per source (§5.4 p.79). Where the energy itself is not
 * metered it is estimated from statistics: an energy-use intensity (kWh per m²
 * per year) by building type × floor area (Option 2b), or per building where
 * only a count is held (Option 3); an official energy label with floor area is
 * Option 2a. This file holds those statistics and the grid and fuel emission
 * factors, versioned and checksummed the way the sovereign dataset and the
 * sector-factor library are, so a disclosure names the set it rests on.
 *
 * Every shipped figure is PROVISIONAL and says so: order-of-magnitude
 * intensities from published global ranges at an indicative level, and
 * provisional grid and fuel factors — not a licensed dataset and not a
 * national Sri Lankan measurement. A run that uses the set carries its version
 * and checksum, and the report repeats the provisional mark.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber } = require('../../../../shared/reference-data');
const { checksum } = require('../../../../shared/checksum');

const provFigure = Joi.object({
  value: strictNumber.min(0).required(),
  provisional: Joi.boolean().required(),
  source: Joi.string().max(2000).optional(),
}).unknown(false);

const buildingTypeSchema = Joi.object({
  key: Joi.string().max(60).required(),
  label: Joi.string().max(120).required(),
  electricityShare: strictNumber.min(0).max(1).required(),
  fuelSource: Joi.string().valid('diesel', 'lpg').required(),
  intensity_kWh_per_m2_yr: provFigure.required(),
  source: Joi.string().max(2000).required(),
}).unknown(false);

const factorSchema = Joi.object({
  value: strictNumber.min(0).required(),
  provisional: Joi.boolean().required(),
  source: Joi.string().max(2000).required(),
}).unknown(false);

const statisticsSchema = Joi.object({
  version: Joi.string().max(20).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  status: Joi.string().valid('provisional', 'released').required(),
  standard: Joi.string().max(600).required(),
  note: Joi.string().max(4000).required(),
  emissionFactors: Joi.object({
    unit: Joi.string().max(120).required(),
    byCountry: Joi.object().pattern(Joi.string().length(2).uppercase(), Joi.object({
      electricity_grid: factorSchema.required(),
      diesel: factorSchema.required(),
      lpg: factorSchema.required(),
    }).unknown(false)).min(1).required(),
  }).unknown(false).required(),
  buildingTypes: Joi.array().items(buildingTypeSchema).min(1).required(),
  perBuildingFloorArea_m2: Joi.object({ note: Joi.string().max(2000).required() })
    .pattern(Joi.string(), Joi.alternatives(Joi.string(), strictNumber.min(0))).required(),
  labelClasses: Joi.object({
    note: Joi.string().max(2000).required(),
    unit: Joi.string().max(120).required(),
    classes: Joi.object().pattern(Joi.string(), strictNumber.min(0)).min(1).required(),
  }).unknown(false).required(),
}).unknown(false);

const STATS = Object.freeze(checked('data/pcaf-parta/real-estate/energy-statistics.json',
  require('../../../../../data/pcaf-parta/real-estate/energy-statistics.json'), statisticsSchema));

const TYPE_MAP = Object.freeze(Object.fromEntries(STATS.buildingTypes.map(t => [t.key, t])));

function statistics() { return STATS; }
function buildingTypes() { return STATS.buildingTypes.map(t => ({ ...t })); }
function typeKeys() { return STATS.buildingTypes.map(t => t.key); }

/** One building type's record, or null when the vocabulary does not hold it. */
function typeFor(key) {
  if (!key || typeof key !== 'string') return null;
  const t = TYPE_MAP[key.trim()];
  return t ? { ...t } : null;
}

/** The grid and fuel emission factors held for a country, or null. */
function factorsFor(country) {
  if (!country || typeof country !== 'string') return null;
  const f = STATS.emissionFactors.byCountry[country.trim().toUpperCase()];
  return f ? JSON.parse(JSON.stringify(f)) : null;
}

/** The illustrative label-class intensity table (Option 2a). */
function labelClasses() { return JSON.parse(JSON.stringify(STATS.labelClasses)); }

/** The typical floor area per building type (Option 3, count only). */
function floorAreaPerBuilding(key) {
  const v = STATS.perBuildingFloorArea_m2[key];
  return Number.isFinite(v) ? Number(v) : null;
}

/**
 * The release a real-estate figure rests on: version, effective date, status
 * and a SHA-256 over the canonical form. The version says what was intended;
 * the checksum says what was there.
 */
function release() {
  const table = {
    table: 'real-estate-energy-statistics',
    version: STATS.version,
    effectiveFrom: STATS.effectiveFrom,
    status: STATS.status,
    rowCount: STATS.buildingTypes.length,
    checksum: checksum(STATS),
  };
  return {
    tables: [table],
    checksum: checksum([[table.table, table.checksum]]),
    provisionalTables: STATS.status === 'provisional' ? [table.table] : [],
    algorithm: 'SHA-256 over the canonical form (keys sorted at every level)',
  };
}

module.exports = {
  statistics, buildingTypes, typeKeys, typeFor, factorsFor,
  labelClasses, floorAreaPerBuilding, release, statisticsSchema,
};
