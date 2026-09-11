// @ts-check
/**
 * PCAF Part A §5.2 — assess one business loan or unlisted equity holding.
 *
 * The path is the standard's own order: classify (Figure 5-1, p.55) → the
 * outstanding amount, which this chapter defines twice (p.56) → the company
 * value, EVIC for a listed borrower and total equity plus debt otherwise
 * (p.57) → attribute → decide which option each scope has earned (Table 5.2-1)
 * → estimate what has to be estimated (Annex 10.1) → report six separate lines
 * (pp.62–63).
 *
 * What is new here and not in §5.1 is the last step. The engine also says what
 * the data says about itself: the footnote 71 fluctuation of a revolving
 * facility, the age of the borrower's emissions figure, a denominator that
 * cannot have come from one balance sheet, an intensity outside its sector's
 * band. None of it refuses and none of it changes a figure. It is the
 * difference between a calculator and an instrument — see
 * `../corporate/findings.js` for the line between a refusal and a finding.
 */

'use strict';

const { classify, ASSET_CLASS } = require('./classify');
const { outstanding: numerator } = require('./numerator');
const { denominator } = require('./denominator');
const { deriveOptions, reconcileClaim } = require('./options');
const { estimate } = require('./estimate');
const { reportingLines } = require('./lines');
const checks = require('./checks');
const { register } = require('../corporate/findings');
const { attributionFactor } = require('../attribution');
const { traced } = require('../provenance');
const dataQuality = require('../data-quality');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard Part A: Financed Emissions. Third Edition, §5.2.';

function refuse(code, message) {
  const err = /** @type {import('../../../../shared/types').AppError} */ (new Error(message));
  err.statusCode = 400;
  err.code = code;
  return err;
}

/** The borrower-level figure for one scope: reported as given, or estimated. */
function borrowerFigure({ scope, opt, entry, out, reportingYear, deflator }) {
  if (!opt) return null;

  if (!opt.estimated && opt.option !== 'alt') {
    const v = Number(entry.value);
    if (!Number.isFinite(v) || v < 0) {
      throw refuse('SCOPE_VALUE_INVALID', `Scope ${scope} reported figure must be a number of zero or more.`);
    }
    return traced({
      value: v, unit: 'tCO2e',
      equation: `company scope ${scope} = reported`,
      inputs: { reported_tCO2e: v, period: entry.period || null, source: entry.source || null, verifier: entry.verifier || null, provider: entry.provider || null },
      basis: opt.option === '1a' ? 'Reported, verified by a third party' : 'Reported by the company, unverified',
      reference: 'PCAF Part A Third Edition Annex Table 10.1-2, Option 1',
    });
  }

  if (opt.option === 'alt') {
    const v = Number(entry.value);
    if (!Number.isFinite(v) || v < 0) throw refuse('SCOPE_VALUE_INVALID', `Scope ${scope} alternative figure must be a number of zero or more.`);
    return Object.assign(traced({
      value: v, unit: 'tCO2e',
      equation: `company scope ${scope} = alternative method (see justification)`,
      inputs: { value: v, method: entry.method || null, basis: opt.basis },
      basis: 'Alternative calculation option, with the institution\'s explanation (p.62)',
      reference: 'PCAF Part A Third Edition §5.2, p.62',
      assumptions: [`Alternative option: ${entry.justification}`],
    }), entry.alreadyAttributed ? { alreadyAttributed: true } : {});
  }

  return estimate({ option: opt.option, scope, activity: entry.activity || {}, outstanding: out, reportingYear, deflator });
}

/**
 * @param {Object} x  one exposure (see docs/PCAF-PART-A-BUSINESS-LOANS.md)
 */
function assessBusinessLoan(x = {}) {
  const cls = classify(x);
  const reportingYear = x.reportingYear ? Number(x.reportingYear) : null;
  const found = register();

  /* 1 — the numerator, by kind (p.56). */
  const out = x.outstanding || {};
  const num = numerator(cls.kind, out);
  const amount = Number(num.value);

  const options = deriveOptions(x.emissions || {});
  const claims = x.dataQualityClaims || {};
  const scope12 = reconcileClaim(options.scope12, claims.scope12, claims.justification);
  const scope3 = options.scope3 ? reconcileClaim(options.scope3, claims.scope3, claims.justification) : null;

  /* Does any line need a factor? 3b/3c lines do not (footnote 73). */
  const needsFactor = scope12.attributionFactor || (scope3 && scope3.attributionFactor)
    || x.removals || x.creditsRetired || x.creditsGenerated;

  /* 2 — the denominator (p.57), and 3 — the factor. */
  let denom = null, af = null;
  if (needsFactor) {
    const d = x.denominator || {};
    denom = denominator(cls.denominatorKind, {
      ...d,
      issuer: d.issuer || (x.counterparty && x.counterparty.name),
      financialInstitution: d.financialInstitution !== undefined ? d.financialInstitution
        : Boolean(x.counterparty && x.counterparty.financialInstitution),
    });

    /* The numerator is defined in line with the denominator; a ratio of a
       March balance sheet to a December balance is not an attribution factor. */
    if (String(denom.inputs.asOf) !== String(num.inputs.asOf)) {
      throw refuse('VALUATION_DATE_MISMATCH',
        `The outstanding amount is dated ${num.inputs.asOf} and the company value ${denom.inputs.asOf}. Both are `
        + 'taken at the same year-end (§5.2, pp.56–57). An institution should use either the calendar or the '
        + 'financial year-end and use it consistently; where the borrower\'s year differs from the '
        + 'institution\'s, use the borrower\'s figures at the institution\'s year-end.');
    }
    if (out.currency && denom.unit && out.currency !== denom.unit) {
      throw refuse('CURRENCY_MISMATCH',
        `The outstanding amount is in ${out.currency} and the company value in ${denom.unit}. Convert one at `
        + 'the valuation date and record the rate; a ratio across currencies is not an attribution factor.');
    }

    af = attributionFactor({
      assetClass: cls.denominatorKind === 'evic' ? ASSET_CLASS : `${ASSET_CLASS}-private`,
      outstandingAmount: amount,
      denominator: Number(denom.value),
      overrideJustification: x.attributionOverrideJustification,
    });
  }

  /* 4 — the borrower's figures. */
  const deflator = x.deflator || null;
  const em = x.emissions || {};
  const s1 = borrowerFigure({ scope: '1', opt: scope12.scope1, entry: em.scope1, out: amount, reportingYear, deflator });
  const s2 = borrowerFigure({ scope: '2', opt: scope12.scope2, entry: em.scope2, out: amount, reportingYear, deflator });
  const s3 = scope3 ? borrowerFigure({ scope: '3', opt: scope3.scope3, entry: em.scope3, out: amount, reportingYear, deflator }) : null;

  const plain = (v, what) => {
    if (v === undefined || v === null) return null;
    const n = Number(v.value !== undefined ? v.value : v);
    if (!Number.isFinite(n) || n < 0) throw refuse('LINE_VALUE_INVALID', `${what} must be a number of zero or more.`);
    return traced({ value: n, unit: 'tCO2e', equation: `company ${what} = reported`, inputs: { reported_tCO2e: n, period: v.period || null }, basis: v.basis || 'Reported by the company', reference: 'PCAF Part A Third Edition §5.2, pp.62–63' });
  };

  const lines = reportingLines({
    attributionFactor: af ? Number(af.value) : null,
    scope1: s1, scope2: s2, scope3: s3,
    scope3AbsentReason: em.scope3AbsentReason || null,
    removals: plain(x.removals, 'emission removals'),
    creditsRetired: plain(x.creditsRetired, 'carbon credits retired'),
    creditsGenerated: plain(x.creditsGenerated, 'carbon credits generated'),
  });

  const dq12 = dataQuality.score(ASSET_CLASS, scope12.option);
  const dq3 = scope3 ? dataQuality.score(ASSET_CLASS, scope3.option) : null;

  const economicIntensity = amount > 0
    ? +((Number(lines.scope1And2.value) / (amount / 1e6))).toFixed(2) : null;

  /* 5 — what the data says about itself. */
  const thresholds = x.thresholds || {};
  const cp = x.counterparty || {};

  found.add(checks.yearEndFluctuation({
    outstanding: amount,
    averageOutstanding: out.averageOutstanding,
    peakOutstanding: out.peakOutstanding,
    instrument: cls.instrument,
    thresholdPct: thresholds.fluctuationPct,
  }));
  for (const [scope, entry] of [['1', em.scope1], ['2', em.scope2], ['3', em.scope3]]) {
    if (entry && entry.period) {
      found.add(checks.emissionsLag({ reportingYear, period: entry.period, scope, thresholdYears: thresholds.emissionsLagYears }));
    }
  }
  found.add(checks.denominatorCoherence({ denominator: denom, totalAssets: (x.denominator || {}).totalAssets }));
  found.add(checks.intensityPlausibility({
    scope1And2_tCO2e: (s1 && s1.value ? s1.value : 0) + (s2 && s2.value ? s2.value : 0),
    revenue: (x.plausibility || {}).revenue,
    currency: out.currency || null,
    sectorBand: (x.plausibility || {}).sectorBand,
    sector: cp.sector || cp.naceL2 || null,
  }));
  found.add(checks.concentration({ attributionFactor: af, borrowerListed: cls.borrowerListed }));

  /* The denominator and numerator record their own departures as assumptions;
     the ones a reader of the figure has to be told about are promoted to
     findings so they reach the disclosure rather than the trace alone. */
  for (const a of (denom ? denom.assumptions || [] : [])) {
    if (/total balance sheet/i.test(a)) {
      found.add({
        code: 'BALANCE_SHEET_FALLBACK',
        severity: 'material',
        field: 'denominator.totalAssets',
        statement: 'The denominator is the borrower\'s total balance sheet, not its total equity plus debt.',
        effect: 'Total assets are larger than equity plus interest-bearing debt, so the attribution factor is '
          + 'smaller and the financed emissions lower than the defined denominator would give.',
        remedy: 'Obtain total equity and total debt from the borrower\'s balance sheet. Footnote 77 permits '
          + 'this fallback with the intention of improving the data.',
        reference: 'PCAF Part A Third Edition §5.2, footnote 77',
      });
    }
  }
  if (!scope3) {
    found.add({
      code: 'SCOPE_3_NOT_REPORTED',
      severity: 'material',
      field: 'emissions.scope3',
      statement: 'No scope 3 figure is held for this borrower.',
      effect: 'Scope 3 is required across all sectors for reports published from 2025, so the disclosure is '
        + 'incomplete for this exposure and says so rather than reporting zero.',
      remedy: em.scope3AbsentReason
        ? 'The stated reason travels into the report. An institution unable to report scope 3 shall explain why.'
        : 'Supply the figure, or a reason: an institution unable to report scope 3 shall explain why (§5.2, p.56).',
      reference: 'PCAF Part A Third Edition §5.2, p.56',
    });
  }
  if (!needsFactor) {
    found.add({
      code: 'NO_ATTRIBUTION_FACTOR',
      severity: 'material',
      field: 'emissions',
      statement: `Every figure rests on Option ${scope12.option}, which yields no attribution factor.`,
      effect: 'The outstanding amount is multiplied directly by a sector-average intensity, so the result is a '
        + 'rough estimate of this institution\'s share rather than a share of a measured company figure.',
      remedy: 'Obtain the borrower\'s total equity and debt — or its EVIC where it is listed — and any Option '
        + '1, 2 or 3a figure then attributes properly.',
      reference: 'PCAF Part A Third Edition §5.2, footnote 73',
    });
  }

  return {
    standard: STANDARD,
    assetClass: ASSET_CLASS,
    classification: cls,
    exposure: {
      identifiers: x.identifiers || {},
      counterparty: {
        name: cp.name || null, country: cp.country || null, sector: cp.sector || null,
        naceL2: cp.naceL2 || null, financialInstitution: Boolean(cp.financialInstitution),
        borrowerType: cls.borrowerType,
      },
      instrument: cls.instrument,
      kind: cls.kind,
      reportingYear,
      outstanding: num,
    },
    denominator: denom,
    attribution: af,
    inventory: {
      ...lines,
      dataQuality: {
        scope1And2: { ...dq12, ...(scope12.claimed && scope12.claimed !== scope12.derivedOption ? { claimed: scope12.claimed, derivedOption: scope12.derivedOption, overrideJustification: scope12.overrideJustification } : {}), scope1: scope12.scope1, scope2: scope12.scope2, note: scope12.note },
        scope3: dq3 ? { ...dq3, scope3: scope3.scope3 } : { absent: true, reason: 'No scope 3 figure; no score. The scope 3 weighted score is reported separately from scope 1 and 2 (p.167), and an absent scope carries no score rather than a score of 5.' },
        scale: dq12.scale,
      },
      economicIntensity_tCO2e_per_M: economicIntensity,
      economicIntensityNote: 'Economic emission intensity on financed scope 1 and 2, per million of the stated '
        + 'currency outstanding (PCAF Disclosure Checklist Part A, p.127).',
    },
    validation: found.result(),
    /* p.56: separate reporting of financed emissions to the financial sector
       is recommended, because of the double count it creates. */
    financialSector: Boolean(cp.financialInstitution),
  };
}

module.exports = { assessBusinessLoan, ASSET_CLASS, STANDARD };
