/**
 * The curve — how the book moves from here.
 *
 * A projection is the easiest thing on a dashboard to draw confidently and
 * wrongly, so the four rules that keep this one honest are pinned here rather
 * than left to the renderer's good intentions:
 *
 *   1. Never net. Emissions, reduction and avoidance are three separate
 *      series. There is no subtraction, no stacking and no crossing point —
 *      PCAF reports avoided emissions apart from the inventory and never sets
 *      them against it (Part A, p.126).
 *   2. Never let a projection look measured. Every year on this chart is ahead
 *      of today, so the whole plot is hatched and the current year is marked.
 *   3. Never call a scenario a plan. The assumptions that produced the curve
 *      print underneath it, so a screenshot carries them.
 *   4. Never hide the shape you assumed. The phasing profiles in play are
 *      named, and the year past which a figure is a direction is on the axis.
 *
 * Two defects the browser found are pinned too, because both passed their unit
 * tests: a null horizon collapsing the drawdown series to a single year, and a
 * "peak year" claimed on a book whose top is a plateau.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const html    = read('ui', 'index.html');
const dashJs  = read('ui', 'js', 'dashboard.js');
const css     = read('ui', 'styles.css');
const forecast = read('services', 'capital-forecast.js');

const curve = dashJs.slice(dashJs.indexOf('function _renderCurve'), dashJs.indexOf('function _wireCurve'));

const { capitalSeries, bookSeries } = require('../services/capital-forecast');
const { baselineBook } = require('../services/capital-baseline');

describe('The curve is on the page and drawn from the engine', () => {
  test('the chart, its readout, its facts and its assumptions all have a home', () => {
    for (const id of ['cap-curve', 'fc-sub', 'fc-toggles', 'fc-chart', 'fc-readout', 'fc-facts', 'fc-assumptions']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('it plots the forecast the API returned rather than extrapolating in the browser', () => {
    expect(curve).toMatch(/const s = f\.emissions/);
    expect(curve).toMatch(/s\.rows/);
    expect(curve).not.toMatch(/Math\.pow\(/);
  });
});

describe('Rule 1 — never net', () => {
  test('the three series are separate, and no fourth combines them', () => {
    const keys = Object.keys({ forward: 1, reduction: 1, avoided: 1 });
    for (const k of keys) expect(dashJs).toMatch(new RegExp(`${k}:\\s*\\{ key:`));
    expect(curve).not.toMatch(/net|Net /);
  });

  test('nothing in the renderer subtracts one series from another', () => {
    /* The tempting chart is emissions minus avoidance trending to zero. */
    expect(curve).not.toMatch(/forward_tCO2e\s*-\s*/);
    expect(curve).not.toMatch(/-\s*r\.avoided_tCO2e/);
    expect(curve).not.toMatch(/-\s*r\.reduction_tCO2e/);
  });

  test('areas are drawn to the zero baseline, never onto the series below', () => {
    expect(curve).toMatch(/py\(0\)/);
    expect(curve).not.toMatch(/stack|cumulative/i);
  });

  test('the caption says the series are never summed', () => {
    expect(curve).toMatch(/three separate series, never summed/);
  });
});

describe('Rule 2 — a projection never looks measured', () => {
  test('the whole plot is hatched, and the hatch means projection', () => {
    expect(curve).toContain('id="fcHatch"');
    expect(curve).toMatch(/fill="url\(#fcHatch\)"/);
    expect(curve).toMatch(/it means projection, and every/);
  });

  test('today is marked and labelled', () => {
    expect(curve).toMatch(/class="fc-today"/);
    expect(curve).toMatch(/— today/);
    expect(css).toMatch(/\.fc-today\b/);
  });

  test('the sub-heading states that every year ahead is a projection', () => {
    expect(curve).toMatch(/every year ahead is a projection/);
  });

  test('the year past which a figure is a direction is drawn on the plot', () => {
    expect(curve).toMatch(/indicative beyond here/);
    expect(curve).toMatch(/r\.indicative/);
  });
});

describe('Rule 3 — a scenario is never called a plan', () => {
  test('the assumptions that produced the curve print beneath it', () => {
    expect(curve).toMatch(/fc-assumptions/);
    expect(curve).toMatch(/s\.notes\.projection/);
    expect(curve).toMatch(/s\.notes\.horizon/);
    expect(curve).toMatch(/s\.notes\.grid/);
  });

  test('the drawdown figure carries the note that explains how it was spread', () => {
    expect(curve).toMatch(/cap\.note/);
  });
});

describe('Rule 4 — the assumed shape is named', () => {
  test('the phasing profiles in play are printed as a fact, not buried', () => {
    expect(curve).toMatch(/Phasing in play/);
    expect(curve).toMatch(/s\.profiles\.map/);
  });

  test('each profile explains itself in the assumptions block', () => {
    expect(curve).toMatch(/s\.profiles\.map\(p => `\$\{p\.label\}: \$\{p\.note\}`\)/);
  });
});

describe('A peak is only claimed when one year genuinely stands out', () => {
  test('a shared top is reported as the range it is, not as its first year', () => {
    expect(curve).toMatch(/Highest years/);
    expect(curve).toMatch(/sit level at the top/);
  });

  test('a flat book is called level rather than given an arbitrary peak', () => {
    expect(curve).toMatch(/\['Shape', 'level'/);
  });

  test('the tolerance is explicit, so "stands out" is a measured claim', () => {
    expect(curve).toMatch(/top \* 0\.98/);
  });

  test('the baseline book has a plateau, so this is not a hypothetical', () => {
    const s = bookSeries(baselineBook(), { attributionBasis: 'outstanding' });
    const top = s.rows.reduce((m, r) => Math.max(m, r.forward_tCO2e), 0);
    const atTop = s.rows.filter(r => r.forward_tCO2e >= top * 0.98);
    expect(atTop.length).toBeGreaterThan(1);
  });
});

describe('The drawdown series covers the whole horizon, not one year of it', () => {
  test('a null horizon falls back to ten years rather than collapsing to one', () => {
    /* Math.round(null) is 0. A default parameter only covers undefined, so the
       span became 1 and the series reported one year's drawdown as the whole
       of it. The unit test passed because it called the function directly. */
    const book = baselineBook();
    const nulled = capitalSeries(book, { years: null });
    const defaulted = capitalSeries(book, {});
    expect(nulled.rows.length).toBe(defaulted.rows.length);
    expect(nulled.rows.length).toBeGreaterThan(1);
    expect(nulled.totalPlanned).toBe(defaulted.totalPlanned);
  });

  test('the guard is Number(years) || 10, and the reason is recorded', () => {
    expect(forecast).toMatch(/Math\.round\(Number\(years\) \|\| 10\)/);
    expect(forecast).toMatch(/default\s+parameter only covers undefined/);
  });

  test('the planned total equals what is committed and undrawn', () => {
    const book = baselineBook();
    const s = capitalSeries(book, { years: null });
    const summed = s.rows.reduce((t, r) => t + r.plannedDrawdown, 0);
    expect(Math.round(s.totalPlanned)).toBe(Math.round(summed));
  });
});

describe('The reader can put a series away, but not the whole chart', () => {
  test('the last visible series cannot be turned off', () => {
    const wire = dashJs.slice(dashJs.indexOf('function _wireCurve'));
    expect(wire).toMatch(/never leave an empty chart/);
    expect(wire).toMatch(/on === 1\) return/);
  });

  test('the readout totals every visible series, so the curve can be checked', () => {
    expect(curve).toMatch(/s\.totals\[FC\[k\]\.key\]/);
    expect(curve).toMatch(/over \$\{s\.years\} years/);
  });
});

describe('The curve uses the validated palette and no dark override', () => {
  test('its three colours are the ones the palette validator passed', () => {
    expect(dashJs).toMatch(/forward:\s*\{ key: 'forward_tCO2e',\s*label: 'Emissions',\s*colour: '#5e5ce6'/);
    expect(dashJs).toMatch(/colour: '#c77700'/);
    expect(dashJs).toMatch(/colour: '#1f6fb2'/);
  });

  test('the shell stylesheet still carries no prefers-color-scheme rule', () => {
    /* The shell has no dark palette; an override here is how the demo banner
       ended up at 1.5:1 on a phone. */
    expect(css).not.toMatch(/@media[^{]*prefers-color-scheme/);
  });
});
