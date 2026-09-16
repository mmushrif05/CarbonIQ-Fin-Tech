// @ts-check
/**
 * The factors a property assessment rests on, resolved from the baseline
 * registry on the way into the engine.
 *
 * The §5.4/§5.5 engine is synchronous and stores nothing; the registry is
 * async and partitioned by organisation. So, as `plausibility.js` does for
 * the sector bands, this resolves what the engine needs — the grid factor, the
 * fuel factors and the building-type intensities in force for the country and
 * the caller's organisation — and hands them in as `resolvedFactors`, each
 * carrying the scope, version and provenance the engine prints on the trace.
 *
 * A figure the registry does not hold is simply not handed in: the engine falls
 * back to its provisional table for that one figure and says so, rather than
 * this layer inventing one. The registry's own rule holds — a released baseline
 * replaces the seed entirely and the two are never merged — because each
 * metric resolves to exactly one record.
 */

'use strict';

const baselines = require('../../baseline/application/registry');

const GRID = 'grid_emission_factor_kgCO2e_kWh';
const FUEL = 'fuel_emission_factor_kgCO2e_kWh';
const INTENSITY = 'building_energy_intensity_kWh_m2';
const DEFAULT_COUNTRY = 'LK';

/** @param {any} r a registry resolution */
function provenance(r) {
  return {
    scope: r.scope,
    version: r.version,
    provisional: Boolean(r.provisional),
    source: r.source,
    basis: r.basis,
    metric: r.metric,
  };
}

/**
 * @param {any} input the request body for `assessRealEstate`
 * @param {{orgId?: string|null}} [ctx]
 */
async function withPropertyFactors(input, ctx = {}) {
  const country = String(input.country || DEFAULT_COUNTRY).toUpperCase();
  const where = { country, orgId: ctx.orgId || null };
  const [grid, fuel, intensity] = await Promise.all([
    baselines.effective(GRID, where),
    baselines.effective(FUEL, where),
    baselines.effective(INTENSITY, where),
  ]);

  /** @type {any} */
  const resolved = {};
  const gv = grid.values || {};
  if (grid.resolved && Number.isFinite(gv.value)) {
    resolved.electricity_grid = { value: gv.value, baseline: provenance(grid) };
  }
  const fv = fuel.values || {};
  if (fuel.resolved) {
    for (const key of ['diesel', 'lpg']) {
      if (Number.isFinite(fv[key])) resolved[key] = { value: fv[key], baseline: provenance(fuel) };
    }
  }
  if (intensity.resolved) {
    resolved.intensityByType = {};
    for (const [type, value] of Object.entries(intensity.values || {})) {
      if (typeof value === 'number' && Number.isFinite(value)) resolved.intensityByType[type] = { value, baseline: provenance(intensity) };
    }
  }
  return { ...input, country, resolvedFactors: resolved };
}

module.exports = { withPropertyFactors, GRID, FUEL, INTENSITY, DEFAULT_COUNTRY };
