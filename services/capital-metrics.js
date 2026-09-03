/**
 * CarbonIQ FinTech — What the capital book adds up to
 *
 * Pure, deterministic, and given the book rather than reading it, so every
 * figure on the dashboard can be reproduced from a fixture.
 *
 * ── Three separations this file exists to hold ──────────────────────────────
 *
 * **Money committed is not money paid.** A commitment is a promise; a payment
 * is a movement. Reporting one as the other overstates deployment, which is
 * the number a treasury function is judged on. Balance is allocated less
 * *paid*, and undrawn commitment is reported beside it as its own line,
 * because a portfolio with its budget committed and nothing disbursed is in a
 * completely different position from one with the money out of the door.
 *
 * **Emissions incurred are not emissions projected.** One is history, the
 * other is a forecast over the remaining term that will be wrong by some
 * margin. They are never summed into a single figure, and the projection is
 * labelled as one wherever it appears.
 *
 * **Reduction and avoidance are not deductions.** PCAF reports avoided
 * emissions separately from the scope 1/2/3 inventory and never nets them
 * against it (Part A, p.126). A reduction is a movement against a project's
 * own base year; an avoidance is against a counterfactual that never
 * happened. Neither is subtracted from anything here, and a test asserts it.
 *
 * ── The ranking ────────────────────────────────────────────────────────────
 *
 * A pipeline is not ranked by carbon alone, because a lender is not investing
 * for carbon alone. Two scores are computed — carbon impact per unit of
 * capital, and expected financial return — each normalised across the pipeline
 * so they are comparable, and combined under a weight the reader sets. The
 * weight travels with the result: a composite score whose basis is hidden is
 * a number nobody can argue with, which is the opposite of useful.
 *
 * A project that cannot be scored is excluded from the ranking and counted in
 * `unrankable`, never given a zero. Zero is a claim about impact; absent is a
 * claim about evidence.
 */

'use strict';

const { DEPLOYING_STATUSES } = require('./capital-book');

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};
const sum = (rows, pick) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);

// ---------------------------------------------------------------------------
// Capital
// ---------------------------------------------------------------------------

/**
 * Where the money stands.
 *
 * `paid` is net of repayments, because a revolving facility that has been
 * drawn and repaid has not consumed the budget. Fees are counted as paid but
 * are not a drawdown of commitment, so they are reported on their own line
 * rather than folded into either.
 */
function capitalPosition(book) {
  const allocated = sum(book.portfolios, p => p.allocatedBudget);

  const deploying = book.investments.filter(i => DEPLOYING_STATUSES.includes(i.status));
  const committed = sum(deploying, i => i.commitment);

  const disbursed  = sum(book.payments.filter(p => p.kind === 'disbursement'), p => p.amount);
  const repaid     = sum(book.payments.filter(p => p.kind === 'repayment'),    p => p.amount);
  const fees       = sum(book.payments.filter(p => p.kind === 'fee'),          p => p.amount);
  const paid       = disbursed - repaid;

  const balance = allocated - paid;

  return {
    currency: (book.portfolios[0] && book.portfolios[0].currency) || 'USD',
    portfolios: book.portfolios.length,

    allocated: round(allocated),
    committed: round(committed),
    disbursed: round(disbursed),
    repaid: round(repaid),
    fees: round(fees),
    paid: round(paid),
    balance: round(balance),

    /* Committed but not yet out of the door. A budget can be fully committed
       and barely deployed, and the two say different things about a book. */
    undrawnCommitment: round(Math.max(0, committed - paid)),
    uncommitted: round(allocated - committed),

    deploymentPct: allocated > 0 ? round((paid / allocated) * 100, 1) : null,
    commitmentPct: allocated > 0 ? round((committed / allocated) * 100, 1) : null,

    /* Over-deployment is reported, not clamped. A balance that cannot go
       negative cannot tell you that you are over your allocation. */
    overDeployed: paid > allocated,
    note: allocated === 0
      ? 'No budget has been allocated to any portfolio, so there is nothing to draw against and no balance to report.'
      : null,
  };
}

// ---------------------------------------------------------------------------
// Emissions
// ---------------------------------------------------------------------------

/**
 * The four lines, each on its own.
 *
 * `incurred` and `forward` are both inventory — attributed financed emissions
 * — but one is measured and one is projected, so they are reported separately
 * and their sum is offered only as `lifetimeInventory`, explicitly named as
 * part measurement and part forecast.
 *
 * `reduction` and `avoided` sit outside the inventory entirely and are never
 * subtracted from it.
 */
function emissionsLedger(book) {
  const held = book.investments.filter(i => DEPLOYING_STATUSES.includes(i.status));
  const e = (i) => i.emissions || {};

  const incurred  = sum(held, i => e(i).incurred_tCO2e);
  const forward   = sum(held, i => e(i).forward_tCO2e);
  const reduction = sum(held, i => e(i).reduction_tCO2e);
  const avoided   = sum(held, i => e(i).avoided_tCO2e);

  const scored = held.filter(i => e(i).dataQuality && Number.isFinite(e(i).dataQuality.score));
  const weightBase = sum(scored, i => Math.abs(Number(i.commitment) || 0));
  const weighted = weightBase > 0
    ? sum(scored, i => (Math.abs(Number(i.commitment) || 0)) * e(i).dataQuality.score) / weightBase
    : null;

  return {
    unit: 'tCO2e',
    investmentsCounted: held.length,

    incurred: round(incurred),
    forward: round(forward),
    lifetimeInventory: round(incurred + forward),

    reduction: round(reduction),
    avoided: round(avoided),

    /* Said in the payload as well as on the screen, because a client asked to
       accept these figures will read one of the two. */
    inventoryNote: 'Emissions already incurred are measured; forward emissions are a projection over the remaining term. The two are reported separately and their sum is part measurement, part forecast.',
    creditNote: 'Reduction and avoided emissions are reported separately from the inventory and are never netted against it. Reduction is measured against a project\'s own base year; avoidance is against a counterfactual that did not happen (PCAF Part A, p.126).',

    dataQuality: {
      weighted: weighted == null ? null : round(weighted),
      basis: 'Outstanding-amount weighted, per PCAF Part A p.128. A lower score is better.',
      scale: 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest.',
      investmentsScored: scored.length,
      investmentsWithoutScore: held.length - scored.length,
      note: held.length && !scored.length
        ? 'No investment in the book carries a data-quality score, so none is reported. An unscored holding is excluded from the weighting rather than counted as zero.'
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Portfolio rows
// ---------------------------------------------------------------------------

/** Per portfolio, so a reader can see which book carries what. */
function portfolioRows(book) {
  return book.portfolios.map((p) => {
    const mine = book.investments.filter(i => i.portfolioId === p.id);
    const held = mine.filter(i => DEPLOYING_STATUSES.includes(i.status));
    const pays = book.payments.filter(x => x.portfolioId === p.id);

    const disbursed = sum(pays.filter(x => x.kind === 'disbursement'), x => x.amount);
    const repaid    = sum(pays.filter(x => x.kind === 'repayment'),    x => x.amount);
    const paid      = disbursed - repaid;
    const committed = sum(held, i => i.commitment);
    const allocated = Number(p.allocatedBudget) || 0;

    const incurred = sum(held, i => (i.emissions || {}).incurred_tCO2e);
    const forward  = sum(held, i => (i.emissions || {}).forward_tCO2e);

    return {
      id: p.id,
      name: p.name,
      currency: p.currency,
      vintage: p.vintage,
      mandate: p.mandate,
      allocated: round(allocated),
      committed: round(committed),
      paid: round(paid),
      balance: round(allocated - paid),
      investments: mine.length,
      held: held.length,
      pipeline: mine.filter(i => i.status === 'pipeline').length,
      incurred_tCO2e: round(incurred),
      forward_tCO2e: round(forward),
      reduction_tCO2e: round(sum(held, i => (i.emissions || {}).reduction_tCO2e)),
      avoided_tCO2e: round(sum(held, i => (i.emissions || {}).avoided_tCO2e)),
      /* Emissions per unit deployed. The comparable measure across books of
         different sizes — a total says only that one book is bigger. */
      intensity_tCO2e_perMillion: paid > 0 ? round((incurred / (paid / 1e6)), 1) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// The pipeline, and how to choose from it
// ---------------------------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Min-max across the candidates, so two quantities in different units can be
 * compared. Where every candidate is equal the spread is zero and normalising
 * would divide by it — they all score 0.5, which is the honest answer: this
 * measure does not separate them.
 */
function _normalise(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return values.map(() => null);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (hi === lo) return values.map(v => (Number.isFinite(v) ? 0.5 : null));
  return values.map(v => (Number.isFinite(v) ? clamp01((v - lo) / (hi - lo)) : null));
}

/**
 * Rank what is waiting.
 *
 * @param {object} book
 * @param {number} carbonWeight 0..1 — 1 ranks on carbon alone, 0 on return
 *   alone, 0.5 weighs them equally. Whatever is passed is echoed in the
 *   result and printed beside the rank on screen.
 */
function pipeline(book, { carbonWeight = 0.5 } = {}) {
  const w = clamp01(Number.isFinite(Number(carbonWeight)) ? Number(carbonWeight) : 0.5);
  const waiting = book.investments.filter(i => i.status === 'pipeline');

  /* Carbon impact per unit of capital, so a large project does not outrank a
     more efficient one simply by being large. Reduction and avoidance are
     added here because both are impact a lender can claim to have helped
     bring about — but this is a selection score, not an inventory figure, and
     nothing derived from it reaches the emissions ledger. */
  const impactPerMillion = waiting.map((i) => {
    const e = i.emissions || {};
    const capital = Number(i.commitment) || 0;
    const benefit = (Number(e.reduction_tCO2e) || 0) + (Number(e.avoided_tCO2e) || 0);
    if (capital <= 0) return NaN;
    return benefit / (capital / 1e6);
  });

  const returns = waiting.map(i =>
    (i.expectedReturnPct === null || i.expectedReturnPct === undefined)
      ? NaN
      : Number(i.expectedReturnPct));

  const nImpact = _normalise(impactPerMillion);
  const nReturn = _normalise(returns);

  const rows = waiting.map((i, k) => {
    const e = i.emissions || {};
    const scorable = nImpact[k] !== null && nReturn[k] !== null;
    const missing = [];
    if (nImpact[k] === null) missing.push('carbon impact per unit of capital');
    if (nReturn[k] === null) missing.push('expected return');

    return {
      id: i.id,
      name: i.name,
      portfolioId: i.portfolioId,
      sector: i.sector,
      assetType: i.assetType,
      country: i.country,
      taxonomy: i.taxonomy,
      commitment: round(Number(i.commitment) || 0),
      expectedReturnPct: i.expectedReturnPct === null || i.expectedReturnPct === undefined
        ? null : round(Number(i.expectedReturnPct), 2),
      tenorYears: i.tenorYears ?? null,

      /* What this one would add to the book if it were written. Named as a
         contribution, because until it is committed it is not in any total. */
      financedEmissionContribution_tCO2e: round(
        (Number(e.incurred_tCO2e) || 0) + (Number(e.forward_tCO2e) || 0)),
      reduction_tCO2e: round(Number(e.reduction_tCO2e) || 0),
      avoided_tCO2e: round(Number(e.avoided_tCO2e) || 0),
      impact_tCO2e_perMillion: Number.isFinite(impactPerMillion[k])
        ? round(impactPerMillion[k], 1) : null,

      carbonScore: nImpact[k] === null ? null : round(nImpact[k], 3),
      financeScore: nReturn[k] === null ? null : round(nReturn[k], 3),
      score: scorable ? round(w * nImpact[k] + (1 - w) * nReturn[k], 3) : null,
      rankable: scorable,
      missing,
      dataQuality: e.dataQuality || null,
    };
  });

  const ranked = rows.filter(r => r.rankable).sort((a, b) => b.score - a.score);
  ranked.forEach((r, idx) => { r.rank = idx + 1; });
  const unrankable = rows.filter(r => !r.rankable);

  return {
    carbonWeight: round(w, 2),
    weightingNote: `Ranked on ${Math.round(w * 100)}% carbon impact and `
      + `${Math.round((1 - w) * 100)}% expected return. Both are min-max normalised across the `
      + `${rows.length} project${rows.length === 1 ? '' : 's'} waiting, so the scores compare `
      + `these candidates with each other and mean nothing on their own.`,
    count: rows.length,
    totalRequested: round(sum(rows, r => r.commitment)),
    totalContribution_tCO2e: round(sum(rows, r => r.financedEmissionContribution_tCO2e)),
    ranked,
    unrankable,
    unrankableNote: unrankable.length
      ? `${unrankable.length} project${unrankable.length === 1 ? ' is' : 's are'} not ranked because `
        + `something needed to score ${unrankable.length === 1 ? 'it' : 'them'} is missing. `
        + `They are listed unscored rather than placed last, because absent evidence is not low impact.`
      : null,
    byType: _byType(rows),
  };
}

/** What kind of thing is waiting, and how much it would cost to write. */
function _byType(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.sector || 'Unclassified';
    const cur = map.get(key) || { sector: key, count: 0, commitment: 0, contribution_tCO2e: 0 };
    cur.count += 1;
    cur.commitment += r.commitment;
    cur.contribution_tCO2e += r.financedEmissionContribution_tCO2e;
    map.set(key, cur);
  }
  return [...map.values()]
    .map(r => ({ ...r, commitment: round(r.commitment), contribution_tCO2e: round(r.contribution_tCO2e) }))
    .sort((a, b) => b.commitment - a.commitment);
}

// ---------------------------------------------------------------------------

/**
 * Everything the dashboard renders, from one read of the book.
 */
function dashboard(book, { carbonWeight = 0.5 } = {}) {
  const empty = !book.portfolios.length && !book.investments.length;
  return {
    generatedAt: new Date().toISOString(),
    empty,
    emptyNote: empty
      ? 'No portfolio has been recorded, so there is nothing to report. That is not a position of zero — it is a book that has not been entered yet.'
      : null,
    capital: capitalPosition(book),
    emissions: emissionsLedger(book),
    portfolios: portfolioRows(book),
    pipeline: pipeline(book, { carbonWeight }),
    storage: book.storage || null,
  };
}

module.exports = {
  capitalPosition, emissionsLedger, portfolioRows, pipeline, dashboard,
  _normalise,
};
