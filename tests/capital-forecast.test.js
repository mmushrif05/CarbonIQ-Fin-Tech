/**
 * The time axis.
 *
 * This phase exists to make a forecast possible and to change nothing while
 * doing it. Adding a time axis to a book is only safe if it can be proved to
 * leave today's totals exactly where they were, so the first suite here is the
 * acceptance test for the whole phase: the year-by-year series has to sum back
 * to the scalars the roll-up already reports.
 *
 * That test found a real defect. Rounding each year to two decimals and then
 * adding the years up drifted the series 0.1 tCO2e away from the roll-up it
 * sits beneath. A curve that does not add up to the number printed beside it
 * is worse than no curve, so rounding now happens once, where a figure is
 * displayed.
 */

'use strict';

const forecast = require('../services/capital-forecast');
const metrics  = require('../services/capital-metrics');
const demo     = require('../services/capital-demo-data');

const investments = [...demo.HELD, ...demo.PIPELINE];
const BOOK = {
  portfolios: demo.PORTFOLIOS,
  investments,
  payments: demo.PAYMENTS.map(p => ({
    ...p,
    portfolioId: investments.find(i => i.id === p.investmentId).portfolioId,
  })),
};

const YEAR = 2026;

describe('The acceptance test for this phase: the curve adds up to the figure above it', () => {
  const ledger = metrics.emissionsLedger(BOOK);
  const series = forecast.bookSeries(BOOK, { fromYear: YEAR });

  /* Checked on both attribution bases. When only the roll-up knew about
     attribution, the curve was drawn from the unattributed figures and stopped
     reconciling — the defect this invariant exists to catch. */
  test.each(['outstanding', 'commitment'])('on the %s basis, all three series reconcile', (basis) => {
    const led = metrics.emissionsLedger(BOOK, { attributionBasis: basis });
    const ser = forecast.bookSeries(BOOK, { fromYear: YEAR, attributionBasis: basis });
    expect(ser.totals.forward_tCO2e).toBe(led.forward);
    expect(ser.totals.reduction_tCO2e).toBe(led.reduction);
    expect(ser.totals.avoided_tCO2e).toBe(led.avoided);
  });

  test('forward emissions sum back to the roll-up, exactly', () => {
    expect(series.totals.forward_tCO2e).toBe(ledger.forward);
  });

  test('so do reduction and avoidance', () => {
    expect(series.totals.reduction_tCO2e).toBe(ledger.reduction);
    expect(series.totals.avoided_tCO2e).toBe(ledger.avoided);
  });

  test('the dashboard payload agrees with itself', () => {
    const d = metrics.dashboard(BOOK, { fromYear: YEAR });
    expect(d.forecast.emissions.totals.forward_tCO2e).toBe(d.emissions.forward);
    expect(d.forecast.emissions.totals.avoided_tCO2e).toBe(d.emissions.avoided);
  });

  test('planned drawdown sums to what is committed and undrawn', () => {
    const cap = forecast.capitalSeries(BOOK, { fromYear: YEAR });
    expect(cap.totalPlanned).toBe(metrics.capitalPosition(BOOK).undrawnCommitment);
  });

  test('the horizon covers the book rather than stopping short of it', () => {
    // A curve that ends before the book does hides emissions already committed
    // to, and the total under it would not reconcile with the figure above it.
    const longest = Math.max(...investments
      .filter(i => ['committed', 'deployed', 'exited'].includes(i.status))
      .map(i => i.tenorYears));
    expect(series.years).toBeGreaterThanOrEqual(longest);
  });
});

describe('The shape is an assumption, and it is named', () => {
  test('every profile sums to one, whatever the term', () => {
    for (const id of Object.keys(forecast.PROFILES)) {
      for (const years of [1, 2, 3, 7, 12, 20]) {
        const w = forecast.weightsFor(id, years);
        expect(w).toHaveLength(years);
        expect(w.reduce((t, v) => t + v, 0)).toBeCloseTo(1, 10);
        for (const v of w) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('construction is front-loaded and then stops', () => {
    // A1 to A5 land while the asset is built, not across the life of the loan.
    const w = forecast.weightsFor('construction', 12);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
    expect(w.slice(3).every(v => v === 0)).toBe(true);
    expect(w[0]).toBeGreaterThan(1 / 12 * 4);   // four times the level rate
  });

  test('a fixed profile truncated by a short term keeps the whole total', () => {
    expect(forecast.weightsFor('construction', 2).reduce((t, v) => t + v, 0)).toBeCloseTo(1, 10);
    expect(forecast.weightsFor('construction', 1)).toEqual([1]);
  });

  test('level is level', () => {
    const w = forecast.weightsFor('level', 4);
    expect(w).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  test('build-then-operate is quiet after the build, not flat throughout', () => {
    const w = forecast.weightsFor('buildThenOperate', 10);
    expect(w[0]).toBe(w[1]);
    expect(w[0]).toBeGreaterThan(w[2]);
    expect(w[2]).toBe(w[9]);
  });

  test('an unknown profile falls back to level rather than to nothing', () => {
    expect(forecast.weightsFor('wishful', 4)).toEqual(forecast.weightsFor('level', 4));
  });

  test('the profiles in play are reported, with the reason for each', () => {
    const s = forecast.bookSeries(BOOK, { fromYear: YEAR });
    expect(s.profiles.length).toBeGreaterThan(0);
    for (const p of s.profiles) {
      expect(p.label).toBeTruthy();
      expect(p.note).toBeTruthy();
    }
  });
});

describe('What is ahead is phased from now, not from the original start', () => {
  test('an investment already running phases its remainder over what is left', () => {
    // `forward` is by definition what is still ahead. Phasing it from an
    // original start year would place part of the total in the past, where it
    // would vanish from the curve and stop the series reconciling.
    const started2020 = {
      id: 'x', name: 'Old', status: 'deployed', commitment: 1, tenorYears: 10,
      startYear: 2020, phasing: 'level',
      emissions: { forward_tCO2e: 100 },
    };
    const s = forecast.investmentSeries(started2020, { fromYear: 2026, attributionBasis: 'commitment' });
    expect(s.remainingYears).toBe(4);                  // 2020 + 10 − 2026
    expect(s.rows.reduce((t, r) => t + r.forward_tCO2e, 0)).toBeCloseTo(100, 6);
    expect(s.rows[0].year).toBe(2026);
  });

  test('a term already past still reports its remainder rather than losing it', () => {
    const done = {
      id: 'y', name: 'Ended', status: 'deployed', tenorYears: 2, startYear: 2000,
      phasing: 'level', emissions: { forward_tCO2e: 50 },
    };
    const s = forecast.investmentSeries(done, { fromYear: 2026, attributionBasis: 'commitment' });
    expect(s.remainingYears).toBe(1);
    expect(s.rows[0].forward_tCO2e).toBeCloseTo(50, 6);
  });
});

describe('The grid assumption touches avoidance and nothing else', () => {
  const flat = forecast.bookSeries(BOOK, { fromYear: YEAR, gridDeclinePctPerYear: 0 });
  const decl = forecast.bookSeries(BOOK, { fromYear: YEAR, gridDeclinePctPerYear: 3 });

  test('a decarbonising grid avoids less', () => {
    expect(decl.totals.avoided_tCO2e).toBeLessThan(flat.totals.avoided_tCO2e);
  });

  test('it does not change what anything emitted', () => {
    // A cleaner grid does not retroactively alter a building's emissions.
    expect(decl.totals.forward_tCO2e).toBe(flat.totals.forward_tCO2e);
    expect(decl.totals.reduction_tCO2e).toBe(flat.totals.reduction_tCO2e);
  });

  test('holding the grid flat is named as the assumption it is', () => {
    expect(flat.notes.grid).toMatch(/conservative in one direction only/);
    expect(decl.notes.grid).toMatch(/3% a year/);
  });
});

describe('What the series refuses to do', () => {
  const series = forecast.bookSeries(BOOK, { fromYear: YEAR });

  test('it never combines the three lines into one', () => {
    for (const row of series.rows) {
      expect(row).not.toHaveProperty('net_tCO2e');
      expect(row).not.toHaveProperty('total_tCO2e');
    }
    expect(series.notes.separation).toMatch(/never combined into one line/);
  });

  test('the source carries no subtraction of avoidance from emissions', () => {
    const src = require('fs').readFileSync(require.resolve('../services/capital-forecast'), 'utf8');
    expect(src).not.toMatch(/forward[^;\n]*-[^;\n]*avoided/);
    expect(src).not.toMatch(/avoided[^;\n]*-[^;\n]*forward/);
  });

  test('it draws no confidence band, and says why', () => {
    for (const row of series.rows) {
      expect(row).not.toHaveProperty('low');
      expect(row).not.toHaveProperty('high');
    }
    expect(series.notes.horizon).toMatch(/no confidence band/);
  });

  test('years past the horizon are marked indicative rather than hidden', () => {
    const beyond = series.rows.filter(r => r.indicative);
    expect(beyond.length).toBeGreaterThan(0);
    expect(series.rows.filter(r => !r.indicative)).toHaveLength(forecast.CONFIDENCE_HORIZON_YEARS);
    expect(series.confidenceHorizonYear).toBe(YEAR + forecast.CONFIDENCE_HORIZON_YEARS - 1);
  });

  test('every year is named a projection, not a plan', () => {
    expect(series.notes.projection).toMatch(/not a plan/);
    expect(series.notes.projection).toMatch(/not a measurement/);
  });

  test('a pipeline project is not in the curve of what the book will emit', () => {
    // Putting it there would report a decision nobody has taken.
    const base = forecast.bookSeries(BOOK, { fromYear: YEAR, attributionBasis: 'commitment' });
    const withOne = forecast.bookSeries(BOOK, {
      fromYear: YEAR, attributionBasis: 'commitment', include: ['inv_jaffna_minigrid'],
    });
    expect(withOne.totals.avoided_tCO2e).toBeGreaterThan(base.totals.avoided_tCO2e);
    expect(withOne.investments).toBe(base.investments + 1);
  });
});

describe('Capital over time', () => {
  test('what has been drawn is history and needs no assumption', () => {
    const cap = forecast.capitalSeries(BOOK, { fromYear: YEAR });
    expect(cap.note).toMatch(/taken from the payment log and needs no assumption/);
  });

  test('the drawdown pace is an assumption, and changing it moves the shape not the total', () => {
    const fast = forecast.capitalSeries(BOOK, { fromYear: YEAR, drawdownYears: 1 });
    const slow = forecast.capitalSeries(BOOK, { fromYear: YEAR, drawdownYears: 5 });
    expect(fast.totalPlanned).toBe(slow.totalPlanned);
    expect(fast.rows[0].plannedDrawdown).toBeGreaterThan(slow.rows[0].plannedDrawdown);
  });
});
