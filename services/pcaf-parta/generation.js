/**
 * A renewable project, derived from what it generates.
 *
 * MW is a rate and MWh is a quantity. Every emission factor is per MWh, so a
 * nameplate figure alone can never produce tonnes — the capacity factor is the
 * bridge, and which of the two the operator actually holds depends on where
 * the project is in its life. So there are two modes and they run in opposite
 * directions:
 *
 *   PROJECTED (ex-ante, no meter)  capacity is primary; generation is derived
 *                                  as capacity x default CF x 8,760, stays
 *                                  editable, and reports Expected Avoided
 *                                  Emissions.
 *   METERED   (ex-post)            generation is primary and is NEVER
 *                                  overwritten; capacity is used only for the
 *                                  plausibility check, and the output is
 *                                  realised avoided emissions.
 *
 * Two things are never entangled. The combined margin values what a new
 * renewable DISPLACES; the grid average values what the plant itself DRAWS.
 * They live behind separate functions in country-config.js that take no key
 * argument, so neither can be handed the other's.
 *
 * And the data quality option follows the weakest link in the chain that
 * produced the number, not the best. A generation figure invented from a
 * default capacity factor is not primary physical activity data however
 * precisely it is printed.
 */

'use strict';

const { traced } = require('./provenance');
const cc = require('./country-config');

const HOURS_PER_YEAR = 8760;
const CONFIG = cc.CONFIG;

/* ── The data quality ladder ──────────────────────────────────────────────
   PCAF Table 5.3-1 Option 2a requires primary physical activity data AND an
   emission factor specific to that data. Lose either and 2a is unavailable —
   which is the whole reason a global default carries a penalty rather than
   just a footnote. */
const DQ_LADDER = {
  'metered|national':   { option: '2a', why: 'Metered generation is primary physical activity data, and the grid factor is specific to this country.' },
  'metered|global':     { option: '2b', why: 'Generation is metered, but the grid factor is a global default rather than one specific to this grid. Option 2a requires factors specific to the data, so it is not available.' },
  'supplied|national':  { option: '2b', why: 'Generation is a project-specific projection rather than metered output, with a country-specific grid factor.' },
  'supplied|global':    { option: '3a', why: 'Generation is a projection and the grid factor is a global default. Neither input is specific to this project and grid.' },
  'derived|national':   { option: '3a', why: 'Generation was estimated from a default capacity factor rather than supplied — it is not project data. The grid factor is country-specific.' },
  'derived|global':     { option: '3b', why: 'Generation was estimated from a default capacity factor and the grid factor is a global default. Nothing in this figure is specific to this project or this grid.' },
};

/** Which rung this run has earned. */
function _resolveOption({ generationSource, factorScope }) {
  const key = `${generationSource}|${factorScope}`;
  const rung = DQ_LADDER[key];
  return {
    option: rung.option,
    derived: true,
    reason: rung.why,
    generationSource,
    factorScope,
    penalised: rung.option !== '2a',
    ladder: DQ_LADDER,
  };
}

/**
 * Is this generation achievable from this plant, and if not, why not?
 *
 * The diagnosis is the point. "Outside the band" tells an operator a number is
 * odd; naming the two or three things that actually produce that number tells
 * them where to look.
 */
function capacityFactorCheck({ annualGeneration_MWh, installedCapacity_MW, country, technology }) {
  const tech = cc.technology(country, technology);

  if (!Number.isFinite(installedCapacity_MW) || installedCapacity_MW <= 0) {
    return { ran: false, reason: 'Installed capacity was not supplied, so the generation figure '
      + 'could not be checked against what the plant can physically produce.' };
  }
  if (tech.absent) {
    /* Rule: no data, no check. A band borrowed from another country would
       pass or fail a project against a place it is not in. */
    return { ran: false, available: false, reason: tech.reason };
  }

  const limits = cc.limits(technology);
  const ceiling_MWh = installedCapacity_MW * HOURS_PER_YEAR;
  const cf = annualGeneration_MWh / ceiling_MWh;
  /* MWh per MW is numerically kWh per kWp. Developers read this far more
     fluently than a capacity factor. */
  const specificYield = annualGeneration_MWh / installedCapacity_MW;

  const shared = {
    ran: true,
    available: true,
    capacityFactor: +cf.toFixed(4),
    capacityFactorPct: +(cf * 100).toFixed(1),
    specificYield_kWh_per_kWp: Math.round(specificYield),
    nameplateCeiling_MWh: +ceiling_MWh.toFixed(0),
    equation: 'capacity factor = annual generation ÷ (installed capacity × 8,760 h)',
    specificYieldEquation: 'specific yield = annual generation (MWh) ÷ installed capacity (MW), '
      + 'which is kWh per kWp per year',
    technology: tech.technology,
    reference: tech.isGlobalDefault ? 'Global' : tech.country,
    isGlobalDefault: Boolean(tech.isGlobalDefault),
    hasBand: Boolean(tech.hasBand),
    band: tech.hasBand ? { low: tech.band_low, high: tech.band_high } : null,
    referenceCf: tech.default_cf,
    source: `${tech.publisher || tech.source} (${tech.year})`,
    limits,
  };

  const fmtPct = v => `${(v * 100).toFixed(1)}%`;

  if (cf > limits.ceiling) {
    const err = new Error(
      `${annualGeneration_MWh.toLocaleString('en-GB')} MWh from ${installedCapacity_MW} MW implies a `
      + `capacity factor of ${fmtPct(cf)}. No ${tech.technology.toLowerCase()} plant operates above `
      + `${fmtPct(limits.ceiling)} — ${limits.ceiling_basis} The figure is refused rather than `
      + 'carried into a disclosure.');
    err.statusCode = 422; err.code = 'GENERATION_NOT_PHYSICALLY_POSSIBLE';
    err.remedy = 'Three things produce a figure this high. A DC nameplate entered where the band '
      + 'assumes AC. Generation covering more than twelve months. Or kWh entered as MWh. '
      + `At ${fmtPct(shared.referenceCf)} this plant would generate about `
      + `${Math.round(ceiling_MWh * shared.referenceCf).toLocaleString('en-GB')} MWh a year.`;
    throw err;
  }

  if (cf < limits.floor) {
    const outBy = cf > 0 ? Math.round(shared.referenceCf / cf) : null;
    const thousandish = outBy !== null && outBy >= 300 && outBy <= 3000;
    const pct = cf * 100;
    const err = new Error(
      `${annualGeneration_MWh.toLocaleString('en-GB')} MWh from ${installedCapacity_MW} MW implies a `
      + `capacity factor of ${pct >= 0.01 ? pct.toFixed(2) : pct.toPrecision(2)}%. A plant producing `
      + `that little has not run: below ${fmtPct(limits.floor)}, ${limits.floor_basis} The figure is `
      + 'refused rather than carried into a disclosure.');
    err.statusCode = 422; err.code = 'GENERATION_NOT_PHYSICALLY_POSSIBLE';
    err.remedy = thousandish
      ? `The two figures are out by a factor of about ${outBy.toLocaleString('en-GB')}, which is the `
        + 'signature of a thousands mix-up — capacity entered in kW where the field asks for MW, or '
        + 'generation entered in GWh where it asks for MWh. Check both.'
      : 'Two things produce a figure this low. A partial year of generation, where the plant was '
        + 'commissioned mid-year and the figure covers only the months since. Or kWh entered as MWh. '
        + `A full year at ${fmtPct(shared.referenceCf)} would be about `
        + `${Math.round(ceiling_MWh * shared.referenceCf).toLocaleString('en-GB')} MWh.`;
    throw err;
  }

  /* A global default gives a reference point, not a range. Judging a plant in
     or out of a band nobody published would be inventing the band. */
  if (!tech.hasBand) {
    const ratio = cf / tech.default_cf;
    return {
      ...shared,
      status: 'no_band',
      ratioToReference: +ratio.toFixed(2),
      note: `${fmtPct(cf)} against a global weighted average of ${fmtPct(tech.default_cf)} for `
        + `${tech.technology.toLowerCase()} — ${ratio.toFixed(2)}× the global figure. `
        + `${tech.globalDefaultNote} No national band is held for ${cc.forCountry(country).name}, so `
        + 'this is a reference point rather than a pass or a fail.',
    };
  }

  if (cf > tech.band_high) {
    return { ...shared, status: 'above_band',
      note: `${fmtPct(cf)} sits above the ${fmtPct(tech.band_low)}-${fmtPct(tech.band_high)} band for `
        + `${tech.technology.toLowerCase()} in ${tech.country}. The usual causes are a DC nameplate `
        + 'entered where the band assumes AC capacity, or a generation figure covering more than '
        + 'twelve months. A tracking array on an unusually good site can also do it legitimately — '
        + 'but it should be explained rather than left for a reviewer to notice.' };
  }

  if (cf < tech.band_low) {
    const halfway = cf < tech.band_low / 2;
    return { ...shared, status: 'below_band',
      note: `${fmtPct(cf)} sits below the ${fmtPct(tech.band_low)}-${fmtPct(tech.band_high)} band for `
        + `${tech.technology.toLowerCase()} in ${tech.country}. `
        + (halfway
          ? 'At less than half the bottom of the band the most likely cause is a partial year — the '
            + 'plant commissioned mid-year and the figure covers only the months since. Check also '
            + 'that the figure is MWh and not kWh.'
          : 'The usual causes are a partial year of generation, a curtailed grid connection, or a '
            + 'shaded or otherwise constrained site. Not necessarily an error, but it should be '
            + 'explained rather than left for a reviewer to notice.') };
  }

  return { ...shared, status: 'within_band',
    note: `${fmtPct(cf)} is within the ${fmtPct(tech.band_low)}-${fmtPct(tech.band_high)} band for `
      + `${tech.technology.toLowerCase()} in ${tech.country}.` };
}

/** Lifetime avoided emissions, with degradation and an optional grid trajectory. */
function _lifetime({ annualGeneration_MWh, factorValue, country, years, degradationPct }) {
  const traj = (CONFIG.grid_trajectory.countries || {})[country] || null;
  const factorFor = y => {
    if (!traj) return factorValue;
    const row = traj.find(r => r.year === y);
    return row ? row.value : factorValue;
  };

  const startYear = new Date().getFullYear();
  let total = 0;
  /* The per-year series, so a chart plots what was actually summed rather than
     redrawing a curve from the total. */
  const series = [];
  for (let i = 0; i < years; i++) {
    const output = annualGeneration_MWh * Math.pow(1 - degradationPct / 100, i);
    const factor = factorFor(startYear + i);
    const avoided = output * factor;
    total += avoided;
    series.push({
      year: startYear + i,
      generation_MWh: +output.toFixed(1),
      factor,
      avoided_tCO2e: +avoided.toFixed(2),
    });
  }

  return {
    value: +total.toFixed(2),
    series,
    firstYear: series[0] ? series[0].avoided_tCO2e : null,
    lastYear: series.length ? series[series.length - 1].avoided_tCO2e : null,
    years,
    degradationPct,
    trajectory: traj ? 'configured' : 'flat',
    trajectoryNote: traj
      ? `A declining grid factor configured for ${country} has been applied year by year.`
      : 'No grid trajectory is configured for this country, so the factor is held flat for the whole '
        + 'life. That is conservative in one direction only: on a decarbonising grid it OVERSTATES '
        + 'avoided emissions in later years, and on one getting dirtier it understates them.',
    degradationNote: `Output declines ${degradationPct}% a year. ${CONFIG.degradation.basis}`,
  };
}

/**
 * @param {Object} p
 * @param {'projected'|'metered'} p.mode
 * @param {string} p.country       ISO 3166-1 alpha-2
 * @param {string} p.technology    solar_pv | wind_on | hydro_ror
 * @param {number} [p.installedCapacity_MW]
 * @param {number} [p.annualGeneration_MWh]  required in metered mode
 * @param {'P50'|'P90'} [p.yieldBasis]
 * @param {number} [p.degradationRatePct]
 * @param {number} [p.lifetimeYears]
 * @param {number} [p.auxiliaryConsumption_MWh]
 * @param {number} [p.reportingYear]
 */
function deriveFromGeneration(input) {
  const {
    mode = 'projected', country, technology = 'solar_pv',
    installedCapacity_MW, annualGeneration_MWh,
    yieldBasis = 'P50',
    degradationRatePct = CONFIG.degradation.default_rate_pct_per_year,
    lifetimeYears = 25,
    auxiliaryConsumption_MWh, reportingYear,
  } = input;

  const assumptions = [];
  const countryName = cc.forCountry(country).name;

  /* ── Which figure drives which ───────────────────────────────────────── */
  let generation = annualGeneration_MWh;
  let generationSource;          // metered | supplied | derived
  let generationEquation = null;
  let derivation = null;

  if (mode === 'metered') {
    if (!Number.isFinite(generation) || generation <= 0) {
      const err = new Error('Metered mode reports what the plant actually produced, so annual '
        + 'generation is required and is never derived. Enter the metered figure, or switch to '
        + 'projected to estimate it from capacity.');
      err.statusCode = 400; err.code = 'METERED_GENERATION_REQUIRED';
      throw err;
    }
    generationSource = 'metered';
  } else if (Number.isFinite(generation) && generation > 0) {
    generationSource = 'supplied';
  } else {
    const tech = cc.technology(country, technology);
    if (tech.absent) {
      const err = new Error(
        `Annual generation cannot be estimated for ${cc.TECHNOLOGIES[technology].label} in `
        + `${countryName}: ${tech.reason}`);
      err.statusCode = 501; err.code = 'CAPACITY_FACTOR_NOT_HELD';
      err.remedy = 'Enter the annual generation directly, or add a sourced capacity factor for '
        + 'this country and technology to the config.';
      throw err;
    }
    if (!Number.isFinite(installedCapacity_MW) || installedCapacity_MW <= 0) {
      const err = new Error('Projected mode derives generation from installed capacity, so '
        + 'capacity is required.');
      err.statusCode = 400; err.code = 'CAPACITY_REQUIRED';
      throw err;
    }
    const p50 = installedCapacity_MW * tech.default_cf * HOURS_PER_YEAR;
    const ratio = yieldBasis === 'P90' ? CONFIG.yield_basis.p90_ratio_of_p50 : 1;
    generation = +(p50 * ratio).toFixed(2);
    generationSource = 'derived';
    generationEquation = `annual generation = installed capacity × capacity factor × 8,760 h`
      + (yieldBasis === 'P90' ? ` × ${ratio} (P90 ratio)` : '');

    /* The chain, step by step, so the screen can show the working rather than
       assert a number. The question this answers on sight is the one a user
       asks first: why did that figure not move when I changed the country? */
    derivation = {
      steps: [
        { label: 'Installed capacity', value: installedCapacity_MW, unit: 'MW' },
        { label: 'Capacity factor', value: tech.default_cf, unit: 'ratio',
          pct: +(tech.default_cf * 100).toFixed(1),
          scope: tech.isGlobalDefault ? 'global' : 'national',
          source: `${tech.publisher || tech.source} (${tech.year})` },
        { label: 'Hours in a year', value: HOURS_PER_YEAR, unit: 'h' },
        ...(yieldBasis === 'P90'
          ? [{ label: 'P90 ratio', value: ratio, unit: 'ratio',
               source: CONFIG.yield_basis.ratio_basis }] : []),
      ],
      result: generation,
      cfIsGlobal: Boolean(tech.isGlobalDefault),
      /* Answers the "why didn't it change?" question before it is asked. */
      whyUnchangedNote: tech.isGlobalDefault
        ? `The capacity factor used is a GLOBAL weighted average, because no national one is held `
          + `for ${cc.TECHNOLOGIES[technology].label} in ${countryName}. Changing the country will `
          + `not move this figure until a national capacity factor is loaded — changing the `
          + `TECHNOLOGY will, because each has its own global average.`
        : `The capacity factor is specific to ${countryName}, so changing the country moves this figure.`,
    };
    assumptions.push(`Annual generation was estimated from a ${(tech.default_cf * 100).toFixed(1)}% `
      + `capacity factor${tech.isGlobalDefault ? ' (global weighted average, not national)' : ''}, `
      + `not supplied. ${tech.publisher || tech.source} (${tech.year}).`);
    if (yieldBasis === 'P90') {
      assumptions.push(`P90 derived from P50 using a ${ratio} ratio. ${CONFIG.yield_basis.ratio_basis}`);
    }
  }

  /* ── The two factors, resolved apart ─────────────────────────────────── */
  const consumption  = cc.consumptionFactor(country);
  const displacement = cc.displacementFactor(country);

  if (consumption.absent) {
    const err = new Error(`Scope 2 cannot be computed for ${countryName}: ${consumption.reason}`);
    err.statusCode = 501; err.code = 'CONSUMPTION_FACTOR_NOT_HELD';
    throw err;
  }

  const factorScope = (consumption.isGlobalDefault || displacement.isGlobalDefault) ? 'global' : 'national';

  for (const f of [consumption, displacement]) {
    if (f.absent) continue;
    if (f.isGlobalDefault) assumptions.push(f.globalDefaultNote);
    const stale = cc.staleness(f, reportingYear);
    if (stale.stale) assumptions.push(`${f.key === 'combined_margin' ? 'Displacement' : 'Consumption'} factor: ${stale.note}`);
    if (f.caveat) assumptions.push(`${f.key === 'combined_margin' ? 'Displacement' : 'Consumption'} factor: ${f.caveat}`);
  }

  /* ── Auxiliary draw ──────────────────────────────────────────────────── */
  const metered = Number.isFinite(auxiliaryConsumption_MWh) && auxiliaryConsumption_MWh >= 0;
  const auxRate = 0.005;
  const auxMWh = metered ? auxiliaryConsumption_MWh : generation * auxRate;
  if (!metered) {
    assumptions.push(`Auxiliary consumption assumed at ${(auxRate * 100).toFixed(1)}% of gross `
      + `generation (${Math.round(auxMWh).toLocaleString('en-GB')} MWh). Replace with metered `
      + 'auxiliary consumption where it exists.');
  }

  /* ── The figures ─────────────────────────────────────────────────────── */
  const scope1 = traced({
    value: 0, unit: 'tCO2e',
    equation: 'project scope 1 = 0 — no combustion in the generation process',
    inputs: { technology: cc.TECHNOLOGIES[technology].label },
    basis: 'Derived from the technology: this generation involves no fuel combustion',
    reference: 'PCAF Part A Third Edition §5.3, Emission scopes covered',
    assumptions: ['Standby generation, refrigerant and switchgear SF6 fugitives are excluded. '
      + 'Where the plant holds a diesel standby set or SF6-insulated switchgear, those are scope 1.'],
  });

  const scope2 = traced({
    value: +(auxMWh * consumption.value).toFixed(2), unit: 'tCO2e',
    equation: 'project scope 2 = auxiliary consumption × grid average emission factor',
    inputs: { auxiliaryConsumption_MWh: +auxMWh.toFixed(2),
      gridAverage_tCO2e_per_MWh: consumption.value, basis: consumption.use },
    basis: metered ? 'Measured from metered auxiliary consumption and a published grid average'
      : 'Calculated from generation and a published grid average, with auxiliary draw assumed',
    reference: `${consumption.publisher} — ${consumption.source} (${consumption.vintage || consumption.year})`,
  });

  const avoided = displacement.absent ? displacement : traced({
    value: +(generation * displacement.value).toFixed(2), unit: 'tCO2e',
    equation: 'avoided emissions = annual generation × combined margin emission factor',
    inputs: { annualGeneration_MWh: generation,
      combinedMargin_tCO2e_per_MWh: displacement.value, basis: displacement.use },
    basis: 'Calculated against the displaced grid supply named in the factor store',
    reference: `${displacement.publisher} — ${displacement.source} (${displacement.year})`,
  });

  const lifetime = displacement.absent ? null : _lifetime({
    annualGeneration_MWh: generation, factorValue: displacement.value,
    country, years: lifetimeYears, degradationPct: degradationRatePct,
  });
  if (lifetime) assumptions.push(lifetime.trajectoryNote, lifetime.degradationNote);

  return {
    mode,
    technology: cc.TECHNOLOGIES[technology].label,
    technologyId: technology,
    country: countryName,
    countryCode: String(country).toUpperCase(),

    generation: {
      value: generation, unit: 'MWh',
      source: generationSource,
      driver: mode === 'metered' ? 'generation' : 'capacity',
      derived: generationSource === 'derived',
      equation: generationEquation,
      yieldBasis: mode === 'projected' ? yieldBasis : null,
      derivation,
      overrideNote: generationSource === 'supplied'
        ? 'This figure was entered rather than derived, so it does not move when the country or '
          + 'technology changes. Clear it to return to the derived estimate.'
        : null,
    },
    installedCapacity_MW: Number.isFinite(installedCapacity_MW) ? installedCapacity_MW : null,

    scope1, scope2, avoided, lifetime,
    plausibility: capacityFactorCheck({
      annualGeneration_MWh: generation, installedCapacity_MW, country, technology }),

    dataQuality: _resolveOption({ generationSource, factorScope }),

    factors: {
      consumption: { ...consumption },
      displacement: { ...displacement },
      auxiliaryConsumption_MWh: +auxMWh.toFixed(2),
      auxiliaryMetered: metered,
    },

    counterfactual: displacement.absent ? null
      : `Grid electricity that would otherwise have been supplied to the ${displacement.country} `
        + 'system, valued on the CDM combined margin basis.',
    counterfactualSource: displacement.absent ? null
      : `${displacement.publisher} — ${displacement.source} (${displacement.year})`,

    assumptions: assumptions.filter(Boolean),
  };
}

module.exports = { deriveFromGeneration, capacityFactorCheck, HOURS_PER_YEAR, DQ_LADDER };
