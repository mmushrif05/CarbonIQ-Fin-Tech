// @ts-check
/**
 * The metrics a baseline can govern — a closed vocabulary.
 *
 * A baseline is only worth something if everybody quoting it means the same
 * thing by it, so the metric decides the shape of the values, the unit, and
 * what in the product actually reads it. A metric nobody reads is declared
 * here as **provisioned** and says so, rather than being invented into the
 * seed with numbers no one can defend.
 *
 * The rule that governs the whole registry: *where a published standard sets
 * the figure, the standard's value wins and this holds only the citation;
 * where no standard sets one, the figure is regional judgement and this is
 * where it lives.* PCAF sets the method and does not set Sri Lanka's
 * baseline; that is what makes the second kind worth maintaining.
 */

'use strict';

const { checked, sectorVocabularySchema } = require('../../../shared/reference-data');

/**
 * The sector vocabulary the intensity bands are keyed to — Part A's, read from
 * the same file its factor library reads, so a band cannot name a sector the
 * library does not know and the two cannot drift.
 */
const SECTORS = checked('data/pcaf-parta/sectors.json',
  require('../../../../data/pcaf-parta/sectors.json'), sectorVocabularySchema).sectors;

/**
 * @typedef {Object} MetricDefinition
 * @property {string} key
 * @property {string} label
 * @property {string} unit
 * @property {string[]} fields the value keys a baseline for this metric carries
 * @property {'bands'|'single'|'sector_bands'|'margins'|'table'|'building_types'|'vehicle_classes'|'series'} shape
 * @property {string} governs what reads it — or that nothing does yet
 * @property {boolean} wired whether the product reads it today
 * @property {string} [direction] for bands: whether lower is better
 * @property {boolean} [sparse] a table where a country may hold some fields and not others;
 *   at least one is required and no field outside the list is accepted
 */

/** @type {Record<string, MetricDefinition>} */
const METRICS = Object.freeze({
  construction_intensity_kgCO2e_m2: {
    key: 'construction_intensity_kgCO2e_m2',
    label: 'Construction carbon intensity screen',
    unit: 'kgCO2e/m²',
    shape: 'bands',
    fields: ['green', 'transition'],
    direction: 'lower_is_better',
    governs: 'The green / transition / not-aligned band on GET /v1/taxonomy and the '
      + 'tier printed on a Green Loan Certificate.',
    wired: true,
  },

  embodied_carbon_benchmark_kgCO2e_m2: {
    key: 'embodied_carbon_benchmark_kgCO2e_m2',
    label: 'Embodied carbon benchmark',
    unit: 'kgCO2e/m²',
    shape: 'single',
    fields: ['value'],
    direction: 'lower_is_better',
    governs: 'A typical figure for the building type, against which a project is read. '
      + 'Nothing reads it yet: the Part C benchmark library is built from an '
      + "organisation's own locked assessments, which is a stronger figure than any "
      + 'default would be.',
    wired: false,
  },

  grid_emission_factor_kgCO2e_kWh: {
    key: 'grid_emission_factor_kgCO2e_kWh',
    label: 'Grid emission factor',
    unit: 'kgCO2e/kWh',
    shape: 'single',
    fields: ['value'],
    governs: 'A financed building\'s scope 2 (§5.4/§5.5) — the property engine resolves '
      + 'it here, location-based, and names the scope and version on the trace. Part C\'s '
      + 'A5.2 site electricity still reads data/factors/a5-defaults.json; a released '
      + 'baseline is the figure that row will be held to. Never a displacement factor.',
    wired: true,
  },

  sector_intensity_tCO2e_per_million_revenue: {
    key: 'sector_intensity_tCO2e_per_million_revenue',
    label: 'Sector carbon-intensity plausibility bands',
    unit: 'tCO2e per million units of the reporting currency, of revenue (scope 1 and 2)',
    shape: 'sector_bands',
    /* The fields are the vocabulary's: `<sector>_low` and `<sector>_high` for
       each sector held, so the value set is declared by the sector list and
       not restated here. */
    fields: [],
    direction: 'range',
    governs: 'The plausibility finding on a PCAF Part A §5.2 exposure: a borrower whose reported '
      + 'scope 1 and 2 intensity sits outside its sector\'s band is recorded, with the divergence and '
      + 'the baseline version it was checked against. Nothing is refused and no figure changes. '
      + 'PCAF sets no such test; the bands are regional judgement, which is why they are governed here.',
    wired: true,
  },

  grid_displacement_factor_tCO2e_MWh: {
    key: 'grid_displacement_factor_tCO2e_MWh',
    label: 'Grid displacement factor — operating, build and combined margins',
    unit: 'tCO2e/MWh',
    shape: 'margins',
    fields: ['operating_margin', 'build_margin', 'combined_margin'],
    governs: 'The counterfactual a financed renewable displaces — avoided emissions only, '
      + 'never a scope 2 factor (PCAF supplement Table A.1 prefers the operating margin; '
      + 'CDM Tool 07 combines the margins at stated weights). Project finance reads it '
      + 'from data/pcaf-parta/country-config.json today; a released baseline is the '
      + 'figure that file will be held to.',
    wired: false,
  },

  fuel_emission_factor_kgCO2e_kWh: {
    key: 'fuel_emission_factor_kgCO2e_kWh',
    label: 'Fuel combustion emission factors',
    unit: 'kgCO2 per kWh of fuel, net calorific value',
    shape: 'table',
    fields: ['diesel', 'petrol', 'kerosene', 'furnace_oil', 'lpg', 'natural_gas', 'bituminous_coal'],
    governs: 'On-site fuel combustion in a financed building (§5.4/§5.5), and every '
      + 'scope 1 figure a class computes from fuel; the property engine reads diesel and '
      + 'LPG from it. The standard\'s value wins (IPCC 2006 Vol. 2 Table 1.4) and the '
      + 'registry holds the citation; a Sri Lankan density is what turns it into a '
      + 'per-litre figure.',
    wired: true,
  },

  gwp_100yr: {
    key: 'gwp_100yr',
    label: 'Global warming potentials, 100-year',
    unit: 'kgCO2e per kg of gas',
    shape: 'table',
    fields: ['ch4_fossil', 'ch4_non_fossil', 'n2o', 'hfc32', 'hfc125', 'hfc134a', 'r410a', 'r404a', 'r407c', 'sf6', 'nf3'],
    governs: 'The conversion of non-CO2 gases to CO2e (PCAF Third Edition p.162, p.176). '
      + 'Nothing reads it yet: Part C\'s refrigerant table is fixed at AR5 and says so, '
      + 'and a product-wide basis is decided once and recorded, not resolved per request.',
    wired: false,
  },

  building_energy_intensity_kWh_m2: {
    key: 'building_energy_intensity_kWh_m2',
    label: 'Building energy intensity by type',
    unit: 'kWh per m² per year, gross floor area',
    shape: 'building_types',
    fields: ['office', 'office_naturally_ventilated', 'retail', 'supermarket', 'hotel', 'hospital',
      'industrial', 'warehouse', 'residential_apartment', 'residential_house'],
    sparse: true,
    governs: 'PCAF §5.4/§5.5 Option 2b (statistics × floor area, score 4) and Option 3. The '
      + 'property engine reads a type\'s intensity from a released or shipped baseline and '
      + 'falls back to the provisional energy-statistics table for a type the baseline '
      + 'does not hold, naming which on the trace.',
    wired: true,
  },

  building_energy_per_dwelling_kWh: {
    key: 'building_energy_per_dwelling_kWh',
    label: 'Residential energy per dwelling',
    unit: 'kWh per dwelling per year',
    shape: 'single',
    fields: ['value'],
    governs: 'PCAF §5.5 Option 3 — statistics per dwelling × number of dwellings (score 5). '
      + 'No Sri Lankan figure has been read from its source; the registry reports it absent '
      + 'rather than borrowing one.',
    wired: false,
  },

  vehicle_annual_distance_km: {
    key: 'vehicle_annual_distance_km',
    label: 'Vehicle annual distance by class',
    unit: 'km per vehicle per year',
    shape: 'vehicle_classes',
    fields: ['car_petrol', 'car_diesel', 'three_wheeler', 'motorcycle', 'van', 'bus', 'lorry'],
    sparse: true,
    governs: 'PCAF §5.6 Options 2a/2b/3a/3b — a Sri-Lanka-wide statistic is *local* (fn 146), '
      + 'so make/model efficiency × this figure is Option 2a, score 2. Read by the §5.6 engine '
      + 'through application/vehicle-factors.js.',
    wired: true,
  },

  vehicle_fuel_economy_l_per_100km: {
    key: 'vehicle_fuel_economy_l_per_100km',
    label: 'Vehicle fuel economy by class',
    unit: 'litres per 100 km (electric: kWh per 100 km)',
    shape: 'vehicle_classes',
    fields: ['car_petrol', 'car_diesel', 'three_wheeler', 'motorcycle', 'van', 'bus', 'lorry', 'ev_kwh_per_100km'],
    sparse: true,
    governs: 'PCAF §5.6 Options 3a/3b (vehicle-type efficiency). No Sri Lankan class-average '
      + 'figure has been verified; make/model figures come from the registration certificate.',
    wired: false,
  },

  carbon_price_usd_tCO2e: {
    key: 'carbon_price_usd_tCO2e',
    label: 'Carbon price — explicit and shadow',
    unit: 'USD per tCO2e',
    shape: 'table',
    fields: ['explicit', 'shadow_low', 'shadow_high'],
    sparse: true,
    governs: 'Carbon-pricing exposure and transition-risk screens. Sri Lanka has no carbon '
      + 'tax and no ETS (OECD 2024), so the explicit price is zero and says so.',
    wired: false,
  },

  currency_lkr_per_usd_annual_average: {
    key: 'currency_lkr_per_usd_annual_average',
    label: 'Annual-average exchange rate, LKR per USD',
    unit: 'LKR per USD, annual average',
    shape: 'series',
    fields: ['y2018', 'y2019', 'y2020', 'y2021', 'y2022', 'y2023', 'y2024', 'y2025', 'y2026'],
    sparse: true,
    governs: 'Re-basing a foreign-currency economic factor (PCAF Box 6.1-5). Nothing reads it '
      + 'until the CBSL annual-average table has been read from its source; until then the '
      + 'uncorrected figure is the minimum reported (p.65).',
    wired: false,
  },

  data_quality_target_score: {
    key: 'data_quality_target_score',
    label: 'PCAF data-quality ambition',
    unit: 'PCAF score (1 is the highest quality, 5 the lowest)',
    shape: 'single',
    fields: ['value'],
    direction: 'lower_is_better',
    governs: 'The score an organisation has committed to reach across its book. '
      + 'Reported beside the disclosed premium-weighted score as a target, never '
      + 'blended into it.',
    wired: false,
  },
});

const KEYS = Object.freeze(Object.keys(METRICS));

/** @param {string} key */
function metric(key) {
  return METRICS[key] || null;
}

/**
 * Whether `values` is the shape this metric requires, and why not where it is
 * not. A band set must also be ordered: a green threshold above the
 * transition threshold is not a stricter screen, it is an unreadable one.
 *
 * @param {string} key
 * @param {Record<string, any>} values
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validateValues(key, values) {
  const def = METRICS[key];
  if (!def) return { ok: false, reason: `Unknown metric "${key}". Known: ${KEYS.join(', ')}.` };
  if (!values || typeof values !== 'object') return { ok: false, reason: 'Values are required.' };

  if (def.shape === 'sector_bands') return validateSectorBands(values, def);

  if (def.sparse && !def.fields.some(f => values[f] !== undefined)) {
    return { ok: false, reason: `At least one of ${def.fields.join(', ')} is required (${def.unit}).` };
  }
  for (const f of def.fields) {
    const n = values[f];
    if (n === undefined && def.sparse) continue;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { ok: false, reason: `"${f}" must be a finite number (${def.unit}).` };
    }
    if (n < 0) return { ok: false, reason: `"${f}" cannot be negative.` };
  }
  const extra = Object.keys(values).filter(k => !def.fields.includes(k));
  if (extra.length) return { ok: false, reason: `Unexpected field(s): ${extra.join(', ')}. This metric carries ${def.fields.join(', ')}.` };

  if (def.shape === 'bands' && def.direction === 'lower_is_better' && values.green > values.transition) {
    return { ok: false, reason: `The green threshold (${values.green}) cannot be above the transition threshold (${values.transition}).` };
  }
  return { ok: true };
}

/**
 * A band set over the sector vocabulary: `<sector>_low` and `<sector>_high`
 * for at least one sector, both present, both finite and non-negative, low
 * at or below high, and no key naming a sector the vocabulary does not hold.
 * A band for an unknown sector would sit in the table looking authoritative
 * and never apply to a single exposure.
 *
 * @param {Record<string, any>} values
 * @param {MetricDefinition} def
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validateSectorBands(values, def) {
  /** @type {Record<string, {low?: number, high?: number}>} */
  const bySector = {};
  for (const [k, n] of Object.entries(values)) {
    const m = k.match(/^(.+)_(low|high)$/);
    if (!m) return { ok: false, reason: `"${k}" is not a band key. This metric carries <sector>_low and <sector>_high.` };
    const [, sector, end] = m;
    if (!SECTORS[sector]) {
      return { ok: false, reason: `"${sector}" is not a sector in the vocabulary (data/pcaf-parta/sectors.json). Held: ${Object.keys(SECTORS).join(', ')}.` };
    }
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { ok: false, reason: `"${k}" must be a finite number (${def.unit}).` };
    }
    if (n < 0) return { ok: false, reason: `"${k}" cannot be negative.` };
    bySector[sector] = { ...(bySector[sector] || {}), [end]: n };
  }
  const sectors = Object.keys(bySector);
  if (!sectors.length) return { ok: false, reason: 'At least one sector band is required.' };
  for (const sector of sectors) {
    const b = bySector[sector];
    if (b.low === undefined || b.high === undefined) {
      return { ok: false, reason: `${sector} needs both ${sector}_low and ${sector}_high.` };
    }
    if (b.low > b.high) {
      return { ok: false, reason: `${sector}_low (${b.low}) cannot be above ${sector}_high (${b.high}).` };
    }
  }
  return { ok: true };
}

/**
 * A band set's values, read by sector: `{ sector: { low, high } }`.
 * @param {Record<string, number>|null|undefined} values
 */
function sectorBandsOf(values) {
  /** @type {Record<string, {low: number, high: number}>} */
  const out = {};
  for (const [k, n] of Object.entries(values || {})) {
    const m = k.match(/^(.+)_(low|high)$/);
    if (!m) continue;
    out[m[1]] = { ...(out[m[1]] || { low: NaN, high: NaN }), [m[2]]: Number(n) };
  }
  return out;
}

module.exports = { METRICS, KEYS, SECTORS, metric, validateValues, sectorBandsOf };
