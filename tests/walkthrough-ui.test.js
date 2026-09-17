/**
 * The Walkthrough — the runbook inside the product.
 *
 * Reachability first: the nav item, the container, the script, the
 * stylesheet, the title, the loader entry and the role gate — the seven
 * edits that make a page reachable, any one missing silent. Then the strip
 * in the shell, the hand-overs the two target screens read, the mechanical
 * rules this codebase has shipped once each, and the claim the page exists
 * to keep: it computes nothing, and every readiness row is a field the
 * position returned.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/walkthrough.html');
const JS = source('ui/js/walkthrough.js');
const CSS = source('ui/css/walkthrough.css');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');
const AUTH = source('ui/js/auth.js');
const BANK = source('ui/js/bank.js');
const REGISTER = source('ui/js/parta-register.js');

const Page = vm.runInNewContext(`${JS}\n;WalkthroughPage`, { document: undefined, window: {} }, { timeout: 5000 });

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, a script and a stylesheet', () => {
    must(INDEX, 'data-page="walkthrough"', 'the sidebar carries a nav item for it');
    must(INDEX, /data-page="walkthrough"[\s\S]{0,600}?Walkthrough/, 'the nav item is labelled');
    must(INDEX, 'id="page-walkthrough" data-src="pages/walkthrough.html"', 'the page container names its fragment');
    must(INDEX, '<script src="js/walkthrough.js"></script>', 'the module is loaded');
    must(INDEX, '<link rel="stylesheet" href="css/walkthrough.css">', 'the stylesheet is loaded');
    for (const f of ['ui/js/walkthrough.js', 'ui/css/walkthrough.css', 'ui/pages/walkthrough.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('it sits in the financed-emissions group, after the bank’s own screens', () => {
    const nav = INDEX.slice(INDEX.indexOf('<nav class="sidebar-nav">'), INDEX.indexOf('</nav>'));
    const at = id => nav.indexOf(`data-page="${id}"`);
    expect(at('walkthrough')).toBeGreaterThan(at('bank'));
    expect(at('walkthrough')).toBeLessThan(nav.indexOf('Insurance-associated emissions</div>'));
  });

  test('it is registered with a real title and a return visit re-reads', () => {
    must(APP, /'walkthrough':\s*\{\s*title:\s*'Walkthrough'/, 'the router titles it');
    must(APP, "src:  'pages/walkthrough.html'", 'the router loads it');
    must(APP, 'WalkthroughPage.init()', 'the router initialises it');
    must(APP, /'walkthrough':\s*\{[\s\S]*?refresh:/, 'a return visit re-reads');
    must(JS, /function refresh\(\)\s*\{\s*return load\(\);/, 'refresh is load');
  });

  test('the role gate holds it to the PCAF bar, and a preview visitor is not offered a presenter’s rail', () => {
    const level = Number((AUTH.match(/'walkthrough':\s*(\d+)/) || [])[1]);
    const pcaf = Number((AUTH.match(/'pcaf':\s*(\d+)/) || [])[1]);
    expect(level).toBe(pcaf);
    const previewList = (AUTH.match(/PREVIEW_PAGES = \[([\s\S]*?)\]/) || [])[1] || '';
    expect(previewList).not.toMatch(/'walkthrough'/);
  });
});

describe('The strip follows the presenter', () => {
  test('the strip is in the shell, hidden until started, and every id the module reads is there', () => {
    must(INDEX, /<div class="wt-strip" id="wt-strip" role="status" hidden>/, 'the strip is shell markup, hidden by attribute');
    for (const id of ['wt-strip-n', 'wt-strip-title', 'wt-strip-action', 'wt-strip-say', 'wt-strip-say-row', 'wt-strip-notes',
      'wt-strip-back', 'wt-strip-open', 'wt-strip-next', 'wt-strip-end']) {
      must(INDEX, `id="${id}"`, `the strip carries #${id}`);
    }
    must(JS, /WalkthroughPage\.mount\(\)/, 'the strip is mounted when the script loads, so a reload keeps it');
  });

  test('every id the page module reads is in its fragment', () => {
    const ids = new Set([...JS.matchAll(/\$\('([a-z0-9-]+)'\)|\bon\('([a-z0-9-]+)'|\bshow\('([a-z0-9-]+)'|\bsay\('([a-z0-9-]+)'|setHtml\('([a-z0-9-]+)'/g)]
      .map(m => m[1] || m[2] || m[3] || m[4] || m[5]).filter(Boolean));
    for (const id of ids) {
      if (id.startsWith('wt-strip')) continue;
      expect({ id, present: HTML.includes(`id="${id}"`) }).toEqual({ id, present: true });
    }
  });

  test('the steps open the real screens through the hand-overs those screens already read', () => {
    /* Chief executive first: the position, the file downloaded, what S2 asks,
       the climate view, then what a loan carries, back to the dashboard, the
       lineage, and the detail screen last. */
    expect(Page.STEPS.map(s => s.page)).toEqual(
      ['bank', 'bank', 'bank', 'bank', 'parta-register', 'bank', 'bank', 'parta-position']);
    expect(Page.STEPS).toHaveLength(8);
    expect(Page.STEPS[1].title).toMatch(/SLFRS S2 file, downloaded/);
    for (const s of Page.STEPS) must(INDEX, `data-page="${s.page}"`, `step "${s.title}" names a page the shell has`);
    must(JS, /CLASS_KEY = 'carboniq\.parta\.class'/, 'the Lending Book’s class hand-over');
    must(REGISTER, /localStorage\.getItem\('carboniq\.parta\.class'\)/, 'the Lending Book reads it');
    must(JS, /BANK_INTENT = 'carboniq\.bank\.intent'/, 'the overview’s intent');
    must(BANK, /localStorage\.getItem\('carboniq\.bank\.intent'\)/, 'the overview reads it');
    must(BANK, /applyIntent\(\);\s*\n\s*\}/, 'the overview applies it once the position is on screen');
    must(JS, /window\.CARBONIQ_navigateTo/, 'navigation goes through the shell’s one door');
  });
});

describe('The page computes nothing and says what a presenter needs', () => {
  test('no sum, division or average lives in the module', () => {
    mustNot(JS, /\.reduce\(/, 'no reduce', 'read the figure off the position');
    mustNot(JS, /\btoFixed\(/, 'no rounding of a figure', 'print what the route returned');
    mustNot(JS, /[\w)] \/ [\w(]/, 'no division', 'the share is the route’s');
  });

  test('the readiness rows read the position’s own fields', () => {
    for (const field of ['reportingEntity', 'preparedBy', 'approvedBy', 'approval', 'outstandingItems', 'cover']) {
      must(JS, field, `the ${field} row is read, not derived`);
    }
    must(JS, /financed-emissions\/\$\{encodeURIComponent\(year\)\}\/disclosure\?format=json/, 'the render check is the document route');
  });

  test('the notes keep the claims that matter and never the forbidden ones', () => {
    must(JS, /marked scenario/, 'a projected score is a scenario');
    must(JS, /is not counted as not vulnerable/, 'what has not been assessed is reported, never absorbed into the safe side');
    must(JS, /Nothing is written on the bank’s behalf/, 'an unanswered paragraph is printed as not stated with its clause');
    must(JS, /an item can answer No/, 'the checklist is answered from the document and can fail');
    must(HTML, /PCAF-conformant/, 'the language rule');
    for (const src of [JS, HTML]) mustNot(src, /certified by PCAF|PCAF (approved|endorsed|certified)/i, 'no endorsement language', 'always PCAF-conformant');
  });

  test('the four mechanical rules hold', () => {
    must(CSS, /\.walkthrough \[hidden\], \.wt-strip\[hidden\] \{ display: none !important; \}/, 'hidden beats any display this sheet sets');
    must(CSS, /\.wt-strip \{[^}]*min-width: 0/, 'the strip may shrink');
    must(CSS, /\.walkthrough \.wt-year select \{ min-width: 0; \}/, 'the select may shrink');
    must(JS, /await loadYears\(\);\s*\n\s*await load\(\);/, 'the year is settled before the first request');
  });
});
