/**
 * The Dashboard, and the two ways it was not working.
 *
 * The first was a spinner that never came down. `navigateTo()` loads a page's
 * data, and it was only ever reached by clicking a nav item. A returning user
 * — session already in localStorage, page reloaded — was shown the Dashboard
 * by the inline display:block on #page-dashboard while `Dashboard.init()` never
 * ran, so "Loading portfolio data…" sat there indefinitely. From a browser that
 * is indistinguishable from a backend that never answers, which is what it was
 * reported as.
 *
 * The second was quieter and worse. GET /v1/portfolio answers 200 with
 * `totalProjects: 0` when no projects are linked to the API key. That was
 * treated as success, so no banner was shown — and then the asset-class bars,
 * the region table, the data-quality split and the regulatory readiness table
 * were filled in from a demo constant. A real total of zero sat beside invented
 * bars with nothing on the screen to tell a reader which was which.
 *
 * These tests read the shipped files rather than a rendering of them, because
 * both defects were in the wiring, not in any function a unit test would call.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const appJs  = read('ui', 'app.js');
const html   = read('ui', 'index.html');
const dashJs = read('ui', 'js', 'dashboard.js');
const css    = read('ui', 'styles.css');
const sample = JSON.parse(read('ui', 'data', 'portfolio-sample.json'));

describe('A returning user lands on a page rather than on a spinner', () => {
  test('the router runs on load, not only on a nav click', () => {
    expect(appJs).toContain('_landOnFirstPage');
    expect(appJs).toMatch(/_landOnFirstPage\(\);/);
  });

  test('landing goes through navigateTo, so it is the same path as clicking', () => {
    const fn = appJs.slice(appJs.indexOf('function _landOnFirstPage'));
    expect(fn.slice(0, 600)).toContain('navigateTo(landing)');
  });

  test('it does not navigate while the login screen is up', () => {
    const fn = appJs.slice(appJs.indexOf('function _landOnFirstPage'), appJs.indexOf('_landOnFirstPage();'));
    expect(fn).toMatch(/Auth\.isLoggedIn\(\)/);
    expect(fn).toMatch(/if \(!loggedIn\) return;/);
  });

  test('the landing page respects the role gate rather than assuming dashboard', () => {
    const fn = appJs.slice(appJs.indexOf('function _landOnFirstPage'), appJs.indexOf('_landOnFirstPage();'));
    expect(fn).toContain('Auth.getDefaultPage()');
  });

  test('the login screen calls the router directly', () => {
    expect(html).toContain('window.CARBONIQ_navigateTo(defaultPage)');
  });

  test('the loader comes down on every outcome, including a failure', () => {
    const render = dashJs.slice(dashJs.indexOf('function _renderDashboard'));
    const guardAt  = render.indexOf("_source?.mode === 'unavailable'");
    const loaderAt = render.indexOf("loader.style.display = 'none'");
    expect(loaderAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(loaderAt);   // hidden before we can bail out
  });
});

describe('Sample figures are named as samples, and never blended', () => {
  test('the demo constant is gone from the module', () => {
    expect(dashJs).not.toMatch(/\bconst DEMO\b/);
    expect(dashJs).not.toMatch(/= DEMO\./);
  });

  test('the sample book is a data file, not a literal in the code', () => {
    expect(dashJs).toContain("/data/portfolio-sample.json");
    expect(sample._meta.label).toBe('SAMPLE DATA');
  });

  test('an empty portfolio is a named state, distinct from an unreachable API', () => {
    expect(dashJs).toContain("cause = 'empty'");
    expect(dashJs).toContain("cause = 'unreachable'");
    expect(dashJs).toContain("mode: 'sample'");
    expect(dashJs).toContain("mode: 'unavailable'");
  });

  test('the empty case explains the remedy, which is not the same as a 401', () => {
    expect(dashJs).toMatch(/no projects are linked to this API key/i);
    expect(dashJs).toMatch(/npm run key:create/);
  });

  test('a live portfolio is never topped up from the sample', () => {
    // The old code did exactly this, six times over.
    for (const field of ['assetClasses', 'assetTypes', 'dqDistribution', 'regions', 'regulatoryReadiness']) {
      expect(dashJs).not.toMatch(new RegExp(`data\\.${field}\\s*=\\s*(DEMO|_sample|sample)\\.`));
    }
  });

  test('a panel the portfolio does not carry is reported absent', () => {
    expect(dashJs).toContain('function _absent');
    expect(dashJs).toMatch(/does not carry an asset-class breakdown/);
    expect(css).toContain('.dash-absent');
  });

  test('a missing data-quality score is reported, never rendered as zero', () => {
    expect(dashJs).toContain("const DQ_ABSENT = 'not reported'");
    expect(dashJs).not.toMatch(/\$\('dash-dq-value'\)[\s\S]{0,200}d\.weightedDQ\.toFixed\(2\)`/);
  });

  test('every rendering of the score states the direction of the scale', () => {
    // 1 is the best of five. Printed bare it is read as a mark out of five.
    const shown = dashJs.match(/1 = best[^`]*/g) || [];
    expect(shown.length).toBeGreaterThan(0);
    for (const s of shown) expect(s).toContain('1–5');
  });
});

describe('The sample book reconciles with itself', () => {
  const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

  test('region emissions sum to the portfolio total', () => {
    expect(sum(sample.regions, 'emissions')).toBe(sample.totalFinancedEmissions_tCO2e);
  });

  test('asset-class emissions sum to the same total', () => {
    expect(sum(sample.assetClasses, 'value')).toBe(sample.totalFinancedEmissions_tCO2e);
  });

  test('region outstanding sums to the portfolio outstanding', () => {
    expect(sum(sample.regions, 'outstanding')).toBe(sample.totalOutstanding);
  });

  test('project counts agree three ways', () => {
    const tax = sample.taxonomyDistribution;
    expect(tax.green + tax.transition + tax.brown).toBe(sample.totalProjects);
    expect(sum(sample.regions, 'projects')).toBe(sample.totalProjects);
  });

  test('the asset-type mix is a percentage split', () => {
    expect(sum(sample.assetTypes, 'value')).toBe(100);
  });

  test('the weighted data-quality score is the mean of its own distribution', () => {
    // It was 2.4 beside a distribution that averaged 2.56 — a headline figure
    // contradicted by the chart printed under it.
    const dist = sample.dqDistribution;
    const total = Object.values(dist).reduce((t, v) => t + v, 0);
    expect(total).toBe(100);
    const mean = Object.entries(dist).reduce((t, [score, share]) => t + Number(score) * share, 0) / 100;
    expect(Number(mean.toFixed(2))).toBe(sample.weightedDQ);
  });

  test('coverage is the resolved share of what was requested', () => {
    const { requestedProjects, resolvedProjects } = sample.meta;
    expect(Math.round((resolvedProjects / requestedProjects) * 100)).toBe(sample.coveragePct);
  });

  test('every contributor carries the fields the table and the CSV read', () => {
    for (const p of sample.topContributors) {
      for (const k of ['projectId', 'name', 'financedEmissions_tCO2e', 'classification', 'region', 'buildingType', 'loanOutstanding', 'cfsScore']) {
        expect(p[k]).toBeDefined();
      }
      expect(['green', 'transition', 'brown']).toContain(p.classification);
    }
  });

  test('the file says what it is and how to replace it', () => {
    expect(sample._meta.what).toMatch(/invented/i);
    expect(sample._meta.howToReplace).toMatch(/API key/i);
  });
});

describe('The chart says what it is measuring', () => {
  test('the asset-class chart names its unit and its baseline', () => {
    // Four numbers with no unit are four numbers.
    expect(html).toMatch(/chart-sub">Financed emissions, tCO2e · bars start at zero/);
    expect(css).toContain('.chart-sub');
  });

  test('the scale phrase wraps whole rather than breaking after "of"', () => {
    // "1 = best of 1–5" states the direction of a scale people read backwards.
    // Split across a line it stops reading as one thing.
    expect(css).toMatch(/\.kpi-unit \{[^}]*white-space: nowrap/);
  });
});

describe('The asset-class bars actually have height', () => {
  test('the bar sits in a track that owns the height', () => {
    // A percentage height against a parent sized by its own text resolves to
    // zero: labels and values rendered, no bars.
    expect(dashJs).toContain('bar-track');
    expect(css).toMatch(/\.bar-track \{[\s\S]*?flex: 1 1 auto;/);
    expect(css).toMatch(/\.bar-chart \{[\s\S]*?align-items: stretch;/);
  });

  test('the label and value classes the module emits are styled', () => {
    expect(css).toContain('.bar-value');
    expect(css).toContain('.bar-label');
  });
});
