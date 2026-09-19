/**
 * FormSteps — the rules the component has to carry.
 *
 * A long form read one section at a time (`ui/js/form-steps.js`). What is
 * checked here is what a browser test cannot see at a glance: that the
 * component is reachable at all — the stylesheet and the script are two
 * separate edits in the shell and either one missing is silent — that the
 * forms which asked for it still ask for it, and the four rules the
 * implementation has already been caught breaking once each while it was
 * being written. The behaviour itself is driven in Chromium by
 * `e2e/form-steps.spec.js`, because whether a section is reachable is a
 * question about a rendered page and not about its source.
 */

'use strict';

const { source, must, mustNot } = require('./helpers/ui-source');

const JS = source('ui/js/form-steps.js');
const CSS = source('ui/css/form-steps.css');
const SHELL = source('ui/index.html');

describe('FormSteps is reachable', () => {
  test('the shell loads the stylesheet and the script', () => {
    must(SHELL, /<link rel="stylesheet" href="css\/form-steps\.css">/,
      'the stylesheet is registered in the shell');
    must(SHELL, /<script src="js\/form-steps\.js"><\/script>/,
      'the script is registered in the shell');
  });

  test('the loader sections a page once its own module has wired it', () => {
    const APP = source('ui/app.js');
    must(APP, /FormSteps\.init\(container\)/,
      'a freshly loaded page fragment is sectioned');
    const init = APP.indexOf('FormSteps.init(container)');
    const own = APP.indexOf("config.init()");
    expect(own).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(own);
  });
});

describe('the forms that asked for it still ask for it', () => {
  const CASES = [
    ['ui/pages/parta-register.html', 'pr-form'],
    ['ui/pages/parta-position.html', 'fe-entity-form'],
    ['ui/pages/parta-sovereign.html', 'ps-form'],
    ['ui/pages/gcf.html', 'gcfIntakeForm'],
  ];
  test.each(CASES)('%s — %s is sectioned', (file, id) => {
    const HTML = source(file);
    const re = new RegExp(`id="${id}"[^>]*data-steps`, 's');
    const alt = new RegExp(`data-steps[^>]*id="${id}"`, 's');
    expect(re.test(String(HTML)) || alt.test(String(HTML))).toBe(true);
  });

  test('the register re-reads its sections when the asset class changes', () => {
    must(source('ui/js/parta-register.js'), /FormSteps\.(reset|refresh)\(\$\('pr-form'\)\)/,
      'a class carries its own blocks, so the rail is re-read when it changes');
  });

  test('the GCF intake is sectioned again after it is re-rendered', () => {
    must(source('ui/js/gcf.js'), /FormSteps\.attach\(\$\('gcfIntakeForm'\)\)/,
      'the intake is built from a field list, so its rail has to be rebuilt with it');
    must(source('ui/js/gcf.js'), /data-step-title="\$\{esc\(f\.group\)\}"/,
      'the intake group line is what divides it into sections');
  });
});

describe('the two shapes a screen can adopt', () => {
  test('a <fieldset> is a section and its <legend> is the title', () => {
    must(JS, /el\.tagName === 'FIELDSET' \? el\.querySelector\(':scope > legend'\) : null/,
      'a form written as fieldsets adopts this with one attribute and no new markup');
    must(source('ui/pages/pcaf-parta.html'), /id="paForm"[\s\S]{0,120}?data-steps="auto"/,
      'the Part A engine is sectioned on its own fieldsets');
  });

  test('a run of numbered cards is a flow, named on each card', () => {
    must(JS, /scope\.querySelectorAll\('\[data-step-group\]'\)/, 'cards name their flow');
    must(JS, /if \(members\.length > 1\) attachGroup\(members\)/,
      'one card is not a flow');
    for (const [file, flow, n] of [
      ['ui/pages/pcaf-partc.html', 'partc-intake', 5],
      ['ui/pages/partc-book.html', 'insurance-book', 6],
    ]) {
      const HTML = String(source(file));
      expect((HTML.match(new RegExp(`data-step-group="${flow}"`, 'g')) || []).length).toBe(n);
    }
  });

  test('a card flow follows the cards the page reveals', () => {
    must(JS, /attributeFilter: \['hidden'\]/,
      'the rail re-reads itself rather than asking every page to remember');
    mustNot(JS, /attributeFilter: \[[^\]]*class/,
      'watching class would loop: putting a card away is a class');
  });

  test('the pages written into the shell are sectioned too', () => {
    must(source('ui/app.js'), /FormSteps\.init\(document\)/,
      'the inline screens are never loaded as fragments, so the per-fragment '
      + 'call never reaches them');
  });

  test('a title is not repeated by the number the rail already prints', () => {
    must(JS, /function stepTitle\(raw\)/, 'a leading number is dropped from a title');
    must(JS, /\.partc-step, \.step-number, \.fs-num/, 'and so is a number badge inside a heading');
  });

  test('a container marked as a section is not hidden as if it were a heading', () => {
    must(JS, /\/\^H\[1-6\]\$\/\.test\(section\.heading\.tagName\)/,
      'hiding a container that carries data-step-title would hide the section itself');
  });
});

describe('the rules the implementation was caught breaking', () => {
  /* Each of these four is a defect this component actually shipped during
     the hour it was written, found by driving it rather than by reading it. */

  test('its own rail and nav are not taken for content', () => {
    must(JS, /data-fs-chrome/,
      'the rail and the Back/Next row are marked, or the walk puts the rail '
      + 'in the first section and hides it the moment anyone leaves');
    must(JS, /if \(child\.hasAttribute\('data-fs-chrome'\)\) continue;/,
      'and the walk skips them');
  });

  test('the action row stays out of the sections', () => {
    must(JS, /data-fs-keep'\) \|\| child\.classList\.contains\('partc-actions'\)/,
      'Record belongs to the form, not to its last section — swallowed into '
      + 'one it vanishes for every other section');
  });

  test('it never reads its own marker back as the page hiding something', () => {
    mustNot(JS, /if \(node\.hidden[^)]*\|\|[^)]*classList\.contains\(OFF\)/,
      'consulting .fs-off in the visibility walk makes every section look '
      + 'empty from the second render on');
  });

  test('a section is bound to the block of markup its heading came from', () => {
    must(JS, /visible\(section\.heading, form\) && visible\(section\.group, form\)/,
      'a section runs to the next heading and so can pick up blocks from the '
      + 'next class block; the heading\'s own group is what decides');
  });

  test('the opening section is where a block\'s leading fields go', () => {
    must(JS, /if \(!current \|\| group !== currentGroup\) current = first\(\);/,
      'a wrapper\'s fields above its first heading would otherwise join a '
      + 'section that is dropped, and could not be reached at all');
  });

  test('a required field that fails is brought back on screen', () => {
    must(JS, /addEventListener\('invalid'/,
      'the browser refuses to submit a form it cannot focus the bad control in');
    must(JS, /reveal\(bad\)/,
      'and the section holding it is opened before the browser validates');
  });
});

describe('the component keeps the house rules', () => {
  test('.fs-off only ever hides', () => {
    must(CSS, /\.fs-off \{ display: none !important; \}/,
      'a class that sets display beats [hidden]; this one may only hide, so '
      + 'an element the page hid stays hidden when its section comes back');
    mustNot(CSS, /\.fs-off[^{]*\{[^}]*display:\s*(block|flex|grid)/,
      'nothing here may show an element');
  });

  test('it fetches nothing and sums nothing', () => {
    mustNot(JS, /fetch\(|CARBONIQ_fetch|XMLHttpRequest/,
      'a form component that fetched would be a second reader of the book');
    mustNot(JS, /\.reduce\(/, 'it places sections; it computes no figure');
  });

  test('the rail scrolls rather than the page', () => {
    must(CSS, /@media \(max-width: 620px\)[\s\S]*overflow-x: auto/,
      'a page must never scroll sideways; a strip of section names may');
    must(CSS, /min-width: 0/, 'a grid or flex item refuses to shrink without it');
  });

  test('no colour is chosen here that the screen does not own', () => {
    const hard = String(CSS).match(/#[0-9a-fA-F]{3,6}/g) || [];
    for (const hex of hard) {
      expect(String(CSS)).toMatch(new RegExp(`var\\(--[a-z0-9-]+,\\s*${hex}`, 'i'));
    }
  });
});
