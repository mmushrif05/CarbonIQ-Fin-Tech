// @ts-check
/**
 * The browser computes nothing and holds no table.
 *
 * Three screens used to do their own arithmetic — the PCAF calculator's
 * attribution and scope split, the new-project wizard's bill priced on a
 * factor table and screened against thresholds it invented, the monitoring
 * page's fluctuation analysis over a sample series it carried — and the
 * Portfolio screen derived every share it printed from the counts. Every one
 * of those formulas and tables was published to any browser that loaded the
 * page, readable from the developer tools, and a figure a screen computes
 * for itself is one the engine never stood behind. They are routes now, and
 * this sweep refuses their return.
 *
 * The rule is the one the Fund Desk, the Bank Overview and the GCF Overview
 * already carry: a screen renders what the API returned. Geometry — a bar
 * scaled to the largest row, a fraction of a circle — is not a figure, and
 * `ui/js/charts.js` and `ui/js/format.js` are where that lives.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const modules = fs.readdirSync(path.join(ROOT, 'ui', 'js')).filter(f => f.endsWith('.js'));
const every = modules.map(f => source(`ui/js/${f}`));

describe('No table a browser could read', () => {
  test.each([
    ['an emission-factor table', /\b(concrete|steel|timber|glass|aluminium|masonry|insulation|plastics)\s*:\s*\{?\s*-?\d+(\.\d+)?\s*[,}]/],
    ['a density table', /\bDENSITIES\b/],
    ['a scope-split table', /\bSCOPE_SPLITS?\b/],
    ['a taxonomy tier table', /\bFRAMEWORKS\s*=\s*\[/],
    ['a sample monitoring history', /\bDEMO_HISTORY\b/],
    ['a GCF size-ceiling table', /\bSIZE_CEILING\s*=/],
    ['an invented intensity threshold', /\b(SG|EU|HK)_THRESHOLD\b/],
  ])('no module holds %s', (_label, pattern) => {
    for (const m of every) mustNot(m, pattern, `the browser holds no ${_label}: it is served by the API`);
  });

  test('the site publishes no data directory', () => {
    expect(fs.existsSync(path.join(ROOT, 'ui', 'data'))).toBe(false);
    for (const m of every) mustNot(m, /['"`]\/data\/[^'"`]*\.json/, 'a data file is never fetched from the site; figures come from /v1/');
  });
});

describe('The lending screens read the engine\'s answer', () => {
  const pcaf = source('ui/js/pcaf.js');
  const wizard = source('ui/js/new-project.js');
  const monitoring = source('ui/js/monitoring.js');
  const taxonomy = source('ui/js/taxonomy.js');
  const dashboard = source('ui/js/dashboard.js');

  test('the PCAF calculator asks POST /v1/lending/attribution and prints what comes back', () => {
    must(pcaf, "'/v1/lending/attribution'", 'the calculation is a request');
    mustNot(pcaf, /outstanding\s*\/\s*totalValue/, 'no attribution formula in the browser');
    mustNot(pcaf, /financedEmissions\s*\*\s*split/, 'no scope split in the browser');
    mustNot(pcaf, /\.reduce\(/, 'no sum in the browser');
    must(pcaf, 'answer.scopes.note', 'the indicative allocation is printed with what it is');
  });

  test('the wizard asks POST /v1/lending/estimate and POST /v1/taxonomy/screen', () => {
    must(wizard, "'/v1/lending/estimate'", 'the bill is priced by the engine');
    must(wizard, "'/v1/taxonomy/screen'", 'the quick-check is the engine\'s');
    mustNot(wizard, /qty\s*\*\s*factor|\*\s*factor\b/, 'no line is priced in the browser');
    mustNot(wizard, /\.reduce\(/, 'no total is summed in the browser');
    mustNot(wizard, /\/\s*\(equity\s*\+\s*debt\)/, 'no attribution in the browser');
    mustNot(wizard, /totalKgCO2e\s*\/\s*area/, 'no intensity in the browser');
  });

  test('the monitoring page reads the priced series and the comparison', () => {
    must(monitoring, /\/monitoring`\)/, 'the series is read from the monitoring route');
    must(monitoring, 'data.comparison', 'the comparison is the engine\'s');
    must(monitoring, 'h.timelineBarPct', 'the bar length is the engine\'s');
    mustNot(monitoring, /\/\s*\(equity\s*\+\s*debt\)/, 'no attribution in the browser');
    mustNot(monitoring, /\*\s*prev\.emissions|\*\s*cur\.attribution/, 'no fluctuation analysis in the browser');
    mustNot(monitoring, /\.reduce\(/, 'no sum in the browser');
    must(monitoring, 'Illustrative dataset — not client records.', 'the sample series is named on the page');
  });

  test('the taxonomy screen asks POST /v1/taxonomy/screen', () => {
    must(taxonomy, "'/v1/taxonomy/screen'", 'the screen is the engine\'s');
    mustNot(taxonomy, /intensity\s*<=\s*tier\.max/, 'no tier chosen in the browser');
    mustNot(taxonomy, /\/\s*maxThreshold/, 'no bar scale in the browser');
  });

  test('the Portfolio screen prints the derived shares the portfolio carries', () => {
    must(dashboard, "'/v1/portfolio/sample'", 'the sample book is served by the API');
    must(dashboard, 'd.derived.greenLoanPct', 'the green-loan share is the engine\'s');
    must(dashboard, 'd.derived.concentration', 'the concentration is the engine\'s');
    must(dashboard, 'd.derived.economicIntensity_tCO2e_per_M', 'the intensity is the engine\'s');
    mustNot(dashboard, /topContributors\.reduce\(/, 'no concentration summed in the browser');
    mustNot(dashboard, /totalFinancedEmissions_tCO2e\s*\/\s*\(d\.totalOutstanding/, 'no intensity in the browser');
    mustNot(dashboard, /tax\.green\s*\/\s*totalProj/, 'no share in the browser');
    must(dashboard, 'dq.coveragePct', 'the capital data-quality coverage is the engine\'s');
  });
});

describe('The other screens read the figure beside the series it describes', () => {
  test('Part C reads the material-path share and the Pareto share', () => {
    const js = source('ui/js/pcaf-partc.js');
    must(js, 'd.sensitivity.materialPathSharePct', 'the share is the engine\'s');
    must(js, 'd.paretoVitalFewShare', 'the arc is drawn from the engine\'s share');
    mustNot(js, /\.reduce\(\s*\(\s*t\s*,\s*[mv]\s*\)\s*=>\s*t\s*\+/, 'no share summed in the browser');
  });

  test('Part A reads the decline beside the lifetime series', () => {
    const js = source('ui/js/pcaf-parta.js');
    must(js, 'life.declinePct', 'the decline is the engine\'s');
    mustNot(js, /1\s*-\s*last\.avoided_tCO2e\s*\/\s*first\.avoided_tCO2e/, 'no decline computed in the browser');
  });

  test('the extract page converts no unit', () => {
    const js = source('ui/js/extract.js');
    mustNot(js, /_toKilograms/, 'no conversion in the browser');
    mustNot(js, /using standard density/, 'no density applied in the browser');
  });

  test('the GCF screen reads the size ceilings off the reference, and the desk the lifecycle total off the position', () => {
    must(source('ui/js/gcf.js'), 'state.reference.sizeCeilings_usd', 'the ceilings are the reference\'s');
    must(source('ui/js/desk.js'), 'Number(l.total)', 'the whole is the engine\'s count');
  });
});
