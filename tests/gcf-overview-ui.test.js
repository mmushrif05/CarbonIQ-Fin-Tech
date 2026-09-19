/**
 * The GCF Overview — the rules the source has to carry.
 *
 * Reachability first: the nav item, the container, the script, the
 * stylesheet, the title, the loader entry and the role gate are seven
 * separate edits in four files and any one missing is silent. Then the four
 * mechanical faults this codebase has shipped once each, and the claims this
 * screen exists to keep apart: it computes nothing, the adaptation
 * co-benefit is never in the mitigation headline, direct and indirect
 * beneficiaries are never summed, the gate is a verdict beside a word and a
 * mark rather than a colour, and every hue is a token defined for both
 * themes and read from the stylesheet.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/gcf-overview.html');
const JS = source('ui/js/gcf-overview.js');
const CSS = source('ui/css/gcf-overview.css');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');
const AUTH = source('ui/js/auth.js');

const Page = vm.runInNewContext(`${JS}\n;GCFOverviewPage`, {}, { timeout: 5000 });

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, a script and a stylesheet', () => {
    must(INDEX, 'data-page="gcf-overview"', 'the sidebar carries a nav item for it');
    must(INDEX, /data-page="gcf-overview"[\s\S]{0,600}?GCF Overview/, 'the nav item is labelled');
    must(INDEX, 'id="page-gcf-overview" data-src="pages/gcf-overview.html"', 'the page container names its fragment');
    must(INDEX, '<script src="js/gcf-overview.js"></script>', 'the module is loaded');
    must(INDEX, '<link rel="stylesheet" href="css/gcf-overview.css">', 'the stylesheet is loaded');
    for (const f of ['ui/js/gcf-overview.js', 'ui/css/gcf-overview.css', 'ui/pages/gcf-overview.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('it opens the Capital & GCF group, ahead of the Fund Desk and the Pipeline tab', () => {
    const nav = INDEX.slice(INDEX.indexOf('<nav class="sidebar-nav">'), INDEX.indexOf('</nav>'));
    const at = id => nav.indexOf(`data-page="${id}"`);
    expect(at('gcf-overview')).toBeGreaterThan(nav.indexOf('Capital &amp; GCF</div>'));
    expect(at('gcf-overview')).toBeLessThan(at('desk'));
    expect(at('gcf-overview')).toBeLessThan(at('gcf'));
  });

  test('it is registered with a real title, and a return visit re-reads', () => {
    must(APP, /'gcf-overview':\s*\{\s*title:\s*'GCF Overview'/, 'the router titles it');
    must(APP, "src:  'pages/gcf-overview.html'", 'the router loads it');
    must(APP, 'GCFOverviewPage.init()', 'the router initialises it');
    must(APP, /'gcf-overview':\s*\{[\s\S]*?refresh:/, 'a return visit re-reads rather than replaying');
    must(JS, /function refresh\(\{ shown = false \} = \{\}\)/, 'refresh is load, except for a hand-over on the screen already shown');
    must(JS, /if \(shown && held && portfolio && register\) \{ applyIntent\(\); return Promise\.resolve\(\); \}\s*return load\(\);/, 'a return visit re-reads; only a hand-over on the screen already shown is applied over the position held');
    must(APP, /page\.refresh\(\{ shown: true \}\)/, 'the shell says when a page is re-read in place');
  });

  test('the role gate holds it to the Pipeline tab’s bar, and the sample pipeline reaches it', () => {
    const level = Number((AUTH.match(/'gcf-overview':\s*(\d+)/) || [])[1]);
    const gcf = Number((AUTH.match(/'gcf':\s*(\d+)/) || [])[1]);
    expect(level).toBe(gcf);
    must(AUTH, /PREVIEW_PAGES = \[[\s\S]*?'gcf-overview'/, 'a preview visitor is offered it');
  });
});

describe('The four mechanical rules', () => {
  test('hidden beats any display this sheet sets', () => {
    must(CSS, /\.gov \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/, '[hidden] must beat every class rule that sets display');
  });

  test('every toggle is el.hidden, never a display style, and every drawing is a block', () => {
    mustNot(JS, /style\.display\s*=/, 'toggles go through el.hidden so the [hidden] guard governs them');
    must(CSS, /\.gov \.ch\s*\{[^}]*display:\s*block/, 'a drawing on an inline element renders as nothing');
    must(CSS, /\.gov-chip-soft i, \.gov-chip i, \.gov-dot \{ display: inline-block/, 'a swatch on an inline element renders as nothing');
  });

  test('a select may shrink, so one long option cannot widen the page', () => {
    must(CSS, /\.gov select\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/, 'a <select> sizes to its widest option unless told it may shrink');
  });

  test('grid columns collapse rather than push the page at 430px, and the wide table scrolls in its own box', () => {
    must(CSS, /minmax\(min\(100%,\s*\d+px\),\s*1fr\)/, 'repeat(auto-fit, minmax(Npx, 1fr)) is Npx wide whatever the container is');
    mustNot(CSS, /minmax\(\d+px,\s*1fr\)/, 'no grid sets a floor a phone cannot meet');
    must(CSS, /\.gov-scroll\s*\{[^}]*overflow-x:\s*auto/, 'a wide table scrolls in its own box; the page never scrolls sideways');
    must(HTML, /<div class="gov-scroll"><table class="partc-table gov-table" id="go-projects">/, 'the candidate table sits in the scroll box');
    must(CSS, /\.partc\.gov \{[\s\S]*?min-width: 0;/, 'the root may shrink inside a flex parent');
  });

  test('everything that changes the first request is wired before it is sent', () => {
    const init = JS.slice(JS.indexOf('async function init()'));
    const firstLoad = init.indexOf('await load()');
    const preview = init.indexOf("[data-writes]')) el.hidden = preview()");
    expect(firstLoad).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(0);
    expect(preview).toBeLessThan(firstLoad);
    expect(init.indexOf("on('go-refresh'")).toBeLessThan(firstLoad);
    expect(init.indexOf("[data-behind]')) b.addEventListener")).toBeLessThan(firstLoad);
  });
});

describe('The screen renders the engines rather than repeating them', () => {
  test('it reads the portfolio, the gap register, the report and the conformance matrix, and computes no total of its own', () => {
    must(JS, /gcf\('\/portfolio'\)/, 'the position is the portfolio route’s');
    must(JS, /gcf\('\/gaps'\)/, 'the register is the gap route’s');
    must(JS, /gcf\('\/report'\)/, 'the disclosure lines are the report’s');
    must(JS, /gcf\('\/conformance'\)/, 'the rules are the matrix’s');
    /* The journey: two reads per candidate in focus, drawn from the routes' own fields. */
    must(JS, /gcf\(`\/pipeline\/\$\{encodeURIComponent\(id\)\}\/readiness`\)/, 'the journey’s checklist is the readiness route’s');
    must(JS, /gcf\(`\/cn\/\$\{encodeURIComponent\(id\)\}`\)/, 'the journey’s package counts are the package’s');
    must(JS, /\(portfolio\.byCycle \|\| \[\]\)\.map\(c => /, 'the rail is the Fund’s cycle as the portfolio lists it');
    must(JS, /fmt\(rdy\.held\)\} held · \$\{fmt\(rdy\.partial\)\} partial · \$\{fmt\(rdy\.external\)\} external/, 'the package counts are printed as the package returned them');
    must(JS, /STATUS_COLOR = s => `var\(--go-item-\$\{s\}/, 'held, partial and missing take their hue from the stylesheet');
    must(JS, /if \(focus === id\) renderFocus\(\);/, 'a late answer never draws over another candidate');
    must(JS, /detail\.clear\(\);/, 'the journey is dropped with the position');
    must(CSS, /--go-item-held: #0a5c3a; --go-item-partial: #c46a1f; --go-item-missing: #98a19c;/, 'the three states are tokens for the light theme');
    must(CSS, /--go-item-held: #7fc79f; --go-item-partial: #e08a44; --go-item-missing: #79837d;/, 'and stepped for the dark surface, never flipped');
    mustNot(JS, /\.reduce\(/, 'no sum in the browser');
    mustNot(JS, /\)\s*\/\s*\(?\s*(total|count|projects|candidates|ask|cost)/i, 'no share or average in the browser');
    mustNot(JS, /(mitigation|lifetime)[^\n]*\+[^\n]*(coBenefit|co-benefit)/i, 'the adaptation co-benefit is never added to the headline');
    mustNot(JS, /direct[^\n]*\+[^\n]*indirect/i, 'direct and indirect beneficiaries are never summed');
    must(JS, /co-benefit, apart/, 'the co-benefit bar says so in its label');
    must(HTML, /never summed/, 'the beneficiaries card says so on its face');
    must(HTML, /never in the headline/, 'the co-benefit is stated apart on the card');
  });

  test('the three reads are answered on their own, and a read that did not complete names itself', () => {
    /* One read that never got an answer used to blank the whole screen with
       the browser's one sentence. The pipeline and the register are the
       screen; the disclosure lines are one card and one drawer. */
    must(JS, /Promise\.allSettled\(\[gcf\('\/portfolio'\), gcf\('\/gaps'\), gcf\('\/report'\)\]\)/, 'the three reads are settled, not raced to the first failure');
    must(JS, /if \(p\.status !== 'fulfilled' \|\| g\.status !== 'fulfilled'\)/, 'without the pipeline or the register there is nothing to draw');
    must(JS, /reportError = r\.status === 'fulfilled' \? null : r\.reason\.message/, 'a disclosure read that did not complete is kept as its reason');
    must(JS, /if \(!report\) \{\s*setHtml\('go-s2', `<p class="partc-hint">\$\{esc\(reportError/, 'the disclosure card says why it is empty');
    const CFG = source('ui/config.js');
    must(CFG, /throw noResponse\(url, second\)/, 'a read is asked once more, then the request is named');
    must(CFG, /if \(!isRead\(opts\.method\)\) throw noResponse\(url, first\)/, 'a write is never asked twice');
  });

  test('the gate is a verdict beside a word and a mark, never a colour alone', () => {
    must(JS, /GATE_WORD = \{ eligible: 'Eligible', flagged: 'Flagged', excluded: 'Excluded' \}/, 'every verdict has its word');
    must(JS, /GATE_MARK = \{ eligible: '✓', flagged: '!', excluded: '✕' \}/, 'every verdict has its mark');
    must(HTML, /A gate, not a score/, 'the card says what the gate is');
    must(HTML, /Board decision B\.36\/10/, 'the accreditation is cited');
  });

  test('a candidate in focus is handed to the Pipeline tab as an intent, and a write control is marked', () => {
    must(JS, /remember\('carboniq\.gcf\.intent', `open:\$\{id\}`\)/, 'the Pipeline tab is told which candidate to open');
    must(JS, /localStorage\.getItem\('carboniq\.gcf-overview\.intent'\)/, 'the walkthrough’s hand-over is read once the pipeline is on screen');
    must(HTML, /id="go-starter"[^>]*data-writes/, 'the starter button carries data-writes');
  });

  test('the documents are fetched as a blob, never opened as a plain link', () => {
    must(JS, /\/report\?format=pdf/, 'the disclosure PDF is one press');
    must(JS, /\/report\?format=word/, 'and the Word document beside it');
    must(JS, /assessment-report\?format=pdf/, 'the assessment report per candidate');
    must(JS, /\/cn\/\$\{encodeURIComponent\(id\)\}\?format=pdf/, 'the Concept Note package per candidate');
    must(JS, /URL\.createObjectURL\(await res\.blob\(\)\)/, 'a document is a blob the browser saves');
    mustNot(JS, /window\.open\(/, 'never a plain link a browser may render as text');
  });
});

describe('The charts draw figures the engines returned, and every hue is a token', () => {
  test('the chart module is loaded before the overview', () => {
    expect(INDEX.indexOf('<script src="js/charts.js"></script>')).toBeGreaterThan(0);
    expect(INDEX.indexOf('<script src="js/charts.js"></script>')).toBeLessThan(INDEX.indexOf('<script src="js/gcf-overview.js"></script>'));
  });

  test('one hue per stream, gate verdict, owner, state and stage, defined on the bare selector and again for both dark states', () => {
    const light = CSS.slice(CSS.indexOf('.partc.gov {'), CSS.indexOf('@media (prefers-color-scheme: dark)'));
    const media = CSS.slice(CSS.indexOf('@media (prefers-color-scheme: dark)'), CSS.indexOf(':root[data-theme="dark"] .partc.gov'));
    const stamp = CSS.slice(CSS.indexOf(':root[data-theme="dark"] .partc.gov'));
    const tokens = ['--go-mitigation', '--go-adaptation', '--go-gate-eligible', '--go-gate-flagged', '--go-gate-excluded',
      '--go-state-draft', '--go-state-under-review', '--go-state-validated',
      '--go-owner-dfcc', '--go-owner-sponsor', '--go-owner-nda', '--go-owner-fund', '--go-owner-co-financiers',
      '--go-owner-gender-specialist', '--go-owner-communities', '--go-owner-assessor',
      '--go-money-ask', '--go-money-dfcc', '--go-money-other', '--go-ben-direct', '--go-ben-indirect', '--go-apart',
      ...Array.from({ length: 10 }, (_, i) => `--go-cycle-${i + 1}`)];
    for (const t of tokens) {
      const re = new RegExp(`${t}:\\s*#[0-9a-f]{6}`);
      expect(light).toMatch(re);
      expect(media).toMatch(re);
      expect(stamp).toMatch(re);
      const l = (light.match(re) || [])[0]; const d = (stamp.match(re) || [])[0];
      expect(l).not.toBe(d);
    }
    must(CSS, /:root:not\(\[data-theme="light"\]\) \.partc\.gov/, 'the system dark scheme is honoured unless light is stamped');
  });

  test('the module reads every hue from the stylesheet and chooses none', () => {
    must(JS, /const STREAM_COLOR = s => `var\(--go-\$\{s\}/, 'the stream hue is a token');
    must(JS, /const GATE_COLOR = g => `var\(--go-gate-\$\{g\}/, 'the gate hue is a token');
    must(JS, /const OWNER_COLOR = o => `var\(--go-owner-/, 'the owner hue is a token');
    must(JS, /const STATE_COLOR = s => `var\(--go-state-/, 'the state hue is a token');
    must(JS, /const CYCLE_COLOR = n => `var\(--go-cycle-\$\{n\}/, 'the stage ramp is a token per stage');
    mustNot(JS, /(background|fill|stroke|color)\s*:\s*#[0-9a-f]{3,6}/i, 'no hex colour lives in the module');
  });

  test('the owners of a gap on the screen are the register’s vocabulary', () => {
    const gaps = require('../src/domains/gcf/domain/gaps');
    for (const o of gaps.OWNER_IDS) must(CSS, new RegExp(`--go-owner-${o.replace(/_/g, '-')}:`), `the owner ${o} has a hue of its own`);
  });

  test('a projected date is drawn as one', () => {
    must(JS, /class="gov-date\$\{u\.projected \? ' is-projected' : ''\}"/, 'the projected flag reaches the mark');
    must(CSS, /\.gov-date\.is-projected\s*\{[^}]*repeating-linear-gradient/, 'hatching means not measured');
    must(JS, /Projected — \$\{esc\(u\.basis\)\}/, 'a projected date names the standard it rests on');
  });
});

describe('Every id the module reads exists in the fragment', () => {
  const ids = new Set();
  for (const m of JS.matchAll(/\$\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:say|setHtml|show|on)\('([a-zA-Z0-9-]+)'/g)) ids.add(m[1]);
  test('the sweep found the ids it claims to, and each one is in the page', () => {
    expect(ids.size).toBeGreaterThan(15);
    /* One control is drawn by the module itself, inside the list it belongs to. */
    const missing = [...ids].filter(id => !HTML.includes(`id="${id}"`) && !JS.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
  test('the module exposes init, refresh and load', () => {
    expect(typeof Page.init).toBe('function');
    expect(typeof Page.refresh).toBe('function');
    expect(typeof Page.load).toBe('function');
  });
});
