/**
 * CarbonIQ FinTech — The capital book
 *
 * What a lender actually holds: portfolios carrying an allocated budget,
 * investments drawn against them, and the payments that moved the money.
 *
 * Three rules shape this file.
 *
 * **Balance is derived, never stored.** Allocated less deployed is arithmetic
 * over the payment log. Held as a field it would drift from the payments the
 * moment one was corrected, and the drift is invisible exactly where it
 * matters — in front of a credit committee. Every figure the dashboard shows
 * is computed from the records here, so a payment entered wrongly is a payment
 * that can be corrected rather than a total that has to be reconciled.
 *
 * **A projection is not a measurement.** An investment carries emissions that
 * have already been incurred and emissions expected over the rest of its term.
 * They are separate fields with separate labels, and nothing ever adds them
 * into a single "emissions" number, because one is history and the other is a
 * forecast that will be wrong.
 *
 * **Reduction and avoidance are not inventory.** PCAF reports avoided
 * emissions separately from the scope 1/2/3 inventory and never nets them
 * against it (Part A, p.126). Reduction is measured against a project's own
 * base year; avoidance is against a counterfactual that never happened. This
 * store keeps all four apart and the roll-up refuses to subtract any of them
 * from the emissions figure.
 *
 * Storage is the same layer Part C uses — Firebase where configured, an
 * in-process fallback for a laptop, and a refusal rather than a silent loss in
 * a serverless runtime with neither.
 */

'use strict';

const store = require('./partc-store');
const { randomUUID } = require('crypto');

const C_PORTFOLIO  = 'capital_portfolios';
const C_INVESTMENT = 'capital_investments';
const C_PAYMENT    = 'capital_payments';

/** Where an investment has got to. Only `pipeline` is ranked for selection. */
const STATUSES = ['pipeline', 'committed', 'deployed', 'exited', 'declined'];

/** Money has left the institution for these; the others are intentions. */
const DEPLOYING_STATUSES = ['committed', 'deployed', 'exited'];

const PAYMENT_KINDS = ['disbursement', 'repayment', 'fee'];

const now = () => new Date().toISOString();
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * A number, or absent — and `null` is absent.
 *
 * `Number(null)` is 0, so routing a nullable field through num() silently
 * turned "not yet priced" into "prices at zero percent". A pipeline project
 * with no return agreed then scored as the worst possible return and was
 * ranked on it, instead of being held out of the ranking as unscoreable. Zero
 * is a claim about the number; null is a claim about the evidence.
 */
const numOrNull = (v) =>
  (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------------------
// Portfolios
// ---------------------------------------------------------------------------

async function listPortfolios(orgId) {
  const rows = await store.list(C_PORTFOLIO, orgId, { limit: 200 });
  return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function getPortfolio(orgId, id) {
  return store.get(C_PORTFOLIO, orgId, id);
}

async function createPortfolio(orgId, input) {
  const id = input.id || `pf_${randomUUID().slice(0, 8)}`;
  const record = {
    id,
    name: input.name,
    currency: input.currency || 'USD',
    mandate: input.mandate || '',
    vintage: input.vintage || null,
    allocatedBudget: num(input.allocatedBudget),
    /* Promised for future deployment, not yet committed to a named project.
       It sits between the allocated budget and the committed book. */
    pledged: num(input.pledged),
    createdAt: now(),
    updatedAt: now(),
  };
  await store.put(C_PORTFOLIO, orgId, id, record);
  return record;
}

async function updatePortfolio(orgId, id, updates) {
  const clean = {};
  for (const k of ['name', 'currency', 'mandate', 'vintage']) {
    if (updates[k] !== undefined) clean[k] = updates[k];
  }
  if (updates.allocatedBudget !== undefined) clean.allocatedBudget = num(updates.allocatedBudget);
  if (updates.pledged !== undefined) clean.pledged = num(updates.pledged);
  return store.patch(C_PORTFOLIO, orgId, id, clean);
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------

/**
 * The four emission lines, kept apart on purpose.
 *
 * `incurred`  — attributed emissions that have already happened.
 * `forward`   — attributed emissions expected over the remaining term. A
 *               projection, and labelled as one wherever it is shown.
 * `reduction` — achieved against the project's own base year.
 * `avoided`   — against a counterfactual. Reported separately, never netted.
 */
function _emissions(e = {}) {
  return {
    incurred_tCO2e:  num(e.incurred_tCO2e),
    forward_tCO2e:   num(e.forward_tCO2e),
    reduction_tCO2e: num(e.reduction_tCO2e),
    avoided_tCO2e:   num(e.avoided_tCO2e),
    basis: e.basis || null,
    dataQuality: e.dataQuality && e.dataQuality.score !== null && Number.isFinite(Number(e.dataQuality.score))
      ? { score: Number(e.dataQuality.score), option: e.dataQuality.option || null }
      : null,
  };
}

async function listInvestments(orgId, { portfolioId, status } = {}) {
  const rows = await store.list(C_INVESTMENT, orgId, { limit: 500 });
  return rows.filter(r =>
    (!portfolioId || r.portfolioId === portfolioId) &&
    (!status || r.status === status));
}

async function getInvestment(orgId, id) {
  return store.get(C_INVESTMENT, orgId, id);
}

async function createInvestment(orgId, input) {
  const id = input.id || `inv_${randomUUID().slice(0, 8)}`;
  const record = {
    id,
    portfolioId: input.portfolioId,
    name: input.name,
    sector: input.sector || 'Unclassified',
    assetType: input.assetType || null,
    country: input.country || null,
    status: STATUSES.includes(input.status) ? input.status : 'pipeline',
    /* The time axis. Without a start year and a shape, everything ahead is a
       lump with no years attached and no curve can be drawn from it. */
    startYear: numOrNull(input.startYear),
    phasing: input.phasing || null,
    commitment: num(input.commitment),
    projectCost: num(input.projectCost),
    expectedReturnPct: numOrNull(input.expectedReturnPct),
    tenorYears: numOrNull(input.tenorYears),
    taxonomy: input.taxonomy || null,
    emissions: _emissions(input.emissions),
    notes: input.notes || '',
    createdAt: now(),
    updatedAt: now(),
  };
  await store.put(C_INVESTMENT, orgId, id, record);
  return record;
}

async function updateInvestment(orgId, id, updates) {
  const clean = {};
  for (const k of ['name', 'sector', 'assetType', 'country', 'taxonomy', 'notes', 'portfolioId', 'phasing']) {
    if (updates[k] !== undefined) clean[k] = updates[k];
  }
  if (updates.startYear !== undefined) clean.startYear = numOrNull(updates.startYear);
  for (const k of ['commitment', 'projectCost']) {
    if (updates[k] !== undefined) clean[k] = num(updates[k]);
  }
  for (const k of ['expectedReturnPct', 'tenorYears']) {
    if (updates[k] !== undefined) clean[k] = numOrNull(updates[k]);
  }
  if (updates.status !== undefined) {
    if (!STATUSES.includes(updates.status)) {
      const err = new Error(`Unknown status "${updates.status}". One of: ${STATUSES.join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }
    clean.status = updates.status;
  }
  if (updates.emissions !== undefined) clean.emissions = _emissions(updates.emissions);
  return store.patch(C_INVESTMENT, orgId, id, clean);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * A movement of money against one investment.
 *
 * Kept as a log rather than a running balance so a correction is a new entry
 * or an amended one, and the total is always the sum of what is on record —
 * there is no second number to reconcile it against.
 */
async function listPayments(orgId, { portfolioId, investmentId } = {}) {
  const rows = await store.list(C_PAYMENT, orgId, { limit: 1000 });
  return rows
    .filter(r =>
      (!portfolioId || r.portfolioId === portfolioId) &&
      (!investmentId || r.investmentId === investmentId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function createPayment(orgId, input) {
  const investment = await getInvestment(orgId, input.investmentId);
  if (!investment) {
    const err = new Error(`No investment ${input.investmentId} in this book. A payment has to be against something.`);
    err.statusCode = 404;
    throw err;
  }

  const kind = PAYMENT_KINDS.includes(input.kind) ? input.kind : 'disbursement';
  const id = input.id || `pay_${randomUUID().slice(0, 8)}`;
  const record = {
    id,
    portfolioId: input.portfolioId || investment.portfolioId,
    investmentId: input.investmentId,
    kind,
    amount: Math.abs(num(input.amount)),
    date: input.date || now().slice(0, 10),
    reference: input.reference || '',
    createdAt: now(),
  };
  await store.put(C_PAYMENT, orgId, id, record);
  return record;
}

async function deletePayment(orgId, id) {
  await store.remove(C_PAYMENT, orgId, id);
}

/**
 * Everything the metrics engine needs, read once.
 *
 * The dashboard is a single view over three collections; fetching them
 * together keeps it from rendering a set of investments against a stale
 * payment log.
 */
async function readBook(orgId, { portfolioId } = {}) {
  const [portfolios, investments, payments] = await Promise.all([
    listPortfolios(orgId),
    listInvestments(orgId, { portfolioId }),
    listPayments(orgId, { portfolioId }),
  ]);
  return {
    portfolios: portfolioId ? portfolios.filter(p => p.id === portfolioId) : portfolios,
    investments,
    payments,
    storage: store.capability(),
    readAt: now(),
  };
}

module.exports = {
  listPortfolios, getPortfolio, createPortfolio, updatePortfolio,
  listInvestments, getInvestment, createInvestment, updateInvestment,
  listPayments, createPayment, deletePayment,
  readBook,
  STATUSES, DEPLOYING_STATUSES, PAYMENT_KINDS,
  _collections: { C_PORTFOLIO, C_INVESTMENT, C_PAYMENT },
};
