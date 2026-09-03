/**
 * The Part C result screen.
 *
 * It was rebuilt in the same idiom as the Part A screen — a hero, an
 * attribution bridge, a bento whose tile size encodes importance, the
 * data-quality scale drawn with its direction stated, and every table folded
 * behind a summary. Three things about that are worth holding in place with
 * tests, because each of them has already gone wrong once on this project.
 *
 * A renderer nobody calls. Two of the Part A renderers were written, unit
 * tested and never wired to the page, because the edit that was supposed to
 * call them did not match the file. A unit test cannot notice a function
 * nobody calls, so these tests read `render()` and check the calls are there.
 *
 * An element nobody fills. Every id the module writes to must exist in the
 * fragment. Seven files have to agree for a screen to appear at all.
 *
 * A score printed as a fraction. `3 / 5` reads as a mark out of five and
 * inverts a scale on which 1 is best. The sweep for that form already exists
 * in dq-rendering.test.js; what is checked here is that the direction is
 * stated wherever the number is shown.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const page = read('ui', 'pages', 'pcaf-partc.html');
const js   = read('ui', 'js', 'pcaf-partc.js');
const css  = read('ui', 'css', 'pcaf-partc.css');

const renderFn = js.slice(js.indexOf('  function render(d) {'), js.indexOf('  function showRegister('));

/** Every id the module writes to, so a renderer cannot target a missing node. */
const idsWritten = [...js.matchAll(/\$\('(partc[A-Za-z0-9]+)'\)/g)].map(m => m[1]);

describe('Every element the module writes to exists in the fragment', () => {
  test.each([...new Set(idsWritten)])('#%s is in the page', (id) => {
    expect(page).toContain(`id="${id}"`);
  });
});

describe('The renderers are actually called', () => {
  test.each([
    'renderHero', 'renderUseStage', 'renderDqTile',
    'renderModuleSplit', 'renderParetoArc', 'renderSummary',
  ])('render() calls %s', (fn) => {
    expect(js).toContain(`function ${fn}(`);
    expect(renderFn).toMatch(new RegExp(`\\b${fn}\\(d\\)`));
  });
});

describe('The hero carries the PCAF figure and nothing else', () => {
  test('it is A4 + A5 construction, named as such', () => {
    expect(page).toMatch(/partc-hero-eyebrow">The PCAF figure · A4 \+ A5 construction/);
  });

  test('the hero value is the construction total, not a sum with the use stage', () => {
    expect(renderFn).not.toMatch(/construction_tCO2e\s*\+\s*useStage/);
    const hero = js.slice(js.indexOf('function renderHero'), js.indexOf('function renderUseStage'));
    expect(hero).toContain("countTo($('partcHeroValue'), s.construction_tCO2e");
    expect(hero).not.toContain('useStage_');
  });

  test('the figure is named as the re/insurer’s own scope 3', () => {
    const hero = js.slice(js.indexOf('function renderHero'), js.indexOf('function renderUseStage'));
    expect(hero).toMatch(/re\/insurer's own scope 3/);
  });
});

describe('The attribution is drawn as a bridge', () => {
  const hero = js.slice(js.indexOf('function renderHero'), js.indexOf('function renderUseStage'));

  test('the three rows are present in the fragment', () => {
    expect(page).toContain('id="partcBridgeSegTotal"');
    expect(page).toContain('id="partcBridgeSegDrop"');
    expect(page).toContain('id="partcBridgeSegResult"');
  });

  test('the step down is the total less the insurer’s share', () => {
    expect(hero).toContain('const rest  = Math.max(0, total - mine);');
  });

  test('the insurer’s row reads the attributed figure, never the project total', () => {
    expect(hero).toContain("$('partcIae').textContent         = `${fmt(mine, 4)} tCO₂e`");
  });

  test('the sliver is drawn to scale, and the page says so', () => {
    // An insurance attribution factor is routinely well under one percent. A
    // bar stretched to be visible would misstate the quantity it exists to
    // show, so the caption explains the sliver instead.
    expect(hero).toMatch(/drawn to the same scale/);
    expect(css).toMatch(/\.partc-bridge-seg\.is-result \{[^}]*min-width: 4px/);
  });
});

describe('The use stage stays a separate line', () => {
  const use = js.slice(js.indexOf('function renderUseStage'), js.indexOf('function renderDqTile'));

  test('a visible break separates it from the PCAF figure', () => {
    expect(page).toMatch(/partc-break">.*never added to the figure above/i);
  });

  test('zero is reported as a scope rule, not as an absence of data', () => {
    expect(use).toMatch(/Zero by scope rule, not by omission/);
    expect(use).toContain('d.policy.gateReason');
  });

  test('it says a client-entered cover period cannot override the gate', () => {
    expect(use).toMatch(/applies within that gate rather than overriding it/);
  });

  test('it reads indigo, because it is a different container from the figure', () => {
    expect(css).toMatch(/\.partc-usestage \{[\s\S]*?--data-indigo-soft/);
  });
});

describe('The data-quality score is a category with its direction stated', () => {
  const dq = js.slice(js.indexOf('function renderDqTile'), js.indexOf('function renderModuleSplit'));

  test('the five bands are in the fragment and one is marked', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(page).toContain(`data-band="${n}"`);
    expect(dq).toContain("b.classList.toggle('is-here'");
  });

  test('the ends of the scale are labelled', () => {
    expect(page).toContain('best evidence');
    expect(page).toContain('weakest');
  });

  test('the score is never written as a fraction', () => {
    expect(page).not.toMatch(/\b[1-5]\s*\/\s*5\b/);
    expect(js).not.toMatch(/\$\{[^}]*score[^}]*\}\s*\/\s*5/);
  });

  test('it says the score follows the option, not the strength of an input', () => {
    expect(dq).toMatch(/The score follows the option/);
    expect(dq).toMatch(/only using a different kind of data does/);
  });

  test('the bands are one ordered hue, never green-to-red', () => {
    // Green-to-red would read as good-to-bad on a scale whose direction people
    // already get backwards.
    const light = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf('.partc-dqscale-band')));
    const bands = [...light.matchAll(/\.partc-dqscale-band\[data-band="\d"\] \{ background: (#[0-9a-f]{6}); \}/g)]
      .map(m => m[1]);
    expect(bands).toHaveLength(5);
    for (const hex of bands) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      expect(g).toBeGreaterThan(r);   // every band stays on the green side
      expect(g).toBeGreaterThan(b);
    }
  });
});

describe('The module split is one whole, not four figures', () => {
  const split = js.slice(js.indexOf('function renderModuleSplit'), js.indexOf('function renderParetoArc'));

  test('it is a single stacked bar', () => {
    expect(page).toContain('id="partcModuleSplit"');
    expect(css).toMatch(/\.partc-split \{[\s\S]*?display: flex;/);
  });

  test('the hues are categorical and in a fixed order', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(css).toContain(`.partc-split-seg.is-${n}`);
    expect(split).toContain("const HUES = ['is-1', 'is-2', 'is-3', 'is-4', 'is-5']");
  });

  test('there is a legend, because there is more than one series', () => {
    expect(page).toContain('id="partcModuleLegend"');
    expect(split).toContain('partc-split-row');
  });

  test('it explains why material quantities move the total so little', () => {
    expect(split).toMatch(/A4 transport and A5\.3 waste/);
    expect(split).toMatch(/variation order moves this/);
  });
});

describe('Detail is available, not in the way', () => {
  test('the four tables are folded', () => {
    const folds = page.match(/class="partc-fold"/g) || [];
    expect(folds.length).toBe(4);
  });

  test('each fold still contains the container its renderer writes to', () => {
    for (const id of ['partcModules', 'partcDrivers', 'partcPareto', 'partcDqPanel']) {
      expect(page).toMatch(new RegExp(`partc-fold[\\s\\S]{0,400}id="${id}"`));
    }
  });

  test('the registers, the disclosure and the voluntary annex survived the rebuild', () => {
    expect(page).toContain('id="partcRegisterBody"');
    expect(page).toContain('id="partcDisclosure"');
    expect(page).toContain('id="partcAnnexD"');
    expect(page).toMatch(/Not part of the PCAF figure/);
  });
});

describe('The summary is generated from the run, never written into the page', () => {
  const sum = js.slice(js.indexOf('function renderSummary'));

  test('the list is empty in the fragment', () => {
    expect(page).toMatch(/<ul id="partcSummaryList"><\/ul>/);
  });

  test('every line is built from the result', () => {
    expect(sum).toContain('s.construction_tCO2e');
    expect(sum).toContain('s.insurerIAE_tCO2e');
    expect(sum).toContain('s.perM2Factor_kgCO2e_m2');
    expect(sum).toContain('d.policy.useStageYears');
  });

  test('it claims conformance, never endorsement', () => {
    expect(sum).toMatch(/conformance with PCAF Part C, never endorsement/);
  });
});

describe('The layout holds up', () => {
  test('hidden elements stay hidden, whatever a later display rule says', () => {
    // [hidden] from the UA stylesheet loses to any class carrying display:.
    const guard = css.indexOf('.partc-result [hidden] { display: none !important; }');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(css.indexOf('.partc-bento {'));
  });

  test('the bento collapses to one column on a phone', () => {
    expect(css).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.partc-bento \{ grid-template-columns: 1fr; \}/);
  });

  test('tiles size to their content rather than stretching', () => {
    expect(css).toMatch(/\.partc-bento \{[\s\S]*?align-items: start;/);
  });

  test('motion is dropped for anyone who asks for that', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,220}partc-bridge-seg/);
    expect(js).toContain("prefers-reduced-motion: reduce");
  });
});
