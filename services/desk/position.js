/**
 * CarbonIQ FinTech — the Fund Desk position
 *
 * What a credit committee arrives wanting to know, in the order it asks:
 * which projects have we completed, which have we financed, what will the book
 * emit when it is fully drawn, what does it carry today against the payments
 * actually made, and what is still waiting in the pipeline.
 *
 * ── This module computes nothing ───────────────────────────────────────────
 *
 * Every figure below is returned by an engine that already exists —
 * `capital-metrics` for the money and the emissions ledger,
 * `capital-attribution` for the per-row drawdown share, `gcf/store` for the
 * candidate pool. The desk arranges those answers; it does not restate them.
 *
 * That is a rule and not a preference. A second engine producing "the same"
 * figure is how a screen ends up disagreeing with the report generated from
 * the same book, and the disagreement surfaces in front of the reader who
 * trusts it least. `tests/desk-engine.test.js` asserts the desk's totals equal
 * the source modules' figure for figure, so the rule cannot quietly lapse.
 *
 * ── Three claims, never one number ────────────────────────────────────────
 *
 * **At full commitment** is what this book will carry once every facility is
 * fully drawn. **Carried today** is what it carries now, attributed on the
 * payments actually made (PCAF Part A attributes on the outstanding amount).
 * **Still to arrive** is the difference — not lost, not a second inventory,
 * simply not yet this book's to report.
 *
 * Reduction and avoided emissions sit outside all three and are never netted
 * against any of them (PCAF Part A, p.126).
 *
 * A fourth figure, the **pledged mitigation** frozen when a GCF candidate was
 * adopted, is a project-level claim against a counterfactual. It is carried on
 * the row that owns it and appears in no total on this screen.
 */

'use strict';

const book = require('../capital-book');
const metrics = require('../capital-metrics');
const attribution = require('../capital-attribution');
const baseline = require('../capital-baseline');
const gcfStore = require('../gcf/store');
const store = require('../partc-store');

const DELIVERY_STATES = book.DELIVERY_STATES;
const HELD = book.DEPLOYING_STATUSES;

const round = (n, dp = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))
  ? null
  : Math.round(Number(n) * 10 ** dp) / 10 ** dp);

const sum = (rows, pick) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);

/* A record with no delivery state recorded has not been said to be anything.
   `not_started` is the only reading that claims nothing: it is the state every
   project passes through, so defaulting to it cannot assert progress that was
   never entered. */
const deliveryOf = i => (DELIVERY_STATES.includes(i.delivery) ? i.delivery : 'not_started');

const countBy = (rows, pick, keys) => {
  const out = Object.fromEntries(keys.map(k => [k, 0]));
  for (const r of rows) { const k = pick(r); if (k in out) out[k] += 1; }
  return out;
};

/**
 * One row per investment: the money, the drawdown, and what each carries.
 *
 * Row figures are rounded to the nearest tonne for reading. The headline
 * totals are taken from the ledger rather than by adding this column up, so a
 * column that sums a tonne or two away from the tile above it is rounding and
 * nothing else — the note on the payload says so rather than leaving a reader
 * to wonder which of the two is wrong.
 */
function rowsFor(bk, { attributionBasis }) {
  const payments = bk.payments || [];
  return (bk.investments || []).map((inv) => {
    const share = attribution.drawnShare(inv, payments);
    const split = attribution.splitEmissions(inv, payments, attributionBasis);
    const held = HELD.includes(inv.status);
    const full = (split.incurred.full || 0) + (split.forward.full || 0);
    const carried = (split.incurred.attributed || 0) + (split.forward.attributed || 0);

    return {
      id: inv.id,
      portfolioId: inv.portfolioId,
      name: inv.name,
      sector: inv.sector || null,
      country: inv.country || null,
      taxonomy: inv.taxonomy || null,
      startYear: inv.startYear ?? null,

      /* Two axes, side by side and never merged. */
      status: inv.status,
      delivery: deliveryOf(inv),

      commitment: round(inv.commitment),
      projectCost: round(inv.projectCost),
      drawn: round(share.outstanding),
      drawnPct: share.commitment > 0 ? round(share.share * 100, 1) : null,
      undrawn: round(Math.max(0, (Number(inv.commitment) || 0) - share.outstanding)),

      /* Only a held investment carries emissions. A pipeline candidate is an
         intention: attributing emissions to it would book an inventory for
         money that has not been committed. */
      held,
      atFullCommitment_tCO2e: held ? round(full, 2) : null,
      carried_tCO2e: held ? round(carried, 2) : null,
      pending_tCO2e: held ? round(full - carried, 2) : null,

      /* Outside the inventory, and never netted against it. */
      reduction_tCO2e: held ? round(split.reduction.attributed, 2) : null,
      avoided_tCO2e: held ? round(split.avoided.attributed, 2) : null,

      dataQuality: (inv.emissions && inv.emissions.dataQuality) || null,

      /* Project-level, frozen at adoption, in no total on this screen. */
      pledgedMitigation: inv.pledgedMitigation || null,
      origin: inv.origin || null,
    };
  });
}

/** The candidates that have not been written yet, and what they would cost. */
function pipelineWaiting(projects, investments) {
  const adopted = new Set((investments || [])
    .filter(i => i.origin && i.origin.system === 'gcf')
    .map(i => i.origin.recordId));

  const waiting = (projects || []).filter(p => !adopted.has(p.id));
  return {
    waiting: waiting.length,
    adopted: adopted.size,
    pool: (projects || []).length,
    totalCost: round(sum(waiting, p => p.financing && p.financing.totalCost)),
    dfccShare: round(sum(waiting, p => p.financing && p.financing.dfcc)),
    gcfAsk: round(sum(waiting, p => p.financing && p.financing.gcfAsk)),
    byStream: {
      mitigation: waiting.filter(p => p.stream === 'mitigation').length,
      adaptation: waiting.filter(p => p.stream === 'adaptation').length,
    },
    codes: waiting.map(p => p.code),
    note: 'GCF candidates with no corresponding position on this book. Bank share, GCF ask and '
      + 'total project cost are separate figures and are not additive.',
    streamNote: 'Adaptation candidates are assessed on beneficiaries reached, not carbon intensity.',
  };
}

/**
 * The whole position, from one read of both books.
 *
 * @param {object} bk         the capital book — portfolios, investments, payments
 * @param {object[]} projects the GCF candidate pool
 * @param {object} opts       attributionBasis
 */
function position(bk, projects, { attributionBasis = 'outstanding' } = {}) {
  const money = metrics.capitalPosition(bk);
  const ledger = metrics.emissionsLedger(bk, { attributionBasis });
  const rows = rowsFor(bk, { attributionBasis: ledger.attributionBasis });

  const held = (bk.investments || []).filter(i => HELD.includes(i.status));
  const carriedTotal = ledger.incurred + ledger.forward;
  const fullTotal = ledger.atFullCommitment.incurred + ledger.atFullCommitment.forward;

  return {
    currency: money.currency,
    attributionBasis: ledger.attributionBasis,
    generatedAt: new Date().toISOString(),

    money: {
      allocated: money.allocated,
      committed: money.committed,
      disbursed: money.disbursed,
      repaid: money.repaid,
      paid: money.paid,
      undrawnCommitment: money.undrawnCommitment,
      uncommitted: money.uncommitted,
      balance: money.balance,
      deploymentPct: money.deploymentPct,
      commitmentPct: money.commitmentPct,
      overDeployed: money.overDeployed,
      note: money.note,
      /* Nested, not stacked. Disbursed money is inside the committed figure and
         committed money is inside the allocation; adding the three would count
         the same dollar three times. */
      nestingNote: 'Paid out is a subset of committed; committed is a subset of the allocation.',
    },

    emissions: {
      unit: 'tCO2e',
      investmentsCounted: ledger.investmentsCounted,

      atFullCommitment: {
        incurred: ledger.atFullCommitment.incurred,
        forward: ledger.atFullCommitment.forward,
        total: round(fullTotal, 2),
      },
      carried: {
        incurred: ledger.incurred,
        forward: ledger.forward,
        total: round(carriedTotal, 2),
      },
      pending: {
        incurred: ledger.pending.incurred,
        forward: ledger.pending.forward,
        total: round(ledger.pending.incurred + ledger.pending.forward, 2),
      },
      carriedPct: fullTotal > 0 ? round((carriedTotal / fullTotal) * 100, 1) : null,

      /* Outside the inventory. Reported here so they are visible, and on their
         own keys so nothing can subtract them from anything above. */
      separatelyStated: {
        reduction: ledger.reduction,
        avoided: ledger.avoided,
        note: ledger.creditNote,
      },

      dataQuality: ledger.dataQuality,
      attributionNote: ledger.attributionNote,
      inventoryNote: ledger.inventoryNote,
      pendingNote: ledger.pendingNote,
      claimNote: 'At full commitment: the position with every facility fully drawn. '
        + 'Carried today: attributed on the outstanding amount (PCAF Part A). '
        + 'Still to arrive: the balance, attributed as the undrawn commitment is drawn.',
      roundingNote: 'Figures are carried to two decimals and displayed to the nearest tonne.',
    },

    /* Two axes, counted separately, because they answer different questions. */
    delivery: {
      ...countBy(bk.investments || [], deliveryOf, DELIVERY_STATES),
      states: DELIVERY_STATES,
      note: 'Construction status of the financed asset. Independent of the bank\'s position on '
        + 'the facility.',
    },
    lifecycle: {
      ...countBy(bk.investments || [], i => i.status, book.STATUSES),
      held: held.length,
      total: (bk.investments || []).length,
      note: 'Committed, deployed and exited positions carry attributed emissions. '
        + 'Pipeline and declined positions do not.',
    },

    rows,
  };
}

/**
 * Which book is actually being shown.
 *
 * Its own function because three things need the answer and they must not
 * disagree: the position, the scenario, and the year-end readiness. When the
 * scenario resolved its own book it could model a selection against a
 * different book from the one printed above it — the same class of defect as a
 * forecast drawn from unattributed figures under an attributed total.
 *
 * Precedence is the rule the rest of the application follows: an organisation's
 * own records win entirely, and where it has recorded nothing the repository
 * baseline is shown instead, marked as what it is. The two are never merged.
 */

/**
 * Read both books and answer.
 *
 * Precedence is the same rule the rest of the application follows and it is
 * applied to each book independently: an organisation's own records win
 * entirely, and where it has recorded nothing the repository baseline (capital)
 * or the shipped pipeline (GCF) is shown instead, marked as what it is. The two
 * are never merged, and the payload says which is showing on each side.
 */
async function effectiveBook(orgId, { portfolioId } = {}) {
  const recorded = await book.readBook(orgId, { portfolioId });
  const hasOwn = (recorded.portfolios || []).length > 0 || (recorded.investments || []).length > 0;
  if (hasOwn) return { book: recorded, source: 'recorded', sample: false, sampleNote: null };

  const base = baseline.baselineBook();
  if (!base) return { book: recorded, source: 'none', sample: false, sampleNote: null };

  const bk = portfolioId
    ? {
      portfolios: base.portfolios.filter(p => p.id === portfolioId),
      investments: base.investments.filter(i => i.portfolioId === portfolioId),
      payments: base.payments.filter(p => p.portfolioId === portfolioId),
    }
    : base;
  return {
    book: bk,
    source: 'baseline',
    sample: true,
    sampleNote: 'Illustrative dataset — not client records.',
  };
}

async function read(orgId, { attributionBasis = 'outstanding', portfolioId } = {}) {
  const [effective, pipeline] = await Promise.all([
    effectiveBook(orgId, { portfolioId }),
    gcfStore.list(orgId),
  ]);

  const bk = effective.book;
  const { source, sample, sampleNote } = effective;

  const result = position(bk, pipeline.projects, { attributionBasis });
  result.source = source;
  result.sample = sample;
  result.sampleNote = sampleNote;
  result.empty = source === 'none';
  result.pipeline = {
    ...pipelineWaiting(pipeline.projects, bk.investments),
    source: pipeline.source,
    sample: pipeline.sample,
  };
  result.storage = store.capability();
  return result;
}

module.exports = { read, effectiveBook, position, rowsFor, pipelineWaiting, DELIVERY_STATES };
