/**
 * The company value: EVIC for a listed company, total equity plus debt for a
 * private one — the denominator §5.1 and §5.2 share.
 *
 * §5.1 states the rules at pp.41–43 and §5.2 restates them at pp.56–58,
 * word for word and under different footnote numbers. They are rules, not
 * commentary, and each one is a named assumption on the trace so the report
 * can print what was done:
 *
 *   negative book equity is set to zero — all attribution falls on debt
 *   total debt is current plus long-term
 *   where debt or equity cannot be obtained, fall back to the total balance
 *     sheet, with the intent to improve
 *   EU TEG total debt includes non-interest-bearing liabilities; where that
 *     figure is unknown, the precautionary principle excludes it
 *   an element may be OMITTED from EVIC under the precautionary principle —
 *     it lowers EVIC and raises the institution's share — but the base must
 *     still be market capitalisation plus total book debt, and nothing may
 *     be added
 *   a subsidiary is attributed on its own balance sheet if held, else on the
 *     entity with recourse
 *   for a borrower or investee that is a financial institution, book debt
 *     includes customer deposits
 *
 * Cash is never deducted. There is no field for it, and an input that tries to
 * deduct it is refused: that would be enterprise value, whose shares can sum
 * past 100% — the very thing Box 5.1-2 chose EVIC to avoid.
 *
 * The chapter's own citations are passed in, because a reviewer checking a
 * business loan should be sent to §5.2's footnotes and not to §5.1's.
 */

'use strict';

const { traced } = require('../provenance');

function refuse(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

const num = v => (v === undefined || v === null || v === '') ? undefined : Number(v);

/**
 * Bind the two denominators to one chapter's pages and footnote numbers.
 *
 * @param {Object} refs
 * @param {string} refs.evicRef        cited on an EVIC figure
 * @param {string} refs.edRef          cited on a total-equity-plus-debt figure
 * @param {string} refs.evicPage       where the EVIC definition is stated
 * @param {string} refs.depositsPage   where deposits are added for a financial institution
 * @param {string} refs.numeratorPage  where the numerator is required to match the denominator's date
 * @param {Object} refs.footnotes      negativeEquity · totalDebt · fallback · nonInterestBearing · omission · subsidiary
 */
function build(refs) {
const fn = refs.footnotes;
const REF_EVIC = refs.evicRef;
const REF_ED = refs.edRef;

/**
 * Enterprise value including cash.
 *
 * @param {Object} d
 * @param {number} d.marketCapOrdinary          at fiscal year-end
 * @param {number} [d.marketCapPreferred]       at fiscal year-end; omitted → 0 with a declaration
 * @param {number} d.totalDebtInterestBearing   current + long-term (fn 43)
 * @param {number} [d.totalDebtNonInterestBearing]  unknown → excluded (fn 45)
 * @param {number} [d.minorityInterests]        unknown → excluded (fn 46)
 * @param {boolean} [d.financialInstitution]    then customerDeposits is required (p.43)
 * @param {number} [d.customerDeposits]
 * @param {string} d.asOf                       the date the figures are taken at
 * @param {string} d.currency
 * @param {string} [d.entity]                   the balance sheet used, if not the issuer (fn 48)
 * @param {string} [d.issuer]
 * @param {string} [d.recourseReason]
 */
function evic(d = {}) {
  const assumptions = [];

  if (d.cash !== undefined || d.cashDeduction !== undefined) {
    throw refuse('EVIC_CASH_DEDUCTION',
      `EVIC makes no deduction for cash or cash equivalents (${refs.evicPage}). Deducting cash gives enterprise `
      + 'value, whose equity and debt shares can sum past 100% — Box 5.1-2 shows 63% + 63% on the same '
      + 'company. Remove the cash field.');
  }

  const mcO = num(d.marketCapOrdinary);
  if (!(mcO > 0)) {
    throw refuse('EVIC_MARKET_CAP_REQUIRED',
      'Market capitalisation of ordinary shares at fiscal year-end is required and must be positive. '
      + 'A listed company has one; if the company is not listed, its bond is attributed on total equity '
      + `plus debt instead (${refs.evicPage}).`);
  }

  let mcP = num(d.marketCapPreferred);
  if (mcP === undefined) {
    mcP = 0;
    assumptions.push('No preferred shares declared; preferred market capitalisation taken as 0.');
  } else if (mcP < 0) {
    throw refuse('EVIC_PREFERRED_NEGATIVE', 'Preferred market capitalisation cannot be negative.');
  }

  const debtIB = num(d.totalDebtInterestBearing);
  if (!(debtIB >= 0)) {
    throw refuse('EVIC_TOTAL_DEBT_REQUIRED',
      `Book value of total debt is required (current plus long-term, footnote ${fn.totalDebt}). Where it cannot `
      + `be obtained, footnote ${fn.fallback} permits a fallback to the total balance sheet — supply totalAssets `
      + 'to the equity-plus-debt path with a reason instead.');
  }

  let debtNIB = num(d.totalDebtNonInterestBearing);
  if (debtNIB === undefined) {
    debtNIB = 0;
    assumptions.push('Non-interest-bearing liabilities not available; excluded from total debt under the '
      + `precautionary principle (footnote ${fn.nonInterestBearing}). This lowers EVIC and raises the attributed share.`);
  } else if (debtNIB < 0) {
    throw refuse('EVIC_NIB_DEBT_NEGATIVE', 'Non-interest-bearing debt cannot be negative.');
  }

  let minorities = num(d.minorityInterests);
  if (minorities === undefined) {
    minorities = 0;
    assumptions.push('Minority interests not available; excluded from EVIC under the precautionary '
      + `principle (footnote ${fn.omission}). This lowers EVIC and raises the attributed share.`);
  } else if (minorities < 0) {
    throw refuse('EVIC_MINORITIES_NEGATIVE', 'Minority interests cannot be negative.');
  }

  /* Deposits are part of a bank's funding base and count as debt. A
     bank entered without them would carry an EVIC missing most of its
     liabilities and an attributed share several times too high. */
  let deposits = 0;
  if (d.financialInstitution) {
    deposits = num(d.customerDeposits);
    if (!(deposits >= 0)) {
      throw refuse('EVIC_DEPOSITS_REQUIRED',
        'The borrower or investee is a financial institution, so the book value of debt includes customer '
        + `deposits (${refs.depositsPage}). Supply customerDeposits.`);
    }
    assumptions.push('Borrower or investee is a financial institution: customer deposits included in total '
      + `debt (${refs.depositsPage}).`);
  }

  /* Omissions are permitted, additions are not. Anything not in the
     definition is refused rather than summed. */
  const known = new Set(['marketCapOrdinary', 'marketCapPreferred', 'totalDebtInterestBearing',
    'totalDebtNonInterestBearing', 'minorityInterests', 'customerDeposits', 'financialInstitution',
    'asOf', 'currency', 'entity', 'issuer', 'recourseReason', 'kind']);
  const extras = Object.keys(d).filter(k => !known.has(k) && d[k] !== undefined && d[k] !== null);
  if (extras.length) {
    throw refuse('EVIC_UNKNOWN_ELEMENT',
      `EVIC has four elements — ordinary and preferred market capitalisation, book value of total debt, `
      + `and minority interests (${refs.evicPage}). "${extras.join('", "')}" is not one of them. Footnote ${fn.omission} permits `
      + 'elements to be omitted under the precautionary principle, never added.');
  }

  if (!d.asOf) {
    throw refuse('EVIC_DATE_REQUIRED',
      'State the date the EVIC elements are taken at. The numerator is defined in line with the '
      + `denominator (${refs.numeratorPage}), so both must sit on the same date.`);
  }

  /* Follow the money. */
  if (d.entity && d.issuer && d.entity !== d.issuer) {
    if (!d.recourseReason) {
      throw refuse('EVIC_ENTITY_MISMATCH',
        `The balance sheet used (${d.entity}) is not the issuer's (${d.issuer}). Footnote ${fn.subsidiary}: attribute at `
        + 'subsidiary level where its balance sheet is held; otherwise on the entity with recourse for '
        + 'repayment. State the recourse reason.');
    }
    assumptions.push(`Attributed on the balance sheet of ${d.entity} rather than the issuer ${d.issuer}: `
      + `${d.recourseReason} (footnote ${fn.subsidiary}).`);
  }

  const totalDebt = debtIB + debtNIB + deposits;
  const value = mcO + mcP + totalDebt + minorities;

  return traced({
    value: +value.toFixed(2),
    unit: d.currency || null,
    equation: 'EVIC = market cap (ordinary) + market cap (preferred) + book value of total debt + minority interests',
    inputs: {
      marketCapOrdinary: mcO, marketCapPreferred: mcP,
      totalDebt, totalDebtInterestBearing: debtIB, totalDebtNonInterestBearing: debtNIB,
      customerDeposits: deposits, minorityInterests: minorities, asOf: d.asOf,
    },
    basis: 'Measured from the investee\'s market data and balance sheet',
    reference: REF_EVIC,
    assumptions,
  });
}

/**
 * Total company equity plus debt, for a bond to a private company.
 *
 * @param {Object} d
 * @param {number} [d.totalEquity]
 * @param {number} [d.totalDebt]
 * @param {number} [d.totalAssets]   the fn 44 fallback when equity or debt is unavailable
 * @param {string} d.asOf
 * @param {string} d.currency
 */
function equityPlusDebt(d = {}) {
  const assumptions = [];
  if (!d.asOf) throw refuse('ED_DATE_REQUIRED', `State the balance-sheet date the figures are taken at (${refs.numeratorPage}).`);

  let equity = num(d.totalEquity);
  const debt = num(d.totalDebt);
  const assets = num(d.totalAssets);

  if (equity === undefined || debt === undefined) {
    /* The permitted fallback. It is recorded as one so the report can
       say the denominator is the balance sheet, not equity plus debt. */
    if (!(assets > 0)) {
      throw refuse('ED_INPUTS_REQUIRED',
        `Total equity and total debt from the balance sheet are required for a private company `
        + `(${refs.evicPage}). Where they cannot be obtained, footnote ${fn.fallback} permits the total balance `
        + 'sheet (total assets) as the denominator — supply totalAssets.');
    }
    assumptions.push('Total equity or total debt could not be obtained; the total balance sheet (total '
      + `assets) is used as the denominator under footnote ${fn.fallback}, with the intention of improving this `
      + 'data in future.');
    return traced({
      value: +assets.toFixed(2),
      unit: d.currency || null,
      equation: 'denominator = total balance sheet (total equity + liabilities = total assets)',
      inputs: { totalAssets: assets, asOf: d.asOf },
      basis: `Balance-sheet fallback (footnote ${fn.fallback})`,
      reference: REF_ED,
      assumptions,
    });
  }

  if (!(debt >= 0)) throw refuse('ED_DEBT_NEGATIVE', 'Total debt cannot be negative.');

  /* Negative equity attributes everything to debt. The rule is the
     standard's own and is carried as an assumption, not hidden as a clamp. */
  if (equity < 0) {
    assumptions.push(`Total equity on the balance sheet is negative (${equity}); set to 0 under footnote ${fn.negativeEquity}, `
      + 'so all emissions are attributed to debt providers and none to equity.');
    equity = 0;
  }

  const value = equity + debt;
  if (!(value > 0)) {
    throw refuse('ED_ZERO',
      'Total equity plus debt comes to zero, so no attribution is possible. Check the balance-sheet inputs.');
  }

  return traced({
    value: +value.toFixed(2),
    unit: d.currency || null,
    equation: 'denominator = total company equity + total debt',
    inputs: { totalEquity: equity, totalDebt: debt, asOf: d.asOf },
    basis: 'Measured from the investee\'s balance sheet',
    reference: REF_ED,
    assumptions,
  });
}

/** Resolve whichever denominator the classifier asked for. */
function denominator(kind, d) {
  if (kind === 'evic') return evic(d);
  if (kind === 'equity-plus-debt') return equityPlusDebt(d);
  throw refuse('DENOMINATOR_KIND_UNKNOWN', `No denominator rule for "${kind}".`);
}

  return { evic, equityPlusDebt, denominator };
}

module.exports = { build };
