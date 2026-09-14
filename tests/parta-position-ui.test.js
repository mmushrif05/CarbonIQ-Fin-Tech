/**
 * The Financed Emissions screen — the rules the source has to carry.
 *
 * Sweeps the source rather than trusting the paths a feature test walks. The
 * first block is reachability: a page fragment can be perfect and never
 * appear, because the nav item, the container, the script, the stylesheet,
 * the title, the loader entry and the role gate are seven separate edits in
 * four files and any one missing is silent — that is how Part A shipped to
 * production with a working API and nothing in the sidebar.
 *
 * The rest are the four mechanical faults this codebase has shipped once each
 * with a unit test passing, and the claims this screen exists to keep apart:
 * one headline on named boundaries, scope 3 apart, one score per class never
 * averaged, coverage only in the book's currency.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/parta-position.html');
const JS = source('ui/js/parta-position.js');
const CSS = source('ui/css/parta-position.css');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');
const AUTH = source('ui/js/auth.js');
const DASH = source('ui/js/dashboard.js');

/* The module, loaded without a browser: nothing at its top level touches the
   DOM — init() does — so it evaluates in a bare context. */
const Page = vm.runInNewContext(`${JS}\n;PartAPositionPage`, {}, { timeout: 5000 });

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, a script and a stylesheet', () => {
    must(INDEX, 'data-page="parta-position"', 'the sidebar carries a nav item for it');
    must(INDEX, /data-page="parta-position"[\s\S]{0,600}?Financed Emissions/, 'the nav item is labelled');
    must(INDEX, 'id="page-parta-position" data-src="pages/parta-position.html"', 'the page container names its fragment');
    must(INDEX, '<script src="js/parta-position.js"></script>', 'the module is loaded');
    must(INDEX, '<link rel="stylesheet" href="css/parta-position.css">', 'the stylesheet is loaded');
    for (const f of ['ui/js/parta-position.js', 'ui/css/parta-position.css', 'ui/pages/parta-position.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('it heads the financed-emissions group, ahead of the two books', () => {
    const nav = INDEX.slice(INDEX.indexOf('<nav class="sidebar-nav">'), INDEX.indexOf('</nav>'));
    const at = id => nav.indexOf(`data-page="${id}"`);
    expect(nav).toContain('Financed emissions</div>');
    expect(at('parta-position')).toBeGreaterThan(0);
    expect(at('parta-position')).toBeLessThan(at('parta-register'));
    expect(at('parta-register')).toBeLessThan(at('parta-sovereign'));
  });

  test('it is registered with a real title, and a return visit re-reads', () => {
    must(APP, /'parta-position':\s*\{\s*title:\s*'Financed Emissions'/, 'the router titles it');
    must(APP, "src:  'pages/parta-position.html'", 'the router loads it');
    must(APP, 'PartAPositionPage.init()', 'the router initialises it');
    must(APP, /'parta-position':\s*\{[\s\S]*?refresh:/, 'a return visit re-reads rather than replaying');
    must(JS, /function refresh\(\)\s*\{\s*return load\(\);/, 'refresh is load');
  });

  test('the role gate holds it to the same bar as the other PCAF screens, and the sample book reaches it', () => {
    const level = Number((AUTH.match(/'parta-position':\s*(\d+)/) || [])[1]);
    const pcaf = Number((AUTH.match(/'pcaf':\s*(\d+)/) || [])[1]);
    expect(level).toBe(pcaf);
    must(AUTH, /PREVIEW_PAGES = \[[\s\S]*?'parta-position'/, 'a preview visitor is offered it, because the sample lending book is installed for them');
  });
});

describe('The four mechanical rules', () => {
  test('hidden beats any display this sheet sets', () => {
    must(CSS, /\.parta-position \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/, '[hidden] must beat every class rule that sets display',
      'add `.parta-position [hidden] { display: none !important; }` at the top of the sheet');
  });

  test('every toggle is el.hidden, never a display style', () => {
    mustNot(JS, /style\.display\s*=/, 'toggles go through el.hidden so the [hidden] guard governs them');
  });

  test('a select may shrink, so one long option cannot widen the page', () => {
    must(CSS, /\.parta-position select\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/, 'a <select> sizes to its widest option unless told it may shrink');
  });

  test('grid columns collapse rather than push the page at 430px', () => {
    must(CSS, /minmax\(min\(100%,\s*\d+px\),\s*1fr\)/, 'repeat(auto-fit, minmax(Npx, 1fr)) is Npx wide whatever the container is');
    must(CSS, /\.fe-scroll\s*\{[^}]*overflow-x:\s*auto/, 'a wide table scrolls in its own box; the page never scrolls sideways');
    must(JS, /<div class="fe-scroll"><table class="partc-table">/, 'every table the module renders sits in the scrolling box');
    expect((JS.match(/<table class="partc-table">/g) || []).length)
      .toBe((JS.match(/<div class="fe-scroll"><table class="partc-table">/g) || []).length);
  });

  test('everything that changes the first request is wired before it is sent', () => {
    const init = JS.slice(JS.indexOf('async function init()'));
    const firstLoad = init.indexOf('await load()');
    const preview = init.indexOf("[data-writes]')) el.hidden = preview()");
    const yearWire = init.indexOf("on('fe-year'");
    expect(firstLoad).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(0);
    expect(preview).toBeLessThan(firstLoad);
    expect(yearWire).toBeLessThan(firstLoad);
    expect(init.indexOf('await loadYears()')).toBeLessThan(firstLoad);
  });
});

describe('The screen renders the engine rather than repeating it', () => {
  test('it reads the consolidated route and computes no total of its own', () => {
    must(JS, /call\(`\/financed-emissions\/\$\{encodeURIComponent\(year\)\}`\)/, 'the position is read from the consolidated route');
    mustNot(JS, /headline[^\n]*\+[^\n]*scope3|scope3[^\n]*\+[^\n]*headline/, 'scope 3 is never added to the headline');
    mustNot(JS, /\.reduce\(\(s, [a-z]\) => s \+/, 'nothing is summed in the browser');
    mustNot(JS, /outstanding\w*\s*\/\s*(total|denominator|book)/i, 'coverage is not divided out in the browser');
    mustNot(JS, /\(\s*score\s*\+|\+\s*[a-z.]*score\)\s*\/\s*2/, 'scores are never averaged across classes');
  });

  test('the headline names the boundaries it sums, and scope 3 says it is apart', () => {
    must(JS, /say\('fe-headline-basis', t\.headline \? t\.headline\.basis/, 'the basis beside the headline is the engine’s');
    must(HTML, /Financed scope 3 — separate line, never summed into the headline/, 'the figure says so on its face');
    must(HTML, /never averaged across classes/, 'the class table says the score rule');
  });

  test('a class outside the book’s currency shows a dash for coverage, not a ratio', () => {
    must(JS, /c\.coveragePct !== null && c\.coveragePct !== undefined \? `\$\{Number\(c\.coveragePct\)\.toFixed\(2\)\}%` : '—'/, 'absence is checked before the number is');
    must(JS, /const fmt = \(n, d = 0\) => \(n === null \|\| n === undefined/, 'the formatter answers a dash for absence before it answers a number');
  });

  test('a score is a category with the scale beside it, never a mark out of five', () => {
    mustNot(JS, /\/\s*5\b/, 'never "3 / 5"');
    mustNot(HTML, /\/\s*5\b/, 'never "3 / 5"');
    must(HTML, /1 is the highest quality, 5 the lowest/, 'the scale is stated where the score is shown');
    must(JS, /dqb dqb-\$\{Math\.round\(v\)\}/, 'the badge shares the palette every PCAF screen uses');
  });

  test('the citations that matter survived the trim', () => {
    must(HTML, /Chapter 6 \(p\.162\)/, 'the not-reported rule cites its clause');
    must(HTML, /Disclosure Checklist Part A, p\.124/, 'coverage cites its clause');
    must(HTML, /ISO 14064-3 §5\.2; ISAE 3000 §12\(a\)/, 'the entity block cites what a verifier reads it under');
    must(HTML, /\(p\.128\)/, 'the weighting cites its page');
  });

  test('a figure is shown as one of three things: measured, declared or absent', () => {
    must(JS, /const stated = v => \(v === null \|\| v === undefined \|\| v === ''\) \? '<span class="fe-absent">not stated<\/span>'/, 'an unstated entity fact reads as not stated, never as a default');
    must(JS, /<dt>Basis<\/dt><dd>Declared/, 'the book total is labelled declared');
  });

  test('the downloads are the document routes, checked before a file is offered', () => {
    for (const id of ['fe-pdf', 'fe-docx', 'fe-json', 'fe-csv']) must(HTML, `id="${id}"`, `${id} is on the page`);
    must(JS, /\/financed-emissions\/\$\{encodeURIComponent\(year\)\}\/disclosure\?format=\$\{format\}/, 'the disclosure route, in the format asked');
    must(JS, /\/financed-emissions\/\$\{encodeURIComponent\(year\)\}\/register\.csv/, 'the register CSV route');
    must(JS, /if \(!res\.ok\) \{[\s\S]{0,300}throw new Error/, 'a refusal is shown, never saved as a file');
  });
});

describe('Every id the module reads exists in the fragment', () => {
  const ids = new Set();
  for (const m of JS.matchAll(/\$\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:say|setHtml|show|on)\('([a-zA-Z0-9-]+)'/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:num|str|set)\('([a-zA-Z0-9-]+)'/g)) ids.add(m[1]);

  test('the sweep found the ids it claims to', () => {
    expect(ids.size).toBeGreaterThan(40);
  });

  test('each one is in the page, or in the dashboard band the shell carries', () => {
    const missing = [...ids].filter(id => !HTML.includes(`id="${id}"`) && !INDEX.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
});

describe('The dashboard band', () => {
  test('the shell carries the band after the curve and before the emissions ledger', () => {
    const order = [...INDEX.matchAll(/<section class="cap-section" id="(cap-[a-z]+)"/g)].map(m => m[1]);
    expect(order.indexOf('cap-financed')).toBeGreaterThan(order.indexOf('cap-curve'));
    expect(order.indexOf('cap-financed')).toBeLessThan(order.indexOf('cap-emissions'));
  });

  test('the dashboard asks this module for the figures rather than reading the route itself', () => {
    must(DASH, /PartAPositionPage\.band\(\)/, 'one reader for one year, so two screens cannot disagree');
    mustNot(DASH, /financed-emissions\//, 'the dashboard does not fetch the consolidated route itself');
    must(DASH, /_renderFinanced\(\),\n\s*\]\);/, 'the band is rendered in the same pass as the rest of the dashboard');
  });

  test('the band’s scope 3 tile says it is never added to the headline', () => {
    must(INDEX, /id="fe-band-s3"[\s\S]{0,200}never added to the headline/, 'the band states the rule');
  });
});

describe('The request the entity form builds', () => {
  test('a person is a name, with a role and a date only where typed', () => {
    must(JS, /if \(str\(r\)\) p\.role = str\(r\);/, 'a null role never reaches a schema that refuses it');
    must(JS, /if \(!str\(n\)\) return null;/, 'no name clears the person');
  });

  test('the write controls are marked, so a preview visitor is not offered a button the server refuses', () => {
    for (const id of ['fe-entity-form', 'fe-book-form']) {
      must(HTML, new RegExp(`id="${id}"[^>]*data-writes|data-writes[^>]*id="${id}"`), `${id} carries data-writes`);
    }
    expect(typeof Page.collectEntity).toBe('function');
  });
});
