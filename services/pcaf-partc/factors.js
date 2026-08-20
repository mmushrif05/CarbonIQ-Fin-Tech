/**
 * CarbonIQ FinTech — PCAF Part C: Factor Store
 *
 * Loads the seed factor tables from data/factors/*.json and exposes typed
 * lookups. Every value returned carries its data-quality tier and named
 * reference, so a factor can never enter a calculation anonymously.
 *
 * Store design (hybrid, per the agreed architecture):
 *   · Seed tables live in-repo as JSON — versioned, git-diffable, citable.
 *     This is what makes the disclosure defensible to a regulator.
 *   · Runtime overrides (client corrections, learned Local-tier values) are
 *     layered on top via setOverrides() without a deploy.
 *
 * Lookup contract: a lookup NEVER throws on a miss. It falls back to the
 * table default, marks the result `fallback: true`, and attaches a gap note.
 * Per the MVP ruling, a missing factor is calculated silently but always
 * highlighted in the Data Gap Ledger.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const FACTOR_DIR = path.join(__dirname, '..', '..', 'data', 'factors');

const TABLE_FILES = [
  'transport-ef', 'densities', 'mass-factors', 'waste-rates-rics-t18',
  'service-lives', 'refrigerant-leak', 'refrigerant-gwp', 'water-ef',
  'vehicle-ef', 'a5-defaults', 'b1-b4-defaults', 'beyond-pcaf-defaults'
];

let _tables    = null;
let _overrides = {};

function _load() {
  if (_tables) return _tables;
  _tables = {};
  for (const name of TABLE_FILES) {
    const file = path.join(FACTOR_DIR, `${name}.json`);
    _tables[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return _tables;
}

/** Force a reload — used by tests and after an override change. */
function reload() { _tables = null; return _load(); }

/**
 * Layer runtime overrides on top of the seed tables.
 * Shape: { 'densities.rubble_masonry': { value: 2450, tier: 'Local', reference: '...' } }
 */
function setOverrides(overrides) { _overrides = overrides || {}; }
function getOverrides() { return _overrides; }

/** All tables, for the factor-transparency endpoint. */
function allTables() { return _load(); }

/**
 * Core lookup.
 *
 * @param {string} table - table name, e.g. 'densities'
 * @param {string} key   - row key, e.g. 'concrete_normal'
 * @param {Object} [opts]
 * @param {number} [opts.fallbackValue] - value to use when the row is absent
 * @returns {Object} { key, value, unit, tier, reference, gap?, fallback }
 */
function lookup(table, key, opts = {}) {
  const tables   = _load();
  const t        = tables[table];
  const fullKey  = `${table}.${key}`;

  if (!t) {
    return {
      key: fullKey, value: opts.fallbackValue ?? null, unit: null,
      tier: 'Global', reference: `Unknown factor table "${table}"`,
      gap: `Factor table "${table}" not found`, fallback: true
    };
  }

  // Runtime override wins, and records that it did.
  if (_overrides[fullKey]) {
    const o = _overrides[fullKey];
    return {
      key: fullKey,
      value: o.value,
      unit: o.unit || t.unit || (t.rows[key] && t.rows[key].unit) || null,
      tier: o.tier || 'Local',
      reference: o.reference || 'Runtime override',
      overridden: true,
      fallback: false
    };
  }

  const row = t.rows && t.rows[key];

  if (!row) {
    const fallbackValue = opts.fallbackValue ?? t.defaultRate ?? t.defaultLife ?? null;
    return {
      key: fullKey,
      value: fallbackValue,
      unit: t.unit || null,
      tier: t.tier || 'Global',
      reference: t.defaultReference || t.reference || `No row "${key}" in ${table}`,
      gap: `"${key}" not found in ${table} — table default applied`,
      fallback: true
    };
  }

  return {
    key: fullKey,
    value: row.value,
    unit: row.unit || t.unit || null,
    tier: row.tier || t.tier || 'Global',
    reference: row.reference || t.reference || null,
    ...(row.gap ? { gap: row.gap } : {}),
    ...(row.note ? { note: row.note } : {}),
    fallback: false
  };
}

// --- Convenience accessors used across the engine ---------------------------

const transportEF  = mode => lookup('transport-ef', mode);
const density      = key  => lookup('densities', key);
const massFactor   = key  => lookup('mass-factors', key);
const wasteRate    = cat  => lookup('waste-rates-rics-t18', cat);
const serviceLife  = cat  => lookup('service-lives', cat);
const leakRate     = eq   => lookup('refrigerant-leak', eq);
const gwp          = ref  => lookup('refrigerant-gwp', ref);
const waterEF      = kind => lookup('water-ef', kind);
const vehicleEF    = type => lookup('vehicle-ef', type);
const a5Default    = key  => lookup('a5-defaults', key);
const b1b4Default  = key  => lookup('b1-b4-defaults', key);
const wlcaDefault  = key  => lookup('beyond-pcaf-defaults', key);

/** Water benchmark values live in a sub-object rather than .rows. */
function waterBenchmark(key) {
  const t = _load()['water-ef'];
  const row = t.benchmarks && t.benchmarks[key];
  if (!row) {
    return { key: `water-ef.${key}`, value: null, tier: 'Global',
             reference: 'Benchmark not found', gap: `"${key}" missing`, fallback: true };
  }
  return { key: `water-ef.${key}`, value: row.value, unit: row.unit || null,
           tier: row.tier, reference: row.reference, fallback: false };
}

/** Dropdown option lists for the client form (M3). */
function options() {
  const t = _load();
  return {
    equipmentTypes:  Object.keys(t['refrigerant-leak'].rows),
    refrigerants:    Object.keys(t['refrigerant-gwp'].rows),
    wasteCategories: Object.keys(t['waste-rates-rics-t18'].rows),
    serviceLifeCategories: Object.keys(t['service-lives'].rows),
    vehicleTypes:    Object.keys(t['vehicle-ef'].rows),
    policyTypes:     ['CAR', 'EAR', 'IDI'],
    units:           ['m3', 'm2', 'm', 'MT', 'kg', 'Nr']
  };
}

module.exports = {
  reload, setOverrides, getOverrides, allTables, lookup, options,
  transportEF, density, massFactor, wasteRate, serviceLife,
  leakRate, gwp, waterEF, waterBenchmark, vehicleEF,
  a5Default, b1b4Default, wlcaDefault
};
