/**
 * CarbonIQ FinTech — the basket: what writing these would do
 *
 * The pipeline ranks what is waiting. The basket answers the question that
 * follows it — *if we wrote these three, what changes?* — and it is a
 * different question from the ranking in three ways that matter.
 *
 * **A rank is per project; affordability is not.** Each of five candidates can
 * be individually affordable while any three of them together are not. So the
 * basket reports what the selection needs against what is uncommitted, and
 * where that falls short it says so as a shortfall rather than quietly showing
 * a negative remainder.
 *
 * **A basket is a scenario, not a commitment.** Nothing here enters the
 * capital position or the emissions ledger. Every figure is labelled as what
 * *would* be added, and the payload carries that sentence so a screen cannot
 * lose it.
 *
 * **Reduction and avoidance are still never netted.** The impact of a basket
 * is three separate figures, exactly as the ledger reports them. There is no
 * "net impact" here and there must never be one: PCAF reports avoided
 * emissions apart from the inventory and never against it (Part A, p.126).
 * A basket that funded a solar farm would otherwise appear to *lower* the
 * book's emissions, which is a different and false claim.
 *
 * The arithmetic lives here rather than in the browser for the same reason it
 * always does in this codebase: two implementations of one figure eventually
 * disagree, and the one on screen is the one a person acts on.
 */

'use strict';

const { capitalPosition } = require('./capital-metrics');
const { bookSeries } = require('./capital-forecast');

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};
const sum = (rows, f) => rows.reduce((t, r) => t + (Number(f(r)) || 0), 0);

const SCENARIO_NOTE =
  'A basket is a scenario. Nothing selected here has been committed, nothing '
  + 'below is in the capital position or the emissions ledger, and every figure '
  + 'is what would be added if these were written.';

/**
 * @param {object} book              the capital book
 * @param {string[]} selectedIds     ids of pipeline investments to model
 * @param {object} opts
 * @param {string} opts.attributionBasis  passed through to the forecast
 */
function basket(book, selectedIds = [], {
  attributionBasis = 'outstanding', horizonYears = null, gridDeclinePctPerYear = 0,
} = {}) {
  const wanted = new Set((selectedIds || []).map(String).filter(Boolean));
  const waiting = book.investments.filter(i => i.status === 'pipeline');

  const chosen = waiting.filter(i => wanted.has(String(i.id)));
  /* An id that names nothing is reported rather than dropped. A selection that
     silently shrank would show a smaller funding need than the one asked for. */
  const unknown = [...wanted].filter(id => !chosen.some(i => String(i.id) === id));

  const position = capitalPosition(book);
  const available = position.uncommitted;
  const needed = round(sum(chosen, i => Number(i.commitment) || 0));
  const remaining = round(available - needed);

  const rows = chosen.map((i) => {
    const e = i.emissions || {};
    return {
      id: i.id,
      name: i.name,
      sector: i.sector,
      commitment: round(Number(i.commitment) || 0),
      expectedReturnPct: i.expectedReturnPct ?? null,
      forward_tCO2e: round(Number(e.forward_tCO2e) || 0),
      incurred_tCO2e: round(Number(e.incurred_tCO2e) || 0),
      reduction_tCO2e: round(Number(e.reduction_tCO2e) || 0),
      avoided_tCO2e: round(Number(e.avoided_tCO2e) || 0),
    };
  });

  /* Weighted by the capital each project asks for, because a blended return is
     a return on money, not an average of percentages. A project with no priced
     return is excluded from the weighting and counted, rather than treated as
     zero — the same rule the data-quality weighting follows. */
  /* Number(null) is 0 and 0 is finite, so a coercion test would have counted
     an unpriced project as one promising nothing — dragging the blended return
     down with a figure nobody entered. The absence is checked before the
     number is, the same way it is checked everywhere else in this book. */
  const isPriced = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const priced = rows.filter(r => isPriced(r.expectedReturnPct));
  const pricedCapital = sum(priced, r => r.commitment);
  const blendedReturnPct = pricedCapital > 0
    ? round(sum(priced, r => r.commitment * Number(r.expectedReturnPct)) / pricedCapital, 2)
    : null;

  /* The book as it stands, and the book with the basket written. Two runs of
     the same function on two books, so the difference cannot come from two
     different methods.
     
     Both sides run on the **commitment** basis, whatever basis the dashboard
     is displaying, and this is the whole reason the scenario says anything at
     all. Attribution on outstanding scales a project's emissions by what has
     been drawn, and a facility written this morning has drawn nothing — so on
     that basis the curve does not move by a single tonne, and a reader would
     take "nothing changed" from a chart that had simply not been asked the
     question. Holding the basis constant across both runs is the same
     discipline the BOQ comparison follows: change one thing, so the movement
     is attributable to that thing. */
  const SCENARIO_BASIS = 'commitment';
  /* The horizon and the grid trajectory come from whatever the reader has set
     on the chart, because the dashed reading is drawn on the same axis as the
     solid one. A scenario run over a different span would be plotted against
     the wrong years and would leave the plot entirely — the line would look
     like an answer and be a misalignment. */
  const seriesOpts = { attributionBasis: SCENARIO_BASIS, years: horizonYears, gridDeclinePctPerYear };
  const asItStands = bookSeries(book, seriesOpts);
  const withBasket = chosen.length
    ? bookSeries(
      {
        ...book,
        investments: book.investments.map(i =>
          (wanted.has(String(i.id)) ? { ...i, status: 'committed' } : i)),
      },
      seriesOpts,
    )
    : null;

  return {
    selected: rows.map(r => r.id),
    count: rows.length,
    unknownIds: unknown,
    unknownNote: unknown.length
      ? `${unknown.length} selected id${unknown.length === 1 ? '' : 's'} matched no project waiting in the pipeline, `
        + 'and nothing was assumed for them.'
      : null,
    scenarioNote: SCENARIO_NOTE,

    funding: {
      currency: position.currency,
      needed,
      available: round(available),
      remaining: remaining >= 0 ? remaining : 0,
      shortfall: remaining < 0 ? round(-remaining) : 0,
      affordable: remaining >= 0,
      note: remaining >= 0
        ? 'Available is what is allocated and not yet committed. Committing this basket would leave '
          + 'the remainder for everything else still waiting.'
        : 'This basket asks for more than is uncommitted. The shortfall is the additional allocation '
          + 'it would need — it is not a reason the projects are unaffordable individually.',
    },

    /* Three figures, never one. See the note at the head of this file. */
    impact: {
      forward_tCO2e: round(sum(rows, r => r.forward_tCO2e)),
      incurred_tCO2e: round(sum(rows, r => r.incurred_tCO2e)),
      reduction_tCO2e: round(sum(rows, r => r.reduction_tCO2e)),
      avoided_tCO2e: round(sum(rows, r => r.avoided_tCO2e)),
      basis: 'What these projects would add to the book, at full commitment. Emissions, reduction and '
        + 'avoidance are reported separately and are never netted against one another.',
    },

    finance: {
      blendedReturnPct,
      pricedCount: priced.length,
      unpricedCount: rows.length - priced.length,
      note: blendedReturnPct === null
        ? 'None of the selected projects carries a priced return, so no blended return is given.'
        : `Weighted by the capital each project asks for. ${rows.length - priced.length} of `
          + `${rows.length} carr${rows.length - priced.length === 1 ? 'ies' : 'y'} no priced return and `
          + 'are excluded from the weighting rather than counted as zero.',
    },

    rows,
    forecast: {
      basis: 'commitment',
      displayBasis: attributionBasis,
      asItStands,
      withBasket,
      basisNote:
        'Both curves are drawn at full commitment. A facility that has just been written has drawn '
        + 'nothing, so on the outstanding basis a new project moves the line by zero — which would read '
        + 'as "this changes nothing" rather than "this has not been drawn yet". Holding the basis constant '
        + 'across both runs means the movement between them is the basket and nothing else.'
        + (attributionBasis === 'commitment' ? '' : ' The figures above the chart remain on the '
          + `${attributionBasis} basis.`),
    },
  };
}

module.exports = { basket, SCENARIO_NOTE };
