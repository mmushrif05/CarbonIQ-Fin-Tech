/**
 * Country-dependent numbers, in one place, keyed by ISO 3166-1 alpha-2.
 *
 * Two rules are enforced structurally rather than by convention.
 *
 * FIRST: the combined margin and the grid average are never interchangeable.
 * A combined margin is what a new grid-connected renewable displaces; a grid
 * average is what the plant itself draws off the system. The previous version
 * had one resolver taking a "purpose" argument, which meant one wrong string
 * silently swapped the two — and on Sri Lanka's numbers that is a 62% error
 * that looks entirely correct on the page. There is therefore no parameterised
 * getter here. `displacementFactor` reads `combined_margin` and nothing else;
 * `consumptionFactor` reads `grid_average` and nothing else. Neither can be
 * passed the other's key because neither takes a key.
 *
 * SECOND: nothing is ever borrowed. Where a country has no value for what a
 * purpose needs, the answer is absent with the reason — not the other basis,
 * and never another country's number. A wrong-country default is worse than no
 * check, because it produces a figure a reviewer has no reason to question.
 */

'use strict';

const { absent } = require('./provenance');

const CONFIG = require('../../data/pcaf-parta/country-config.json');

const TECHNOLOGIES = {
  solar_pv:  { id: 'solar_pv',  label: 'Solar PV' },
  wind_on:   { id: 'wind_on',   label: 'Onshore wind' },
  hydro_ror: { id: 'hydro_ror', label: 'Hydro — run of river' },
};

const countries = () => Object.entries(CONFIG.countries)
  .map(([code, c]) => ({ code, name: c.name }));

function forCountry(code) {
  const c = CONFIG.countries[String(code || '').toUpperCase()];
  if (!c) {
    const err = new Error(
      `No configuration is held for country "${code}". `
      + `Held: ${Object.keys(CONFIG.countries).join(', ')}.`);
    err.statusCode = 501;
    err.code = 'COUNTRY_NOT_CONFIGURED';
    err.remedy = 'Add the country to data/pcaf-parta/country-config.json with a year, '
      + 'source and url for every value. Values without a citation are not accepted.';
    throw err;
  }
  return c;
}

/**
 * Is this figure old enough that a reader should be told?
 *
 * Generic and driven by the config's own `year`, so the notice that used to be
 * written specifically for Sri Lanka's 2017 factor now fires for any country
 * whose data has aged past the threshold.
 */
function staleness(factor, reportingYear) {
  if (!factor || !Number.isFinite(factor.year)) return { stale: false };
  const year = Number.isFinite(reportingYear) ? reportingYear : new Date().getFullYear();
  const age = year - factor.year;
  if (age <= CONFIG.stale_after_years) return { stale: false, ageYears: age };
  return {
    stale: true,
    ageYears: age,
    note: `This factor is from ${factor.year} and the reporting year is ${year} — `
      + `${age} years old, past the ${CONFIG.stale_after_years}-year threshold this store applies. `
      + 'A grid changes materially over that period. Refresh it with the publisher before the '
      + 'figure supports a disclosure.',
  };
}

/* ── The two factors. Separate functions, separate keys, no shared path. ── */

/**
 * Attach the global-default marking that every downstream consumer keys on.
 *
 * A figure resting on a global default is not wrong, but it is a weaker claim,
 * and PCAF says so in Table 5.3-1: Option 2a requires "emission factors
 * specific to that data". A global average is specific to the world, not to
 * this grid, so a run using one cannot be 2a. The flag is what carries that
 * consequence out of this module.
 */
const _global = (f, key, why) => ({
  ...f, key, isGlobalDefault: true, country: 'Global',
  globalDefaultNote: why,
  use: CONFIG.grid_factor_uses[key] || null,
});

/** Avoided emissions ONLY. Reads `combined_margin`. Never the grid average. */
function displacementFactor(code) {
  const c = forCountry(code);
  const f = c.grid_factors.combined_margin;
  if (f) {
    return { ...f, key: 'combined_margin', isGlobalDefault: false,
      use: CONFIG.grid_factor_uses.combined_margin, country: c.name };
  }

  /* Geography fallback would be legitimate; there is nowhere to fall back TO.
     No global combined margin is published, and the global grid average is a
     different basis — substituting it is the one move this store forbids at
     every geography. So the figure is absent, and says why. */
  const g = CONFIG.global_defaults.grid_factors.combined_margin;
  if (g) return _global(g, 'combined_margin', CONFIG.global_defaults.note);

  return absent(
    `Combined margin for ${c.name}`,
    `${c.grid_factors.combined_margin_absent_reason || `No combined margin is held for ${c.name}.`} `
    + CONFIG.global_defaults.grid_factors.combined_margin_absent_reason,
    'CDM Tool 07 — Tool to calculate the emission factor for an electricity system');
}

/** The plant's own scope 2 ONLY. Reads `grid_average`. Never the combined margin. */
function consumptionFactor(code) {
  const c = forCountry(code);
  const f = c.grid_factors.grid_average;
  if (f) {
    return { ...f, key: 'grid_average', isGlobalDefault: false,
      use: CONFIG.grid_factor_uses.grid_average, country: c.name };
  }

  /* Same basis, wider geography. Permitted, penalised, and never silent. */
  const g = CONFIG.global_defaults.grid_factors.grid_average;
  if (g) {
    return _global(g, 'grid_average',
      `No grid average is held for ${c.name}, so the global average has been used. `
      + `${c.grid_factors.grid_average_absent_reason || ''} It is the same basis at a wider `
      + 'geography, which is permitted — but it is not specific to this grid, so the data '
      + 'quality option drops.');
  }

  return absent(`Grid average for ${c.name}`,
    c.grid_factors.grid_average_absent_reason || `No grid average is held for ${c.name}.`,
    'PCAF Part A Third Edition §5.3, Emission scopes covered');
}

/**
 * The capacity-factor band for a technology in a country.
 *
 * A 17% band applied to a wind or hydro project is nonsense, so the band is a
 * property of (country, technology) and there is no default for either.
 */
function technology(code, techId) {
  const c = forCountry(code);
  if (!TECHNOLOGIES[techId]) {
    const err = new Error(
      `Unknown technology "${techId}". Known: ${Object.keys(TECHNOLOGIES).join(', ')}.`);
    err.statusCode = 400; err.code = 'UNKNOWN_TECHNOLOGY';
    throw err;
  }
  const t = c.technologies[techId];
  if (t) {
    return { ...t, technology: TECHNOLOGIES[techId].label, country: c.name,
      isGlobalDefault: false, hasBand: Number.isFinite(t.band_low) && Number.isFinite(t.band_high) };
  }

  /* A global weighted average, not a national band. It gives the check a
     reference point without pretending to a spatial range it does not have,
     so a plant is compared as a RATIO to the global figure rather than judged
     in or out of a band nobody published. */
  const g = CONFIG.global_defaults.technologies[techId];
  if (g) {
    return { ...g, technology: TECHNOLOGIES[techId].label, country: 'Global',
      isGlobalDefault: true, hasBand: false,
      globalDefaultNote:
        `No capacity-factor data is held for ${TECHNOLOGIES[techId].label} in ${c.name}, so the `
        + 'global weighted average is used as a reference. It is not a national band, so the '
        + 'plant is compared against it as a ratio rather than passed or failed against a range.' };
  }

  return absent(
    `${TECHNOLOGIES[techId].label} capacity factor for ${c.name}`,
    `${c.technologies_absent_reason || ''} `
    + (CONFIG.global_defaults.technologies[`${techId}_absent_reason`] || ''),
    null);
}

/** The absolute engineering bounds for a technology. Not a band — a limit. */
function limits(techId) {
  const l = CONFIG.technology_limits[techId];
  if (!l) {
    const err = new Error(`No physical limits are held for technology "${techId}".`);
    err.statusCode = 501; err.code = 'TECHNOLOGY_LIMITS_NOT_HELD';
    throw err;
  }
  return l;
}

/** Whether the physical check can run at all, and if not, why not. */
function physicalCheckAvailability(code, techId) {
  const t = technology(code, techId);
  if (t.absent) return { available: false, reason: t.reason };
  return {
    available: true,
    isGlobalDefault: t.isGlobalDefault,
    hasBand: t.hasBand,
    band: t.hasBand ? { low: t.band_low, high: t.band_high } : null,
    defaultCf: t.default_cf,
    limits: limits(techId),
  };
}

/** What is and is not held, measured from the config rather than asserted. */
function coverage() {
  return Object.entries(CONFIG.countries).map(([code, c]) => ({
    code,
    name: c.name,
    combined_margin:  c.grid_factors.combined_margin  ? c.grid_factors.combined_margin.value  : null,
    operating_margin: c.grid_factors.operating_margin ? c.grid_factors.operating_margin.value : null,
    build_margin:     c.grid_factors.build_margin     ? c.grid_factors.build_margin.value     : null,
    grid_average:     c.grid_factors.grid_average     ? c.grid_factors.grid_average.value     : null,
    technologies: Object.fromEntries(
      Object.keys(TECHNOLOGIES).map(t => [t, Boolean(c.technologies[t])])),
    canComputeAvoided: !displacementFactor(code).absent,
    canComputeScope2:  !consumptionFactor(code).absent,
    avoidedIsGlobal:   Boolean(displacementFactor(code).isGlobalDefault),
    scope2IsGlobal:    Boolean(consumptionFactor(code).isGlobalDefault),
  }));
}

module.exports = {
  CONFIG, TECHNOLOGIES,
  countries, forCountry, staleness,
  displacementFactor, consumptionFactor,
  technology, limits, physicalCheckAvailability, coverage,
};
