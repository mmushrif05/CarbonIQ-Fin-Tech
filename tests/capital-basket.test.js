/**
 * The basket — "if we wrote these".
 *
 * Ranking answers which project to take first. This answers what happens if
 * you take a particular few, and it is a different question in three ways that
 * each have a way of going quietly wrong:
 *
 *   Affordability is not per project. Five individually affordable candidates
 *   are not necessarily affordable together, so the basket is set against what
 *   is uncommitted and a selection that does not fit is reported as a
 *   shortfall rather than as a negative remainder or a bar held at 100%.
 *
 *   A basket is a scenario. Nothing here is committed, nothing is stored, and
 *   the payload carries that sentence so a screen cannot lose it.
 *
 *   Reduction and avoidance are still never netted. A basket that funded a
 *   solar farm must not appear to lower the book's emissions.
 *
 * And one thing the arithmetic had to be forced to say: on the outstanding
 * basis a facility written this morning has drawn nothing, so the curve does
 * not move by a tonne. Both sides of the scenario therefore run at full
 * commitment, and the difference between them is the basket alone.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { basket } = require('../services/capital-basket');
const { baselineBook } = require('../services/capital-baseline');
const { capitalPosition } = require('../services/capital-metrics');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const book = () => baselineBook();
const pipelineIds = (b) => b.investments.filter(i => i.status === 'pipeline').map(i => i.id);

describe('An empty basket is nothing, not zero', () => {
  test('it selects nothing and models nothing', () => {
    const r = basket(book(), []);
    expect(r.count).toBe(0);
    expect(r.funding.needed).toBe(0);
    expect(r.forecast.withBasket).toBeNull();
  });

  test('it still says what a basket is, so the panel can say so before any figure', () => {
    expect(basket(book(), []).scenarioNote).toMatch(/scenario/i);
    expect(basket(book(), []).scenarioNote).toMatch(/has been committed/);
  });
});

describe('Affordability is asked of the selection, not of its members', () => {
  test('what it needs is the sum of what the selected projects ask for', () => {
    const b = book();
    const ids = pipelineIds(b).slice(0, 3);
    const r = basket(b, ids);
    const expected = b.investments
      .filter(i => ids.includes(i.id))
      .reduce((t, i) => t + i.commitment, 0);
    expect(r.funding.needed).toBe(expected);
  });

  test('available is what is allocated and not yet committed', () => {
    const b = book();
    expect(basket(b, pipelineIds(b).slice(0, 2)).funding.available)
      .toBe(capitalPosition(b).uncommitted);
  });

  test('a basket larger than the uncommitted allocation reports a shortfall, not a negative remainder', () => {
    const b = book();
    const r = basket(b, pipelineIds(b));
    expect(r.funding.affordable).toBe(false);
    expect(r.funding.shortfall).toBeGreaterThan(0);
    expect(r.funding.remaining).toBe(0);
    expect(r.funding.shortfall).toBe(r.funding.needed - r.funding.available);
  });

  test('the shortfall note does not let it read as though the projects were individually unaffordable', () => {
    const r = basket(book(), pipelineIds(book()));
    expect(r.funding.note).toMatch(/not a reason the projects are unaffordable individually/);
  });

  test('every project waiting in the baseline is individually affordable, so the case is real', () => {
    const b = book();
    const available = capitalPosition(b).uncommitted;
    for (const id of pipelineIds(b)) {
      expect(basket(b, [id]).funding.affordable).toBe(true);
      expect(basket(b, [id]).funding.needed).toBeLessThanOrEqual(available);
    }
  });
});

describe('Impact is three figures and never one', () => {
  test('emissions, reduction and avoidance are reported separately', () => {
    const r = basket(book(), pipelineIds(book()).slice(0, 3));
    for (const k of ['forward_tCO2e', 'reduction_tCO2e', 'avoided_tCO2e', 'incurred_tCO2e']) {
      expect(typeof r.impact[k]).toBe('number');
    }
  });

  test('there is no net figure anywhere in the payload', () => {
    const r = basket(book(), pipelineIds(book()));
    expect(JSON.stringify(r)).not.toMatch(/"net[A-Za-z_]*"\s*:/);
  });

  test('the source says avoidance is never set against the inventory', () => {
    const src = read('services', 'capital-basket.js');
    expect(src).toMatch(/never netted/);
    expect(src).toMatch(/Part A, p\.126/);
  });

  test('each figure is the sum of the selected rows, so the panel can be checked against the table', () => {
    const b = book();
    const ids = pipelineIds(b).slice(0, 3);
    const r = basket(b, ids);
    const sum = (k) => r.rows.reduce((t, x) => t + x[k], 0);
    expect(r.impact.forward_tCO2e).toBeCloseTo(sum('forward_tCO2e'), 2);
    expect(r.impact.reduction_tCO2e).toBeCloseTo(sum('reduction_tCO2e'), 2);
    expect(r.impact.avoided_tCO2e).toBeCloseTo(sum('avoided_tCO2e'), 2);
  });
});

describe('The scenario curve moves, and moves by exactly the basket', () => {
  test('both sides run at full commitment, whatever the dashboard is showing', () => {
    const r = basket(book(), pipelineIds(book()).slice(0, 2), { attributionBasis: 'outstanding' });
    expect(r.forecast.basis).toBe('commitment');
    expect(r.forecast.displayBasis).toBe('outstanding');
  });

  test('on the outstanding basis a newly written project would move nothing — which is why it is not used', () => {
    /* The defect this guards: a facility written this morning has drawn
       nothing, so attribution on outstanding scales its emissions to zero and
       the curve does not move. A reader would take "this changes nothing" from
       a chart that had simply not been asked the question. */
    const { bookSeries } = require('../services/capital-forecast');
    const b = book();
    const ids = pipelineIds(b).slice(0, 2);
    const written = {
      ...b,
      investments: b.investments.map(i => (ids.includes(i.id) ? { ...i, status: 'committed' } : i)),
    };
    const before = bookSeries(b, { attributionBasis: 'outstanding' }).totals.forward_tCO2e;
    const after  = bookSeries(written, { attributionBasis: 'outstanding' }).totals.forward_tCO2e;
    expect(after).toBe(before);
  });

  test('the movement between the two curves equals the impact reported above them', () => {
    const b = book();
    const r = basket(b, pipelineIds(b).slice(0, 3));
    const a = r.forecast.asItStands.totals;
    const w = r.forecast.withBasket.totals;
    expect(w.forward_tCO2e - a.forward_tCO2e).toBeCloseTo(r.impact.forward_tCO2e, 1);
    expect(w.reduction_tCO2e - a.reduction_tCO2e).toBeCloseTo(r.impact.reduction_tCO2e, 1);
    expect(w.avoided_tCO2e - a.avoided_tCO2e).toBeCloseTo(r.impact.avoided_tCO2e, 1);
  });

  test('the payload explains why the basis is held constant', () => {
    const r = basket(book(), pipelineIds(book()).slice(0, 1));
    expect(r.forecast.basisNote).toMatch(/has drawn\s+nothing|drawn nothing/);
    expect(r.forecast.basisNote).toMatch(/the movement between them is the basket/);
  });
});

describe('A blended return is a return on money', () => {
  test('it is weighted by the capital each project asks for, not averaged', () => {
    const b = book();
    const ids = pipelineIds(b).slice(0, 3);
    const r = basket(b, ids);
    const chosen = b.investments.filter(i => ids.includes(i.id));
    const cap = chosen.reduce((t, i) => t + i.commitment, 0);
    const weighted = chosen.reduce((t, i) => t + i.commitment * i.expectedReturnPct, 0) / cap;
    const plainMean = chosen.reduce((t, i) => t + i.expectedReturnPct, 0) / chosen.length;
    expect(r.finance.blendedReturnPct).toBeCloseTo(weighted, 2);
    if (Math.abs(weighted - plainMean) > 0.01) {
      expect(r.finance.blendedReturnPct).not.toBeCloseTo(plainMean, 2);
    }
  });

  test('an unpriced project is excluded from the weighting and counted, never treated as zero', () => {
    const b = book();
    const ids = pipelineIds(b).slice(0, 2);
    b.investments.forEach((i) => { if (i.id === ids[0]) i.expectedReturnPct = null; });
    const r = basket(b, ids);
    expect(r.finance.unpricedCount).toBe(1);
    expect(r.finance.pricedCount).toBe(1);
    const priced = b.investments.find(i => i.id === ids[1]);
    expect(r.finance.blendedReturnPct).toBeCloseTo(priced.expectedReturnPct, 2);
    expect(r.finance.note).toMatch(/rather than counted as zero/);
  });

  test('a basket with nothing priced gives no blended return rather than zero', () => {
    const b = book();
    const ids = pipelineIds(b).slice(0, 2);
    b.investments.forEach((i) => { if (ids.includes(i.id)) i.expectedReturnPct = null; });
    expect(basket(b, ids).finance.blendedReturnPct).toBeNull();
  });
});

describe('A selection that names nothing is reported, not silently dropped', () => {
  test('an unknown id comes back named', () => {
    const b = book();
    const r = basket(b, [pipelineIds(b)[0], 'inv_does_not_exist']);
    expect(r.count).toBe(1);
    expect(r.unknownIds).toEqual(['inv_does_not_exist']);
    expect(r.unknownNote).toMatch(/nothing was assumed for them/);
  });

  test('a project already committed cannot be put in the basket', () => {
    const b = book();
    const held = b.investments.find(i => i.status !== 'pipeline');
    const r = basket(b, [held.id]);
    expect(r.count).toBe(0);
    expect(r.unknownIds).toEqual([held.id]);
  });
});

describe('The basket does not touch the book', () => {
  test('modelling a basket leaves the source book unchanged', () => {
    const b = book();
    const before = JSON.stringify(b);
    basket(b, pipelineIds(b));
    expect(JSON.stringify(b)).toBe(before);
  });

  test('the capital position is the same before and after', () => {
    const b = book();
    const before = capitalPosition(b);
    basket(b, pipelineIds(b));
    expect(capitalPosition(b)).toEqual(before);
  });
});
