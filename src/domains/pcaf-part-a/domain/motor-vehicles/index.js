// @ts-check
/**
 * PCAF Part A §5.6 — motor vehicle loans. One facility, one or several
 * vehicles: financed emissions = attribution factor × Σ over the vehicles of
 * (distance × efficiency × fuel factor, or fuel consumed × factor).
 *
 * The option is decided per vehicle by what is known about it (Table 5.6-1,
 * p.94) and the engine derives it from the data actually supplied rather than
 * taking it from a list:
 *
 *   1a  actual fuel or electricity consumed                          → 1
 *   1b  make/model efficiency × actual distance                      → 1
 *   2a  make/model efficiency × local statistical distance           → 2
 *   2b  make/model efficiency × regional statistical distance        → 3
 *   3a  vehicle-type efficiency × statistical distance               → 4
 *   3b  an average vehicle, the type itself unknown                  → 5
 *
 * Two options score 1 here, the one Part A table where that is so. Under
 * fn 146 a "local" statistic is the province, state or small-country level, so
 * a Sri-Lanka-wide annual-km figure is local and a make/model efficiency read
 * off the registration certificate reaches score 2 with it. Where a
 * borrower's vehicles are assessed under different options the borrower's
 * score is the lowest data quality in the mix (p.93) — the one class where the
 * standard states a combination rule — and the mix is printed beside it.
 *
 * Attribution is outstanding ÷ total value at origination (p.91). Where that
 * value is unknown the standard's own default is 100 % attribution, and the
 * trace says the default was taken rather than a figure keyed. Scope 1 is the
 * fuel burned and scope 2 the electricity drawn; scope 3 is not required and
 * is absent unless the institution reports a new vehicle's production
 * emissions as a first-year lump sum (p.91). A non-plug-in hybrid consumes
 * petrol only; a plug-in splits by the manufacturer's usage share, else 100 %
 * combustion (p.96).
 *
 * The engine does every arithmetic operation — including the litres-to-kWh
 * step that lets the fuel-factor baseline (held per kWh) price a litre — and
 * every figure is traced. It stores nothing.
 */

'use strict';

const dataQuality = require('../data-quality');
const { traced, absent } = require('../provenance');
const vs = require('./dataset');

const ASSET_CLASS = 'motor-vehicle-loans';
const STANDARD = 'PCAF (2025). Global GHG Accounting and Reporting Standard Part A: Financed '
  + 'Emissions. Third Edition, §5.6 and Chapter 6.';
const REF = 'PCAF Part A Third Edition §5.6 (pp.90–96), Table 5.6-1 (p.94), Annex Table 10.1-6';

const r2 = n => +Number(n).toFixed(2);
const r4 = n => +Number(n).toFixed(4);
const num = v => typeof v === 'number' && Number.isFinite(v);

/** @param {string} code @param {string} message @param {number} [statusCode] @param {string} [remedy] */
function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {any} */ (new Error(message));
  err.statusCode = statusCode; err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/** Efficiency in the engine's own units — litres (or kWh) per 100 km — whatever unit it was keyed in. */
function per100km(e) {
  const v = Number(e.value);
  if (!num(v) || v <= 0) throw refuse('EFFICIENCY_INVALID', 'Vehicle efficiency must be a number greater than zero.');
  const unit = String(e.unit || 'L/100km');
  if (unit === 'km/L') return { value: r4(100 / v), unit: 'L/100km', asKeyed: { value: v, unit }, conversion: `L/100km = 100 ÷ ${v} km/L` };
  if (unit === 'L/100km') return { value: v, unit, asKeyed: { value: v, unit }, conversion: null };
  if (unit === 'kWh/100km') return { value: v, unit, asKeyed: { value: v, unit }, conversion: null };
  if (unit === 'km/kWh') return { value: r4(100 / v), unit: 'kWh/100km', asKeyed: { value: v, unit }, conversion: `kWh/100km = 100 ÷ ${v} km/kWh` };
  throw refuse('EFFICIENCY_UNIT_NOT_HELD', `Efficiency unit "${unit}" is not one this engine converts (L/100km, km/L, kWh/100km, km/kWh).`, 400,
    'State the efficiency in L/100km or km/L (electric: kWh/100km or km/kWh), and name the test cycle where known.');
}

/** The factors a vehicle's fuel and electricity are priced at, with where each came from. */
function factorsOf(resolved) {
  const r = resolved || {};
  const tableFallback = key => ({ value: null, baseline: { scope: 'absent', provisional: true, source: `no ${key} factor resolved` } });
  return {
    electricity_grid: r.electricity_grid && num(r.electricity_grid.value) ? r.electricity_grid : tableFallback('grid'),
    petrol: r.petrol && num(r.petrol.value) ? r.petrol : tableFallback('petrol'),
    diesel: r.diesel && num(r.diesel.value) ? r.diesel : tableFallback('diesel'),
  };
}

/**
 * One vehicle: its option, its energy and its own (100 %) emissions.
 * @param {any} v the vehicle as keyed
 * @param {any} factors kgCO2e per kWh for grid, petrol and diesel, each with a baseline
 * @param {any} distances the registry's annual distance by class, if held
 */
function assessVehicle(v, factors, distances) {
  const cls = v.vehicleClass ? vs.classFor(v.vehicleClass) : null;
  if (v.vehicleClass && !cls) {
    throw refuse('VEHICLE_CLASS_NOT_HELD',
      `Vehicle class "${v.vehicleClass}" is not in the statistics (${vs.classKeys().join(', ')}).`, 400,
      'Use a held class, or supply the vehicle\'s make/model efficiency and its distance.');
  }
  const fuel = v.fuel || (cls ? cls.fuel : 'petrol');
  if (!['petrol', 'diesel', 'electricity', 'hybrid', 'plug-in-hybrid'].includes(fuel)) {
    throw refuse('FUEL_NOT_HELD', `Fuel "${fuel}" is not one this engine prices (petrol, diesel, electricity, hybrid, plug-in-hybrid).`);
  }
  const liquid = fuel === 'diesel' ? 'diesel' : 'petrol';
  const electric = fuel === 'electricity';
  /* A non-plug-in hybrid consumes petrol only; a plug-in splits by the
     manufacturer's usage share, else 100 % combustion (p.96). */
  const electricShare = electric ? 1 : (fuel === 'plug-in-hybrid' ? (num(v.electricShare) ? Math.min(1, Math.max(0, v.electricShare)) : 0) : 0);
  const assumptions = [];
  if (fuel === 'plug-in-hybrid' && !num(v.electricShare)) assumptions.push('Plug-in hybrid with no manufacturer usage split: 100 % combustion assumed (p.96).');
  if (fuel === 'hybrid') assumptions.push('Non-plug-in hybrid: petrol only, no scope 2 (p.96).');

  const price = (litres, kwh) => {
    const ec = vs.energyContent(liquid);
    const fuelFactor = factors[liquid];
    const grid = factors.electricity_grid;
    if (litres > 0 && !num(fuelFactor.value)) throw refuse('FUEL_FACTOR_NOT_HELD', `No ${liquid} emission factor is held.`, 400, 'Release a fuel_emission_factor_kgCO2e_kWh baseline.');
    if (kwh > 0 && !num(grid.value)) throw refuse('GRID_FACTOR_NOT_HELD', 'No grid emission factor is held.', 400, 'Release a grid_emission_factor_kgCO2e_kWh baseline.');
    const fuelKwh = r2(litres * (ec ? ec.value : 0));
    return {
      scope1: r4(fuelKwh * (num(fuelFactor.value) ? fuelFactor.value : 0) / 1000),
      scope2: r4(kwh * (num(grid.value) ? grid.value : 0) / 1000),
      energy: { litres: r2(litres), fuel: litres > 0 ? liquid : null, fuel_kWh: fuelKwh, electricity_kWh: r2(kwh),
        energyContent_kWh_per_L: ec ? ec.value : null },
      factorsUsed: { ...(litres > 0 ? { fuel: { value: fuelFactor.value, baseline: fuelFactor.baseline, unit: 'kgCO2e per kWh' } } : {}),
        ...(kwh > 0 ? { electricity: { value: grid.value, baseline: grid.baseline, unit: 'kgCO2e per kWh' } } : {}) },
    };
  };

  /* Option 1a — actual consumption. */
  const fc = v.fuelConsumed;
  if (fc && (num(fc.petrol_L) || num(fc.diesel_L) || num(fc.electricity_kWh))) {
    const litres = (num(fc.petrol_L) ? fc.petrol_L : 0) + (num(fc.diesel_L) ? fc.diesel_L : 0);
    const priced = price(litres, num(fc.electricity_kWh) ? fc.electricity_kWh : 0);
    return finish('1a', 'actual-fuel', v, cls, fuel, priced, { basis: 'actual fuel and electricity consumed over the year' }, assumptions);
  }

  /* Efficiency: make/model as keyed, or the class's provisional figure. */
  let eff, effBasis;
  if (v.efficiency && num(Number(v.efficiency.value))) {
    eff = per100km(v.efficiency);
    effBasis = v.efficiency.basis === 'class' ? 'class' : 'make-model';
  } else if (cls) {
    eff = { value: cls.efficiency.value, unit: cls.efficiency.unit, asKeyed: null, conversion: null };
    effBasis = 'class';
    assumptions.push(`Efficiency for "${cls.key}" from the provisional vehicle-statistics table (${cls.efficiency.source}); not a make/model figure.`);
  } else {
    const avg = vs.classFor('average');
    eff = { value: avg.efficiency.value, unit: avg.efficiency.unit, asKeyed: null, conversion: null };
    effBasis = 'average';
    assumptions.push('Vehicle type unknown: an average vehicle\'s efficiency and distance are used (Option 3b).');
  }

  /* Distance: actual as keyed; a statistic as keyed with its level; else the
     registry's local statistic for the class; else the table's. */
  let km, distBasis, distSource;
  if (v.distance && num(Number(v.distance.value_km))) {
    km = Number(v.distance.value_km);
    distBasis = ['actual', 'local', 'regional'].includes(v.distance.basis) ? v.distance.basis : 'local';
    distSource = v.distance.source || (distBasis === 'actual' ? 'odometer readings as keyed' : 'statistic as keyed');
  } else {
    const key = cls ? cls.key : 'average';
    const regKey = (cls && cls.distanceClass) || (vs.classFor(key) || {}).distanceClass || key;
    const held = distances && distances[regKey];
    if (held && num(held.value)) {
      km = held.value; distBasis = 'local';
      distSource = `registry baseline vehicle_annual_distance_km, class ${regKey} (${held.baseline.scope}${held.baseline.version ? ` v${held.baseline.version}` : ''}): ${held.baseline.basis || ''}`.trim();
    } else {
      const row = vs.classFor(key);
      km = row.annualDistance_km.value; distBasis = 'local';
      distSource = `provisional vehicle-statistics table: ${row.annualDistance_km.source}`;
    }
    assumptions.push(`Annual distance ${km} km for "${key}" is a Sri-Lanka-wide statistic — local under fn 146 — from ${distSource}.`);
  }

  const option = effBasis === 'average' ? '3b'
    : effBasis === 'class' ? '3a'
    : distBasis === 'actual' ? '1b' : distBasis === 'local' ? '2a' : '2b';
  const basisKey = { '1b': 'make-model-actual-distance', '2a': 'make-model-local-distance', '2b': 'make-model-regional-distance', '3a': 'type-statistical-distance', '3b': 'average-vehicle' }[option];

  const per100 = eff.value;
  const combustionKm = km * (1 - electricShare);
  const electricKm = km * electricShare;
  const litres = eff.unit === 'L/100km' ? (combustionKm / 100) * per100 : 0;
  const kwh = eff.unit === 'kWh/100km' ? (electricKm / 100) * per100 : 0;
  if (eff.unit === 'kWh/100km' && electricShare === 0) {
    throw refuse('EFFICIENCY_UNIT_MISMATCH', 'An efficiency in kWh/100km needs an electric or plug-in vehicle.', 400, 'Set fuel to electricity or plug-in-hybrid, or state the efficiency in L/100km.');
  }
  const priced = price(litres, kwh);
  return finish(option, basisKey, v, cls, fuel, priced, {
    basis: `${effBasis === 'make-model' ? 'make/model' : effBasis === 'class' ? 'vehicle-type' : 'average-vehicle'} efficiency × ${distBasis} distance`,
    efficiency: { ...eff, basis: effBasis, makeModel: v.makeModel || null, cycle: v.efficiency && v.efficiency.cycle ? v.efficiency.cycle : null },
    distance: { km, basis: distBasis, source: distSource, combustionKm: r2(combustionKm), electricKm: r2(electricKm) },
  }, assumptions);
}

function finish(option, basisKey, v, cls, fuel, priced, how, assumptions) {
  const combined = r2(priced.scope1 + priced.scope2);
  return {
    id: v.id || null,
    vehicleClass: cls ? cls.key : null,
    label: cls ? cls.label : 'Average vehicle',
    makeModel: v.makeModel || null,
    fuel,
    option,
    score: dataQuality.score(ASSET_CLASS, option).score,
    emissionsBasis: basisKey,
    ...how,
    energy: priced.energy,
    factors: priced.factorsUsed,
    emissions: { scope1: r2(priced.scope1), scope2: r2(priced.scope2), combined, unit: 'tCO2e' },
    traced: traced({
      value: combined, unit: 'tCO2e',
      equation: option === '1a' ? 'vehicle scope 1 and 2 = fuel consumed × energy content × fuel factor + electricity × grid factor'
        : 'vehicle scope 1 and 2 = distance × efficiency × energy content × fuel factor (+ distance × kWh/100km × grid factor)',
      inputs: { option, ...priced.energy },
      basis: `Measured (Option ${option})`,
      reference: REF,
      assumptions,
    }),
    provisional: assumptions.some(a => /provisional/.test(a)) || Object.values(priced.factorsUsed).some(f => f.baseline && f.baseline.provisional),
  };
}

/**
 * @param {Object} input
 * @returns {Object} the traced financed-emissions result for one vehicle facility
 */
function assessMotorVehicles(input = {}) {
  const country = String(input.country || 'LK').toUpperCase();
  const vehicles = Array.isArray(input.vehicles) ? input.vehicles : [];
  if (!vehicles.length) {
    throw refuse('VEHICLES_REQUIRED', 'A motor vehicle facility finances at least one vehicle; none was supplied.', 400,
      'Supply vehicles: [{ vehicleClass, makeModel, efficiency, distance, fuelConsumed }].');
  }
  const exposure = input.exposure || {};
  const outstanding = Number(exposure.outstanding);
  if (!num(outstanding) || outstanding < 0) throw refuse('INVALID_OUTSTANDING', 'Outstanding must be a number of zero or more.');

  /* Attribution: outstanding ÷ total value at origination; unknown → 100 %
     by the standard's own default (p.91), said on the trace. */
  const v = input.value || {};
  let af, denominator;
  if (num(Number(v.atOrigination)) && Number(v.atOrigination) > 0) {
    const value = Number(v.atOrigination);
    if (outstanding > value) {
      throw refuse('ATTRIBUTION_ABOVE_ONE', `Outstanding (${outstanding}) exceeds the value at origination (${value}); an attributed share above 100 % is an input error.`, 400,
        'Check the units of the outstanding amount and the origination value.');
    }
    af = r4(outstanding / value);
    denominator = { state: 'origination', value, factor: traced({ value: af, unit: 'ratio', equation: 'attribution factor = outstanding ÷ total value at origination', inputs: { outstanding, valueAtOrigination: value }, basis: 'Measured', reference: 'PCAF Part A Third Edition §5.6 (p.91)' }) };
  } else {
    af = 1;
    denominator = { state: 'assumed-100pct', value: null, factor: traced({ value: 1, unit: 'ratio', equation: 'attribution factor = 1 (value at origination unknown)', inputs: { outstanding }, basis: 'Standard default', reference: 'PCAF Part A Third Edition §5.6 (p.91)',
      assumptions: ['The total value at origination is unknown, so 100 % attribution is assumed — the standard\'s own conservative default (p.91). Supplying the origination value gives the actual share.'] }) };
  }

  const factors = factorsOf(input.resolvedFactors);
  const distances = input.resolvedFactors && input.resolvedFactors.annualDistanceByClass;
  const assessed = vehicles.map(x => assessVehicle(x, factors, distances));

  const s1 = r2(assessed.reduce((s, x) => s + x.emissions.scope1, 0));
  const s2 = r2(assessed.reduce((s, x) => s + x.emissions.scope2, 0));
  const attribute = (val, label) => traced({
    value: r2(val * af), unit: 'tCO2e',
    equation: `financed ${label} = Σ vehicle ${label} × attribution factor`,
    inputs: { [`vehicles_${label.replace(/\s/g, '_')}_tCO2e`]: val, attributionFactor: af },
    basis: 'Measured', reference: REF,
  });
  const financedScope1 = attribute(s1, 'scope 1');
  const financedScope2 = attribute(s2, 'scope 2');
  const combined = r2(Number(financedScope1.value) + Number(financedScope2.value));

  /* Lowest data quality in the mix (p.93): the borrower's score is the worst
     vehicle's, and the mix is printed beside it. */
  const worst = assessed.reduce((w, x) => (x.score > w.score ? x : w), assessed[0]);
  const dq = dataQuality.score(ASSET_CLASS, worst.option);
  const mix = [...new Set(assessed.map(x => x.option))].sort();
  const dataQualityBlock = {
    ...dq,
    mix,
    rule: mix.length > 1
      ? `Vehicles assessed under Options ${mix.join(', ')}: the borrower's score is the lowest data quality in the mix — Option ${worst.option}, score ${dq.score} (§5.6, p.93).`
      : 'One option across the facility\'s vehicles.',
  };

  /* Scope 3: not required; a new vehicle's production emissions as a first-year lump sum (p.91). */
  const prod = assessed.reduce((s, x, i) => s + (num(Number(vehicles[i].productionEmissions_tCO2e)) ? Number(vehicles[i].productionEmissions_tCO2e) : 0), 0);
  const scope3 = prod > 0
    ? traced({ value: r2(prod * af), unit: 'tCO2e', equation: 'financed production scope 3 = Σ new-vehicle production emissions × attribution factor (first year only)', inputs: { productionEmissions_tCO2e: prod, attributionFactor: af }, basis: 'Declared by the manufacturer or the institution', reference: 'PCAF Part A Third Edition §5.6 (p.91)', assumptions: ['Reported as a lump sum in the first year only, apart from scope 1 and 2.'] })
    : absent('Financed production emissions (scope 3)', 'Not required under §5.6; an institution may report a new vehicle\'s production emissions as a first-year lump sum, and none was supplied.', 'PCAF Part A Third Edition §5.6 (p.91)');

  return {
    standard: STANDARD,
    facility: {
      class: ASSET_CLASS, section: '§5.6', country,
      vehicles: assessed.length,
      vehicleClasses: [...new Set(assessed.map(x => x.vehicleClass || 'average'))],
      productType: input.productType || 'vehicle-loan',
      dataset: vs.release().tables[0],
    },
    denominator,
    attribution: denominator.factor,
    inventory: {
      financedScope1And2: {
        combined, scope1: financedScope1, scope2: financedScope2, unit: 'tCO2e',
        note: 'The institution\'s attributed share of the vehicles\' scope 1 (fuel) and scope 2 (electricity), reported combined at minimum with the split carried (§5.6; Chapter 6).',
      },
      vehicleEmissions: { scope1: s1, scope2: s2, combined: r2(s1 + s2), unit: 'tCO2e', note: 'The vehicles\' own (100 %) figure before attribution.' },
      vehicles: assessed,
      dataQuality: dataQualityBlock,
      productionScope3: scope3,
      factors,
      category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },
    provisional: assessed.some(x => x.provisional),
  };
}

module.exports = { assessMotorVehicles, ASSET_CLASS, STANDARD, REF };
