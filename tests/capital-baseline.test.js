/**
 * The baseline book, held in the repository.
 *
 * Two things need holding here. The file has to reconcile — a demonstration
 * book whose totals do not add up teaches a reader to distrust the screen,
 * which is the opposite of what a demonstration is for. And the precedence has
 * to be all-or-nothing: a recorded book wins entirely, never merged with this
 * one. Blending a real total with an invented one and leaving nothing on screen
 * to separate them is a failure this project has already had once.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const baseline = require('../services/capital-baseline');
const metrics  = require('../services/capital-metrics');
const forecast = require('../services/capital-forecast');

const raw = JSON.parse(fs.readFileSync(baseline.BOOK_PATH, 'utf8'));
const book = baseline.baselineBook();

describe('The file is where it should be, and says what it is', () => {
  test('it sits with the other versioned data, not in a database', () => {
    expect(baseline.BOOK_PATH).toContain(path.join('data', 'capital', 'book.json'));
    expect(baseline.isAvailable()).toBe(true);
  });

  test('it explains the precedence rule on its own face', () => {
    expect(raw._meta.precedence).toMatch(/win ENTIRELY/);
    expect(raw._meta.precedence).toMatch(/never blended/);
  });

  test('it says the figures are invented', () => {
    expect(raw._meta.figures).toMatch(/Invented/);
  });

  test('nothing downstream can mutate it', () => {
    // A caller that edited the baseline would be changing every future
    // request's starting position — action at a distance that makes a figure
    // impossible to trace.
    expect(Object.isFrozen(baseline.readBaseline().portfolios[0])).toBe(true);
    expect(book.portfolios[0]).not.toBe(baseline.readBaseline().portfolios[0]);
  });
});

describe('The book reconciles with itself', () => {
  const cap = metrics.capitalPosition({ ...book, storage: null });

  test('payments sum to the deployed figure', () => {
    const disbursed = book.payments.filter(p => p.kind === 'disbursement')
      .reduce((t, p) => t + p.amount, 0);
    const repaid = book.payments.filter(p => p.kind === 'repayment')
      .reduce((t, p) => t + p.amount, 0);
    expect(cap.paid).toBe(disbursed - repaid);
  });

  test('every payment is against an investment that exists', () => {
    const ids = new Set(book.investments.map(i => i.id));
    for (const p of book.payments) expect(ids.has(p.investmentId)).toBe(true);
  });

  test('every investment belongs to a portfolio that exists', () => {
    const ids = new Set(book.portfolios.map(p => p.id));
    for (const i of book.investments) expect(ids.has(i.portfolioId)).toBe(true);
  });

  test('a payment carries the portfolio of its investment', () => {
    for (const p of book.payments) {
      const inv = book.investments.find(i => i.id === p.investmentId);
      expect(p.portfolioId).toBe(inv.portfolioId);
    }
  });

  test('nothing is drawn beyond what was committed to it', () => {
    for (const inv of book.investments) {
      const drawn = book.payments
        .filter(p => p.investmentId === inv.id && p.kind !== 'fee')
        .reduce((t, p) => t + (p.kind === 'repayment' ? -p.amount : p.amount), 0);
      expect(drawn).toBeLessThanOrEqual(inv.commitment);
    }
  });

  test('the phased series sums back to the roll-up', () => {
    const led = metrics.emissionsLedger(book);
    const ser = forecast.bookSeries(book, { fromYear: 2026 });
    expect(ser.totals.forward_tCO2e).toBe(led.forward);
    expect(ser.totals.avoided_tCO2e).toBe(led.avoided);
  });
});

describe('Every investment carries what the forecast needs', () => {
  test.each(book.investments.map(i => [i.name, i]))('%s', (_name, inv) => {
    expect(Number.isFinite(inv.startYear)).toBe(true);
    expect(Object.keys(forecast.PROFILES)).toContain(inv.phasing);
    expect(Number.isFinite(inv.tenorYears)).toBe(true);
    expect(inv.tenorYears).toBeGreaterThan(0);
  });

  test('a build is front-loaded and an operating asset is not', () => {
    // A1 to A5 land while the thing is being built. Levelling them across a
    // twelve-year tenor would understate the early years fourfold.
    const penang = book.investments.find(i => i.id === 'inv_penang_logistics');
    const marina = book.investments.find(i => i.id === 'inv_marina_bay');
    expect(penang.phasing).toBe('construction');
    expect(marina.phasing).toBe('level');
  });
});

describe('It needs no external service', () => {
  test('the module reaches for the filesystem, never a client', () => {
    // Comments stripped first — this file explains why it does not use
    // Firebase, and the explanation is not a dependency.
    const code = fs.readFileSync(require.resolve('../services/capital-baseline'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/firebase|firestore|fetch\(|axios/i);
    expect(code).toMatch(/require\('fs'\)/);
  });

  test('a missing file yields nothing rather than an outage', () => {
    // A missing baseline means the screen has nothing to show, which the caller
    // already knows how to say. Crashing would turn a gap into an outage.
    const real = baseline.BOOK_PATH;
    baseline._reset();
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
      if (p === real) throw new Error('ENOENT');
      return jest.requireActual('fs').readFileSync(p, ...rest);
    });
    expect(baseline.baselineBook()).toBeNull();
    expect(baseline.isAvailable()).toBe(false);
    spy.mockRestore();
    baseline._reset();
    expect(baseline.isAvailable()).toBe(true);
  });
});
