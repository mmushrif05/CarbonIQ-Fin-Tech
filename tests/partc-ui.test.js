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
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const read = (...p) => source(p.join('/'));

const page  = read('ui', 'pages', 'pcaf-partc.html');
const appJs = read('ui', 'app.js');
const sampleBook = JSON.parse(read('ui', 'data', 'portfolio-sample.json')).partC;
const js   = read('ui', 'js', 'pcaf-partc.js');
const css  = read('ui', 'css', 'pcaf-partc.css');

const renderFn = js.slice(js.indexOf('  function render(d) {'), js.indexOf('  function showRegister('));

/** Every id the module writes to, so a renderer cannot target a missing node. */
const idsWritten = [...js.matchAll(/\$\('(partc[A-Za-z0-9]+)'\)/g)].map(m => m[1]);

describe('Every element the module writes to exists in the fragment', () => {
  test.each([...new Set(idsWritten)])('#%s is in the page', (id) => {
    must(page, `id="${id}"`, "the rule this file holds");
  });
});

describe('The renderers are actually called', () => {
  test.each([
    'renderHero', 'renderUseStage', 'renderDqTile',
    'renderModuleSplit', 'renderParetoArc', 'renderSummary',
  ])('render() calls %s', (fn) => {
    must(js, `function ${fn}(`, "the rule this file holds");
    expect(renderFn).toMatch(new RegExp(`\\b${fn}\\(d\\)`));
  });
});

describe('The hero leads with the insurer\u2019s share, never the project total', () => {
  const hero = js.slice(js.indexOf('function renderHero'), js.indexOf('function renderUseStage'));

  test('it is A4 + A5 construction, named as such', () => {
    must(page, /partc-hero-eyebrow">Insurance-associated emissions \u00b7 A4 \+ A5 construction/, "it is A4 + A5 construction, named as such");
  });

  /*
   * The defect this pins. The hero used to count to `construction_tCO2e` under
   * the label "The PCAF figure", which is the project’s whole construction
   * total — carried by everyone who financed or insured the work. The figure
   * this insurer discloses is the attributed share, and
   * src/domains/pcaf-part-c/reporting/partc-report-standard.js reports exactly that
   * (`attributed_tCO2e: s.insurerIAE_tCO2e`). Showing the larger number large
   * read as the insurer emitting 265 times what it does.
   */
  test('the large figure is the attributed share', () => {
    expect(hero).toContain("countTo($('partcHeroValue'), s.insurerIAE_tCO2e");
    expect(hero).not.toContain("countTo($('partcHeroValue'), s.construction_tCO2e");
  });

  test('the project total is present, and quieter', () => {
    must(page, 'id="partcHeroBaseValue"', "the project total is present, and quieter");
    expect(hero).toContain("$('partcHeroBaseValue').textContent");
    // The hero is set with clamp(); the largest of its three lengths is what
    // it reaches on a desk screen, which is where the two are compared.
    const heroRule = /\.partc-hero-value \{([^}]*)\}/.exec(css);
    const baseRule = /\.partc-hero-base-value \{([^}]*)\}/.exec(css);
    expect(heroRule).toBeTruthy();
    expect(baseRule).toBeTruthy();
    const largest = rule => Math.max(...[...rule.matchAll(/(\d+)px/g)].map(m => Number(m[1])));
    const basePx = Number(/font-size:\s*(\d+)px/.exec(baseRule[1])[1]);
    expect(largest(heroRule[1])).toBeGreaterThan(basePx * 2);
  });

  test('the hero never sums the construction figure with the use stage', () => {
    expect(renderFn).not.toMatch(/construction_tCO2e\s*\+\s*useStage/);
    expect(hero).not.toContain('useStage_');
  });

  test('the share is stated as a percentage beside the figure', () => {
    expect(hero).toMatch(/of the project's construction emissions/);
  });

  test('the figure is named as the re/insurer\u2019s own scope 3', () => {
    expect(hero).toMatch(/re\/insurer's own scope 3/);
  });

  /*
   * Both figures in one unit. An insurance attribution factor is routinely a
   * few thousandths, so the attributed figure is sub-tonne while the project
   * total is tens of tonnes; printed in different units the reader has to
   * convert before they can check that one is a share of the other.
   */
  test('the two figures share one unit', () => {
    expect(hero).toContain('const u = heroUnit(s.insurerIAE_tCO2e);');
    expect(hero).toContain("$('partcHeroBaseValue').textContent =\n      `${fmt(s.construction_tCO2e * u.scale, u.dp)} ${u.unit}`;");
  });
});

describe('The attribution is drawn as a bridge', () => {
  const hero = js.slice(js.indexOf('function renderHero'), js.indexOf('function renderUseStage'));

  test('the three rows are present in the fragment', () => {
    must(page, 'id="partcBridgeSegTotal"', "the three rows are present in the fragment");
    must(page, 'id="partcBridgeSegDrop"', "the three rows are present in the fragment");
    must(page, 'id="partcBridgeSegResult"', "the three rows are present in the fragment");
  });

  test('the step down is the total less the insurer\u2019s share', () => {
    expect(hero).toContain('const rest  = Math.max(0, total - mine);');
  });

  test('the insurer\u2019s row reads the attributed figure, never the project total', () => {
    expect(hero).toContain("$('partcIae').textContent         = `${fmt(mine * u.scale, u.dp)} ${u.unit}`");
  });

  test('the bridge carries the hero\u2019s unit rather than one of its own', () => {
    for (const id of ['partcBridgeTotal', 'partcBridgeDrop', 'partcIae']) {
      const line = hero.split('\n').find(l => l.includes(`$('${id}').textContent`));
      expect(line).toBeTruthy();
      expect(line).toContain('u.scale');
      expect(line).toContain('${u.unit}');
    }
  });

  test('the sliver is drawn to scale', () => {
    // An insurance attribution factor is routinely well under one percent. A
    // bar stretched to be visible would misstate the quantity it exists to
    // show, so the bars share one scale and the smallest stays a sliver.
    expect(hero).toMatch(/All three bars share one scale/);
    must(css, /\.partc-bridge-seg\.is-result \{[^}]*min-width: 4px/, "the sliver is drawn to scale");
  });

  /*
   * `3.762e-3` is the shape a reader has to decode before they can compare it
   * to anything, and it appeared on the attribution tile of every policy whose
   * factor was under one percent — which is most of them.
   */
  test('the attribution factor is never printed in exponent notation', () => {
    mustNot(js, 'toExponential', "the attribution factor is never printed in exponent notation");
  });
});

describe('The use stage stays a separate line', () => {
  const use = js.slice(js.indexOf('function renderUseStage'), js.indexOf('function renderDqTile'));

  test('a visible break separates it from the PCAF figure', () => {
    must(page, /partc-break">.*never added to the figure above/i, "a visible break separates it from the PCAF figure");
  });

  test('zero is reported as a scope rule, not as an absence of data', () => {
    expect(use).toMatch(/Zero by scope rule, not by omission/);
    expect(use).toContain('d.policy.gateReason');
  });

  test('it says a client-entered cover period cannot override the gate', () => {
    expect(use).toMatch(/applies within that gate rather than overriding it/);
  });

  test('it reads indigo, because it is a different container from the figure', () => {
    must(css, /\.partc-usestage \{[\s\S]*?--data-indigo-soft/, "it reads indigo, because it is a different container from the figure");
  });

  /*
   * The optional line had the fault the construction hero had. It led with the
   * project's whole use-stage figure — 973,680.00 kgCO2e — and mentioned the
   * insurer's share in a sentence beneath it, in a different unit (3.6626
   * tCO2e). The large number is not the one this insurer reports, and two
   * units make a reader convert before they can see that one is a share of
   * the other. Same attribution factor as the construction figure, so the same
   * treatment.
   */
  test('the large figure is the insurer\u2019s share', () => {
    expect(use).toContain("countTo($('partcUseStage'), mine * u.scale, u.dp)");
    expect(use).toContain('const mine = s.useStageInsurerShare_tCO2e || 0;');
    expect(use).not.toContain("countTo($('partcUseStage'), s.useStage_kgCO2e");
  });

  test('the project total is present, and quieter', () => {
    must(page, 'id="partcUseStageBaseValue"', "the project total is present, and quieter");
    expect(use).toContain("$('partcUseStageBaseValue').textContent");
    const mineRule = /\.partc-usestage \.partc-tile-value|\.partc-tile-value \{([^}]*)\}/;
    const baseRule = /\.partc-usestage-base-value \{([^}]*)\}/.exec(css);
    expect(baseRule).toBeTruthy();
    expect(mineRule).toBeTruthy();
    // The two figures are sized apart, the same way the hero's pair is.
    const basePx = Number(/font-size:\s*(\d+)px/.exec(baseRule[1])[1]);
    expect(basePx).toBeLessThan(24);
  });

  test('both figures on the card carry one unit', () => {
    expect(use).toContain('const u = heroUnit(gated ? 0 : mine);');
    expect(use).toContain("$('partcUseStageBaseValue').textContent = `${fmt(total * u.scale, u.dp)} ${u.unit}`;");
    // The old form printed tCO2e in prose beside a kgCO2e figure.
    expect(use).not.toMatch(/useStageInsurerShare_tCO2e, 4\)\} tCO/);
  });

  /*
   * A gated policy has nothing to take a share of, so no base figure is
   * drawn. "The project emits 0" would be a claim about the building rather
   * than about the cover, and the building does emit over its life.
   */
  test('a gated policy shows no project total at all', () => {
    expect(use).toContain('base.hidden = true;');
    expect(use).toMatch(/const gated = d\.policy\.useStageYears === 0;/);
  });

  /*
   * [hidden] is display:none from the user-agent sheet and carries almost no
   * specificity, so the .partc-usestage-base display rule would beat it and
   * the base would stay on screen through the gate. This page already carries
   * the guard; the test is here because this block is a new element that
   * depends on it.
   */
  test('the hidden base is actually hidden', () => {
    must(css, /\.partc-result \[hidden\] \{ display: none !important; \}/, "the hidden base is actually hidden");
    must(css, /\.partc-usestage-base \{[^}]*display: flex/, "the hidden base is actually hidden");
  });
});

describe('The data-quality score is a category with its direction stated', () => {
  const dq = js.slice(js.indexOf('function renderDqTile'), js.indexOf('function renderModuleSplit'));

  test('the five bands are in the fragment and one is marked', () => {
    for (const n of [1, 2, 3, 4, 5]) must(page, `data-band="${n}"`, "the five bands are in the fragment and one is marked");
    expect(dq).toContain("b.classList.toggle('is-here'");
  });

  test('the ends of the scale are labelled', () => {
    must(page, 'best evidence', "the ends of the scale are labelled");
    must(page, 'weakest', "the ends of the scale are labelled");
  });

  test('the score is never written as a fraction', () => {
    mustNot(page, /\b[1-5]\s*\/\s*5\b/, "the score is never written as a fraction");
    mustNot(js, /\$\{[^}]*score[^}]*\}\s*\/\s*5/, "the score is never written as a fraction");
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
    must(page, 'id="partcModuleSplit"', "it is a single stacked bar");
    must(css, /\.partc-split \{[\s\S]*?display: flex;/, "it is a single stacked bar");
  });

  test('the hues are categorical and in a fixed order', () => {
    for (const n of [1, 2, 3, 4, 5]) must(css, `.partc-split-seg.is-${n}`, "the hues are categorical and in a fixed order");
    expect(split).toContain("const HUES = ['is-1', 'is-2', 'is-3', 'is-4', 'is-5']");
  });

  test('there is a legend, because there is more than one series', () => {
    must(page, 'id="partcModuleLegend"', "there is a legend, because there is more than one series");
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
      must(page, new RegExp(`partc-fold[\\s\\S]{0,400}id="${id}"`), "each fold still contains the container its renderer writes to");
    }
  });

  test('the registers, the disclosure and the voluntary annex survived the rebuild', () => {
    must(page, 'id="partcRegisterBody"', "the registers, the disclosure and the voluntary annex survived the rebuild");
    must(page, 'id="partcDisclosure"', "the registers, the disclosure and the voluntary annex survived the rebuild");
    must(page, 'id="partcAnnexD"', "the registers, the disclosure and the voluntary annex survived the rebuild");
    must(page, /Not part of the PCAF figure/, "the registers, the disclosure and the voluntary annex survived the rebuild");
  });
});

describe('The summary is generated from the run, never written into the page', () => {
  const sum = js.slice(js.indexOf('function renderSummary'));

  test('the list is empty in the fragment', () => {
    must(page, /<ul id="partcSummaryList"><\/ul>/, "the list is empty in the fragment");
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
    must(css, /@media \(max-width: 900px\) \{[\s\S]*?\.partc-bento \{ grid-template-columns: 1fr; \}/, "the bento collapses to one column on a phone");
  });

  test('tiles size to their content rather than stretching', () => {
    must(css, /\.partc-bento \{[\s\S]*?align-items: start;/, "tiles size to their content rather than stretching");
  });

  test('motion is dropped for anyone who asks for that', () => {
    must(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,220}partc-bridge-seg/, "motion is dropped for anyone who asks for that");
    must(js, "prefers-reduced-motion: reduce", "motion is dropped for anyone who asks for that");
  });
});


describe('The Part C screen opens on the position, not on a file upload', () => {
  const fetchFn  = js.slice(js.indexOf('async function fetchOverview'), js.indexOf('async function loadSampleBook'));
  const renderFn = js.slice(js.indexOf('async function renderOverview'), js.indexOf('function renderPipeline'));

  test('the band is the first thing in the page, above step 1', () => {
    expect(page.indexOf('id="partcOverview"')).toBeGreaterThan(-1);
    expect(page.indexOf('id="partcOverview"')).toBeLessThan(page.indexOf('Policy document'));
  });

  test('it is read from the Part C endpoints, never computed in the browser', () => {
    expect(fetchFn).toContain('/v1/partc/settings');
    expect(fetchFn).toContain('/v1/partc/portfolio/');
    expect(fetchFn).toContain('/v1/partc/periods/');
    expect(fetchFn).toContain('/v1/partc/storage');
  });

  test('the reporting year comes from the insurer settings', () => {
    expect(fetchFn).toContain('settings.reportingYear');
  });

  test('it carries the four figures, and names the PCAF one', () => {
    for (const id of ['partcOvIae', 'partcOvUseStage', 'partcOvCoverage', 'partcOvDq']) {
      must(page, `id="${id}"`, "it carries the four figures, and names the PCAF one");
    }
    must(page, /Insurer's IAE — construction \(A4 \+ A5\)/, "it carries the four figures, and names the PCAF one");
    must(page, /Use stage — B1 \+ B4 \+ B7/, "it carries the four figures, and names the PCAF one");
  });

  test('construction and use stage wear the two hues the result below uses', () => {
    must(css, /\.partc-ovkpi\.is-construction \{ border-left: 3px solid var\(--data-green\); \}/, "construction and use stage wear the two hues the result below uses");
    must(css, /\.partc-ovkpi\.is-usestage {5}\{ border-left: 3px solid var\(--data-indigo\); \}/, "construction and use stage wear the two hues the result below uses");
  });

  test('the use-stage line says it is never summed with the figure beside it', () => {
    must(page, /never summed with the figure beside it/, "the use-stage line says it is never summed with the figure beside it");
  });

  test('nothing here is a financed-emissions figure', () => {
    // A different inventory over a different book. The two are never summed,
    // and this screen does not reach for the lending endpoint at all.
    mustNot(js, '/v1/portfolio', "nothing here is a financed-emissions figure");
    mustNot(js, 'totalFinancedEmissions', "nothing here is a financed-emissions figure");
  });

  test('a year with nothing locked is named, never rendered as a position of zero', () => {
    expect(renderFn).toMatch(/nothing locked yet/);
    expect(renderFn).toMatch(/not a position of zero and is not shown as one/);
  });

  test('a sample position says so on the band itself', () => {
    expect(renderFn).toMatch(/sample position/);
    expect(renderFn).toMatch(/replaced by your own the moment an assessment is locked/);
  });

  test('the sample is drawn only when the book is genuinely empty', () => {
    expect(renderFn).toMatch(/const sample = ov\.mode === 'empty' && Boolean\(sampleBook\)/);
  });

  test('a book that cannot be persisted says so', () => {
    expect(renderFn).toMatch(/durable === false/);
    must(page, 'id="partcOvStorage"', "a book that cannot be persisted says so");
  });

  test('the premium-weighted score states its direction and what it excluded', () => {
    expect(renderFn).toContain('SCALE_NOTE');
    expect(renderFn).toMatch(/excluded rather than counted as zero/);
    // Singular and plural, because "1 policy are excluded" reads as a bug in
    // the figure rather than in the sentence.
    expect(renderFn).toMatch(/=== 1 \? 'is' : 'are'/);
    expect(renderFn).toMatch(/the disclosed figure is the weighted one/);
  });

  test('coverage says why a partial book matters', () => {
    expect(renderFn).toMatch(/means something different from one drawn from all of it/);
  });

  test('the lifecycle says only a locked assessment reaches a disclosure', () => {
    const pipe = js.slice(js.indexOf('function renderPipeline'));
    expect(pipe).toMatch(/Only a locked assessment enters the disclosure/);
    expect(pipe).toContain("{ key: 'locked'");
  });

  test('the band re-reads the book on a return visit', () => {
    // A lock applied on another screen changes this position; showing what it
    // said last time would be stale the moment it mattered.
    must(js, /return \{ init, refresh \}/, "the band re-reads the book on a return visit");
    must(appJs, /'pcaf-partc': \{[\s\S]*?PCAFPartCPage\.refresh\(\)/, "the band re-reads the book on a return visit");
  });

  test('its links reach the screens behind the figures', () => {
    for (const target of ['partc-book', 'partc-portfolio']) {
      must(page, `data-goto="${target}"`, "its links reach the screens behind the figures");
    }
    must(js, 'window.CARBONIQ_navigateTo(b.dataset.goto)', "its links reach the screens behind the figures");
  });
});

describe('The sample book reconciles', () => {
  test('coverage is the assessed share of the policies in the year', () => {
    expect(Math.round((sampleBook.coverage.assessedPolicies / sampleBook.coverage.policiesInYear) * 100))
      .toBe(sampleBook.coverage.coveragePct);
  });

  test('the assessment statuses sum to the total', () => {
    const { locked, draft, underReview, total } = sampleBook.assessments;
    expect(locked + draft + underReview).toBe(total);
  });

  test('only locked assessments count as assessed policies', () => {
    expect(sampleBook.assessments.locked).toBe(sampleBook.coverage.assessedPolicies);
  });

  test('the insurer share is a share of the projects’ total, never larger', () => {
    expect(sampleBook.construction.insurerIAE_tCO2e).toBeLessThan(sampleBook.construction.total_tCO2e);
  });

  test('the score is weighted over exactly the policies that carry one', () => {
    expect(sampleBook.dataQuality.policiesScored).toBe(sampleBook.coverage.assessedPolicies);
  });
});

describe('The Part C screen has a dark palette, and everything on it uses it', () => {
  test('no rule on this page reaches for the app shell’s tokens', () => {
    // The shell's --surface/--border/--text-* do not flip with the theme. Used
    // here they painted white cards with white text on a black page — the
    // result screen and the band both, and only for anyone whose device is set
    // to dark, which is most phones.
    const shellTokens = /var\(--(surface|border|border-light|text-primary|text-secondary|text-tertiary|shadow-sm)\)/g;
    const found = css.match(shellTokens) || [];
    expect(found).toHaveLength(0);
  });

  test('the page’s own tokens are what the new blocks read', () => {
    must(css, /\.partc-tile \{[\s\S]*?background: var\(--p-card\);/, "the page’s own tokens are what the new blocks read");
    must(css, /\.partc-overview \{[\s\S]*?background: var\(--p-card\);/, "the page’s own tokens are what the new blocks read");
  });

  test('the hard-coded amber notes carry a dark variant', () => {
    must(css, /@media \(prefers-color-scheme: dark\) \{[\s\S]*?\.partc-ovnote\.is-warn/, "the hard-coded amber notes carry a dark variant");
  });
});
