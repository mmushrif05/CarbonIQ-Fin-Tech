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
    /* One loan from the door to the file: the position and the file for the
       chief executive, then the loan comes in, is priced, is approved, and is
       on the dashboard. */
    expect(Page.STEPS.map(s => s.page)).toEqual(
      ['bank', 'bank', 'parta-register', 'parta-register', 'parta-register', 'parta-register', 'bank']);
    expect(Page.STEPS).toHaveLength(7);
    expect(Page.STEPS[1].title).toMatch(/SLFRS S2 disclosure, in one press/);
    expect(Page.STEPS[2].title).toMatch(/A loan comes in/);
    /* The borrower that does not know its emissions: the common case, priced
       on the held sector factor, with the score it earns and what would raise
       it shown before Record. */
    expect(Page.STEPS[3].title).toMatch(/does not know its emissions/);
    must(JS, /REGISTER_INTENT, 'record:example-sector'/, 'the fourth step opens the form on the sector example');
    must(REGISTER, /key === 'example-sector'\) await recordExample\('sector'\)/, 'the Lending Book reads it');
    must(REGISTER, /variant=\$\{encodeURIComponent\(variant \|\| 'reported'\)\}/, 'and asks the API for that borrower');
    must(JS, /Option 3a at score 4/, 'the step names the option and score the sector path earns');
    must(JS, /a reported figure earns 2, a verified one 1/, 'and what would raise it');
    for (const s of Page.STEPS) must(INDEX, `data-page="${s.page}"`, `step "${s.title}" names a page the shell has`);
    must(JS, /CLASS_KEY = 'carboniq\.parta\.class'/, 'the Lending Book’s class hand-over');
    must(REGISTER, /localStorage\.getItem\('carboniq\.parta\.class'\)/, 'the Lending Book reads it');
    must(JS, /BANK_INTENT = 'carboniq\.bank\.intent'/, 'the overview’s intent');
    must(BANK, /localStorage\.getItem\('carboniq\.bank\.intent'\)/, 'the overview reads it');
    must(BANK, /applyIntent\(\);\s*\n\s*\}/, 'the overview applies it once the position is on screen');
    must(JS, /REGISTER_INTENT = 'carboniq\.register\.intent'/, 'the Lending Book’s intent');
    must(REGISTER, /localStorage\.getItem\(REGISTER_INTENT\)/, 'the Lending Book reads it');
    must(REGISTER, /await applyIntent\(\);\s*\n\s*\}/, 'and applies it once the book is on screen');
    must(JS, /window\.CARBONIQ_navigateTo/, 'navigation goes through the shell’s one door');
    /* Every step changes the screen: a step on the page already shown is
       re-read so its intent is applied now, and the one control it asks for
       is marked. Two consecutive steps that changed only the strip's words
       read as Next doing nothing. */
    must(JS, /window\.CARBONIQ_refreshPage\(step\.page\)/, 'a step on the page already shown re-reads it');
    must(APP, /window\.CARBONIQ_refreshPage = /, 'the shell exposes the same-page refresh beside navigation');
    must(JS, /window\.CARBONIQ_cue = cueControl/, 'the cue is one shell-wide function');
    must(REGISTER, /cue\('pr-form-submit'\)/, 'the record press is marked when the example loan is opened');
    must(BANK, /cue\('bk-pdf'\)/, 'the download is marked on the file step');
    must(CSS, /\.wt-cue \{/, 'the cue is drawn');
    /* The example loan the form opens on is the API’s, not the browser’s. */
    must(REGISTER, /call\(`\/starter\/example\?reportingYear=/, 'the example is fetched');
    mustNot(REGISTER, /Lanka Textiles/, 'no example figure lives in the browser');
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

describe('The GCF track — one candidate, from the door to the Fund', () => {
  const GCF = source('ui/js/gcf.js');
  const OVERVIEW = source('ui/js/gcf-overview.js');

  test('two tracks over one product, the financed seven untouched beside the GCF eight', () => {
    expect(Object.keys(Page.TRACKS)).toEqual(['financed', 'gcf']);
    expect(Page.TRACKS.financed.steps).toBe(Page.STEPS);
    expect(Page.TRACKS.gcf.steps).toBe(Page.GCF_STEPS);
    expect(Page.GCF_STEPS).toHaveLength(8);
    expect(Page.GCF_STEPS.map(s => s.page)).toEqual(
      ['gcf-overview', 'gcf-overview', 'gcf', 'gcf', 'gcf', 'gcf', 'gcf', 'gcf-overview']);
    for (const s of Page.GCF_STEPS) {
      must(INDEX, `data-page="${s.page}"`, `step "${s.title}" names a page the shell has`);
      expect(typeof s.apply).toBe('function');
      expect(s.action.length).toBeGreaterThan(80);
      expect(s.note.length).toBeGreaterThan(80);
    }
    must(HTML, /id="wt-tracks"[\s\S]*?data-track="financed"[\s\S]*?data-track="gcf"/, 'the page offers both tracks');
    must(JS, /remember\(STATE_KEY, JSON\.stringify\(\{ track, step: i, open:/, 'the strip’s state carries its track');
    must(JS, /const s0 = state\(\);[\s\S]*?track = s0 \? s0\.track/, 'the track is settled before the first request');
  });

  test('the steps open the real screens through the hand-overs those screens read', () => {
    must(JS, /GCF_OVERVIEW_INTENT = 'carboniq\.gcf-overview\.intent'/, 'the overview’s intent');
    must(OVERVIEW, /localStorage\.getItem\('carboniq\.gcf-overview\.intent'\)/, 'the overview reads it');
    must(OVERVIEW, /applyIntent\(\);\s*\n\s*\}/, 'and applies it once the pipeline is on screen');
    must(JS, /GCF_INTENT = 'carboniq\.gcf\.intent'/, 'the Pipeline tab’s intent');
    must(GCF, /const INTENT_KEY = 'carboniq\.gcf\.intent'/, 'the Pipeline tab reads it');
    /* Read before the first request, like the weights overlay beside it. */
    const init = GCF.slice(GCF.indexOf('async function init()'));
    expect(init.indexOf('readIntent();')).toBeGreaterThan(0);
    expect(init.indexOf('readIntent();')).toBeLessThan(init.indexOf("await call('/reference')"));
    must(GCF, /await applyIntent\(fromHash\);/, 'and applied where the hash used to be read');
    must(GCF, /async function refresh\(\) \{\s*readIntent\(\);/, 'a return visit reads it again');
    for (const intent of ['intake:example', 'open:latest', 'panel:decision', 'validate:latest', 'cn:latest']) {
      must(JS, `remember(GCF_INTENT, '${intent}')`, `a step hands over ${intent}`);
    }
    for (const kind of ["kind === 'panel'", "kind === 'intake'", "kind === 'open' || kind === 'validate'", "kind === 'cn'"]) {
      must(GCF, kind, `the Pipeline tab handles ${kind}`);
    }
    must(JS, /remember\(GCF_OVERVIEW_INTENT, 'behind:gaps'\)/, 'the register step opens the drawer behind the figure');
    must(JS, /remember\(GCF_OVERVIEW_INTENT, 'file:gcf'\)/, 'the file step marks the one press');
    must(OVERVIEW, /if \(kind === 'file'\) \{ openBehind\('file'\)[^\n]*cue\('go-pdf'\)/, 'the overview marks the download on the file step');
  });

  test('the example candidate the intake opens on is the API’s, not the browser’s', () => {
    must(GCF, /call\('\/pipeline\/example'\)/, 'the example is fetched');
    mustNot(GCF, /Tea Factory/, 'no example figure lives in the browser');
    must(GCF, /cue\('gcfIntakeSave'\)/, 'the record press is marked');
    must(GCF, /cue\(\$\('gcfValStart'\) \? 'gcfValStart' : 'gcfValValidate'\)/, 'the assessor’s next control is marked');
    must(GCF, /cue\('gcfCnPdf'\)/, 'the Concept Note download is marked');
  });

  test('the GCF readiness rows read the routes’ own fields', () => {
    for (const path of ["call('/v1/gcf/portfolio')", "call('/v1/gcf/gaps')", "call('/v1/gcf/entity')", "call('/v1/gcf/report')"]) {
      must(JS, path, `the day is read off ${path}`);
    }
    for (const field of ['assessment', 'totals', 'accreditation', 'checklist']) must(JS, field, `the ${field} row is read, not derived`);
    must(JS, /the inventory item stays No by rule/, 'the checklist item that cannot pass is named as such');
  });

  test('the GCF notes keep the claims that matter and never the forbidden ones', () => {
    must(JS, /Board decision B\.36\/10/, 'the accreditation is cited');
    must(JS, /a gate, not a score/, 'the gate is named as one');
    must(JS, /never PCAF’s 1–5 scale/, 'the evidence tiers are kept apart from the data-quality scale');
    must(JS, /words and never a number/, 'the ratings are words');
    must(JS, /not a decision of the Fund/, 'the assessment is the bank’s own');
    must(JS, /not the entity’s inventory/, 'a pipeline is not the inventory');
    must(HTML, /never a GCF endorsement/i, 'the language rule for the Fund');
    mustNot(JS, /GCF (approved|endorsed|certified)/i, 'no endorsement language');
  });
});
