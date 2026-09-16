// @ts-check
/**
 * The vehicle statistics the §5.6 engine reaches for when a vehicle's make and
 * model efficiency or its distance is not known — Options 3a and 3b — and the
 * energy content that turns a litre of fuel into the kWh the fuel-factor
 * baseline is held per.
 *
 * Every efficiency figure is PROVISIONAL and says so: an order-of-magnitude
 * class average, not a Sri Lankan measurement (docs/BASELINE-REGISTER.md §3.5.3
 * records that none has been verified). The annual distances are the
 * registry's where it holds them; the ones here are the fallback for a class
 * the registry does not hold. A run that uses the set carries its version and
 * checksum, and the report repeats the provisional mark.
 */

'use strict';

const Joi = require('joi');
const { checked, strictNumber } = require('../../../../shared/reference-data');
const { checksum } = require('../../../../shared/checksum');

const provFigure = Joi.object({
  value: strictNumber.min(0).required(),
  unit: Joi.string().valid('L/100km', 'kWh/100km').optional(),
  provisional: Joi.boolean().required(),
  source: Joi.string().max(2000).required(),
}).unknown(false);

const classSchema = Joi.object({
  key: Joi.string().max(40).required(),
  label: Joi.string().max(120).required(),
  fuel: Joi.string().valid('petrol', 'diesel', 'electricity').required(),
  efficiency: provFigure.keys({ unit: Joi.string().valid('L/100km', 'kWh/100km').required() }).required(),
  annualDistance_km: provFigure.required(),
  /* The registry's distance field this class reads where it has none of its
     own — a hybrid or an electric car drives as a petrol car does. */
  distanceClass: Joi.string().max(40).optional(),
}).unknown(false);

const statisticsSchema = Joi.object({
  version: Joi.string().max(20).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  status: Joi.string().valid('provisional', 'released').required(),
  standard: Joi.string().max(600).required(),
  note: Joi.string().max(4000).required(),
  energyContent: Joi.object({
    unit: Joi.string().max(120).required(),
    petrol: provFigure.required(),
    diesel: provFigure.required(),
  }).unknown(false).required(),
  classes: Joi.array().items(classSchema).min(1).required(),
}).unknown(false).custom((s, helpers) => {
  if (!s.classes.some(c => c.key === 'average')) return helpers.message({ custom: 'the statistics must hold an "average" row for Option 3b' });
  return s;
});

const STATS = Object.freeze(checked('data/pcaf-parta/vehicles/statistics.json',
  require('../../../../../data/pcaf-parta/vehicles/statistics.json'), statisticsSchema));

const CLASS_MAP = Object.freeze(Object.fromEntries(STATS.classes.map(c => [c.key, c])));

function statistics() { return STATS; }
function classes() { return STATS.classes.map(c => ({ ...c })); }
function classKeys() { return STATS.classes.map(c => c.key); }

/** One vehicle class's record, or null when the vocabulary does not hold it. */
function classFor(key) {
  if (!key || typeof key !== 'string') return null;
  const c = CLASS_MAP[key.trim()];
  return c ? JSON.parse(JSON.stringify(c)) : null;
}

/** kWh per litre for a fuel, with its source. */
function energyContent(fuel) {
  const e = STATS.energyContent[fuel];
  return e ? { ...e } : null;
}

/** The release a vehicle figure rests on: version, effective date, status, SHA-256. */
function release() {
  const table = {
    table: 'vehicle-statistics',
    version: STATS.version,
    effectiveFrom: STATS.effectiveFrom,
    status: STATS.status,
    rowCount: STATS.classes.length,
    checksum: checksum(STATS),
  };
  return {
    tables: [table],
    checksum: checksum([[table.table, table.checksum]]),
    provisionalTables: STATS.status === 'provisional' ? [table.table] : [],
    algorithm: 'SHA-256 over the canonical form (keys sorted at every level)',
  };
}

module.exports = { statistics, classes, classKeys, classFor, energyContent, release, statisticsSchema };
