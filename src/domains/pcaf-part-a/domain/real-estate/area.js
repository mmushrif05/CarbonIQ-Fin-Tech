// @ts-check
/**
 * Floor area with its unit — converted once, here, and traced.
 *
 * A Sri Lankan valuation report states a building in square feet and the
 * energy statistics are held per square metre. Converting in the browser would
 * put an arithmetic operation on the one side of the wire the engine cannot
 * see; leaving it to the person keying the loan is how a 10,000 ft² office is
 * recorded as 10,000 m² and reports ten times the energy. So the area arrives
 * with the unit it was measured in, the engine converts it with an exact
 * factor, and the trace carries both the area as keyed and the factor that
 * turned it into square metres.
 *
 * A perch, an acre and a hectare are refused by name rather than converted:
 * they measure land, and the intensity is per square metre of *floor* — a
 * 20-perch plot says nothing about the building on it. The refusal names the
 * remedy, which is the floor area from the valuation or the building plan.
 */

'use strict';

const { refuse } = require('./classify');

/** Exact: 1 ft = 0.3048 m, so 1 ft² = 0.09290304 m². */
const FT2_TO_M2 = 0.09290304;

const UNITS = Object.freeze({
  m2: { toM2: 1, label: 'm²' },
  sqm: { toM2: 1, label: 'm²' },
  ft2: { toM2: FT2_TO_M2, label: 'ft²' },
  sqft: { toM2: FT2_TO_M2, label: 'ft²' },
});

const LAND_UNITS = Object.freeze(['perch', 'perches', 'acre', 'acres', 'hectare', 'hectares', 'ha']);

/**
 * @param {{ value: number, unit?: string }|number|undefined} area
 *   an area with its unit, or a bare number taken as square metres
 * @returns {{ m2: number, asKeyed: { value: number, unit: string }, conversion: string, factor: number }|null}
 */
function floorAreaM2(area) {
  if (area === undefined || area === null) return null;
  const raw = typeof area === 'number' ? { value: area, unit: 'm2' } : area;
  const unit = String(raw.unit || 'm2').toLowerCase().replace(/[^a-z0-9]/g, '');
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw refuse('FLOOR_AREA_INVALID', 'Floor area must be a number greater than zero.', 400,
      'Supply the building’s floor area from the valuation report or the approved plan.');
  }
  if (LAND_UNITS.includes(unit)) {
    throw refuse('LAND_UNIT_NOT_FLOOR_AREA',
      `"${raw.unit}" measures land, not floor: the energy intensity is per square metre of floor area, and the `
      + 'extent of the plot says nothing about the building on it.',
      400, 'Supply the floor area in m² or ft² from the valuation report or the building plan.');
  }
  const u = UNITS[unit];
  if (!u) {
    throw refuse('FLOOR_AREA_UNIT_NOT_HELD',
      `Floor area unit "${raw.unit}" is not one this engine converts (${Object.keys(UNITS).join(', ')}).`,
      400, 'State the area in m² or ft².');
  }
  const m2 = +(value * u.toM2).toFixed(4);
  return {
    m2,
    asKeyed: { value, unit: u.label },
    factor: u.toM2,
    conversion: u.toM2 === 1
      ? `floor area = ${value} m² as keyed`
      : `floor area m² = ${value} ${u.label} × ${u.toM2} (exact: 1 ft = 0.3048 m)`,
  };
}

module.exports = { floorAreaM2, FT2_TO_M2, UNITS, LAND_UNITS };
