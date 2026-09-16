// @ts-check
/**
 * The factors a §5.6 vehicle assessment rests on, resolved from the baseline
 * registry on the way into the engine — the grid factor for an electric
 * vehicle's scope 2, the petrol and diesel factors (held per kWh; the engine
 * applies the fuel's energy content), and the annual distance by vehicle class
 * that makes a make/model efficiency an Option 2a figure under fn 146.
 *
 * The same shape as `property-factors.js`: a figure the registry does not hold
 * is simply not handed in, and the engine falls back to its provisional table
 * for that one figure and says so.
 */

'use strict';

const baselines = require('../../baseline/application/registry');

const GRID = 'grid_emission_factor_kgCO2e_kWh';
const FUEL = 'fuel_emission_factor_kgCO2e_kWh';
const DISTANCE = 'vehicle_annual_distance_km';
const DEFAULT_COUNTRY = 'LK';

/** @param {any} r */
function provenance(r) {
  return { scope: r.scope, version: r.version, provisional: Boolean(r.provisional), source: r.source, basis: r.basis, metric: r.metric };
}

/**
 * @param {any} input the request body for `assessMotorVehicles`
 * @param {{orgId?: string|null}} [ctx]
 */
async function withVehicleFactors(input, ctx = {}) {
  const country = String(input.country || DEFAULT_COUNTRY).toUpperCase();
  const where = { country, orgId: ctx.orgId || null };
  const [grid, fuel, distance] = await Promise.all([
    baselines.effective(GRID, where),
    baselines.effective(FUEL, where),
    baselines.effective(DISTANCE, where),
  ]);
  /** @type {any} */
  const resolved = {};
  const gv = grid.values || {};
  if (grid.resolved && Number.isFinite(gv.value)) resolved.electricity_grid = { value: gv.value, baseline: provenance(grid) };
  const fv = fuel.values || {};
  for (const k of ['petrol', 'diesel']) {
    if (fuel.resolved && Number.isFinite(fv[k])) resolved[k] = { value: fv[k], baseline: provenance(fuel) };
  }
  const dv = distance.values || {};
  if (distance.resolved) {
    resolved.annualDistanceByClass = {};
    for (const [k, v] of Object.entries(dv)) {
      if (Number.isFinite(v)) resolved.annualDistanceByClass[k] = { value: v, baseline: provenance(distance) };
    }
  }
  return { ...input, country, resolvedFactors: resolved };
}

module.exports = { withVehicleFactors, GRID, FUEL, DISTANCE, DEFAULT_COUNTRY };
