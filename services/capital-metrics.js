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
const forecast = require('./capital-forecast');
const attribution = require('./capital-attribution');

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
function emissionsLedger(book, { attributionBasis = 'outstanding' } = {}) {
  const held = book.investments.filter(i => DEPLOYING_STATUSES.includes(i.status));
  const e = (i) => i.emissions || {};
  const basis = attribution.BASES.includes(attributionBasis) ? attributionBasis : 'outstanding';
  const payments = book.payments || [];

  const split = held.map(i => attribution.splitEmissions(i, payments, basis));
  const pick = (key, part) => split.reduce((t, s) => t + s[key][part], 0);

  const incurred  = pick('incurred', 'attributed');
  const forward   = pick('forward', 'attributed');
  const reduction = pick('reduction', 'attributed');
  const avoided   = pick('avoided', 'attributed');

  /* What the drawdown has not reached yet. Not lost — it arrives as the money
     does, and it is the answer to what the position is worth against the
     payments still to be made. */
  const pending = {
    incurred:  round(pick('incurred', 'pending')),
    forward:   round(pick('forward', 'pending')),
    reduction: round(pick('reduction', 'pending')),
    avoided:   round(pick('avoided', 'pending')),
  };
  const atFullCommitment = {
    incurred: round(pick('incurred', 'full')),
    forward:  round(pick('forward', 'full')),
  };

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

    attributionBasis: basis,
    attributionNote: basis === 'outstanding'
      ? 'Attributed on the outstanding amount, per PCAF Part A. Undrawn commitment is carried on '
        + 'the pending line.'
      : 'Attributed at full commitment. Conservative; this is not the PCAF Part A attribution '
        + 'factor and requires a note if disclosed.',
    pending,
    pendingNote: 'Emissions attributable as the undrawn commitment is drawn. Not included in '
      + 'the figures above.',
    atFullCommitment,

    /* Said in the payload as well as on the screen, because a client asked to
       accept these figures will read one of the two. */
    inventoryNote: 'Incurred emissions are measured. Forward emissions are a projection over the remaining term. The two are reported separately.',
    creditNote: 'Reduction and avoided emissions are reported separately from the inventory and are not deducted from it (PCAF Part A, p.126). Reduction is measured against each project\'s base year; avoidance against a counterfactual.',

    dataQuality: {
      weighted: weighted == null ? null : round(weighted),
      basis: 'Outstanding-amount weighted, per PCAF Part A p.128. A lower score indicates higher data quality.',
      scale: 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest.',
      investmentsScored: scored.length,
      investmentsWithoutScore: held.length - scored.length,
      note: held.length && !scored.length
        ? 'No holding carries a data-quality score. Unscored holdings are excluded from the weighting.'
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// What an anchor opens the screen to see
// ---------------------------------------------------------------------------

/**
 * The five questions an anchor investor actually arrives with, answered in the
 * order he asks them and each labelled by what kind of statement it is.
 *
 * Two of the five are not measurements and must never look like one. What the
 * book will emit over the rest of its term is a projection. What a pledge will
 * emit is not even that — there is nothing named to attach emissions to yet,
 * so the honest answer is the money and an explicit absence, not a number
 * derived from an average.
 *
 * The third figure is the one worth reading twice. "What is my position worth
 * against the payments still to be made" splits into money still to go out and
 * the emissions that arrive with it. Booking those emissions today would
 * overstate the inventory; ignoring them would understate the commitment. They
 * are their own line.
 */
function anchorPosition(book, { attributionBasis = 'outstanding' } = {}) {
  const cap = capitalPosition(book);
  const led = emissionsLedger(book, { attributionBasis });
  const pipe = pipeline(book, { carbonWeight: 0.5 });

  const pledged = sum(book.portfolios, p => p.pledged);

  return {
    currency: cap.currency,
    attributionBasis: led.attributionBasis,

    /* 1 — over the whole life of what is held. Part measured, part forecast,
       and the two halves are carried separately so nobody has to trust the
       sum. */
    totalOverLife: {
      value: round(led.incurred + led.forward),
      measured: led.incurred,
      projected: led.forward,
      kind: 'part-measured',
      note: 'Attributed emissions over the life of the holdings: what has already been incurred '
        + 'plus what is projected over the remaining term. The two halves are given separately '
        + 'because only the first is a measurement.',
    },

    /* 2 — the only figure here that is a measurement. */
    current: {
      value: led.incurred,
      kind: 'measured',
      note: 'Attributed to this book to date. The one figure on this screen that is a measurement '
        + 'rather than a projection.',
    },

    /* 3 — the position against payments still to be made. */
    pending: {
      capital: cap.undrawnCommitment,
      emissionsOnDrawdown: round(led.pending.incurred + led.pending.forward),
      incurredWaiting: led.pending.incurred,
      forwardWaiting: led.pending.forward,
      kind: 'committed-not-drawn',
      note: `${cap.undrawnCommitment > 0 ? 'Committed and not yet drawn' : 'Nothing is committed and undrawn'}. `
        + 'The emissions beside it are not in the figures above: they are attributed as the money '
        + 'goes out. Booking them today would overstate the inventory; leaving them out entirely '
        + 'would understate the commitment.',
    },

    /* 4 — pledged. Money promised for deployment that is not yet committed to
       anything named, so its emissions are absent rather than estimated. */
    pledged: {
      capital: round(pledged),
      emissions: null,
      kind: pledged > 0 ? 'declared' : 'none',
      note: pledged > 0
        ? 'Pledged for future deployment and not yet committed to a named project. No emissions are '
          + 'reported against it: there is nothing to attribute them to, and a figure derived from '
          + 'the book average would be an invention dressed as a forecast.'
        : 'Nothing has been pledged beyond what is already committed.',
    },

    /* 5 — what the queue would add. Nothing here is in any total until it is
       written. */
    pipelineWouldAdd: {
      projects: pipe.count,
      capitalNeeded: pipe.totalRequested,
      emissions: pipe.totalContribution_tCO2e,
      reduction: round(sum(pipe.ranked.concat(pipe.unrankable), r => r.reduction_tCO2e)),
      avoided: round(sum(pipe.ranked.concat(pipe.unrankable), r => r.avoided_tCO2e)),
      kind: 'not-yet-decided',
      note: 'What the queue would add to this book if every project in it were written. None of it '
        + 'is in any figure above, because none of it has been decided.',
    },

    kindsNote: 'Measured means computed from what is on record. Part-measured means half of it is '
      + 'a projection. Declared means only the reporting entity can know it. Absent means the '
      + 'standard asks for it and it is not available — never a zero standing in for it.',
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
function dashboard(book, {
  carbonWeight = 0.5,
  attributionBasis = 'outstanding',
  horizonYears = null,
  gridDeclinePctPerYear = 0,
  drawdownYears = 3,
  fromYear = null,
} = {}) {
  const empty = !book.portfolios.length && !book.investments.length;
  const first = fromYear || new Date().getFullYear();
  return {
    generatedAt: new Date().toISOString(),
    empty,
    emptyNote: empty
      ? 'No portfolio has been recorded. This is an unentered book, not a nil position.'
      : null,
    anchor: anchorPosition(book, { attributionBasis }),
    capital: capitalPosition(book),
    emissions: emissionsLedger(book, { attributionBasis }),
    portfolios: portfolioRows(book),
    pipeline: pipeline(book, { carbonWeight }),

    /* The same figures, with years attached. The totals under this series are
       the totals in `emissions` above — a test asserts it, because a curve that
       does not add up to the number printed beside it is worse than no curve. */
    forecast: {
      emissions: forecast.bookSeries(book, {
        fromYear: first, years: horizonYears, gridDeclinePctPerYear, attributionBasis,
      }),
      capital: forecast.capitalSeries(book, {
        fromYear: first, years: horizonYears, drawdownYears,
      }),
      thisYear: first,
    },

    storage: book.storage || null,
  };
}

module.exports = {
  capitalPosition, emissionsLedger, anchorPosition, portfolioRows, pipeline, dashboard,
  _normalise,
  ATTRIBUTION_BASES: attribution.BASES,
};
