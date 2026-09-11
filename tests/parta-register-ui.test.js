/**
 * The Lending Book screen — the rules the source has to carry.
 *
 * Sweeps the source rather than trusting the paths a feature test walks. The
 * first block is reachability: a page fragment can be perfect and never
 * appear, because the nav item, the container, the script, the stylesheet,
 * the title, the loader entry and the role gate are seven separate edits in
 * four files and any one missing is silent — that is how Part A shipped to
 * production with a working API and nothing in the sidebar.
 *
 * The rest are the four mechanical faults this codebase has shipped once each
 * with a unit test passing, and the claims this screen exists to keep apart.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/parta-register.html');
const JS = source('ui/js/parta-register.js');
const CSS = source('ui/css/parta-register.css');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');
const AUTH = source('ui/js/auth.js');

/* The module, loaded without a browser: nothing at its top level touches the
   DOM — init() does — so it evaluates in a bare context. */
const Page = vm.runInNewContext(`${JS}\n;PartARegisterPage`, {}, { timeout: 5000 });

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, a script and a stylesheet', () => {
    must(INDEX, 'data-page="parta-register"', 'the sidebar carries a nav item for it');
    must(INDEX, /data-page="parta-register"[\s\S]{0,600}?Lending Book/, 'the nav item is labelled');
    must(INDEX, 'id="page-parta-register" data-src="pages/parta-register.html"', 'the page container names its fragment');
    must(INDEX, '<script src="js/parta-register.js"></script>', 'the module is loaded');
    must(INDEX, '<link rel="stylesheet" href="css/parta-register.css">', 'the stylesheet is loaded');
    for (const f of ['ui/js/parta-register.js', 'ui/css/parta-register.css', 'ui/pages/parta-register.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('it is registered with a real title, and a return visit re-reads', () => {
    must(APP, /'parta-register':\s*\{\s*title:\s*'Lending Book'/, 'the router titles it');
    must(APP, "src:  'pages/parta-register.html'", 'the router loads it');
    must(APP, 'PartARegisterPage.init()', 'the router initialises it');
    must(APP, /'parta-register':\s*\{[\s\S]*?refresh:/, 'a return visit re-reads rather than replaying');
    must(JS, /function refresh\(\)\s*\{\s*return load\(\);/, 'refresh is load');
  });

  test('the role gate holds it to the same bar as the other PCAF screens, and the sample book reaches it', () => {
    const level = Number((AUTH.match(/'parta-register':\s*(\d+)/) || [])[1]);
    const pcaf = Number((AUTH.match(/'pcaf':\s*(\d+)/) || [])[1]);
    expect(level).toBe(pcaf);
    must(AUTH, /PREVIEW_PAGES = \[[\s\S]*?'parta-register'/, 'a preview visitor is offered it, because the sample lending book is installed for them');
  });
});

describe('The four mechanical rules', () => {
  test('hidden beats any display this sheet sets', () => {
    must(CSS, /\.parta-register \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/, '[hidden] must beat every class rule that sets display',
      'add `.parta-register [hidden] { display: none !important; }` at the top of the sheet');
  });

  test('every toggle is el.hidden, never a display style', () => {
    mustNot(JS, /style\.display\s*=/, 'toggles go through el.hidden so the [hidden] guard governs them');
  });

  test('a select may shrink, so one long option cannot widen the page', () => {
    must(CSS, /\.parta-register select\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/, 'a <select> sizes to its widest option unless told it may shrink');
  });

  test('grid columns collapse rather than push the page at 430px', () => {
    must(CSS, /minmax\(min\(100%,\s*\d+px\),\s*1fr\)/, 'repeat(auto-fit, minmax(Npx, 1fr)) is Npx wide whatever the container is');
    must(CSS, /\.pr-scroll\s*\{[^}]*overflow-x:\s*auto/, 'a wide table scrolls in its own box; the page never scrolls sideways');
    must(JS, /<div class="pr-scroll"><table class="partc-table">/, 'every table the module renders sits in the scrolling box');
  });

  test('everything that changes the first request is wired before it is sent', () => {
    const init = JS.slice(JS.indexOf('async function init()'));
    const firstLoad = init.indexOf('await load()');
    const preview = init.indexOf("[data-writes]')) el.hidden = preview()");
    const yearWire = init.indexOf("on('pr-year'");
    expect(firstLoad).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(0);
    expect(preview).toBeLessThan(firstLoad);
    expect(yearWire).toBeLessThan(firstLoad);
    expect(init.indexOf('await loadYears()')).toBeLessThan(firstLoad);
  });
});

describe('The screen renders the engine rather than repeating it', () => {
  test('it does not compute an attribution factor of its own', () => {
    mustNot(JS, /outstanding\w*\s*\/\s*(total|denominator|value)/i, 'the one number a browser is most tempted to work out for itself');
  });

  test('it never adds scope 3 to scope 1 and 2, and never nets removals', () => {
    mustNot(JS, /scope1And2[^\n]*\+[^\n]*scope3|scope3[^\n]*\+[^\n]*scope1And2/, 'scope 3 is a separate line');
    mustNot(JS, /-\s*(inv|L|lines)\.removals/, 'removals are netted against nothing');
    must(HTML, /Financed scope 3 — separate line/, 'the figure says so on its face');
    must(HTML, /netted against nothing/, 'the figure says so on its face');
  });

  test('an exposure with no attribution factor shows a dash, not a zero', () => {
    must(JS, /Number\.isFinite\(x\.attribution\.value\) \? x\.attribution\.value\.toFixed\(4\) : '—'/, 'Number(null) is 0 and 0 is finite');
    must(JS, /const fmt = \(n, d = 0\) => \(n === null \|\| n === undefined/, 'the formatter answers a dash for absence before it answers a number');
  });

  test('a score is a category with the scale beside it, never a mark out of five', () => {
    mustNot(JS, /\/\s*5\b/, 'never "3 / 5"');
    mustNot(HTML, /\/\s*5\b/, 'never "3 / 5"');
    must(HTML, /1 is the highest quality, 5 the lowest/, 'the scale is stated where the score is shown');
    must(JS, /dqb dqb-\$\{Math\.round\(v\)\}/, 'the badge shares the palette every PCAF screen uses');
  });

  test('the citations that matter survived the trim', () => {
    must(HTML, /Box 6\.1-6 \(p\.168\)/, 'the weighting cites its clause');
    must(HTML, /Disclosure Checklist Part A, p\.124/, 'coverage cites its clause');
    must(JS, /§5\.2 \(p\.56\)/, 'the financial-sector split cites its clause');
  });

  test('every scenario figure in the plan is labelled as one', () => {
    must(JS, /Every figure below is a scenario/, 'the plan says what it is');
    must(JS, /<span class="partc-hint">scenario<\/span>/, 'each scenario score carries the word');
  });
});

describe('Every id the module reads exists in the fragment', () => {
  const ids = new Set();
  for (const m of JS.matchAll(/\$\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:say|setHtml|show|on)\('([a-zA-Z0-9-]+)'/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:num|str)\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);

  test('the sweep found the ids it claims to', () => {
    expect(ids.size).toBeGreaterThan(40);
  });

  test('each one is in the page', () => {
    const missing = [...ids].filter(id => !HTML.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
});

describe('The request the form builds', () => {
  test('prune drops undefined keys and empty objects, so a closed schema never sees a key it would refuse', () => {
    expect(Page.prune({ a: 1, b: undefined, c: { d: undefined }, e: { f: 2 }, g: [1, undefined] }))
      .toEqual({ a: 1, e: { f: 2 }, g: [1, undefined] });
  });

  test('the write controls are marked, so a preview visitor is not offered a button the server refuses', () => {
    for (const id of ['pr-record-toggle', 'pr-record', 'pr-book-form', 'pr-detail-recompute', 'pr-detail-remove']) {
      must(HTML, new RegExp(`id="${id}"[^>]*data-writes|data-writes[^>]*id="${id}"`), `${id} carries data-writes`);
    }
  });
});
