/**
 * CarbonIQ FinTech — PCAF Part C: A5 Construction / Installation Stage
 *
 * RICS WLCA 2nd ed sub-modules. A5.4 (worker transport) is excluded.
 *
 *   A5.1 demolition   = Σ demolished_mass_t × demolition_km × EF_road
 *   A5.2 site energy  = client-derived per-m² × GIFA, else RICS 40 kgCO2e/m² × GIFA
 *   A5.3 waste        = Σ boq_mass_t × waste_rate × waste_km × EF_road
 *
 * A5.2 method selection (the single most material choice in the model):
 *   Method B — a previous project's metered fuel + electricity, normalised
 *              per m² and scaled to this GIFA. Used when the optional
 *              previous-project block is supplied.
 *   Method A — RICS default 40 kgCO2e/m². Used otherwise.
 *
 * On the default path (no previous-project data) Method A contributes ~97%
 * of the whole construction figure from a single Global-tier constant. That
 * is recorded as a MATERIAL assumption on every run, because it is the
 * highest-value Sri Lankan factor gap in the model.
 *
 * A5.1 demolition inventory (agreed ruling): no separate itemised question.
 * Demolition lines are taken from the BOQ and reuse the same density table
 * as A4. Where a BOQ carries no demolition scope, an optional total
 * demolition mass may be supplied; absent both, A5.1 is zero and the
 * exclusion is disclosed rather than silently assumed.
 */

'use strict';

const { traced, assumption, sumValues } = require('./provenance');
const { massTonnes } = require('./a4-transport');
const factors = require('./factors');

// ---------------------------------------------------------------------------
// A5.1 — Pre-construction demolition (debris transport)
// ---------------------------------------------------------------------------

function a51Demolition({ demolitionItems = [], demolitionMass_t = null, demolitionKm } = {}) {
  const efRoad = factors.transportEF('road');
  const kmRef  = Number.isFinite(Number(demolitionKm))
    ? { key: 'input.demolitionTransport_km', value: Number(demolitionKm), unit: 'km', tier: 'Local', reference: 'Client-supplied demolition transport distance' }
    : factors.a5Default('demolitionTransport_km');
  const km = Number(kmRef.value) || 0;
  const assumptions = [];

  // Path 1 — itemised demolition lines lifted from the BOQ.
  if (demolitionItems.length > 0) {
    const children = demolitionItems.map(item => {
      const mass = massTonnes(item);
      const value = mass.value * km * (Number(efRoad.value) || 0);
      return traced({
        value, unit: 'kgCO2e', module: 'A5.1', label: item.name,
        equation: 'A5.1 = mass_t × demolition_km × EF_road',
        inputs: { mass_t: mass.value, demolition_km: km },
        factors: [efRoad, kmRef],
        children: [mass]
      });
    });
    return traced({
      value: sumValues(children), unit: 'kgCO2e', module: 'A5.1',
      label: 'A5.1 Pre-construction demolition',
      equation: 'A5.1 = Σ (mass_t × demolition_km × EF_road)',
      inputs: { itemCount: children.length, demolition_km: km, source: 'BOQ demolition lines' },
      children
    });
  }

  // Path 2 — a single total demolition mass supplied by the client.
  if (Number.isFinite(Number(demolitionMass_t)) && Number(demolitionMass_t) > 0) {
    const mass = Number(demolitionMass_t);
    assumptions.push(assumption('A5_1_TOTAL_MASS',
      `Demolition computed from a single total mass of ${mass} t rather than itemised lines. Item-level densities were not applied.`,
      'notable', { demolitionMass_t: mass }));
    return traced({
      value: mass * km * (Number(efRoad.value) || 0), unit: 'kgCO2e', module: 'A5.1',
      label: 'A5.1 Pre-construction demolition',
      equation: 'A5.1 = total_demolition_mass_t × demolition_km × EF_road',
      inputs: { mass_t: mass, demolition_km: km, source: 'client total mass' },
      factors: [efRoad, kmRef], assumptions
    });
  }

  // Path 3 — no demolition scope found. Disclosed, not silently assumed.
  assumptions.push(assumption('A5_1_NO_DEMOLITION',
    'No demolition lines were found in the BOQ and no total demolition mass was supplied. A5.1 is excluded (zero). If the site required demolition or clearance, that scope is not represented in this disclosure.',
    'notable', {}));

  return traced({
    value: 0, unit: 'kgCO2e', module: 'A5.1', label: 'A5.1 Pre-construction demolition',
    equation: 'A5.1 = 0 (no demolition scope identified)',
    inputs: { demolition_km: km, source: 'none' },
    factors: [kmRef], assumptions
  });
}

// ---------------------------------------------------------------------------
// A5.2 — Construction activities / site energy
// ---------------------------------------------------------------------------

function a52SiteEnergy({ gifa_m2, previousProject } = {}) {
  const gifa = Number(gifa_m2) || 0;
  const assumptions = [];

  const prev      = previousProject || {};
  const prevArea  = Number(prev.area_m2) || 0;
  const prevFuel  = Number(prev.fuel_L) || 0;
  const prevElec  = Number(prev.electricity_kWh) || 0;
  const hasClientData = prevArea > 0 && (prevFuel > 0 || prevElec > 0);

  if (gifa <= 0) {
    assumptions.push(assumption('A5_2_NO_GIFA',
      'Gross internal floor area is zero or missing. A5.2 site energy cannot be computed — it is the basis for both the RICS default and the client-derived rate.',
      'material', {}));
    return traced({
      value: 0, unit: 'kgCO2e', module: 'A5.2', label: 'A5.2 Construction site energy',
      equation: 'A5.2 = 0 (no GIFA)', inputs: { gifa_m2: gifa }, assumptions
    });
  }

  // Method B — client-derived from a previous project's metered site data.
  if (hasClientData) {
    const dieselEF = factors.a5Default('dieselEF');
    const gridEF   = factors.a5Default('gridEF');
    const ricsRef  = factors.a5Default('ricsSiteEnergy_kgCO2e_m2');

    const perM2 = (prevFuel * Number(dieselEF.value) + prevElec * Number(gridEF.value)) / prevArea;
    const value = perM2 * gifa;

    // Silent benchmark check (MVP: recorded, never interrupts).
    const ricsRate = Number(ricsRef.value) || 40;
    const deviation = (perM2 - ricsRate) / ricsRate;
    if (Math.abs(deviation) >= 0.30) {
      assumptions.push(assumption('A5_2_BENCHMARK_DEVIATION',
        `Client-derived site energy of ${perM2.toFixed(2)} kgCO2e/m² is ${Math.abs(deviation * 100).toFixed(0)}% ${deviation < 0 ? 'below' : 'above'} the RICS default of ${ricsRate} kgCO2e/m². Common causes of an understated figure: plant hired with fuel excluded from the log, or a fuel log covering only part of the programme. Not challenged in MVP — verify before relying on this disclosure.`,
        'material', { clientRate: perM2, ricsRate, deviationPct: deviation * 100 }));
    }

    assumptions.push(assumption('A5_2_METHOD_B',
      `Site energy derived from a previous project (${prevArea} m², ${prevFuel} L fuel, ${prevElec} kWh electricity) normalised to ${perM2.toFixed(2)} kgCO2e/m² and scaled to this project.`,
      'notable', { perM2, prevArea, prevFuel, prevElec }));

    return traced({
      value, unit: 'kgCO2e', module: 'A5.2', label: 'A5.2 Construction site energy',
      equation: 'A5.2 = ((prev_fuel_L × diesel_EF + prev_elec_kWh × grid_EF) / prev_area_m2) × GIFA',
      inputs: { method: 'B (client-derived)', gifa_m2: gifa, prevArea_m2: prevArea,
                prevFuel_L: prevFuel, prevElectricity_kWh: prevElec, derivedRate_kgCO2e_m2: perM2 },
      factors: [dieselEF, gridEF], assumptions
    });
  }

  // Method A — RICS default. The normal path, and the dominant assumption.
  const ricsRef = factors.a5Default('ricsSiteEnergy_kgCO2e_m2');
  const rate  = Number(ricsRef.value) || 40;
  const value = rate * gifa;

  assumptions.push(assumption('A5_2_METHOD_A',
    `No previous-project site data supplied. RICS default of ${rate} kgCO2e/m² applied across ${gifa} m². This single Global-tier constant typically drives the large majority of the construction figure — it is the highest-priority Sri Lankan factor gap in this model.`,
    'material', { rate, gifa }));

  return traced({
    value, unit: 'kgCO2e', module: 'A5.2', label: 'A5.2 Construction site energy',
    equation: 'A5.2 = RICS_default_kgCO2e_per_m2 × GIFA',
    inputs: { method: 'A (RICS default)', gifa_m2: gifa, rate_kgCO2e_m2: rate },
    factors: [ricsRef], assumptions
  });
}

// ---------------------------------------------------------------------------
// A5.3 — Waste and waste management
// ---------------------------------------------------------------------------

function a53Waste({ materials = [], wasteDisposalKm } = {}) {
  const efRoad = factors.transportEF('road');
  const kmRef  = Number.isFinite(Number(wasteDisposalKm))
    ? { key: 'input.wasteDisposal_km', value: Number(wasteDisposalKm), unit: 'km', tier: 'Local', reference: 'Client-supplied waste disposal distance' }
    : factors.a5Default('wasteDisposal_km');
  const km = Number(kmRef.value) || 0;

  const children = materials.map(m => {
    const mass = massTonnes(m);
    const rate = factors.wasteRate(m.wasteCategory || '');
    const wastedMass = mass.value * (Number(rate.value) || 0);
    const value = wastedMass * km * (Number(efRoad.value) || 0);

    const assumptions = [];
    if (rate.fallback) {
      assumptions.push(assumption('A5_3_WASTE_RATE_FALLBACK',
        `"${m.name}" is not listed in RICS Table 18 (mapped category: ${m.wasteCategory || 'none'}). The 5% table default was applied.`,
        'info', { material: m.name, category: m.wasteCategory || null }));
    }

    return traced({
      value, unit: 'kgCO2e', module: 'A5.3', label: m.name,
      equation: 'A5.3 = boq_mass_t × waste_rate × waste_km × EF_road',
      inputs: { mass_t: mass.value, wasteRate: rate.value, wastedMass_t: wastedMass, waste_km: km },
      factors: [rate, efRoad, kmRef], assumptions, children: [mass]
    });
  });

  return traced({
    value: sumValues(children), unit: 'kgCO2e', module: 'A5.3',
    label: 'A5.3 Waste and waste management',
    equation: 'A5.3 = Σ (boq_mass_t × waste_rate × waste_km × EF_road)',
    inputs: { materialCount: children.length, waste_km: km },
    children
  });
}

// ---------------------------------------------------------------------------
// A5 total
// ---------------------------------------------------------------------------

function a5Total(input = {}) {
  const a51 = a51Demolition(input);
  const a52 = a52SiteEnergy(input);
  const a53 = a53Waste(input);
  const children = [a51, a52, a53];

  return traced({
    value: sumValues(children), unit: 'kgCO2e', module: 'A5',
    label: 'A5 Construction / installation',
    equation: 'A5 = A5.1 + A5.2 + A5.3',
    inputs: { a5_1: a51.value, a5_2: a52.value, a5_3: a53.value,
              note: 'A5.4 worker transport excluded per scope' },
    children
  });
}

module.exports = { a51Demolition, a52SiteEnergy, a53Waste, a5Total };
