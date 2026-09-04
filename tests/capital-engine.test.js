/**
 * The capital book, and the three separations it exists to hold.
 *
 * Money committed is not money paid. Emissions incurred are not emissions
 * projected. Reduction and avoidance are not deductions from an inventory.
 * Each of those is a place where a plausible-looking total would say something
 * the institution cannot support, so each has a test rather than a comment.
 *
 * The ranking has its own section. A composite score is only useful if its
 * basis is visible and if moving the weight actually moves the answer — a
 * control that appears to do nothing is worse than no control.
 */

'use strict';

const metrics = require('../services/capital-metrics');
const demo    = require('../services/capital-demo-data');

const investments = [...demo.HELD, ...demo.PIPELINE];
const byId = (id) => investments.find(i => i.id === id);

const BOOK = {
  portfolios: demo.PORTFOLIOS,
  investments,
  payments: demo.PAYMENTS.map(p => ({ ...p, portfolioId: byId(p.investmentId).portfolioId })),
};

const EMPTY = { portfolios: [], investments: [], payments: [] };

describe('Where the money stands', () => {
  const cap = metrics.capitalPosition(BOOK);

  test('allocated is the sum of the portfolios’ budgets', () => {
    expect(cap.allocated).toBe(750_000_000);
  });

  test('committed counts only what is committed, deployed or exited', () => {
    // A pipeline project is an intention. Counting it as committed would
    // overstate the book by everything under consideration.
    expect(cap.committed).toBe(521_000_000);
    const pipelineValue = demo.PIPELINE.reduce((t, i) => t + i.commitment, 0);
    expect(pipelineValue).toBeGreaterThan(0);
    expect(cap.committed).not.toBe(521_000_000 + pipelineValue);
  });

  test('paid is disbursements net of repayments', () => {
    expect(cap.disbursed).toBe(337_000_000);
    expect(cap.repaid).toBe(15_000_000);
    expect(cap.paid).toBe(322_000_000);
  });

  test('a fee is paid but is not a drawdown of commitment', () => {
    expect(cap.fees).toBe(1_200_000);
    expect(cap.paid).toBe(cap.disbursed - cap.repaid);   // fees excluded
  });

  test('balance is allocated less paid, and is derived rather than stored', () => {
    expect(cap.balance).toBe(cap.allocated - cap.paid);
    expect(cap.balance).toBe(428_000_000);
    for (const p of demo.PORTFOLIOS) expect(p).not.toHaveProperty('balance');
  });

  test('committed but undrawn is its own line', () => {
    // A book can be two-thirds committed and well under half deployed. One
    // number cannot say both.
    expect(cap.undrawnCommitment).toBe(199_000_000);
    expect(cap.uncommitted).toBe(229_000_000);
    expect(cap.commitmentPct).toBe(69.5);
    expect(cap.deploymentPct).toBe(42.9);
    expect(cap.commitmentPct).toBeGreaterThan(cap.deploymentPct);
  });

  test('over-deployment is reported, not clamped away', () => {
    const over = metrics.capitalPosition({
      portfolios: [{ id: 'p', name: 'Small', currency: 'USD', allocatedBudget: 10 }],
      investments: [{ id: 'i', portfolioId: 'p', status: 'deployed', commitment: 100, emissions: {} }],
      payments: [{ id: 'x', portfolioId: 'p', investmentId: 'i', kind: 'disbursement', amount: 40 }],
    });
    expect(over.balance).toBe(-30);
    expect(over.overDeployed).toBe(true);
  });

  test('an unfunded book says so rather than reporting a balance of zero', () => {
    const cold = metrics.capitalPosition(EMPTY);
    expect(cold.allocated).toBe(0);
    expect(cold.deploymentPct).toBeNull();
    expect(cold.note).toMatch(/no budget has been allocated/i);
  });
});

describe('The emissions ledger keeps four lines apart', () => {
  /* On the commitment basis, which is what these figures were authored as.
     Attribution on the outstanding amount is exercised in capital-anchor. */
  const led = metrics.emissionsLedger(BOOK, { attributionBasis: 'commitment' });

  test('what has happened and what is projected are separate figures', () => {
    expect(led.incurred).toBe(12_050);
    expect(led.forward).toBe(4_230);
    expect(led.lifetimeInventory).toBe(16_280);
  });

  test('the projection is named as one', () => {
    expect(led.inventoryNote).toMatch(/forward emissions are a projection/i);
    expect(led.inventoryNote).toMatch(/reported separately/i);
  });

  test('reduction and avoidance are reported, never netted against the inventory', () => {
    // PCAF Part A p.126. Netting them would let a lender report a smaller
    // inventory than it financed.
    expect(led.reduction).toBe(1_030);
    expect(led.avoided).toBe(36_000);
    expect(led.incurred).toBe(12_050);                       // unchanged by either
    expect(led.lifetimeInventory).toBe(led.incurred + led.forward);
    expect(led.lifetimeInventory).not.toBe(led.incurred + led.forward - led.reduction);
    expect(led.creditNote).toMatch(/not deducted from it/i);
  });

  test('nothing in the ledger subtracts a credit from an emission', () => {
    const src = require('fs').readFileSync(require.resolve('../services/capital-metrics'), 'utf8');
    expect(src).not.toMatch(/incurred\s*-\s*(reduction|avoided)/);
    expect(src).not.toMatch(/forward\s*-\s*(reduction|avoided)/);
  });

  test('only held investments count; a pipeline project is in no total', () => {
    expect(led.investmentsCounted).toBe(demo.HELD.length);
    const pipelineForward = demo.PIPELINE.reduce((t, i) => t + i.emissions.forward_tCO2e, 0);
    expect(pipelineForward).toBeGreaterThan(0);
    expect(led.forward).toBe(4_230);                          // excludes it
  });

  test('data quality is weighted by amount, and states its direction', () => {
    expect(led.dataQuality.weighted).toBe(2.53);
    expect(led.dataQuality.scale).toMatch(/1 is the highest data quality/);
    expect(led.dataQuality.basis).toMatch(/p\.128/);
  });

  test('an unscored holding is excluded from the weighting, not counted as zero', () => {
    const mixed = metrics.emissionsLedger({
      portfolios: [], payments: [],
      investments: [
        { id: 'a', status: 'deployed', commitment: 100, emissions: { dataQuality: { score: 4 } } },
        { id: 'b', status: 'deployed', commitment: 900, emissions: {} },
      ],
    });
    expect(mixed.dataQuality.weighted).toBe(4);               // not 0.4
    expect(mixed.dataQuality.investmentsScored).toBe(1);
    expect(mixed.dataQuality.investmentsWithoutScore).toBe(1);
  });

  test('a book with no scores at all reports none, and says why', () => {
    const none = metrics.emissionsLedger({
      portfolios: [], payments: [],
      investments: [{ id: 'a', status: 'deployed', commitment: 100, emissions: {} }],
    });
    expect(none.dataQuality.weighted).toBeNull();
    expect(none.dataQuality.note).toMatch(/excluded from the weighting/);
  });
});

describe('Per-portfolio rows', () => {
  const rows = metrics.portfolioRows(BOOK);

  test('one row per portfolio, and they reconcile to the book', () => {
    expect(rows).toHaveLength(2);
    expect(rows.reduce((t, r) => t + r.allocated, 0)).toBe(750_000_000);
    expect(rows.reduce((t, r) => t + r.paid, 0)).toBe(322_000_000);
    expect(rows.reduce((t, r) => t + r.incurred_tCO2e, 0)).toBe(12_050);
  });

  test('intensity is per unit deployed, so books of different sizes compare', () => {
    const gb = rows.find(r => r.id === 'pf_green_buildings');
    expect(gb.intensity_tCO2e_perMillion).toBeGreaterThan(0);
    const re = rows.find(r => r.id === 'pf_renewables_sa');
    expect(re.intensity_tCO2e_perMillion).toBeLessThan(gb.intensity_tCO2e_perMillion);
  });

  test('a portfolio with nothing drawn reports no intensity rather than zero', () => {
    const [only] = metrics.portfolioRows({
      portfolios: [{ id: 'p', name: 'Cold', currency: 'USD', allocatedBudget: 1000 }],
      investments: [], payments: [],
    });
    expect(only.intensity_tCO2e_perMillion).toBeNull();
  });
});

describe('The pipeline, and choosing from it', () => {
  const half = metrics.pipeline(BOOK, { carbonWeight: 0.5 });

  test('it lists what is waiting, and nothing that is already written', () => {
    expect(half.count).toBe(demo.PIPELINE.length);
    for (const r of [...half.ranked, ...half.unrankable]) {
      expect(demo.HELD.map(h => h.id)).not.toContain(r.id);
    }
  });

  test('each row carries what it would add to the book, named as a contribution', () => {
    const jaffna = half.ranked.find(r => r.id === 'inv_jaffna_minigrid');
    expect(jaffna.financedEmissionContribution_tCO2e).toBe(90);
    expect(half.totalContribution_tCO2e).toBe(8_430);
    expect(half.totalRequested).toBe(242_000_000);
  });

  test('impact is per unit of capital, so size alone does not win', () => {
    const jaffna = half.ranked.find(r => r.id === 'inv_jaffna_minigrid');   // 12M, 8600 avoided
    const kowloon = half.ranked.find(r => r.id === 'inv_kowloon_refit');    // 88M, 150 reduction
    expect(jaffna.commitment).toBeLessThan(kowloon.commitment);
    expect(jaffna.impact_tCO2e_perMillion).toBeGreaterThan(kowloon.impact_tCO2e_perMillion);
  });

  test('the weighting travels with the result', () => {
    expect(half.carbonWeight).toBe(0.5);
    expect(half.weightingNote).toMatch(/50% carbon impact and 50% expected return/);
    expect(half.weightingNote).toMatch(/mean nothing on their own/);
  });

  test('moving the weight actually moves the answer', () => {
    // A control that cannot change the order is a control that misleads.
    const carbonOnly = metrics.pipeline(BOOK, { carbonWeight: 1 }).ranked.map(r => r.id);
    const returnOnly = metrics.pipeline(BOOK, { carbonWeight: 0 }).ranked.map(r => r.id);
    expect(carbonOnly[0]).toBe('inv_jaffna_minigrid');
    expect(returnOnly[0]).toBe('inv_kowloon_refit');
    expect(carbonOnly).not.toEqual(returnOnly);
  });

  test('a weight outside 0..1 is clamped rather than producing a nonsense score', () => {
    expect(metrics.pipeline(BOOK, { carbonWeight: 4 }).carbonWeight).toBe(1);
    expect(metrics.pipeline(BOOK, { carbonWeight: -2 }).carbonWeight).toBe(0);
    expect(metrics.pipeline(BOOK, { carbonWeight: 'nonsense' }).carbonWeight).toBe(0.5);
  });

  test('a project that cannot be scored is listed unscored, not placed last', () => {
    const trinco = half.unrankable.find(r => r.id === 'inv_trincomalee_biomass');
    expect(trinco).toBeDefined();
    expect(trinco.score).toBeNull();
    expect(trinco.missing).toContain('expected return');
    expect(half.ranked.map(r => r.id)).not.toContain('inv_trincomalee_biomass');
    expect(half.unrankableNote).toMatch(/absent evidence is not low impact/);
  });

  test('candidates that cannot be separated by a measure score alike, rather than by accident', () => {
    // Every value equal means the measure does not discriminate. Saying so is
    // better than letting floating-point order decide a credit decision.
    expect(metrics._normalise([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    expect(metrics._normalise([])).toEqual([]);
    expect(metrics._normalise([NaN, 2, 4])).toEqual([null, 0, 1]);
  });

  test('a single candidate is not ranked as though it beat anything', () => {
    const one = metrics.pipeline({
      portfolios: [], payments: [],
      investments: [{
        id: 'solo', portfolioId: 'p', name: 'Solo', status: 'pipeline',
        commitment: 1_000_000, expectedReturnPct: 5,
        emissions: { avoided_tCO2e: 100 },
      }],
    });
    expect(one.ranked).toHaveLength(1);
    expect(one.ranked[0].score).toBe(0.5);
  });

  test('what is waiting is grouped by type, with the capital it would take', () => {
    const re = half.byType.find(t => t.sector === 'Renewable generation');
    expect(re.count).toBe(2);
    expect(re.commitment).toBe(38_000_000);
    expect(half.byType.reduce((t, r) => t + r.commitment, 0)).toBe(half.totalRequested);
  });
});

describe('The dashboard payload', () => {
  test('an empty book is named, never rendered as a position of zero', () => {
    const d = metrics.dashboard(EMPTY, {});
    expect(d.empty).toBe(true);
    expect(d.emptyNote).toMatch(/unentered book, not a nil position/);
  });

  test('a populated book is not flagged empty', () => {
    expect(metrics.dashboard(BOOK, {}).empty).toBe(false);
  });

  test('it is deterministic — the same book gives the same figures', () => {
    const a = metrics.dashboard(BOOK, { carbonWeight: 0.3 });
    const b = metrics.dashboard(BOOK, { carbonWeight: 0.3 });
    expect({ ...a, generatedAt: null }).toEqual({ ...b, generatedAt: null });
  });
});
