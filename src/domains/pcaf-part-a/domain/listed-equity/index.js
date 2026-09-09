/**
 * PCAF Part A §5.1 — assess one listed-equity or corporate-bond exposure.
 *
 * The path is the standard's own order: classify (Figure 5-1) → value the
 * company (EVIC or equity plus debt, pp.41–43) → attribute (p.44) → decide
 * which option each scope has earned (Table 5.1-2) → estimate what has to be
 * estimated (Table 10.1-1) → report six separate lines (pp.49–50).
 *
 * The numerator is defined in line with the denominator (p.41): equity at
 * market value, a bond at book value, both on the same date. An exposure
 * whose two sides sit on different dates is refused, because a ratio of a
 * March market capitalisation to a December holding is not the attribution
 * factor the standard defines. In Sri Lanka this is the common case, not the
 * edge case — many CSE issuers close on 31 March while the institution reports
 * to 31 December — which is why it is a hard rule and not a warning.
 */

'use strict';

const { classify } = require('./classify');
const { denominator } = require('./denominator');
const { deriveOptions, reconcileClaim } = require('./options');
const { estimate } = require('./estimate');
const { reportingLines } = require('./lines');
const { attributionFactor } = require('../attribution');
const { traced } = require('../provenance');
const dataQuality = require('../data-quality');

const ASSET_CLASS = 'listed-equity-corporate-bonds';
const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard Part A: Financed Emissions. Third Edition, §5.1.';

function refuse(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

/** The investee-level figure for one scope: reported as given, or estimated. */
function investeeFigure({ scope, opt, entry, outstanding, reportingYear, deflator }) {
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
      reference: 'PCAF Part A Third Edition Table 10.1-1, Option 1',
    });
  }
  if (opt.option === 'alt') {
    const v = Number(entry.value);
    if (!Number.isFinite(v) || v < 0) throw refuse('SCOPE_VALUE_INVALID', `Scope ${scope} alternative figure must be a number of zero or more.`);
    return traced({
      value: v, unit: 'tCO2e',
      equation: `company scope ${scope} = alternative method (see justification)`,
      inputs: { value: v, method: entry.method || null },
      basis: 'Alternative calculation option, with the institution\'s explanation (p.48)',
      reference: 'PCAF Part A Third Edition §5.1, p.48',
      assumptions: [`Alternative option: ${entry.justification}`],
    });
  }
  return estimate({ option: opt.option, scope, activity: entry.activity || {}, outstanding, reportingYear, deflator });
}

/**
 * @param {Object} x  one exposure (see docs/PCAF-PART-A-LISTED-EQUITY.md §5.3)
 */
function assessListedEquity(x = {}) {
  const cls = classify(x);
  const reportingYear = x.reportingYear ? Number(x.reportingYear) : null;

  /* Outstanding: market value for equity, book value for a bond (p.41). */
  const out = x.outstanding || {};
  const outstanding = Number(out.amount);
  if (!Number.isFinite(outstanding) || outstanding < 0) {
    throw refuse('OUTSTANDING_REQUIRED', 'Outstanding amount is required as a number of zero or more.');
  }
  const expectBasis = cls.instrument === 'listed-equity' ? 'market-value' : 'book-value';
  if (out.basis && out.basis !== expectBasis) {
    throw refuse('OUTSTANDING_BASIS_MISMATCH',
      `Outstanding ${cls.instrument === 'listed-equity' ? 'listed equity is defined on its market value (price × shares)' : 'corporate bonds are defined on the book value of the debt owed'} (§5.1, p.41). `
      + `The entry says "${out.basis}".`);
  }
  if (!out.asOf) throw refuse('OUTSTANDING_DATE_REQUIRED', 'State the date the outstanding amount is taken at (calendar or fiscal year-end, p.41).');

  /* Fund look-through: the institution's share of the holding is the fund's
     weight times its own share of the fund. */
  const effectiveOutstanding = cls.viaFund ? outstanding * cls.viaFund.fundWeight : outstanding;

  const options = deriveOptions(x.emissions || {});
  const claims = x.dataQualityClaims || {};
  const scope12 = reconcileClaim(options.scope12, claims.scope12, claims.justification);
  const scope3 = options.scope3 ? reconcileClaim(options.scope3, claims.scope3, claims.justification) : null;

  /* Does any line need a factor? 3b/3c lines do not (fn 41). */
  const needsFactor = scope12.attributionFactor || (scope3 && scope3.attributionFactor)
    || x.removals || x.creditsRetired || x.creditsGenerated;

  let denom = null, af = null;
  if (needsFactor) {
    const d = x.denominator || {};
    denom = denominator(cls.denominatorKind, {
      ...d,
      issuer: d.issuer || (x.counterparty && x.counterparty.name),
      financialInstitution: d.financialInstitution !== undefined ? d.financialInstitution
        : Boolean(x.counterparty && x.counterparty.financialInstitution),
    });

    /* p.41 — same date on both sides. */
    if (String(denom.inputs.asOf) !== String(out.asOf)) {
      throw refuse('VALUATION_DATE_MISMATCH',
        `The outstanding amount is dated ${out.asOf} and the company value ${denom.inputs.asOf}. The numerator is `
        + 'defined in line with the denominator (§5.1, p.41), so both are taken at the same year-end. If the '
        + 'investee\'s fiscal year differs from the reporting institution\'s, use the investee\'s figures at the '
        + 'institution\'s year-end, or declare the approximation on the exposure.');
    }
    if (out.currency && denom.unit && out.currency !== denom.unit) {
      throw refuse('CURRENCY_MISMATCH',
        `Outstanding amount is in ${out.currency} and the company value in ${denom.unit}. Convert one at the `
        + 'valuation date and record the rate; a ratio across currencies is not an attribution factor.');
    }

    af = attributionFactor({
      assetClass: cls.denominatorKind === 'evic' ? ASSET_CLASS : 'corporate-bond-private',
      outstandingAmount: effectiveOutstanding,
      denominator: denom.value,
      overrideJustification: x.attributionOverrideJustification,
    });
  }

  const deflator = x.deflator || null;
  const em = x.emissions || {};
  const s1 = investeeFigure({ scope: '1', opt: scope12.scope1, entry: em.scope1, outstanding: effectiveOutstanding, reportingYear, deflator });
  const s2 = investeeFigure({ scope: '2', opt: scope12.scope2, entry: em.scope2, outstanding: effectiveOutstanding, reportingYear, deflator });
  const s3 = scope3 ? investeeFigure({ scope: '3', opt: scope3.scope3, entry: em.scope3, outstanding: effectiveOutstanding, reportingYear, deflator }) : null;

  const plain = (v, what) => {
    if (v === undefined || v === null) return null;
    const n = Number(v.value !== undefined ? v.value : v);
    if (!Number.isFinite(n) || n < 0) throw refuse('LINE_VALUE_INVALID', `${what} must be a number of zero or more.`);
    return traced({ value: n, unit: 'tCO2e', equation: `company ${what} = reported`, inputs: { reported_tCO2e: n, period: v.period || null }, basis: v.basis || 'Reported by the company', reference: 'PCAF Part A Third Edition §5.1, p.49' });
  };

  const lines = reportingLines({
    attributionFactor: af ? af.value : null,
    scope1: s1, scope2: s2, scope3: s3,
    scope3AbsentReason: em.scope3AbsentReason || null,
    removals: plain(x.removals, 'emission removals'),
    creditsRetired: plain(x.creditsRetired, 'carbon credits retired'),
    creditsGenerated: plain(x.creditsGenerated, 'carbon credits generated'),
  });

  /* The scores, rendered as categories with the scale beside them. */
  const dq12 = dataQuality.score(ASSET_CLASS, scope12.option);
  const dq3 = scope3 ? dataQuality.score(ASSET_CLASS, scope3.option) : null;

  /* Economic intensity per million of outstanding (DCL p.127), on scope 1 and 2. */
  const economicIntensity = effectiveOutstanding > 0
    ? +((lines.scope1And2.value / (effectiveOutstanding / 1e6))).toFixed(2) : null;

  const cp = x.counterparty || {};
  return {
    standard: STANDARD,
    assetClass: ASSET_CLASS,
    classification: cls,
    exposure: {
      identifiers: x.identifiers || {},
      counterparty: { name: cp.name || null, country: cp.country || null, naceL2: cp.naceL2 || null, financialInstitution: Boolean(cp.financialInstitution) },
      instrument: cls.instrument,
      viaFund: cls.viaFund,
      reportingYear,
      outstanding: { amount: outstanding, effective: effectiveOutstanding, basis: expectBasis, currency: out.currency || null, asOf: out.asOf },
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
      economicIntensityNote: 'Economic emission intensity on financed scope 1 and 2, per million of the stated currency outstanding (PCAF Disclosure Checklist Part A, p.127).',
    },
    /* p.41: emissions financed in the financial sector are recommended to be
       reported separately, because of the double count. */
    financialSector: Boolean(cp.financialInstitution),
    marketValueNote: 'Financed emissions are reported unadjusted for market-value fluctuation, as required (§5.1, p.50). '
      + 'An adjusted figure may be reported separately with its methodology; it is not computed here.',
  };
}

module.exports = { assessListedEquity, ASSET_CLASS, STANDARD };
