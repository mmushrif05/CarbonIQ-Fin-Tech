/**
 * The Fund Desk engine.
 *
 * One rule dominates this suite: **the desk computes nothing.** Every figure
 * it publishes must equal the figure the module that owns it already returns.
 * A second engine producing "the same" number is how a screen ends up
 * disagreeing with a report generated from the same book, and the
 * disagreement always surfaces in front of the reader who trusts it least.
 *
 * The rest of the suite guards the claims that are easy to merge by accident:
 * three emission claims that are never one number, two lifecycle axes that are
 * never one field, and a pledged mitigation figure that is in no total.
 */

'use strict';

const desk = require('../services/desk');
const metrics = require('../services/capital-metrics');
const attribution = require('../services/capital-attribution');
const baseline = require('../services/capital-baseline');
const book = require('../services/capital-book');

const BOOK = () => baseline.baselineBook();
const POOL = require('../data/gcf/pipeline.seed.json').projects;

describe('The desk restates the engines and never recomputes them', () => {
  test('every money figure equals capitalPosition, figure for figure', () => {
    const bk = BOOK();
    const p = desk.position(bk, POOL);
    const money = metrics.capitalPosition(bk);

    for (const key of ['allocated', 'committed', 'disbursed', 'repaid', 'paid',
      'undrawnCommitment', 'uncommitted', 'balance', 'deploymentPct', 'commitmentPct']) {
      expect(p.money[key]).toBe(money[key]);
    }
  });

  test('every emission figure equals emissionsLedger, figure for figure', () => {
    const bk = BOOK();
    const p = desk.position(bk, POOL);
    const led = metrics.emissionsLedger(bk, { attributionBasis: 'outstanding' });

    expect(p.emissions.carried.incurred).toBe(led.incurred);
    expect(p.emissions.carried.forward).toBe(led.forward);
    expect(p.emissions.pending.incurred).toBe(led.pending.incurred);
    expect(p.emissions.pending.forward).toBe(led.pending.forward);
    expect(p.emissions.atFullCommitment.incurred).toBe(led.atFullCommitment.incurred);
    expect(p.emissions.atFullCommitment.forward).toBe(led.atFullCommitment.forward);
    expect(p.emissions.separatelyStated.reduction).toBe(led.reduction);
    expect(p.emissions.separatelyStated.avoided).toBe(led.avoided);
    expect(p.emissions.dataQuality).toEqual(led.dataQuality);
  });

  test('the basis is passed through to the ledger, not reinterpreted', () => {
    const bk = BOOK();
    const onCommitment = desk.position(bk, POOL, { attributionBasis: 'commitment' });
    const led = metrics.emissionsLedger(bk, { attributionBasis: 'commitment' });
    expect(onCommitment.attributionBasis).toBe('commitment');
    expect(onCommitment.emissions.carried.incurred).toBe(led.incurred);
    /* Fully drawn by definition on the commitment basis — nothing is pending. */
    expect(onCommitment.emissions.pending.total).toBe(0);
  });

  test('each row\'s drawdown equals capital-attribution for that investment', () => {
    const bk = BOOK();
    const p = desk.position(bk, POOL);
    for (const row of p.rows) {
      const inv = bk.investments.find(i => i.id === row.id);
      const share = attribution.drawnShare(inv, bk.payments);
      expect(row.drawn).toBe(Math.round(share.outstanding));
    }
  });

  test('the rows reconcile with the headline to within rounding', () => {
    const p = desk.position(BOOK(), POOL);
    const summed = p.rows.filter(r => r.held).reduce((t, r) => t + r.carried_tCO2e, 0);
    expect(Math.abs(summed - p.emissions.carried.total)).toBeLessThan(0.5);
  });
});

describe('Three claims, never one number', () => {
  test('at full commitment, carried today and still to arrive are separate keys', () => {
    const p = desk.position(BOOK(), POOL);
    expect(p.emissions.atFullCommitment.total).toBeGreaterThan(0);
    expect(p.emissions.carried.total).toBeGreaterThan(0);
    expect(p.emissions.pending.total).toBeGreaterThan(0);
    /* Carried plus pending is what a full drawdown would carry. That identity
       has to hold or one of the three is measuring something else. */
    expect(p.emissions.carried.total + p.emissions.pending.total)
      .toBeCloseTo(p.emissions.atFullCommitment.total, 1);
  });

  test('reduction and avoided are outside the inventory and never netted', () => {
    const p = desk.position(BOOK(), POOL);
    const inv = p.emissions;
    expect(inv.separatelyStated.reduction).toBeGreaterThan(0);
    /* No key anywhere holds an inventory figure with a credit taken off it. */
    const flat = JSON.stringify(inv);
    expect(flat).not.toMatch(/net[A-Z_]/);
    expect(inv.separatelyStated.note).toMatch(/not deducted from it/i);
  });

  test('a pipeline investment carries no emissions — an intention is not an inventory', () => {
    const p = desk.position(BOOK(), POOL);
    const intentions = p.rows.filter(r => !r.held);
    expect(intentions.length).toBeGreaterThan(0);
    for (const r of intentions) {
      expect(r.carried_tCO2e).toBeNull();
      expect(r.atFullCommitment_tCO2e).toBeNull();
    }
  });
});

describe('Two lifecycle axes, never one field', () => {
  test('delivery and status are counted separately and both are published', () => {
    const p = desk.position(BOOK(), POOL);
    expect(p.delivery.completed).toBe(3);
    expect(p.delivery.under_construction).toBe(2);
    expect(p.delivery.not_started).toBe(5);
    expect(p.lifecycle.deployed).toBe(4);
    expect(p.lifecycle.pipeline).toBe(5);
    expect(p.lifecycle.total).toBe(10);
  });

  test('completed is the asset\'s state, and says so rather than meaning exited', () => {
    const p = desk.position(BOOK(), POOL);
    expect(p.delivery.note).toMatch(/Independent of the bank's position/);
    /* A completed project may still be held. If the two axes were one field
       this book could not say that, and it does. */
    const held = p.rows.filter(r => r.delivery === 'completed' && r.held);
    expect(held.length).toBeGreaterThan(0);
  });

  test('a record with no delivery state claims nothing rather than claiming progress', () => {
    const bk = BOOK();
    delete bk.investments[0].delivery;
    const p = desk.position(bk, POOL);
    expect(p.rows[0].delivery).toBe('not_started');
  });

  test('there is no fourth delivery state that means the same as completed', () => {
    /* An earlier draft carried `operating` beside `completed`, which for a
       construction facility is one fact said twice. Two labels for one state
       is how two screens disagree about the same project. */
    expect(book.DELIVERY_STATES).toEqual(['not_started', 'under_construction', 'completed']);
  });
});

describe('The waiting pipeline', () => {
  test('candidates with no investment are counted, with the bank\'s own share apart', () => {
    const p = desk.pipelineWaiting(POOL, []);
    expect(p.waiting).toBe(5);
    expect(p.adopted).toBe(0);
    expect(p.dfccShare).toBe(79_000_000);
    expect(p.gcfAsk).toBe(72_000_000);
    expect(p.totalCost).toBe(196_500_000);
    /* Three figures, never added: the bank's share, the Fund's ask and the
       whole cost are three different people's money. */
    expect(p.dfccShare + p.gcfAsk).not.toBe(p.totalCost);
  });

  test('an adopted candidate drops out of the waiting list', () => {
    const p = desk.pipelineWaiting(POOL, [
      { id: 'inv_x', origin: { system: 'gcf', recordId: POOL[0].id } },
    ]);
    expect(p.waiting).toBe(4);
    expect(p.adopted).toBe(1);
    expect(p.codes).not.toContain(POOL[0].code);
  });

  test('adaptation candidates are counted and never ranked on carbon here', () => {
    const p = desk.pipelineWaiting(POOL, []);
    expect(p.byStream.adaptation).toBe(2);
    expect(p.streamNote).toMatch(/beneficiaries reached, not carbon intensity/);
    /* No carbon figure appears in the waiting block at all, so there is
       nothing for a sort to reach for. */
    expect(JSON.stringify(p)).not.toMatch(/tCO2e"\s*:/);
  });
});
