// @ts-check
/**
 * What the data says about itself.
 *
 * Every figure that reaches this engine has already been checked for the
 * things that would make it wrong — those are refusals. What is left is the
 * harder question a bank actually has at onboarding: *is this book's data
 * telling me the truth?* PCAF sets the method and says almost nothing about
 * that, because it is a standard and not a tool. It is the gap this class is
 * built to fill.
 *
 * Each check follows the rule the GCF engine already uses: where an
 * independent path to the same figure exists, recompute and report the
 * divergence; where none exists, say so with the reason rather than passing
 * silently. A check that passes because it had nothing to check is worse than
 * no check.
 *
 * Nothing here refuses, and nothing here changes a figure. A check produces a
 * finding, the finding carries what would clear it, and the same list sorted
 * by what each fix would move is the improvement plan.
 *
 * Three thresholds are CarbonIQ's judgement rather than PCAF's, and each says
 * so on the finding it raises. Footnote 71 asks an institution to be
 * transparent about "any major last minute increases or decreases at fiscal
 * year-end" and defines neither *major* nor a method; leaving it undefined
 * means nobody checks it, which is how a revolving book reports a year of
 * emissions from one week's balance. The factor-vintage threshold was declared
 * here for a release before anything read it — a threshold with no check
 * behind it is the same as none — and `factorVintage` is the check.
 *
 * The sector band the intensity check reads is not this module's: it is a
 * baseline, resolved by the application layer and handed in with its
 * provenance, so the finding can cite the version it was checked against.
 */

'use strict';

const { finding } = require('../corporate/findings');

const REF_71 = 'PCAF Part A Third Edition §5.2, footnote 71 (p.55)';
const REF_LAG = 'PCAF Part A Third Edition Chapter 4, p.31 (a lag between financial and emissions data years)';

/** CarbonIQ's own defaults, stated on every finding that uses them. */
const DEFAULTS = Object.freeze({
  /* A year-end balance this far from the year's average is "major" for the
     purposes of footnote 71. PCAF sets no figure. */
  fluctuationPct: 25,
  /* An emissions figure this many years behind the reporting year is worth a
     reader knowing about. PCAF permits the lag and sets no limit. */
  emissionsLagYears: 2,
  /* An economic emission factor older than this, applied without a deflator,
     understates the estimate by the inflation between the two years. */
  factorVintageYears: 3,
});

const pct = (a, b) => (b === 0 ? null : ((a - b) / b) * 100);

/**
 * Footnote 71 — the revolving-facility check.
 *
 * Only the year-end balance counts, which is the rule. The finding is not that
 * the rule was applied; it is that applying it to *this* facility produced a
 * figure a long way from what the bank was actually lending all year, which is
 * the thing footnote 71 asks the institution to be transparent about.
 */
function yearEndFluctuation({ outstanding, averageOutstanding, peakOutstanding, instrument, thresholdPct }) {
  const limit = Number.isFinite(Number(thresholdPct)) ? Number(thresholdPct) : DEFAULTS.fluctuationPct;
  const revolving = ['revolving-credit', 'overdraft', 'line-of-credit', 'bridge-loan', 'letter-of-credit', 'cre-secured-line'].includes(instrument);

  if (!Number.isFinite(Number(averageOutstanding))) {
    /* Unverifiable, with the reason — not a silent pass. */
    return revolving
      ? finding({
        code: 'FN71_AVERAGE_NOT_HELD',
        severity: 'advisory',
        field: 'outstanding.averageOutstanding',
        statement: `This is a ${instrument.replace(/-/g, ' ')}, whose balance moves through the year, and only `
          + 'the year-end balance is held.',
        effect: 'The year-end balance is the figure the standard requires and it is the figure used. Whether '
          + 'it represents the year cannot be established from what is held, so the footnote 71 check did not run.',
        remedy: 'Supply the average balance over the reporting year — a monthly or daily average from the '
          + 'facility account — and the check will run. It changes no figure; it establishes whether the '
          + 'year-end figure needs a note beside it.',
        reference: REF_71,
      })
      : null;
  }

  const avg = Number(averageOutstanding);
  const move = pct(Number(outstanding), avg);
  if (move === null || Math.abs(move) < limit) return null;

  const direction = move > 0 ? 'above' : 'below';
  return finding({
    code: 'FN71_YEAR_END_FLUCTUATION',
    severity: 'material',
    field: 'outstanding.amount',
    statement: `The year-end balance is ${Math.abs(move).toFixed(1)}% ${direction} the average balance over the `
      + `reporting year (${outstanding} against ${avg}).`,
    effect: `Financed emissions from this exposure are ${move > 0 ? 'higher' : 'lower'} than a year lived at the `
      + 'average would give. The year-end figure is the one the standard requires and the one reported; this '
      + 'says how far it sits from the exposure the institution actually carried.',
    remedy: 'Report the figure and state the movement. Footnote 71 asks institutions to be transparent about '
      + 'major last-minute increases or decreases at fiscal year-end; this is that disclosure, and it belongs '
      + 'beside the figure rather than in a note nobody reads. PCAF defines neither "major" nor a method — '
      + `the ${limit}% threshold is CarbonIQ's and is settable.`,
    reference: REF_71,
    observed: { yearEnd: Number(outstanding), average: avg, peak: peakOutstanding === undefined ? null : Number(peakOutstanding), movementPct: +move.toFixed(2), thresholdPct: limit },
  });
}

/** How far behind the reporting year the borrower's emissions figure sits. */
function emissionsLag({ reportingYear, period, scope, thresholdYears }) {
  const limit = Number.isFinite(Number(thresholdYears)) ? Number(thresholdYears) : DEFAULTS.emissionsLagYears;
  const year = Number(String(period || '').slice(0, 4));
  if (!reportingYear || !Number.isFinite(year)) return null;
  const lag = Number(reportingYear) - year;
  if (lag < limit) return null;
  return finding({
    code: 'EMISSIONS_DATA_LAG',
    severity: 'material',
    field: `emissions.scope${scope}.period`,
    statement: `The scope ${scope} figure is for ${year} and is reported against ${reportingYear} — a lag of `
      + `${lag} years.`,
    effect: 'The standard permits the lag and the figure stands. A borrower that has grown, shrunk or changed '
      + 'fuel in the interval is reported as it was, not as it is.',
    remedy: 'Request the borrower\'s most recent figure, or state the lag in the disclosure. PCAF sets no '
      + `limit; the ${limit}-year threshold is CarbonIQ's and is settable.`,
    reference: REF_LAG,
    observed: { emissionsYear: year, reportingYear: Number(reportingYear), lagYears: lag, thresholdYears: limit },
  });
}

/**
 * The denominator against the balance sheet it came from.
 *
 * Total equity plus total debt cannot exceed total assets: assets equal equity
 * plus liabilities, and debt is a subset of liabilities. A denominator that
 * does exceed them is a sign the two figures came from different statements or
 * different dates — which does not make the arithmetic wrong, but does make
 * the attribution factor smaller than it should be, in the institution's
 * favour.
 */
function denominatorCoherence({ denominator, totalAssets }) {
  if (!Number.isFinite(Number(totalAssets)) || !denominator || !Number.isFinite(denominator.value)) return null;
  const assets = Number(totalAssets);
  if (assets <= 0 || denominator.value <= assets * 1.005) return null;
  return finding({
    code: 'DENOMINATOR_EXCEEDS_ASSETS',
    severity: 'material',
    field: 'denominator',
    statement: `Total equity plus debt (${denominator.value}) exceeds the total assets declared for the same `
      + `borrower (${assets}).`,
    effect: 'Assets equal equity plus liabilities and debt is a subset of liabilities, so this cannot hold on '
      + 'one balance sheet at one date. The attribution factor is smaller than it should be, which understates '
      + 'the institution\'s financed emissions.',
    remedy: 'Check that the equity, debt and asset figures are from the same statement at the same date. '
      + 'Where only one pair is reliable, footnote 77 permits the total balance sheet as the denominator.',
    reference: 'PCAF Part A Third Edition §5.2, p.57 and footnote 77',
    observed: { denominator: denominator.value, totalAssets: assets },
  });
}

/**
 * The borrower's intensity against a sector band, where one is supplied.
 *
 * This is the check that catches a unit error — kilograms entered as tonnes,
 * a plant's figure entered for a group — and it is the one that cannot run
 * without a band, so when no band is supplied it says so rather than passing.
 */
function intensityPlausibility({ scope1And2_tCO2e, revenue, currency, sectorBand, sector }) {
  if (!Number.isFinite(Number(scope1And2_tCO2e)) || !Number.isFinite(Number(revenue)) || Number(revenue) <= 0) return null;
  const intensity = Number(scope1And2_tCO2e) / (Number(revenue) / 1e6);

  if (!sectorBand || !Number.isFinite(Number(sectorBand.low)) || !Number.isFinite(Number(sectorBand.high))) {
    return finding({
      code: 'INTENSITY_BAND_NOT_HELD',
      severity: 'advisory',
      field: 'plausibility.sectorBand',
      statement: `The borrower's scope 1 and 2 intensity is ${intensity.toFixed(1)} tCO2e per million `
        + `${currency || 'of currency'} of revenue${sector ? ` (${sector})` : ''}, and no sector band is held to `
        + 'compare it against.',
      effect: 'The figure is used as given. A unit error — kilograms entered as tonnes, one plant entered for '
        + 'a group — would not be caught by anything in this run.',
      remedy: 'Map the borrower to a held sector (counterparty.sectorKey) so the band in force for its '
        + 'country applies, or release a band for the sector in the baseline registry, or supply '
        + 'plausibility.sectorBand on the request. The check then reports divergence and never '
        + 'overwrites the figure.',
      reference: 'CarbonIQ plausibility check; PCAF sets no such test',
      observed: { intensity: +intensity.toFixed(2), sector: sector || null },
    });
  }

  const low = Number(sectorBand.low), high = Number(sectorBand.high);
  const basis = sectorBand.basis ? ` Band: ${sectorBand.basis}` : '';
  if (intensity >= low && intensity <= high) return null;
  const side = intensity < low ? 'below' : 'above';
  const factor = intensity < low ? low / intensity : intensity / high;
  return finding({
    code: 'INTENSITY_OUTSIDE_SECTOR_BAND',
    severity: factor >= 10 ? 'material' : 'advisory',
    field: 'emissions',
    statement: `The borrower's scope 1 and 2 intensity is ${intensity.toFixed(1)} tCO2e per million `
      + `${currency || 'of currency'} of revenue, ${side} the ${low}–${high} band held for `
      + `${sector || 'this sector'} by a factor of ${factor.toFixed(1)}.`,
    effect: factor >= 10
      ? 'A divergence of this size is more often a unit or a boundary error than a real one — kilograms for '
        + 'tonnes is a factor of a thousand, one site for a group is a factor of ten. The figure is used as '
        + 'given and nothing here has changed it.'
      : 'The figure is used as given. A borrower can legitimately sit outside its sector band; this records '
        + 'that it does.',
    remedy: 'Confirm the unit and the reporting boundary of the borrower\'s figure against its source '
      + 'document. If it is right, nothing needs to change and the finding is the evidence that it was checked.',
    reference: `CarbonIQ plausibility check; PCAF sets no such test.${basis}`,
    observed: {
      intensity: +intensity.toFixed(2), low, high, sector: sector || null, divergenceFactor: +factor.toFixed(2),
      band: {
        basis: sectorBand.basis || null, provisional: sectorBand.provisional === undefined ? null : Boolean(sectorBand.provisional),
        scope: sectorBand.scope || null, baselineId: sectorBand.baselineId || null, version: sectorBand.version === undefined ? null : sectorBand.version,
      },
    },
  });
}

/**
 * An economic emission factor's age against the year it is applied to.
 *
 * Box 6.1-5 (p.167) recommends inflating score 4 and 5 factors to the
 * reporting year, because a factor per unit of currency of its own year
 * applied to a later year's revenue or balance understates the estimate by
 * the inflation between the two. The estimation records the omission as an
 * assumption; this is the same fact as a finding, so it reaches the plan and
 * the disclosure rather than the trace alone. Where a deflator was applied
 * there is nothing to report.
 */
function factorVintage({ reportingYear, factor, inflationApplied, scope, thresholdYears }) {
  const limit = Number.isFinite(Number(thresholdYears)) ? Number(thresholdYears) : DEFAULTS.factorVintageYears;
  if (inflationApplied || !factor || !Number.isFinite(Number(factor.vintage)) || !reportingYear) return null;
  const vintage = Number(factor.vintage);
  const age = Number(reportingYear) - vintage;
  if (age < limit) return null;
  return finding({
    code: 'FACTOR_VINTAGE_STALE',
    severity: 'advisory',
    field: `emissions.scope${scope}.activity.factor`,
    statement: `The scope ${scope} economic emission factor is of vintage ${vintage} and is applied to `
      + `${reportingYear} figures without an inflation adjustment — ${age} years apart.`,
    effect: 'A factor per unit of currency of its own year, applied to a later year\'s revenue or balance, '
      + 'understates the estimate by the inflation between the two years. The figure stands as computed.',
    remedy: 'Supply a deflator — the price-level ratio and the index it came from — and Box 6.1-5 is '
      + 'applied; or use a factor of a more recent vintage. PCAF names no age; the '
      + `${limit}-year threshold is CarbonIQ's and is settable.`,
    reference: 'PCAF Part A Third Edition Box 6.1-5 (p.167)',
    observed: { vintage, reportingYear: Number(reportingYear), ageYears: age, thresholdYears: limit, source: factor.source || null },
  });
}

/**
 * A concentrated holding is not an error, and saying so is the point.
 *
 * An attribution factor near 1 means this institution finances nearly the
 * whole company, which for an SME lender is ordinary and for a syndicated
 * corporate book is a sign the denominator is wrong. The check cannot tell
 * them apart, so it does not try: it reports the concentration and leaves the
 * judgement where it belongs.
 */
function concentration({ attributionFactor, borrowerListed }) {
  if (!attributionFactor || !Number.isFinite(attributionFactor.value)) return null;
  const af = attributionFactor.value;
  if (af < 0.5) return null;
  return finding({
    code: 'HIGH_ATTRIBUTION_SHARE',
    severity: 'advisory',
    field: 'attribution',
    statement: `The attribution factor is ${(af * 100).toFixed(1)}%: this institution is recorded as financing `
      + 'most of the borrower\'s total value.',
    effect: 'Nearly all of the borrower\'s emissions land in this institution\'s inventory. The figure is '
      + 'correct if the exposure is.',
    remedy: borrowerListed
      ? 'For a listed borrower a share this high is unusual — check that the EVIC is the whole company\'s and '
        + 'not one tranche, and that both sides are in the same currency at the same date.'
      : 'For a small private borrower this is ordinary and needs nothing. Confirm the balance-sheet figures '
        + 'are the whole company\'s.',
    reference: 'CarbonIQ concentration check; PCAF sets no threshold',
    observed: { attributionFactor: af },
  });
}

module.exports = {
  DEFAULTS, yearEndFluctuation, emissionsLag, denominatorCoherence,
  intensityPlausibility, factorVintage, concentration,
};
