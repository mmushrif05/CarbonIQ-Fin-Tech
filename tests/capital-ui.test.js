/**
 * The Dashboard, as the capital book.
 *
 * The engine holds three separations — committed is not paid, incurred is not
 * projected, and reduction and avoidance are not deductions — and a screen
 * that blurs any of them would make that care pointless. So the separations
 * are tested here too, on the markup and the renderer rather than on the
 * arithmetic.
 *
 * Also pinned: the palette is the validated one, the only texture in the
 * system means "projection" and nothing else, percentages that are parts of
 * one whole sum to 100, and the ranking is computed by the engine rather than
 * in the browser — a screen that scored differently from the API would be
 * showing one thing and disclosing another.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const html   = read('ui', 'index.html');
const dashJs = read('ui', 'js', 'dashboard.js');
const recJs  = read('ui', 'js', 'capital-record.js');
const css    = read('ui', 'styles.css');

const renderCapital   = dashJs.slice(dashJs.indexOf('function _renderCapital'), dashJs.indexOf('function _renderEmissions'));
const renderEmissions = dashJs.slice(dashJs.indexOf('function _renderEmissions'), dashJs.indexOf('function _renderPortfolioRows'));
const renderPipeline  = dashJs.slice(dashJs.indexOf('function _renderPipeline'), dashJs.indexOf('function _renderScatter'));
const renderScatter   = dashJs.slice(dashJs.indexOf('function _renderScatter'));

describe('The Dashboard reads the capital book', () => {
  test('it fetches the derived dashboard rather than assembling one', () => {
    expect(dashJs).toContain('/v1/capital/dashboard?');
    expect(dashJs).toContain('async function _fetchCapital');
  });

  test('the four capital figures are on the page', () => {
    for (const id of ['cap-allocated', 'cap-paid', 'cap-undrawn', 'cap-balance']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('committed and paid are separate tiles, not one figure', () => {
    expect(html).toMatch(/Committed, not yet drawn/);
    expect(html).toMatch(/Paid out/);
    expect(renderCapital).toMatch(/A commitment is a promise; a payment is a movement/);
  });

  test('balance is presented as derived, and over-deployment is not hidden', () => {
    expect(renderCapital).toMatch(/Derived from the payment log, never typed/);
    expect(renderCapital).toMatch(/c\.overDeployed/);
    expect(renderCapital).toMatch(/rather than held at zero/);
  });

  test('the three parts of the allocation are one bar, because they are one whole', () => {
    expect(html).toContain('id="cap-deploy-bar"');
    expect(renderCapital).toContain('cap-stack-seg');
    expect(css).toMatch(/\.cap-stack \{[\s\S]*?gap: 2px;/);   // a surface gap between fills
  });

  test('percentages that are parts of one whole sum to 100', () => {
    // Rounding each on its own gave 43 + 27 + 31 = 101, and a reader who adds
    // them up and gets 101 is right to stop trusting the screen.
    expect(dashJs).toContain('function _wholePercents');
    expect(renderCapital).toContain('_wholePercents');
  });
});

describe('The emissions ledger keeps its four lines apart on screen', () => {
  test('two blocks with a rule between them, and the rule says what it is for', () => {
    expect(html).toMatch(/cap-ledger-rule[\s\S]{0,120}never netted against the figures on the left/);
    expect(css).toMatch(/\.cap-ledger-rule \{[\s\S]*?border-left: 2px dashed/);
  });

  test('measured and projected are separate rows, never stacked', () => {
    expect(renderEmissions).toMatch(/Already incurred/);
    expect(renderEmissions).toMatch(/Expected over the remaining term/);
    expect(renderEmissions).not.toMatch(/incurred\s*\+\s*e\.forward/);
  });

  test('the projection is hatched, and that texture means only that', () => {
    expect(renderEmissions).toContain('hatch: true');
    expect(css).toMatch(/\.cap-row-fill\.is-projected \{[\s\S]*?repeating-linear-gradient/);
    /* One texture, one meaning. Every rule that uses it must be a
       `.is-projected` rule — the hatch says "this is a forecast" and must
       never come to mean anything else. */
    const rules = css.split('}').filter(chunk => chunk.includes('repeating-linear-gradient'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toMatch(/is-projected/);
  });

  test('reduction and avoidance carry what they are measured against', () => {
    expect(renderEmissions).toMatch(/Against each project’s own base year/);
    expect(renderEmissions).toMatch(/Against a counterfactual that did not happen/);
  });

  test('the notes from the engine are shown, not paraphrased', () => {
    expect(renderEmissions).toContain('e.inventoryNote');
    expect(renderEmissions).toContain('e.creditNote');
  });

});

/*
 * The evidence band.
 *
 * A data-quality score says how good the evidence behind a figure is. It does
 * not say whether anyone independent has checked it, and a reader shown only
 * the first supplies the second themselves — generously. So the two are stated
 * side by side, with the share of the book the score speaks for beside them,
 * and the band was lifted out of a footnote inside the emissions card because
 * it is what a regulator asks first.
 */
describe('The evidence band states three things, not one', () => {
  const dashJsAll = read('ui', 'js', 'dashboard.js');
  const renderEvidence = dashJsAll.slice(
    dashJsAll.indexOf('function _renderEvidence'),
    dashJsAll.indexOf('function _renderEvidence') + 3500);

  test('the section exists and is drawn from the payload', () => {
    expect(html).toContain('id="cap-evidence"');
    expect(dashJsAll).toMatch(/_renderEvidence\(d\);/);
  });

  test('an unscored holding is named as excluded rather than counted as zero', () => {
    expect(renderEvidence).toMatch(/excluded from the weighting rather than counted as zero/);
  });

  /*
   * "2.40" alone reads as a mark out of five to anyone who has not opened the
   * standard, which inverts a scale on which 1 is the best. The bands carry
   * the direction, and both ends are named.
   */
  test('the score is drawn on its scale, with the direction stated', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`data-band="${n}"`);
    expect(html).toMatch(/best evidence/);
    expect(html).toMatch(/weakest/);
    expect(html).toMatch(/1 is the best of 1–5/);
    expect(renderEvidence).toMatch(/is-here/);
  });

  test('an absent score is a word, never a zero', () => {
    expect(renderEvidence).toMatch(/dq\.weighted == null/);
    expect(renderEvidence).toMatch(/Not reported/);
    // Number(null) is 0 and 0 is finite: absence is checked before the number.
    expect(renderEvidence).not.toMatch(/dq\.weighted \|\| 0/);
  });

  test('coverage says what share of the book the score speaks for', () => {
    expect(html).toContain('id="cap-dq-coverage"');
    expect(renderEvidence).toMatch(/investmentsScored/);
    expect(renderEvidence).toMatch(/investmentsWithoutScore/);
  });

  /* A bar drawn on an inline element renders as nothing, which reads as a
     coverage of zero rather than a missing element. */
  test('the coverage bar is a block', () => {
    expect(css).toMatch(/\.cap-ev-bar > span \{[^}]*display: block/);
  });

  test('the assurance state is shown beside the score, never inferred', () => {
    expect(html).toMatch(/data-assurance="financed"/);
    expect(renderEvidence).toMatch(/CarbonIQAssurance/);
    // Declared or absent. Nothing in the renderer decides it from the figures.
    expect(renderEvidence).not.toMatch(/assured\s*=\s*(true|false)/);
  });

  /* The grid must collapse. `minmax(240px, 1fr)` is 240px wide whatever the
     container is, which is one of the two shapes that put horizontal overflow
     on nine pages of this application. */
  test('the band collapses on a narrow screen', () => {
    expect(css).toMatch(/\.cap-evidence \{[\s\S]*?minmax\(min\(100%, 240px\), 1fr\)/);
  });
});

describe('The pipeline and its weighting', () => {
  test('the slider is a real control with both ends labelled', () => {
    expect(html).toContain('id="cap-weight"');
    expect(html).toMatch(/cap-weight-end">Financial return/);
    expect(html).toMatch(/cap-weight-end">Carbon impact/);
  });

  test('the ranking is recomputed by the engine, never in the browser', () => {
    // A screen that scored differently from the API would show one thing and
    // disclose another.
    expect(dashJs).toMatch(/_carbonWeight = Number\(weight\.value\) \/ 100/);
    expect(dashJs).toContain('refreshCapital');
    expect(dashJs).not.toMatch(/carbonWeight\s*\*\s*\w+\s*\+\s*\(1 - carbonWeight\)/);
  });

  test('the slider is debounced, because it fires continuously', () => {
    expect(dashJs).toMatch(/clearTimeout\(_weightTimer\)/);
  });

  test('the weighting note from the engine is printed beside the rank', () => {
    expect(renderPipeline).toContain('p.weightingNote');
  });

  test('an unscoreable project is shown unscored, with what is missing', () => {
    expect(renderPipeline).toMatch(/not scored/);
    expect(renderPipeline).toContain('r.missing.join');
    expect(html).toContain('id="cap-unrankable-note"');
  });

  test('an unpriced return is named as unpriced, not shown as 0%', () => {
    expect(renderPipeline).toMatch(/not priced/);
  });

  test('what is waiting is grouped by type, with capital and contribution', () => {
    expect(html).toContain('id="cap-bytype-rows"');
    expect(renderPipeline).toContain('p.byType.map');
  });
});

describe('The scatter', () => {
  test('both axes start at zero', () => {
    expect(renderScatter).toMatch(/const x0 = 0/);
    expect(renderScatter).toMatch(/const y0 = -yMax \* 0\.06/);   // axis at zero, pad below it
    expect(renderScatter).toMatch(/the axis marks zero/);
  });

  test('area carries capital, so a large ask looks like one', () => {
    expect(renderScatter).toMatch(/Math\.sqrt/);                  // area, not radius
  });

  test('colour follows the entity — rank is a ring and a label, not a repaint', () => {
    expect(css).toMatch(/\.cap-dot \{[\s\S]*?fill: #00875a;/);
    expect(css).toMatch(/\.cap-dot\.is-lead \{[\s\S]*?stroke: #00875a;/);
    expect(renderScatter).toMatch(/r\.rank <= 2/);                // selective labels
  });

  test('every mark carries a hover title', () => {
    expect(renderScatter).toContain('<title>');
  });

  test('overlapping marks stay countable', () => {
    expect(css).toMatch(/\.cap-dot \{[\s\S]*?stroke: var\(--surface\); stroke-width: 2;/);
  });

  test('fewer than two points is said, not drawn as an empty frame', () => {
    expect(renderScatter).toMatch(/a scatter needs at least two to compare/);
    expect(renderScatter).toMatch(/nothing to plot/);
  });

  test('it is labelled for a screen reader', () => {
    expect(renderScatter).toContain('role="img"');
    expect(renderScatter).toContain('aria-label=');
  });
});

describe('The palette is the validated one', () => {
  test('the four categorical hues are the ones the validator passed', () => {
    // Lightness band, chroma floor, CVD separation (worst adjacent deutan
    // ΔE 23.4), normal-vision floor and contrast all PASS against this surface.
    const cap = dashJs.slice(dashJs.indexOf('const CAP = {'), dashJs.indexOf('let _capital'));
    for (const hex of ['#00875a', '#5e5ce6', '#c77700', '#1f6fb2']) {
      expect(cap).toContain(hex);
    }
  });

  test('text wears text tokens, never a series colour', () => {
    expect(css).toMatch(/\.cap-row-value \{[\s\S]*?color: var\(--text-primary\)/);
    expect(css).toMatch(/\.cap-axis-label \{[\s\S]*?fill: var\(--text-tertiary\)/);
  });
});

describe('Empty and failed states are distinguished', () => {
  const render = dashJs.slice(dashJs.indexOf('function _renderDashboard'), dashJs.indexOf('function _capitalMessage'));

  test('an unrecorded book is not a position of zero', () => {
    expect(render).toContain("state.mode === 'empty'");
    expect(render).toContain('d.emptyNote');
  });

  test('a worked example says so beside the figures, not only in a banner', () => {
    expect(render).toContain("_capitalMessage(d.sampleNote, 'sample')");
    expect(css).toContain('.cap-message.is-sample');
  });

  test('a failed read says the figures are blank because the request failed', () => {
    expect(render).toMatch(/unavailable because the request failed/);
  });

  test('the loader comes down before either bail-out', () => {
    const loaderAt = render.indexOf("loader.style.display = 'none'");
    const bailAt   = render.indexOf("mode === 'unavailable'");
    expect(loaderAt).toBeGreaterThan(-1);
    expect(bailAt).toBeGreaterThan(loaderAt);
  });

  test('a book that cannot be persisted says so', () => {
    expect(dashJs).toMatch(/durable === false/);
    expect(html).toContain('id="cap-storage"');
  });

  test('the sample banner no longer stamps the Dashboard', () => {
    // It belongs to the Portfolio screen. Captioning live recorded figures
    // "sample data — not your portfolio" was worse than saying nothing.
    const banner = dashJs.slice(dashJs.indexOf('function _renderDemoBanner'), dashJs.indexOf('const DQ_ABSENT'));
    expect(banner).toContain("const hosts = ['page-portfolio']");
    expect(banner).not.toContain("'page-dashboard'");
  });
});

describe('Recording the book', () => {
  test('the drawer covers allocation, investments and payments', () => {
    for (const id of ['crd-pf-save', 'crd-budget-save', 'crd-inv-save', 'crd-pay-save', 'crd-seed']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test('nothing in it computes a total', () => {
    // Balance and every roll-up come back from the engine, so a figure on the
    // dashboard cannot disagree with the records behind it.
    expect(recJs).not.toMatch(/allocated\s*-\s*paid/);
    expect(recJs).toContain('Dashboard.refreshCapital');
  });

  test('a blank return is recorded as unpriced, not as zero', () => {
    expect(recJs).toMatch(/expectedReturnPct: _num\('crd-inv-return'\)/);
    expect(recJs).toMatch(/A blank[\s\S]{0,60}stored as zero would rank the project as the worst return/);
    expect(html).toMatch(/blank → not yet priced/);
  });

  test('the form says the four emission lines are never netted', () => {
    expect(html).toMatch(/never netted against the inventory/);
  });

  test('a refusal names the cause and the remedy', () => {
    expect(recJs).toContain('function _fail');
    expect(recJs).toMatch(/err\.remedy/);
  });
});
