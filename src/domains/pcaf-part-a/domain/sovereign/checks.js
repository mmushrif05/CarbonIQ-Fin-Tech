// @ts-check
/**
 * What a sovereign figure says about itself.
 *
 * §5.9 gives the method — exposure ÷ PPP-adjusted GDP, scope 1 both ways, a
 * data-quality table — and says almost nothing about whether the inputs are
 * telling the truth. That is the gap this module fills, the same third verdict
 * §5.2 established: nothing here refuses and nothing changes a figure; each
 * check produces a finding that travels with the disclosure and carries what
 * would clear it.
 *
 * Each check follows the GCF rule: where an independent path to the figure
 * exists, recompute and report the divergence; where none does, say so with the
 * reason rather than passing silently. A check that passes because it had
 * nothing to check is worse than no check — so a sovereign with no second
 * source raises an advisory saying the cross-check could not run, not silence.
 *
 * Four thresholds are CarbonIQ's judgement rather than PCAF's, and each names
 * itself as ours on the finding it raises and is settable per request. PCAF
 * accepts a data-year lag (Chapter 4, p.31) and sets no limit; it names EDGAR's
 * four-year lag (Table 10.3-4) without calling it a fault; and it sets no
 * plausibility band on a sovereign's emission intensity at all — the band is
 * the guardrail against the very distortion PPP-GDP exists to remove, a
 * denominator entered in the wrong units reading as a 1,369× swing (Annex 10.3).
 */

'use strict';

const { finding } = require('../corporate/findings');

const REF_SCOPE = 'PCAF Part A Third Edition §5.9, Table 5.9-1 (p.141)';
const REF_DQ = 'PCAF Part A Third Edition §5.9, Table 5.9-6 (p.147)';
const REF_LAG = 'PCAF Part A Third Edition Chapter 4 (p.31); §5.9 data sources, Table 10.3-4 (pp.205–206)';
const REF_PPP = 'PCAF Part A Third Edition §5.9, Annex 10.3 (pp.201–204)';

/** CarbonIQ's own defaults, stated on every finding that uses them. */
const DEFAULTS = Object.freeze({
  /* An emissions figure this many years behind the reporting year is worth a
     reader knowing about. PCAF permits the lag and sets no limit; EDGAR's own
     series runs four years behind. */
  emissionsLagYears: 2,
  /* Numerator and denominator this many years apart mix a country's emissions
     with a different year's economic output. */
  gdpYearGapYears: 3,
  /* A plausible band for a sovereign's production intensity, tCO2e per million
     international USD. Outside it, the PPP-GDP or the emissions are almost
     certainly in the wrong units — the failure PPP-GDP exists to prevent. PCAF
     sets no such band. */
  intensityLow: 10,
  intensityHigh: 2000,
  /* A second source diverging from the held figure by more than this is worth
     reporting rather than averaging away. */
  sourceDivergencePct: 25,
});

const pct = (a, b) => (b === 0 ? null : ((a - b) / b) * 100);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * The proxy-country finding — the figure rests on another country's inventory.
 * Fires from the resolved data-quality option, not from a guess.
 */
function proxyCountry(dq) {
  if (!dq || dq.option !== '3b') return null;
  return finding({
    code: 'SOVEREIGN_PROXY_COUNTRY',
    severity: 'material',
    field: 'sovereign.emissions',
    statement: 'This country’s emissions are estimated from a proxy country (Option 3b), not from '
      + 'its own inventory.',
    effect: 'The figure is the lowest quality on the §5.9 scale (score 5) and describes a different '
      + 'country’s emissions scaled to this one; a reader of the figure must be told.',
    remedy: 'Source the country’s own production emissions from its UNFCCC submission (di.unfccc.int) '
      + 'or Climate Watch and record them, which moves the figure to Option 1a/1b.',
    reference: REF_DQ,
    observed: { option: dq.option, score: dq.score },
  });
}

/**
 * The emissions-lag finding — the country figure is well behind the reporting
 * year. PCAF permits the lag; the threshold is CarbonIQ's and settable.
 */
function emissionsLag({ emissionsYear, reportingYear, thresholdYears }) {
  const limit = num(thresholdYears, DEFAULTS.emissionsLagYears);
  if (!Number.isFinite(Number(emissionsYear)) || !Number.isFinite(Number(reportingYear))) return null;
  const lag = Number(reportingYear) - Number(emissionsYear);
  if (lag < limit) return null;
  return finding({
    code: 'SOVEREIGN_EMISSIONS_LAG',
    severity: 'material',
    field: 'sovereign.emissionsYear',
    statement: `The country emissions are for ${emissionsYear}, ${lag} year(s) behind the ${reportingYear} `
      + 'reporting year.',
    effect: 'The financed-emissions figure describes the country as it was, not as it is; a fast-moving '
      + 'grid or economy will have changed since.',
    remedy: `Source a more recent inventory year, or state the lag beside the figure. Threshold ${limit} `
      + 'year(s) is CarbonIQ’s, not PCAF’s (PCAF permits a lag and sets none), and is settable.',
    reference: REF_LAG,
    observed: { emissionsYear, reportingYear, lagYears: lag, thresholdYears: limit },
  });
}

/**
 * The LULUCF-coverage finding — §5.9 asks for scope 1 both including and
 * excluding LULUCF, and only one boundary is held.
 */
function lulucfCoverage({ exclHeld, inclHeld }) {
  if (exclHeld && inclHeld) return null;
  const missing = exclHeld ? 'including LULUCF' : 'excluding LULUCF';
  return finding({
    code: 'SOVEREIGN_LULUCF_ONE_SIDED',
    severity: 'material',
    field: 'sovereign.scope1',
    statement: `Scope 1 is held ${exclHeld ? 'excluding' : 'including'} LULUCF only; the ${missing} `
      + 'figure is not held.',
    effect: '§5.9 asks a sovereign’s scope 1 to be reported on both boundaries, because LULUCF can move '
      + 'the total materially and can distort the trend of the energy and industrial sectors. Only one '
      + 'boundary is reportable here.',
    remedy: `Source the ${missing} figure from di.unfccc.int (the UNFCCC GHG profile carries both) and `
      + 'record it beside the one held.',
    reference: REF_SCOPE,
    observed: { exclHeld: Boolean(exclHeld), inclHeld: Boolean(inclHeld) },
  });
}

/**
 * The intensity-plausibility guardrail — the check that catches a denominator
 * in the wrong units, the 1,369× distortion PPP-GDP is meant to remove. The
 * band is CarbonIQ's and settable.
 */
function intensityPlausibility({ intensity, low, high }) {
  if (!Number.isFinite(Number(intensity))) return null;
  const lo = num(low, DEFAULTS.intensityLow);
  const hi = num(high, DEFAULTS.intensityHigh);
  const v = Number(intensity);
  if (v >= lo && v <= hi) return null;
  return finding({
    code: 'SOVEREIGN_INTENSITY_IMPLAUSIBLE',
    severity: 'material',
    field: 'sovereign.pppGdp',
    statement: `The production intensity comes to ${v} tCO2e per million international USD, outside the `
      + `plausible band ${lo}–${hi}.`,
    effect: 'A figure this far outside the band almost always means the PPP-adjusted GDP or the emissions '
      + 'are in the wrong units — millions vs billions, or a debt figure used as the denominator — which '
      + 'is exactly the distortion the PPP-GDP denominator exists to avoid.',
    remedy: `Check the PPP-adjusted GDP is in millions of international USD and the emissions in tCO2e. `
      + `The band ${lo}–${hi} is CarbonIQ’s, not PCAF’s (PCAF sets no such band), and is settable.`,
    reference: REF_PPP,
    observed: { intensity: v, low: lo, high: hi },
  });
}

/**
 * The numerator/denominator vintage-gap finding — the emissions year and the
 * PPP-GDP year are far apart, so the attribution mixes two economic years.
 */
function vintageGap({ emissionsYear, gdpYear, thresholdYears }) {
  const limit = num(thresholdYears, DEFAULTS.gdpYearGapYears);
  if (!Number.isFinite(Number(emissionsYear)) || !Number.isFinite(Number(gdpYear))) return null;
  const gap = Math.abs(Number(emissionsYear) - Number(gdpYear));
  if (gap < limit) return null;
  return finding({
    code: 'SOVEREIGN_EMISSIONS_GDP_YEAR_GAP',
    severity: 'advisory',
    field: 'sovereign.pppGdp.year',
    statement: `The emissions are for ${emissionsYear} and the PPP-adjusted GDP for ${gdpYear}, ${gap} `
      + 'year(s) apart.',
    effect: 'The attribution factor divides one year’s exposure share by another year’s economic output; '
      + 'the effect is small where GDP moved little, but it is not a like-for-like ratio.',
    remedy: `Use emissions and PPP-GDP from the same year where both are published. Threshold ${limit} `
      + 'year(s) is CarbonIQ’s and is settable.',
    reference: REF_LAG,
    observed: { emissionsYear, gdpYear, gapYears: gap, thresholdYears: limit },
  });
}

/**
 * The independent-path check. Where a second source figure is supplied,
 * recompute the divergence and report it; where none is, say the cross-check
 * could not run rather than passing silently.
 */
function independentSource({ heldExclLULUCF, crossCheck, thresholdPct }) {
  if (!crossCheck || !Number.isFinite(Number(crossCheck.scope1ExclLULUCF))) {
    return finding({
      code: 'SOVEREIGN_NO_INDEPENDENT_SOURCE',
      severity: 'advisory',
      field: 'crossCheck',
      statement: 'Only one source for this country’s emissions is held, so the figure could not be '
        + 'cross-checked against an independent one.',
      effect: 'A single-source figure is used as given; a keying error or a source-specific boundary '
        + 'difference would not show.',
      remedy: 'Supply a second source under crossCheck (UNFCCC, Climate Watch or EDGAR give independent '
        + 'estimates) and the divergence will be reported.',
      reference: REF_LAG,
    });
  }
  const limit = num(thresholdPct, DEFAULTS.sourceDivergencePct);
  const move = pct(Number(crossCheck.scope1ExclLULUCF), Number(heldExclLULUCF));
  if (move === null || Math.abs(move) < limit) return null;
  return finding({
    code: 'SOVEREIGN_SOURCE_DIVERGENCE',
    severity: 'material',
    field: 'sovereign.scope1',
    statement: `The held scope 1 (excl LULUCF) and the cross-check source (${crossCheck.source || 'unnamed'}) `
      + `differ by ${move.toFixed(1)}%.`,
    effect: 'Two independent estimates of the same country’s emissions disagree by more than the threshold; '
      + 'the figure used should be the one whose boundary and vintage match the disclosure, not an average.',
    remedy: `Reconcile the two sources — usually a LULUCF-boundary or vintage difference — and record which `
      + `is used and why. Threshold ${limit}% is CarbonIQ’s and is settable.`,
    reference: REF_LAG,
    observed: { held: Number(heldExclLULUCF), crossCheck: Number(crossCheck.scope1ExclLULUCF), divergencePct: +move.toFixed(1), thresholdPct: limit },
  });
}

module.exports = {
  DEFAULTS, proxyCountry, emissionsLag, lulucfCoverage,
  intensityPlausibility, vintageGap, independentSource,
};
