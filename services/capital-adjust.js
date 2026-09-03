/**
 * CarbonIQ FinTech — adjusting the book without recording it
 *
 * The dashboard could already be asked different *questions* — a different
 * carbon weighting, a different attribution basis, a longer horizon. What it
 * could not be asked was a different *book*: change an allocation, price a
 * pipeline project differently, add a payment, and there was nowhere for that
 * to go except the store — which on a serverless runtime with no Firebase
 * refuses the write with a 503, correctly and unhelpfully.
 *
 * So an adjustment is neither a question nor a record. It is a third thing: a
 * set of changed values held by one reader, applied over the book on the way
 * into the engine and never written down. That makes the whole dashboard
 * adjustable on a deployment that can persist nothing, which is the deployment
 * this is demonstrated on.
 *
 * ── Three rules ────────────────────────────────────────────────────────────
 *
 * **The engine still does every calculation.** The overlay changes inputs and
 * nothing else; every figure on the screen is derived server-side from the
 * adjusted book by the same functions that derive it from the recorded one.
 * A browser that recomputed a total would be a second implementation of it.
 *
 * **An adjusted figure is never presented as a recorded one.** The result is
 * marked, the count of what was changed traves with it, and the screen says so.
 * This project has already had one failure of exactly that kind, where six
 * fields were filled from a demo constant beside a real headline.
 *
 * **An overlay can only change what already exists.** It cannot invent a
 * portfolio or an investment — an id that matches nothing is reported back
 * rather than silently creating a record, because a demonstration that quietly
 * grows rows is a demonstration nobody can check against the file.
 *
 * The one exception is payments, which are *added* rather than edited: a
 * payment is an event, and the honest way to model "what if we drew another
 * $20M" is another event, not an altered one.
 */

'use strict';

/** Fields an overlay may change, by entity. Anything else is ignored. */
const PORTFOLIO_FIELDS = ['allocatedBudget', 'pledged', 'name', 'currency'];
const INVESTMENT_FIELDS = [
  'name', 'sector', 'status', 'commitment', 'projectCost', 'expectedReturnPct',
  'tenorYears', 'startYear', 'phasing', 'taxonomy', 'country',
];
const EMISSION_FIELDS = ['incurred_tCO2e', 'forward_tCO2e', 'reduction_tCO2e', 'avoided_tCO2e'];

/* Absence is checked before the number is. `Number(null)` is 0 and 0 is
   finite, which has caused three separate defects in this book already — a
   cleared field means "no value", never "zero". */
const numOrNull = (v) =>
  (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Apply an overlay to a book, returning a new book. The input is never mutated.
 *
 * @param {object} book
 * @param {object} overlay
 *   `{ portfolios: {id: {field: value}}, investments: {id: {field: value, emissions: {...}}},
 *      payments: [ {investmentId, amount, kind, date} ] }`
 * @returns {{book: object, changed: number, unknownIds: string[], addedPayments: number}}
 */
function applyOverlay(book, overlay = {}) {
  const pf = overlay.portfolios || {};
  const inv = overlay.investments || {};
  const added = Array.isArray(overlay.payments) ? overlay.payments : [];

  let changed = 0;
  const unknownIds = [];

  const portfolios = book.portfolios.map((p) => {
    const edit = pf[p.id];
    if (!edit) return { ...p };
    const next = { ...p };
    for (const field of PORTFOLIO_FIELDS) {
      if (!(field in edit)) continue;
      const value = field === 'name' || field === 'currency'
        ? String(edit[field] ?? '')
        : numOrNull(edit[field]);
      if (value === null && field !== 'name' && field !== 'currency') continue;
      if (next[field] !== value) changed += 1;
      next[field] = value;
    }
    return next;
  });
  for (const id of Object.keys(pf)) {
    if (!book.portfolios.some(p => p.id === id)) unknownIds.push(id);
  }

  const investments = book.investments.map((i) => {
    const edit = inv[i.id];
    if (!edit) return { ...i, emissions: { ...(i.emissions || {}) } };
    const next = { ...i, emissions: { ...(i.emissions || {}) } };
    for (const field of INVESTMENT_FIELDS) {
      if (!(field in edit)) continue;
      const isText = ['name', 'sector', 'status', 'phasing', 'taxonomy', 'country'].includes(field);
      const value = isText ? String(edit[field] ?? '') : numOrNull(edit[field]);
      if (next[field] !== value) changed += 1;
      next[field] = value;
    }
    const em = edit.emissions || {};
    for (const field of EMISSION_FIELDS) {
      if (!(field in em)) continue;
      const value = numOrNull(em[field]);
      if (value === null) continue;
      if (next.emissions[field] !== value) changed += 1;
      next.emissions[field] = value;
    }
    return next;
  });
  for (const id of Object.keys(inv)) {
    if (!book.investments.some(i => i.id === id)) unknownIds.push(id);
  }

  /* Added payments carry a synthetic id so they can be told apart from the
     recorded ones, and are dropped if they name an investment that is not in
     the book — a payment against nothing would move the balance without ever
     appearing against a project. */
  const validAdded = added
    .filter(p => investments.some(i => i.id === p.investmentId))
    .map((p, k) => ({
      id: `adj_pay_${k}`,
      investmentId: p.investmentId,
      portfolioId: (investments.find(i => i.id === p.investmentId) || {}).portfolioId,
      kind: ['disbursement', 'repayment', 'fee'].includes(p.kind) ? p.kind : 'disbursement',
      amount: numOrNull(p.amount) || 0,
      date: p.date || new Date().toISOString().slice(0, 10),
      adjusted: true,
    }));
  for (const p of added) {
    if (!investments.some(i => i.id === p.investmentId)) unknownIds.push(String(p.investmentId));
  }

  return {
    book: {
      ...book,
      portfolios,
      investments,
      payments: [...book.payments.map(p => ({ ...p })), ...validAdded],
    },
    changed: changed + validAdded.length,
    addedPayments: validAdded.length,
    unknownIds: [...new Set(unknownIds)],
  };
}

const ADJUSTED_NOTE =
  'These figures include adjustments you made on this screen. They are held in '
  + 'this browser only, nothing has been recorded, and every figure is still '
  + 'computed by the engine from the adjusted book. Reset returns the screen to '
  + 'the book as it stands.';

module.exports = {
  applyOverlay, ADJUSTED_NOTE,
  PORTFOLIO_FIELDS, INVESTMENT_FIELDS, EMISSION_FIELDS,
};
