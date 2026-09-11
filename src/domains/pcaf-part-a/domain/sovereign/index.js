// @ts-check
/**
 * PCAF Part A §5.9 — assess one sovereign exposure.
 *
 * The whole class is one division and a handful of rules that a general
 * financed-emissions tool gets wrong:
 *
 *   The denominator is PPP-adjusted GDP, never equity plus debt (p.144).
 *
 *   Scope 1 is domestic territorial (production) emissions and is reported
 *   **both including and excluding LULUCF** (p.141). The two are the same
 *   emissions on two boundaries and are never summed; the headline follows the
 *   standard's own example and leads with excluding-LULUCF, with including
 *   beside it.
 *
 *   Scope 2 (imported grid energy) and scope 3 (non-energy imports) are
 *   *shoulds*: attributed and reported separately where held, and reported
 *   absent — never zero — where not.
 *
 *   The consumption view (production − exported + imported, p.142) is a
 *   recommended additional cut and is never folded into the territorial figure.
 *
 * The engine reads a country from the versioned dataset, or takes the figures
 * on the request. Either way every figure it returns is traced, and the
 * data-quality option is a property of the emissions source, resolved from the
 * §5.9 table alone.
 */

'use strict';

const dataset = require('./dataset');
const { sovereignAttributionFactor, REF } = require('./attribution');
const { resolveOption } = require('./options');
const checks = require('./checks');
const { register } = require('../corporate/findings');
const { traced, absent } = require('../provenance');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition.';

const SCOPE_REF = 'PCAF Part A Third Edition §5.9, Table 5.9-1 (p.141)';

/** Pull a sourced figure's value, or null when it is a stated absence. */
function figureValue(f) {
  return f && !f.absent && Number.isFinite(f.value) ? f.value : null;
}

/**
 * Resolve the country's emissions and PPP-GDP: from the dataset by code, or
 * from figures supplied on the request.
 *
 * @param {any} input
 */
function resolveCountry(input) {
  const { country, sovereign } = input;
  if (country && sovereign) {
    const err = /** @type {any} */ (new Error(
      'Supply either a country code (resolved from the dataset) or explicit sovereign '
      + 'figures, not both.'));
    err.statusCode = 400; err.code = 'SOVEREIGN_INPUT_AMBIGUOUS';
    throw err;
  }

  if (country) {
    const rec = dataset.countryFor(country);
    if (!rec) {
      const err = /** @type {any} */ (new Error(
        `No sovereign record is held for "${country}". Held: ${dataset.codes().join(', ')}.`));
      err.statusCode = 404; err.code = 'SOVEREIGN_NOT_HELD';
      err.remedy = 'Supply the figures on the request under `sovereign`, or add the country '
        + 'to data/pcaf-parta/sovereign/dataset.json and release it.';
      throw err;
    }
    const excl = rec.scope1.exclLULUCF;
    if (excl.absent) {
      const err = /** @type {any} */ (new Error(
        `The held record for ${rec.name} has no scope 1 excluding LULUCF: ${excl.reason}`));
      err.statusCode = 422; err.code = 'SOVEREIGN_SCOPE1_ABSENT';
      throw err;
    }
    return {
      code: rec.code, name: rec.name, iso3: rec.iso3, provisional: Boolean(rec.provisional),
      exclLULUCF: excl,
      inclLULUCF: rec.scope1.inclLULUCF,
      scope2: rec.scope2 || null,
      scope3: rec.scope3 || null,
      pppGdp: rec.pppGdp,
      basis: excl.basis || null,
      release: dataset.release(),
    };
  }

  if (sovereign) {
    if (!Number.isFinite(sovereign.scope1ExclLULUCF)) {
      const err = /** @type {any} */ (new Error(
        'sovereign.scope1ExclLULUCF is required (domestic territorial emissions excluding LULUCF).'));
      err.statusCode = 400; err.code = 'SOVEREIGN_SCOPE1_REQUIRED';
      throw err;
    }
    const src = sovereign.source || 'Supplied on the request';
    const yr = sovereign.emissionsYear || null;
    const mk = (value) => ({ value, unit: 'tCO2e', year: yr, source: src, basis: sovereign.basis || null });
    return {
      code: null, name: sovereign.name || 'Sovereign', iso3: sovereign.iso3 || null, provisional: false,
      exclLULUCF: mk(sovereign.scope1ExclLULUCF),
      inclLULUCF: Number.isFinite(sovereign.scope1InclLULUCF)
        ? mk(sovereign.scope1InclLULUCF)
        : { absent: true, reason: 'No scope 1 including LULUCF was supplied on the request.' },
      scope2: Number.isFinite(sovereign.scope2_tCO2e) ? { value: sovereign.scope2_tCO2e, unit: 'tCO2e', year: yr, source: src } : null,
      scope3: Number.isFinite(sovereign.scope3_tCO2e) ? { value: sovereign.scope3_tCO2e, unit: 'tCO2e', year: yr, source: src } : null,
      pppGdp: { value: sovereign.pppGdp, unit: 'million international USD (PPP, current)', year: sovereign.pppGdpYear || null, source: src },
      basis: sovereign.basis || null,
      release: null,
    };
  }

  const err = /** @type {any} */ (new Error('Supply a country code or explicit sovereign figures.'));
  err.statusCode = 400; err.code = 'SOVEREIGN_INPUT_REQUIRED';
  throw err;
}

/**
 * @param {any} input
 */
function assessSovereign(input) {
  const {
    reportingYear, instrument = 'sovereign-bond', exposure = {},
    dataQualityOption, dataQualityOverrideJustification,
    thresholds = {}, crossCheck = null,
  } = input;

  const currency = (exposure.currency || 'USD').toUpperCase();
  if (currency !== 'USD') {
    const err = /** @type {any} */ (new Error(
      `The §5.9 denominator is PPP-adjusted GDP in international USD, so the exposure must be `
      + `in USD; this one is in ${currency}.`));
    err.statusCode = 400; err.code = 'SOVEREIGN_CURRENCY_NOT_USD';
    err.remedy = 'Record the exposure in USD at the valuation-date rate with the rate stated, '
      + 'or convert before assessing.';
    throw err;
  }

  const c = resolveCountry(input);

  const af = sovereignAttributionFactor({
    exposureUsd: exposure.amount,
    pppGdpMillionUsd: c.pppGdp.value,
    pppGdpYear: c.pppGdp.year,
  });

  /* Scope 1 on both boundaries. Same emissions, two boundaries, never summed. */
  const attribute = (fig, label, ref) => traced({
    value: +(figureValue(fig) * af.rawValue).toFixed(2),
    unit: 'tCO2e',
    equation: `financed ${label} = country ${label} × attribution factor`,
    inputs: { [`country_${label.replace(/[^a-z0-9]/gi, '_')}_tCO2e`]: figureValue(fig), attributionFactor: af.value },
    basis: 'Measured',
    reference: ref || SCOPE_REF,
    assumptions: fig.source ? [`Country figure: ${fig.source}`] : [],
  });

  const s1Excl = attribute(c.exclLULUCF, 'scope 1 excl LULUCF');
  const s1Incl = c.inclLULUCF && !c.inclLULUCF.absent
    ? attribute(c.inclLULUCF, 'scope 1 incl LULUCF')
    : absent('Financed scope 1 including LULUCF',
        (c.inclLULUCF && c.inclLULUCF.reason)
          || 'No scope 1 including LULUCF is held for this sovereign. §5.9 asks for both bases; '
             + 'the including-LULUCF figure is reported absent rather than assumed equal to the '
             + 'excluding-LULUCF one.',
        SCOPE_REF);

  const s2 = c.scope2
    ? attribute(c.scope2, 'scope 2')
    : absent('Financed scope 2 emissions',
        'Scope 2 (imported grid electricity, heat, steam and cooling) is a §5.9 should and no '
        + 'figure is held. Its absence is the disclosure, not a zero.', SCOPE_REF);

  const s3 = c.scope3
    ? attribute(c.scope3, 'scope 3')
    : absent('Financed scope 3 emissions',
        'Scope 3 (non-energy imports) is a §5.9 should and no figure is held. OECD trade-embodied '
        + 'CO2 is the source PCAF names, CO2 only, with a four-year lag (Table 10.3-4).', SCOPE_REF);

  const dq = resolveOption({
    basis: c.basis,
    requested: dataQualityOption,
    overrideJustification: dataQualityOverrideJustification,
  });

  /* Country-level production intensity — a §5.9 reporting recommendation
     (p.144), unattributed: production emissions ÷ PPP-adjusted GDP. */
  const exclVal = figureValue(c.exclLULUCF);
  const productionIntensity = c.pppGdp.value > 0
    ? traced({
        value: +(exclVal / c.pppGdp.value).toFixed(2),
        unit: 'tCO2e per million international USD (PPP)',
        equation: 'production intensity = country scope 1 (excl LULUCF) ÷ PPP-adjusted GDP',
        inputs: { countryScope1ExclLULUCF_tCO2e: exclVal, pppGdpMillionUsd: c.pppGdp.value },
        basis: 'Measured (country-level, not attributed)',
        reference: 'PCAF Part A Third Edition §5.9, Emissions intensities (p.144)',
      })
    : null;

  /* What the data says about itself — findings that refuse nothing and change
     no figure, the third verdict §5.2 established, applied to a sovereign. */
  const validation = register()
    .add(checks.proxyCountry(dq))
    .add(checks.lulucfCoverage({ exclHeld: exclVal !== null, inclHeld: figureValue(c.inclLULUCF) !== null }))
    .add(checks.emissionsLag({ emissionsYear: c.exclLULUCF.year, reportingYear, thresholdYears: thresholds.emissionsLagYears }))
    .add(checks.vintageGap({ emissionsYear: c.exclLULUCF.year, gdpYear: c.pppGdp.year, thresholdYears: thresholds.gdpYearGapYears }))
    .add(checks.intensityPlausibility({ intensity: productionIntensity ? productionIntensity.value : null, low: thresholds.intensityLow, high: thresholds.intensityHigh }))
    .add(checks.independentSource({ heldExclLULUCF: exclVal, crossCheck, thresholdPct: thresholds.sourceDivergencePct }))
    .result();

  return {
    standard: STANDARD,
    sovereign: {
      country: c.code, name: c.name, iso3: c.iso3,
      reportingYear: reportingYear || null,
      instrument,
      provisional: c.provisional,
      dataset: c.release ? { version: c.release.tables[0].version, checksum: c.release.checksum, status: c.release.tables[0].status } : null,
    },

    attribution: af,

    inventory: {
      /* Both boundaries, side by side, with the rule stated. */
      scope1: {
        exclLULUCF: s1Excl,
        inclLULUCF: s1Incl,
        note: 'Scope 1 is domestic territorial (production) emissions, reported both '
          + 'excluding and including LULUCF (§5.9, p.141). The two are the same emissions on '
          + 'two boundaries and are never summed; the excluding-LULUCF line is the headline, '
          + 'following the standard’s own worked example.',
      },
      scope2: s2,
      scope3: s3,
      scope3Note: 'Scope 3 is reported separately from scope 1 and 2 and is never summed with them.',
      dataQuality: dq,
      productionIntensity,
      category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },

    /* The consumption view is a recommended additional cut, not computed here
       for want of trade-embodied data, and never folded into the territorial
       figure. Recorded so a later step can fill it. */
    consumption: {
      computed: false,
      equation: 'consumption emissions = production − exported + imported (scope 1 + 2 + 3 − exported)',
      reason: 'Export- and import-embodied emissions are not held for this sovereign. PCAF '
        + 'recommends the consumption view as an additional metric (p.142) with stated limitations '
        + '(input-output dependence, ~2-year lag, CO2 only); it is never summed with the '
        + 'territorial figure.',
      reference: 'PCAF Part A Third Edition §5.9 (pp.142–143)',
    },

    /* Removals note: at sovereign level, land-use removals sit inside scope 1
       including LULUCF rather than as a separate line, so there is no removals
       container to net against anything. */
    removalsNote: 'Land-use removals are carried within scope 1 including LULUCF, not as a '
      + 'separate line; nothing is netted against the territorial inventory.',

    /* The half a bank cannot get from the standard: what the country data says
       about itself. Nothing here refused and nothing changed a figure. */
    validation,
    thresholds: { ...checks.DEFAULTS, ...thresholds },
  };
}

module.exports = { assessSovereign, resolveCountry, STANDARD, REF };
