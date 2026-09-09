/**
 * The gate: is this exposure listed equity or a corporate bond at all?
 *
 * PCAF's Figure 5-1 (pp.35–36) is a decision tree, and an exposure that cannot
 * answer it is not assessed. The failures here are refusals with a redirect,
 * because the neighbouring classes look alike and differ in exactly the places
 * that would go wrong silently: a term loan to a listed company shares the EVIC
 * denominator but sits in §5.2 with its own table; a private-equity stake shares
 * the word "equity" and has a different denominator entirely; a fund whose
 * holdings are unknown cannot be followed and belongs to §5.7.
 *
 * A corporate bond of a private company is IN this class (p.40 "listed and
 * unlisted corporate bonds"). It is the one instrument here that uses total
 * equity plus debt rather than EVIC, and the classifier says which.
 */

'use strict';

const ASSET_CLASS = 'listed-equity-corporate-bonds';
const REF = 'PCAF Part A Third Edition §5.1 (p.40) and Figure 5-1 (pp.35–36)';

function refuse(code, message, redirect) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  if (redirect) err.redirect = redirect;
  err.reference = REF;
  return err;
}

const NOT_DEBT_OR_EQUITY = new Set(['derivative', 'future', 'option', 'swap', 'short-position', 'underwriting']);

/**
 * @param {Object} e  the exposure as entered
 * @param {string} e.instrument  'listed-equity' | 'corporate-bond' | 'loan' | 'private-equity' | 'fund' | 'derivative' | ...
 * @param {boolean} [e.issuerListed]   for a bond: is the issuer a listed company?
 * @param {boolean} [e.onBalanceSheetAtYearEnd]
 * @param {boolean} [e.heldForSale]
 * @param {boolean} [e.useOfProceedsKnown]
 * @param {Object}  [e.viaFund]  { fundName, fundWeight, holdingsKnown }
 */
function classify(e = {}) {
  const steps = [];
  const instrument = String(e.instrument || '').toLowerCase();

  /* Step 1 — debt or equity? Derivatives create neither, and PCAF says so
     in this chapter (p.40) and again at the head of the tree. */
  if (NOT_DEBT_OR_EQUITY.has(instrument)) {
    throw refuse('NOT_DEBT_OR_EQUITY',
      `A ${instrument} is not a debt or equity exposure. Derivative financial products, short and long `
      + 'positions and underwriting are not covered by the listed equity and corporate bonds asset class '
      + '(§5.1, p.40), and do not create a financed asset under Part A (Figure 5-1, Step 1).');
  }
  steps.push({ step: 1, question: 'Is the exposure debt and/or equity?', answer: 'yes' });

  /* On the balance sheet at fiscal year-end, and not held for sale (p.37, p.40). */
  if (e.heldForSale === true) {
    throw refuse('HELD_FOR_SALE',
      'Assets held for short durations and designated as held for sale are not in scope (§5.1, p.40). '
      + 'This includes trading-account assets and debt securities carried at fair value and held short.');
  }
  if (e.onBalanceSheetAtYearEnd === false) {
    throw refuse('NOT_ON_BALANCE_SHEET_AT_YEAR_END',
      'Each asset class covers financial products on the balance sheet of the financial institution at '
      + 'fiscal year-end (Chapter 5, p.36–37). An exposure closed out before year-end is not assessed.');
  }

  /* Step 2 — proceeds allocated to specific assets? This class is general
     corporate purpose only. */
  if (e.useOfProceedsKnown === true) {
    throw refuse('KNOWN_USE_OF_PROCEEDS',
      'This asset class is for general corporate purposes with unknown use of proceeds (§5.1, p.40). '
      + 'Financing tied to a specific project is project finance (§5.3); a labelled bond or fund with '
      + 'allocated proceeds is a use of proceeds structure (§5.7).',
      { section: '5.3 or 5.7' });
  }
  steps.push({ step: 2, question: 'Are the proceeds allocated to specific assets?', answer: 'no' });

  /* A fund is followed through to its holdings — or not at all (p.40). */
  let viaFund = null;
  if (e.viaFund) {
    if (e.viaFund.holdingsKnown === false) {
      throw refuse('FUND_HOLDINGS_UNKNOWN',
        'For indirect investments through funds the method applies only where information on the '
        + 'individual holdings is available (§5.1, p.40). Without it the exposure is a use of proceeds '
        + 'structure (§5.7).',
        { section: '5.7' });
    }
    const w = Number(e.viaFund.fundWeight);
    if (!(w > 0 && w <= 1)) {
      throw refuse('FUND_WEIGHT_INVALID',
        'A holding reached through a fund needs the fund\'s weight in the underlying, as a share between 0 and 1.');
    }
    viaFund = { fundName: e.viaFund.fundName || null, fundWeight: w };
  }

  /* Step 3a — customer segment. */
  let denominatorKind;
  switch (instrument) {
    case 'listed-equity':
      if (e.issuerListed === false) {
        throw refuse('EQUITY_NOT_LISTED',
          'Equity investments in private companies are not covered by this asset class because that is '
          + 'finance not traded on a market (§5.1, p.40). See business loans and unlisted equity (§5.2).',
          { section: '5.2' });
      }
      denominatorKind = 'evic';
      break;

    case 'corporate-bond':
      /* Listed or unlisted, the bond is in this class; the issuer's listing
         decides the denominator (p.42). */
      if (e.issuerListed === undefined) {
        throw refuse('ISSUER_LISTING_UNKNOWN',
          'For a corporate bond, state whether the issuer is a listed company. A listed issuer is '
          + 'attributed on EVIC; a bond to a private company on total equity plus debt (§5.1, p.42).');
      }
      denominatorKind = e.issuerListed ? 'evic' : 'equity-plus-debt';
      break;

    case 'loan':
    case 'business-loan':
      throw refuse('BUSINESS_LOAN',
        'A general-purpose loan is business loans and unlisted equity (§5.2), even to a listed company. '
        + 'The denominator is the same EVIC, but the data quality table is Table 5.2-1, not Table 5.1-2.',
        { section: '5.2' });

    case 'private-equity':
    case 'unlisted-equity':
      throw refuse('UNLISTED_EQUITY',
        'Unlisted equity is business loans and unlisted equity (§5.2).', { section: '5.2' });

    default:
      throw refuse('INSTRUMENT_UNKNOWN',
        `Instrument "${e.instrument}" is not one this class can place. Use listed-equity or corporate-bond; `
        + 'a loan, private equity, fund without look-through, or derivative is redirected or refused.');
  }
  steps.push({ step: '3a', question: 'Classify by customer segment', answer: 'listed equity / corporate bonds' });

  return {
    assetClass: ASSET_CLASS,
    instrument,
    denominatorKind,
    viaFund,
    steps,
    reference: REF,
  };
}

module.exports = { classify, ASSET_CLASS };
