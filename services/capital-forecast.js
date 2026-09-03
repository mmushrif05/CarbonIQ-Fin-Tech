/**
 * CarbonIQ FinTech — The time axis
 *
 * Everything the dashboard says in the future tense needs years attached to it,
 * and the book does not carry them. `forward_tCO2e` is a single lump against a
 * tenor: Marina Bay holds 1,180 tCO2e over twelve years with no start date and
 * no shape. You cannot draw a curve from a lump — you can only draw a straight
 * line and let a reader assume it means something.
 *
 * This file gives each investment a schedule and the book a year-by-year
 * series. It changes no total: the series sums back to the same scalars the
 * roll-up already reports, and a test asserts exactly that. Adding a time axis
 * is only safe if it can be proved to move nothing first.
 *
 * ── The shape is an assumption, so it is named ──────────────────────────────
 *
 * Spreading a lump evenly across a tenor is a choice, and for construction it
 * is the wrong one: A1 to A5 land in the first two or three years, not evenly
 * across twelve. Each investment therefore carries a **phasing profile** — a
 * named weight vector — rather than an implicit division. The profile appears
 * on screen beside the curve, because a reader who cannot see the shape you
 * assumed cannot judge the curve you drew.
 *
 * ── Two things this file will not do ────────────────────────────────────────
 *
 * It does not net. Emissions, reduction and avoidance come back as separate
 * series and are never combined into one line, because PCAF reports avoided
 * emissions apart from the inventory and never sets them against it (Part A,
 * p.126). A chart that crosses zero would be drawing a claim the standard
 * forbids.
 *
 * It does not invent precision. There is no variance in the book, so there is
 * no confidence band here — a shaded band would look like statistics and be
 * decoration. Years past the confidence horizon are marked `indicative` and
 * the caller is expected to say so.
 */

'use strict';

const { DEPLOYING_STATUSES } = require('./capital-book');
const attribution = require('./capital-attribution');

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

/**
 * Named shapes for spreading a total across a term.
 *
 * Each is a weight vector summing to 1. Where a term is longer than the
 * vector, the remaining years take zero — construction genuinely stops.
 * Where it is shorter, the vector is truncated and renormalised, so the
 * total is preserved whatever the tenor.
 */
const PROFILES = {
  /** Embodied carbon of a build: A1-A5 land early and then stop. */
  construction: {
    id: 'construction',
    label: 'Construction — front-loaded',
    weights: [0.45, 0.35, 0.20],
    note: 'A1 to A5 are incurred while the asset is being built, not across the life of the loan. '
        + 'Spread evenly over a twelve-year tenor they would understate the early years by a factor '
        + 'of four.',
  },
  /** Operational emissions of something already standing. */
  level: {
    id: 'level',
    label: 'Level across the term',
    weights: null,          // computed from the term
    note: 'The same quantity each year. Appropriate for operational emissions of an asset already '
        + 'in use, and the honest default where nothing better is known.',
  },
  /** A build, then operation: quiet start, then a plateau. */
  buildThenOperate: {
    id: 'buildThenOperate',
    label: 'Build, then operate',
    weights: null,          // computed: 2 years of build weighting, then level
    build: 2,
    buildShare: 0.35,
    note: 'A construction period carrying about a third of the total, then level operation for the '
        + 'rest of the term.',
  },
};

const DEFAULT_PROFILE = 'level';

/**
 * The weight vector for a profile over `years` years.
 * Always sums to 1 (to within floating-point), whatever the term.
 */
function weightsFor(profileId, years) {
  const n = Math.max(1, Math.round(years) || 1);
  const profile = PROFILES[profileId] || PROFILES[DEFAULT_PROFILE];

  if (profile.id === 'level') {
    return new Array(n).fill(1 / n);
  }

  if (profile.id === 'buildThenOperate') {
    const build = Math.min(profile.build, n);
    const operate = n - build;
    const buildShare = operate > 0 ? profile.buildShare : 1;
    const w = new Array(n).fill(0);
    for (let i = 0; i < build; i++) w[i] = buildShare / build;
    for (let i = build; i < n; i++) w[i] = (1 - buildShare) / operate;
    return w;
  }

  // A fixed vector: truncate to the term and renormalise so nothing is lost.
  const raw = profile.weights.slice(0, n);
  const total = raw.reduce((t, v) => t + v, 0) || 1;
  const w = raw.map(v => v / total);
  while (w.length < n) w.push(0);
  return w;
}

/**
 * Beyond this many years a projection is a direction, not a number.
 *
 * Nothing is hidden past it — the series runs the full term — but the rows
 * carry `indicative: true` so the screen can mark them rather than presenting
 * year eighteen with the same confidence as next year.
 */
const CONFIDENCE_HORIZON_YEARS = 5;

/**
 * One investment, year by year.
 *
 * @param {object} inv
 * @param {object} opts
 * @param {number} opts.fromYear   first year of the series (defaults to now)
 * @param {number} opts.years      how many years to run
 * @param {number} opts.gridDeclinePctPerYear
 *        Applied to avoided emissions only. Avoidance is measured against a
 *        counterfactual grid, so a grid that cleans up avoids less each year.
 *        Zero by default: a flat grid changes no total, which is what lets the
 *        acceptance test prove this file moves nothing.
 */
function investmentSeries(inv, {
  fromYear, years, gridDeclinePctPerYear = 0, payments = [], attributionBasis = 'outstanding',
} = {}) {
  /* Phased from the ATTRIBUTED figures, on the same basis the roll-up uses.
     When only the roll-up knew about attribution, the curve was drawn from the
     unattributed numbers and stopped adding up to the total printed above it. */
  const factor = attribution.factorFor(inv, payments, attributionBasis);
  const stored = inv.emissions || {};
  const e = {
    forward_tCO2e:   (Number(stored.forward_tCO2e)   || 0) * factor,
    reduction_tCO2e: (Number(stored.reduction_tCO2e) || 0) * factor,
    avoided_tCO2e:   (Number(stored.avoided_tCO2e)   || 0) * factor,
  };
  const first = fromYear || new Date().getFullYear();

  /* `forward_tCO2e` is by definition what is still ahead — what has already
     happened is in `incurred`. So the series always begins at the start of the
     window and runs over what is LEFT of the term, not over the original one.
     Phasing it from an original start year would place part of the total in
     the past, where it would silently vanish from the curve and stop the
     series reconciling with the roll-up. `startYear` is kept as context and
     shown; it does not move the forward figure. */
  const started = Number(inv.startYear) || first;
  const term = Math.max(1, Math.round(Number(inv.tenorYears) || 1));
  const remaining = Math.max(1, Math.min(term, started + term - first));

  const profileId = PROFILES[inv.phasing] ? inv.phasing : DEFAULT_PROFILE;
  const w = weightsFor(profileId, remaining);

  const span = Math.max(1, Math.round(years || remaining));
  const decline = Math.max(0, Number(gridDeclinePctPerYear) || 0) / 100;

  const rows = [];
  for (let k = 0; k < span; k++) {
    const inTerm = k < remaining;
    const share = inTerm ? w[k] : 0;

    /* A grid that decarbonises avoids less each year. Applied to avoidance
       only — a cleaner grid does not change what a building emitted. */
    const gridFactor = inTerm ? Math.pow(1 - decline, k) : 0;

    rows.push({
      year: first + k,
      inTerm,
      indicative: k >= CONFIDENCE_HORIZON_YEARS,
      /* Full precision. Rounding every year and then adding them up drifts —
         it put the series 0.1 tCO2e away from the roll-up it has to reconcile
         with. Rounding happens once, where a figure is displayed. */
      forward_tCO2e:   (Number(e.forward_tCO2e)   || 0) * share,
      reduction_tCO2e: (Number(e.reduction_tCO2e) || 0) * share,
      avoided_tCO2e:   (Number(e.avoided_tCO2e)   || 0) * share * gridFactor,
    });
  }

  return {
    id: inv.id,
    name: inv.name,
    startYear: started,
    term,
    remainingYears: remaining,
    profile: profileId,
    profileLabel: (PROFILES[profileId] || {}).label,
    profileNote: (PROFILES[profileId] || {}).note,
    rows,
  };
}

/**
 * The book, year by year.
 *
 * Only held investments contribute — a pipeline project is an intention, and
 * putting it in a curve of what the book will emit would be reporting a
 * decision nobody has taken. The basket in a later phase adds selected ones
 * deliberately and says it is doing so.
 */
function bookSeries(book, {
  fromYear, years, gridDeclinePctPerYear = 0, include = null, attributionBasis = 'outstanding',
} = {}) {
  const first = fromYear || new Date().getFullYear();

  const held = book.investments.filter(i =>
    DEPLOYING_STATUSES.includes(i.status) || (include || []).includes(i.id));

  /* Default the horizon to the longest term in the book. A curve that stops
     before the book does hides emissions that are already committed to, and
     the total under it would not reconcile with the roll-up above it. */
  const span = Math.max(1, Math.round(years || _longestTerm(held, first)));

  const per = held.map(i => investmentSeries(i, {
    fromYear: first, years: span, gridDeclinePctPerYear,
    payments: book.payments || [], attributionBasis,
  }));

  const rows = [];
  const exact = { forward: 0, reduction: 0, avoided: 0 };
  for (let k = 0; k < span; k++) {
    let forward = 0, reduction = 0, avoided = 0;
    for (const s of per) {
      forward   += s.rows[k].forward_tCO2e;
      reduction += s.rows[k].reduction_tCO2e;
      avoided   += s.rows[k].avoided_tCO2e;
    }
    exact.forward   += forward;
    exact.reduction += reduction;
    exact.avoided   += avoided;
    rows.push({
      year: first + k,
      indicative: k >= CONFIDENCE_HORIZON_YEARS,
      forward_tCO2e:   round(forward),
      reduction_tCO2e: round(reduction),
      avoided_tCO2e:   round(avoided),
    });
  }

  /* Totals come from the unrounded sums, not from adding the displayed rows.
     The two differ by fractions of a tonne, and the total is the figure that
     has to reconcile with the roll-up. */
  const totals = {
    forward_tCO2e:   round(exact.forward),
    reduction_tCO2e: round(exact.reduction),
    avoided_tCO2e:   round(exact.avoided),
  };

  const profiles = [...new Set(per.map(s => s.profile))]
    .map(id => ({ id, label: PROFILES[id].label, note: PROFILES[id].note }));

  return {
    firstYear: first,
    lastYear: first + span - 1,
    years: span,
    confidenceHorizonYear: first + CONFIDENCE_HORIZON_YEARS - 1,
    gridDeclinePctPerYear: round(gridDeclinePctPerYear, 2),
    attributionBasis,
    rows,
    totals,
    investments: per.length,
    profiles,
    /* Said in the payload as well as on screen. Both get read. */
    notes: {
      separation: 'Emissions, reduction and avoidance are three series and are never combined into '
        + 'one line. Avoided emissions are reported apart from the inventory and never set against '
        + 'it (PCAF Part A, p.126).',
      projection: 'Every year in this series is a projection. It is not a plan, and it is not a '
        + 'measurement — it is what the book would emit under the phasing and the grid assumption '
        + 'printed beside it.',
      horizon: `Years beyond ${first + CONFIDENCE_HORIZON_YEARS - 1} are marked indicative. There is `
        + 'no variance in the book, so no confidence band is drawn — a shaded band would look like '
        + 'statistics and be decoration.',
      grid: gridDeclinePctPerYear > 0
        ? `Avoided emissions decline ${round(gridDeclinePctPerYear, 2)}% a year on the assumption that `
          + 'the displaced grid decarbonises. Emissions themselves are unaffected: a cleaner grid does '
          + 'not change what a building emitted.'
        : 'The displaced grid is held flat. That is conservative in one direction only — on a grid '
          + 'that is decarbonising it overstates avoided emissions in later years.',
    },
  };
}

/** How far ahead the book itself reaches, from `first`. Capped, because a
 *  forty-year tail is a chart nobody reads and a number nobody believes. */
function _longestTerm(investments, first) {
  let span = 1;
  for (const i of investments) {
    const started = Number(i.startYear) || first;
    const term = Math.max(1, Math.round(Number(i.tenorYears) || 1));
    span = Math.max(span, Math.max(1, Math.min(term, started + term - first)));
  }
  return Math.min(30, span);
}

/**
 * Capital, year by year.
 *
 * Payments already carry a date, so what has been drawn is history and needs
 * no assumption. What is still to be drawn does, and the assumption is named:
 * an undrawn commitment is spread over the drawdown period rather than landing
 * all at once, because nobody draws a facility in a single day.
 */
function capitalSeries(book, { fromYear, years, drawdownYears = 3 } = {}) {
  const first = fromYear || new Date().getFullYear();
  /* `years` arrives as null when no horizon was asked for, and a default
     parameter only covers undefined. Math.round(null) is 0, so the series
     collapsed to a single year and the total reported one year's drawdown as
     the whole of it — $66.3M where $199M was committed and undrawn. Only the
     screen showed it: the unit test called this function directly, where the
     default did apply. */
  const span = Math.max(1, Math.round(Number(years) || 10));
  const pace = Math.max(1, Math.round(drawdownYears));

  const held = book.investments.filter(i => DEPLOYING_STATUSES.includes(i.status));
  const paidFor = (id) => book.payments
    .filter(p => p.investmentId === id)
    .reduce((t, p) => t + (p.kind === 'repayment' ? -p.amount : p.kind === 'fee' ? 0 : p.amount), 0);

  /* Undrawn is computed per facility, not across the book. A facility that has
     been over-drawn cannot lend its excess to another one's undrawn balance,
     and netting them would report capital as available that nobody can call. */
  const undrawnTotal = held.reduce(
    (t, inv) => t + Math.max(0, (Number(inv.commitment) || 0) - paidFor(inv.id)), 0);

  const rows = [];
  let exactPlanned = 0;
  for (let k = 0; k < span; k++) {
    const planned = k < pace ? undrawnTotal / pace : 0;
    exactPlanned += planned;
    rows.push({
      year: first + k,
      plannedDrawdown: round(planned),
      indicative: k >= CONFIDENCE_HORIZON_YEARS,
    });
  }

  return {
    firstYear: first,
    years: span,
    drawdownYears: pace,
    rows,
    /* From the unrounded sum, not from adding the displayed rows — the two
       differ by fractions of a dollar, and the total is what has to reconcile
       with the undrawn commitment reported above it. */
    totalPlanned: round(exactPlanned),
    note: `What has been drawn is taken from the payment log and needs no assumption. What is still `
        + `committed and undrawn is spread over ${pace} year${pace === 1 ? '' : 's'} — nobody draws a `
        + `facility in a single day, and the pace is adjustable.`,
  };
}

module.exports = {
  PROFILES, DEFAULT_PROFILE, CONFIDENCE_HORIZON_YEARS,
  weightsFor, investmentSeries, bookSeries, capitalSeries,
};
