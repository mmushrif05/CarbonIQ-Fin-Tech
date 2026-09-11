// @ts-check
/**
 * The gate: is this exposure a business loan or unlisted equity at all?
 *
 * §5.2 (p.55) draws four edges, and three of them separate classes that look
 * alike to whoever keys the exposure:
 *
 *   a *listed* equity holding or a corporate bond is §5.1, even though the
 *     denominator is the same EVIC — the data-quality table is Table 5.1-2;
 *   a loan whose use of proceeds is known belongs to §5.4, §5.5, §5.6 or
 *     §5.7 by what it buys, though footnote 72 lets an institution still
 *     *report* it under a line it calls "business loans";
 *   a loan to a government is sovereign or sub-sovereign debt, while a loan
 *     to a state-owned enterprise is squarely in this class (footnote 69);
 *   private equity meaning an investment *fund* is §5.7, while private equity
 *     meaning shares in a company is this class.
 *
 * Off-balance-sheet loans and lines of credit are excluded outright (p.55).
 * Revolving credit, overdrafts and loans secured on real estate are in, and
 * only the amount outstanding on the year-end balance sheet counts.
 *
 * The classifier also settles the denominator, because §5.2 uses two: EVIC
 * for a business loan to a listed company (footnote 86), total equity plus
 * debt for everything else. Unlisted equity is private by definition and can
 * never reach the EVIC branch.
 */

'use strict';

const ASSET_CLASS = 'business-loans-unlisted-equity';
const REF = 'PCAF Part A Third Edition §5.2 (p.55) and Figure 5-1 (pp.35–36)';

function refuse(code, message, redirect) {
  const err = /** @type {import('../../../../shared/types').AppError & { redirect?: any, reference?: string }} */ (new Error(message));
  err.statusCode = 400;
  err.code = code;
  if (redirect) err.redirect = redirect;
  err.reference = REF;
  return err;
}

const NOT_DEBT_OR_EQUITY = new Set(['derivative', 'future', 'option', 'swap', 'short-position', 'underwriting', 'guarantee']);

const LOANS = new Set(['business-loan', 'loan', 'revolving-credit', 'overdraft', 'line-of-credit',
  'bridge-loan', 'letter-of-credit', 'cre-secured-line']);
const EQUITY = new Set(['unlisted-equity', 'private-equity', 'private-company-equity']);

/** The four classes a known use of proceeds sends an exposure to (p.55). */
const BY_PROCEEDS = {
  'commercial-real-estate': { section: '5.4', name: 'Commercial real estate' },
  'residential-property': { section: '5.5', name: 'Mortgages' },
  'motor-vehicle': { section: '5.6', name: 'Motor vehicle loans' },
  'project': { section: '5.3', name: 'Project finance' },
};

/**
 * @param {Object} [e]  the exposure as entered
 * @param {string} [e.instrument]
 * @param {boolean} [e.borrowerListed]  is the borrower a listed company?
 * @param {boolean} [e.onBalanceSheetAtYearEnd]
 * @param {boolean} [e.offBalanceSheet]
 * @param {boolean} [e.useOfProceedsKnown]
 * @param {string}  [e.proceedsPurpose]  one of BY_PROCEEDS, when proceeds are known
 * @param {string}  [e.borrowerType]  'company' | 'nonprofit' | 'state-owned-enterprise' | 'government'
 * @param {boolean} [e.isInvestmentFund]
 */
function classify(e = {}) {
  const steps = [];
  const instrument = String(e.instrument || '').toLowerCase();

  /* Step 1 — debt or equity? */
  if (NOT_DEBT_OR_EQUITY.has(instrument)) {
    throw refuse('NOT_DEBT_OR_EQUITY',
      `A ${instrument} is not a debt or equity exposure. Derivative financial products, short and long `
      + 'positions, guarantees and underwriting do not create a financed asset under Part A '
      + '(Figure 5-1, Step 1).');
  }
  steps.push({ step: 1, question: 'Is the exposure debt and/or equity?', answer: 'yes' });

  /* On the balance sheet at fiscal year-end (p.55). Off-balance-sheet loans
     and lines of credit are excluded by name in this chapter. */
  if (e.offBalanceSheet === true) {
    throw refuse('OFF_BALANCE_SHEET',
      'Any off-balance sheet loans and lines of credit are excluded from this asset class (§5.2, p.55). '
      + 'Only the amount outstanding on the year-end balance sheet is covered.');
  }
  if (e.onBalanceSheetAtYearEnd === false) {
    throw refuse('NOT_ON_BALANCE_SHEET_AT_YEAR_END',
      'For revolving credit facilities, bridge loans and letters of credit, only those outstanding on the '
      + 'year-end balance sheet of the financial institution are covered (§5.2, p.55). A facility drawn to '
      + 'zero at year-end carries no financed emissions for that year.');
  }

  /* Footnote 69 — a government is a different class; the company it owns is
     not. Getting this backwards moves a utility out of the lending book and
     a treasury bill into it. */
  const borrowerType = String(e.borrowerType || 'company').toLowerCase();
  if (borrowerType === 'government' || borrowerType === 'sovereign' || borrowerType === 'municipality') {
    throw refuse('GOVERNMENT_BORROWER',
      'Loans to governments themselves are excluded from this asset class and are covered by sovereign debt '
      + '(§5.9) and sub-sovereign debt (§5.10) — footnote 69. Government-owned enterprises, such as a '
      + 'state-owned utility or public transport operator, ARE in this class; record those as '
      + 'borrowerType "state-owned-enterprise".',
      { section: '5.9 or 5.10' });
  }

  /* Step 2 — proceeds allocated to specific assets? */
  if (e.useOfProceedsKnown === true) {
    const to = BY_PROCEEDS[String(e.proceedsPurpose || '').toLowerCase()];
    throw refuse('KNOWN_USE_OF_PROCEEDS',
      'This asset class is for general corporate purposes with unknown use of proceeds (§5.2, p.55). '
      + (to
        ? `Financing for ${to.name.toLowerCase()} is §${to.section}. `
        : 'Financing with a known use of proceeds belongs to commercial real estate (§5.4), mortgages '
          + '(§5.5), motor vehicle loans (§5.6) or use of proceeds structures (§5.7) by what it buys. ')
      + 'Footnote 72: the institution may still report such a loan under a line it calls "business loans" '
      + 'if that is the name it uses; the method comes from the other chapter either way.',
      { section: to ? to.section : '5.4, 5.5, 5.6 or 5.7' });
  }
  steps.push({ step: 2, question: 'Are the proceeds allocated to specific assets?', answer: 'no' });

  /* Step 3a — customer segment. */
  let denominatorKind, kind;

  if (LOANS.has(instrument)) {
    kind = 'business-loan';
    if (e.borrowerListed === undefined) {
      throw refuse('BORROWER_LISTING_UNKNOWN',
        'State whether the borrower is a listed company. Footnote 86: for business loans to listed companies, '
        + 'total company equity and debt is the EVIC of that company; a loan to a private company is '
        + 'attributed on total equity plus debt from its balance sheet (§5.2, p.57).');
    }
    denominatorKind = e.borrowerListed ? 'evic' : 'equity-plus-debt';
  } else if (EQUITY.has(instrument)) {
    if (e.isInvestmentFund === true) {
      throw refuse('PRIVATE_EQUITY_FUND',
        'Private equity that refers to investment funds is not included in this asset class; guidance is in '
        + 'use of proceeds structures (§5.7, p.55).',
        { section: '5.7' });
    }
    if (e.borrowerListed === true) {
      throw refuse('EQUITY_IS_LISTED',
        'Equity traded on a market is listed equity (§5.1), not unlisted equity. Unlisted equity is equity in '
        + 'companies that are not traded on a market (§5.2, p.55).',
        { section: '5.1' });
    }
    kind = 'unlisted-equity';
    /* Unlisted equity is private by definition, so there is no EVIC branch
       here at all — a private company has no market capitalisation. */
    denominatorKind = 'equity-plus-debt';
  } else if (instrument === 'listed-equity' || instrument === 'corporate-bond') {
    throw refuse('LISTED_EQUITY_OR_BOND',
      'Listed equity and corporate bonds — listed or unlisted issuer — are §5.1. The denominator may be the '
      + 'same EVIC, but the data quality table is Table 5.1-2, not Table 5.2-1.',
      { section: '5.1' });
  } else {
    throw refuse('INSTRUMENT_UNKNOWN',
      `Instrument "${e.instrument}" is not one this class can place. Use one of: `
      + `${[...LOANS].join(', ')} for a loan, or ${[...EQUITY].join(', ')} for equity in a private company.`);
  }

  steps.push({ step: '3a', question: 'Classify by customer segment', answer: 'business loans / unlisted equity' });

  return {
    assetClass: ASSET_CLASS,
    instrument,
    kind,
    borrowerType,
    borrowerListed: Boolean(e.borrowerListed),
    denominatorKind,
    steps,
    reference: REF,
  };
}

module.exports = { classify, ASSET_CLASS, LOANS, EQUITY, BY_PROCEEDS };
