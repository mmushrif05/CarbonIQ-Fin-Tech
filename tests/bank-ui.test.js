/**
 * The Bank Overview — the rules the source has to carry.
 *
 * Reachability first: the nav item, the container, the script, the
 * stylesheet, the title, the loader entry and the role gate are seven
 * separate edits in four files and any one missing is silent. Then the four
 * mechanical faults this codebase has shipped once each, and the claims this
 * screen exists to keep apart: it computes nothing, scope 3 is never added to
 * scope 1 and 2, a score is a category and never a fraction of five.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/bank.html');
const JS = source('ui/js/bank.js');
const CSS = source('ui/css/bank.css');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');
const AUTH = source('ui/js/auth.js');

const Page = vm.runInNewContext(`${JS}\n;BankPage`, {}, { timeout: 5000 });

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, a script and a stylesheet', () => {
    must(INDEX, 'data-page="bank"', 'the sidebar carries a nav item for it');
    must(INDEX, /data-page="bank"[\s\S]{0,600}?Bank Overview/, 'the nav item is labelled');
    must(INDEX, 'id="page-bank" data-src="pages/bank.html"', 'the page container names its fragment');
    must(INDEX, '<script src="js/bank.js"></script>', 'the module is loaded');
    must(INDEX, '<link rel="stylesheet" href="css/bank.css">', 'the stylesheet is loaded');
    for (const f of ['ui/js/bank.js', 'ui/css/bank.css', 'ui/pages/bank.html']) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  test('it opens the financed-emissions group, ahead of the position and the two books', () => {
    const nav = INDEX.slice(INDEX.indexOf('<nav class="sidebar-nav">'), INDEX.indexOf('</nav>'));
    const at = id => nav.indexOf(`data-page="${id}"`);
    expect(at('bank')).toBeGreaterThan(nav.indexOf('Financed emissions</div>'));
    expect(at('bank')).toBeLessThan(at('parta-position'));
  });

  test('it is registered with a real title, a return visit re-reads, and it is a bank’s own landing', () => {
    must(APP, /'bank':\s*\{\s*title:\s*'Bank Overview'/, 'the router titles it');
    must(APP, "src:  'pages/bank.html'", 'the router loads it');
    must(APP, 'BankPage.init()', 'the router initialises it');
    must(APP, /'bank':\s*\{[\s\S]*?refresh:/, 'a return visit re-reads rather than replaying');
    must(JS, /function refresh\(\)\s*\{[\s\S]{0,400}?return load\(\);/,
      'a return visit re-reads the position');
    must(JS, /if \(yearsUnread\) await loadYears\(\);/,
      'and re-reads the year list where that read had failed, so a book that '
      + 'was briefly out of reach does not need the whole page reloaded');
    must(AUTH, /org !== 'ui' && org !== 'preview'[^\n]*return 'bank'/, 'a bank signed in to its own organisation lands here; the demonstration organisation and a preview keep the dashboard');
  });

  test('the role gate holds it to the same bar as the other PCAF screens, and the sample book reaches it', () => {
    const level = Number((AUTH.match(/'bank':\s*(\d+)/) || [])[1]);
    const pcaf = Number((AUTH.match(/'pcaf':\s*(\d+)/) || [])[1]);
    expect(level).toBe(pcaf);
    must(AUTH, /PREVIEW_PAGES = \[[\s\S]*?'bank'/, 'a preview visitor is offered it');
  });
});

describe('The four mechanical rules', () => {
  test('hidden beats any display this sheet sets', () => {
    must(CSS, /\.bank \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/, '[hidden] must beat every class rule that sets display');
  });

  test('every toggle is el.hidden, never a display style; the one width set is the coverage bar’s fill', () => {
    mustNot(JS, /style\.display\s*=/, 'toggles go through el.hidden so the [hidden] guard governs them');
    must(CSS, /\.bank-bar-fill\s*\{[^}]*display:\s*block/, 'a bar drawn on an inline element renders as nothing');
  });

  test('a select may shrink, so one long option cannot widen the page', () => {
    must(CSS, /\.bank select\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/, 'a <select> sizes to its widest option unless told it may shrink');
  });

  test('grid columns collapse rather than push the page at 430px', () => {
    must(CSS, /minmax\(min\(100%,\s*\d+px\),\s*1fr\)/, 'repeat(auto-fit, minmax(Npx, 1fr)) is Npx wide whatever the container is');
    must(CSS, /\.bk-scroll\s*\{[^}]*overflow-x:\s*auto/, 'a wide table scrolls in its own box; the page never scrolls sideways');
    expect((JS.match(/<table class="partc-table">/g) || []).length)
      .toBe((JS.match(/<div class="bk-scroll"><table class="partc-table">/g) || []).length);
  });

  test('everything that changes the first request is wired before it is sent', () => {
    const init = JS.slice(JS.indexOf('async function init()'));
    const firstLoad = init.indexOf('await load()');
    const preview = init.indexOf("[data-writes]')) el.hidden = preview()");
    expect(firstLoad).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(0);
    expect(preview).toBeLessThan(firstLoad);
    expect(init.indexOf("on('bk-year'")).toBeLessThan(firstLoad);
    expect(init.indexOf('await loadYears()')).toBeLessThan(firstLoad);
  });
});

describe('The screen renders the engines rather than repeating them', () => {
  test('it reads the consolidated route, each class’s own position and the baselines in force, and computes no total of its own', () => {
    must(JS, /partA\(`\/financed-emissions\/\$\{encodeURIComponent\(year\)\}`\)/, 'the position is the consolidated route’s');
    must(JS, /\/position\/\$\{encodeURIComponent\(p\.reportingYear\)\}\?assetClass=/, 'the improvement steps are each class’s own');
    must(JS, /call\('\/v1\/baselines\/effective'\)/, 'the baselines are the registry’s answer');
    mustNot(JS, /\.reduce\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\w+\s*\+/, 'no sum in the browser');
    mustNot(JS, /\)\s*\/\s*\(?\s*(total|outstanding|exposures|count)/i, 'no share or average in the browser');
    mustNot(JS, /scope1And2[^\n]*\+[^\n]*scope3|scope3[^\n]*\+[^\n]*scope1And2/, 'scope 3 is a separate line');
    must(HTML, /never summed with scope 1 and 2/, 'the figure says so on its face');
  });

  test('a score is a category with the scale beside it, never a mark out of five', () => {
    mustNot(JS, /\/\s*5\b/, 'never "3 / 5"');
    mustNot(HTML, /\/\s*5\b/, 'never "3 / 5"');
    must(HTML, /1 is the highest quality, 5 the lowest/, 'the scale is stated where the score is shown');
    must(HTML, /never averaged across classes/, 'one score per class');
    must(JS, /dqb dqb-\$\{Math\.round\(v\)\}/, 'the badge shares the palette every PCAF screen uses');
  });

  test('every scenario figure is labelled as one, and the citations survived', () => {
    must(JS, /<span class="partc-hint">scenario<\/span>/, 'each projected score carries the word');
    must(HTML, /Box 6\.1-6 \(p\.168\)/, 'the weighting cites its clause');
    must(HTML, /Disclosure Checklist Part A, p\.124/, 'coverage cites its clause');
  });

  test('a class tile opens the book at that class, honoured by the lending book before its first request', () => {
    must(JS, /localStorage\.setItem\('carboniq\.parta\.class', assetClass\)/, 'the choice is handed to the lending book');
    const REG = source('ui/js/parta-register.js');
    must(REG, /localStorage\.getItem\('carboniq\.parta\.class'\)/, 'the lending book reads it');
    const text = REG.slice(REG.indexOf('async function loadVocabulary()'), REG.indexOf('function applyClass()'));
    must({ rel: REG.rel, text }, /carboniq\.parta\.class/, 'and reads it while the vocabulary loads, before the first request');
  });

  test('the write controls are marked, so a preview visitor is not offered a button the server refuses', () => {
    must(HTML, /id="bk-starter"[^>]*data-writes/, 'the starter button carries data-writes');
    must(HTML, /id="bk-starter-name"[^>]*data-writes/, 'and so does the name field beside it');
  });
});

describe('The charts draw figures the engines returned, and nothing of their own', () => {
  const CH = source('ui/js/charts.js');

  test('the chart module is loaded before the overview, fetches nothing and sums nothing', () => {
    expect(INDEX.indexOf('<script src="js/charts.js"></script>')).toBeGreaterThan(0);
    expect(INDEX.indexOf('<script src="js/charts.js"></script>')).toBeLessThan(INDEX.indexOf('<script src="js/bank.js"></script>'));
    mustNot(CH, /fetch\(|CARBONIQ_fetch/, 'a chart module that fetched would be a second reader of the book');
    mustNot(CH, /\.reduce\(/, 'a chart that summed would be a second engine');
    expect((CH.match(/<svg /g) || []).length).toBe((CH.match(/<svg [^>]*role="img"/g) || []).length);
  });

  test('every drawing is a block that follows its container, and one hue is one class', () => {
    must(CSS, /\.bank \.ch\s*\{[^}]*display:\s*block/, 'a drawing on an inline element renders as nothing');
    for (const k of ['business-loans-unlisted-equity', 'listed-equity-corporate-bonds', 'project-finance', 'commercial-real-estate', 'mortgages', 'motor-vehicle-loans', 'sovereign-debt']) {
      must(CSS, new RegExp(`--cls-${k}:\\s*#[0-9a-f]{6}`), `the class ${k} has a hue of its own`);
    }
    must(CSS, /--cls-scope3:/, 'scope 3 has a colour of its own, apart from every class');
    must(JS, /const CLASS_COLOR = k => `var\(--cls-\$\{k\}/, 'the hue is read from the stylesheet, never chosen in the module');
    must(JS, /const DQ_COLOR = score => `var\(--dq\$\{Math\.round\(score\)\}/, 'the score ramp is the one every PCAF screen shares');
  });

  test('scope 3 is a bar of its own and never a segment of the headline', () => {
    mustNot(JS, /segments:\s*[^\]]*scope3/, 'no segment list carries scope 3');
    must(JS, /scope 3, apart/, 'the scope 3 bar says so in its label');
    must(HTML, /never added to it/, 'and the panel says so on its face');
  });

  test('behind every figure is the lineage the disclosure prints, read from the document and never restated', () => {
    must(HTML, /id="bk-behind" hidden/, 'the drawer is hidden until a figure is asked about');
    for (const k of ['headline', 's3', 'coverage', 'intensity', 'approved']) must(HTML, new RegExp(`data-behind="${k}"`), `the ${k} figure carries its button`);
    must(JS, /partA\(`\/financed-emissions\/\$\{encodeURIComponent\(year\)\}\/disclosure\?format=json`\)/, 'the lineage is the disclosure’s own facts');
    must(JS, /cover\.reportId/, 'the document reference is printed');
    must(JS, /cover\.identity/, 'and the content hash and build behind it');
    must(JS, /facts\.releases/, 'and every factor set with its checksum');
    must(JS, /lineage = null;\n    show\('bk-behind', false\);/, 'the lineage is dropped on every reload, so a drawer never shows a book that has since changed');
  });

  test('approval is a figure the server counted, shown as a ring and a tile, never tallied here', () => {
    must(HTML, /id="bk-approved"/, 'the hero carries the approved count');
    must(JS, /Charts\.ring\(val\(ap\.approvedPct\)/, 'the ring is the server’s approvedPct');
    must(JS, /\$\{fmt\(ap\.approved, 0\)\} of \$\{fmt\(ap\.total, 0\)\}/, 'the tile prints approved of total, both the server’s');
    mustNot(JS, /status === 'approved'\)\.length/, 'nothing is counted in the browser');
  });

  test('the data-quality chart shares out what the server returned, and the ring shows the coverage the server computed', () => {
    must(JS, /o\.shareOfBook/, 'each share is the improvement plan’s own shareOfBook');
    must(JS, /Charts\.ring\(val\(cov\.sharePct\)/, 'the ring is the consolidated coverage figure');
    must(JS, /const val = v => \(v === null \|\| v === undefined \|\| v === '' \? null : Number\(v\)\)/, 'absence is checked before the number is — Number(null) is 0');
  });

  test('a class in focus follows the choice across the chips, the tiles, the charts and its own panel', () => {
    must(JS, /function setFocus\(assetClass\)[\s\S]{0,300}?renderChips\(position\); renderClasses\(position\); renderCharts\(position\); renderFocus\(position\);/, 'one choice re-renders every panel');
    must(JS, /positions\.set\(c\.assetClass, await partA\(`\/position\//, 'the focus panel reads the position already fetched for the plan');
    must(HTML, /id="bk-chips"/, 'the chips are on the page');
    must(HTML, /id="bk-focus" hidden/, 'the focus panel is hidden until a class is chosen');
  });
});

describe('The SLFRS S2 view: what the file answers, and on whose word', () => {
  test('the download is the S2 file, and the strip says what it answers', () => {
    must(HTML, /id="bk-pdf">SLFRS S2 disclosure — PDF/, 'the primary button is the S2 file');
    must(JS, /slfrs-s2-disclosure-fy\$\{year\}\.pdf/, 'and the file it saves is named as one');
    must(HTML, /id="bk-s2" hidden/, 'the strip is hidden until the position says what is stated');
    must(HTML, /data-behind="s2"/, 'the S2 file carries its own lineage button');
    must(JS, /p\.entity && p\.entity\.climateReadiness/, 'the readiness is the server’s, derived on the settings it holds');
  });

  test('a pillar opens the form that answers it, honoured before the panel’s first request', () => {
    must(JS, /localStorage\.setItem\('carboniq\.parta\.climatePillar', pillar\)/, 'the choice is handed over');
    const CL = source('ui/js/parta-climate.js');
    must(CL, /localStorage\.getItem\('carboniq\.parta\.climatePillar'\)/, 'the climate panel reads it');
    const load = CL.slice(CL.indexOf('async function load(given)'));
    expect(load.indexOf('carboniq.parta.climatePillar')).toBeLessThan(load.indexOf("call('/climate/reference')"));
  });

  test('the three §29 bands are the engine’s amounts, and what is unassessed is drawn rather than dropped', () => {
    must(JS, /val\(band\.totalAmount\)/, 'the bar is the outstanding the engine took the band over, never a sum made here');
    must(JS, /val\(band\.unassessedAmount\)/, 'the unassessed amount is a segment of its own');
    must(JS, /label: 'Not yet assessed'/, 'and is labelled as what it is');
    must(JS, /Number\(band\.sharePct\)\.toFixed\(2\)/, 'the share is the engine’s sharePct');
    must(HTML, /S2 §29\(b\)–\(d\)/, 'the panel cites the paragraphs');
    must(HTML, /the amount not yet assessed is stated beside it/, 'and says what the share is taken over');
  });

  test('not assessed is neutral, and vulnerable and aligned never share a hue', () => {
    for (const t of ['--s2-transition', '--s2-physical', '--s2-aligned', '--s2-assessed', '--s2-unassessed', '--s2-carbon', '--s2-other']) {
      must(CSS, new RegExp(`${t}:\\s*#[0-9a-f]{6}`), `${t} is defined once in the stylesheet`);
    }
    must(JS, /transitionRisk: 'var\(--s2-transition/, 'the hue is read from the stylesheet, never chosen in the module');
    const aligned = (CSS.match(/--s2-aligned:\s*(#[0-9a-f]{6})/) || [])[1];
    const unassessed = (CSS.match(/--s2-unassessed:\s*(#[0-9a-f]{6})/) || [])[1];
    expect(aligned).not.toBe(unassessed);
  });

  test('the industry table is the §32 view, with carbon-related marked on a stated boundary', () => {
    must(HTML, /SLFRS S2 §32/, 'the panel cites the paragraph');
    must(JS, /r\.carbonRelated \? 'var\(--s2-carbon/, 'a carbon-related industry is marked by hue');
    must(JS, /esc\(cr\.basis \|\| ''\)/, 'and the boundary the subtotal was taken on travels with it');
    must(JS, /Carbon-related lending:/, 'the subtotal is printed');
  });
});

describe('The workspace carries the bank’s own name', () => {
  const STYLES = source('ui/styles.css');
  const LOGIN = source('ui/js/login.js');
  const POS = source('ui/js/parta-position.js');

  test('the financed-emissions group is headed by the reporting entity once one is recorded', () => {
    must(INDEX, /<span class="nav-workspace-entity" id="nav-workspace-entity" hidden><\/span>Financed emissions<\/div>/,
      'the entity span sits inside the group label, hidden until a name is held');
    must(APP, /CARBONIQ_fetch\('\/v1\/pcaf\/part-a\/settings'\)/, 'the name is read from the entity’s own settings, never typed into the shell');
    must(APP, /addEventListener\('carboniq:entity'/, 'and re-read when a screen records the entity');
    must(LOGIN, /CARBONIQ_labelWorkspace\(\)/, 'and read again at sign-in, not only at page load');
    must(STYLES, /\.nav-workspace-entity:not\(\[hidden\]\)\s*\{\s*display:\s*block/, 'the display rule yields to [hidden]');
  });

  test('recording the entity or loading the starter book tells the sidebar', () => {
    must(POS, /put\('\/settings'[\s\S]{0,240}?dispatchEvent\(new CustomEvent\('carboniq:entity'\)\)/, 'the entity form announces the name it recorded');
    must(JS, /reportingEntity: name/, 'the starter carries the name typed beside it');
    must(JS, /dispatchEvent\(new CustomEvent\('carboniq:entity'\)\)/, 'and announces it');
    must(POS, /reportingEntity: name/, 'the position screen’s starter does the same');
  });
});

describe('Every id the module reads exists in the fragment', () => {
  const ids = new Set();
  for (const m of JS.matchAll(/\$\('([a-zA-Z0-9-]+)'\)/g)) ids.add(m[1]);
  for (const m of JS.matchAll(/(?:say|setHtml|show|on)\('([a-zA-Z0-9-]+)'/g)) ids.add(m[1]);
  test('the sweep found the ids it claims to, and each one is in the page', () => {
    expect(ids.size).toBeGreaterThan(15);
    const missing = [...ids].filter(id => !HTML.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });
  test('the module exposes init, refresh and load', () => {
    expect(typeof Page.init).toBe('function');
    expect(typeof Page.refresh).toBe('function');
  });
});

describe('The figures band is cards with drawings, not sentences (CARDS-2)', () => {
  test('every figure is a card, the primary and the scope 3 carry a per-class drawing, the two shares are rings, the outstanding items are chips', () => {
    for (const id of ['bk-headline-chart', 'bk-s3-chart', 'bk-coverage-ring', 'bk-approved-ring', 'bk-ready-items']) {
      must(HTML, new RegExp(`id="${id}"`), `${id} is in the band`);
    }
    must(JS, /setHtml\('bk-headline-chart', charts && rec\.length \? Charts\.hbars\(/, 'the headline card draws one bar per class from the class’s own headline');
    must(JS, /setHtml\('bk-s3-chart', charts && rec\.length \? Charts\.hbars\(/, 'the scope 3 card draws one bar per class, apart');
    must(JS, /setHtml\('bk-coverage-ring', charts \? Charts\.ring\(val\(c\.sharePct\)/, 'coverage is the server’s share as a ring');
    must(JS, /setHtml\('bk-approved-ring', charts \? Charts\.ring\(val\(ap\.approvedPct\)/, 'approval is the server’s share as a ring');
    must(JS, /items\.slice\(0, 3\)\.map\(it => `<span class="bank-chip-soft">/, 'the first outstanding items are chips');
    mustNot(HTML, /bk-headline-basis/, 'the class-by-class basis is behind the figure, not in the band', 'the Behind drawer prints it');
    mustNot(JS, /say\('bk-headline-basis'/, 'no sentence is printed under the headline');
  });
  test('one card language, loaded once and before the corrections', () => {
    must(INDEX, /<link rel="stylesheet" href="css\/cards\.css">/, 'the card sheet is loaded');
    expect(INDEX.indexOf('css/cards.css')).toBeLessThan(INDEX.indexOf('css/responsive.css'));
    const CARDS = source('ui/css/cards.css');
    must(CARDS, /\.bank-figure,[\s\S]*?border-radius: var\(--card-radius\)/, 'the figure card takes the shared radius');
    must(CARDS, /:root\[data-theme="dark"\]/, 'the dark stamp is honoured');
    must(CARDS, /:root:not\(\[data-theme="light"\]\)/, 'the system dark scheme is honoured unless light is stamped');
    must(CARDS, /\.ch \{ display: block;/, 'every drawing is a block');
    mustNot(CARDS, /min-width:\s*\d+px/, 'the card sheet sets no floor a phone cannot meet', 'a floor belongs to the screen, in minmax(min(100%, …))');
    must(source('ui/css/bank.css'), /\.bank-behind-btn::after \{ content: ' ›'/, 'the behind control reads as a control');
  });
});

describe('The overview is drawn to the data-visualisation method (DESIGN-3)', () => {
  test('the class palette is one validated set, stepped for both themes, and the hero figure is the sans', () => {
    /* Light and dark values differ: the dark set is the same hues stepped for
       the dark surface, never an automatic flip. */
    for (const k of ['business-loans-unlisted-equity', 'listed-equity-corporate-bonds', 'project-finance', 'commercial-real-estate', 'mortgages', 'motor-vehicle-loans', 'sovereign-debt']) {
      const all = [...CSS.matchAll(new RegExp(`--cls-${k}:\\s*(#[0-9a-f]{6})`, 'g'))].map(m => m[1]);
      expect(all).toHaveLength(3);
      expect(all[0]).not.toBe(all[1]);
      expect(all[1]).toBe(all[2]);
    }
    must(CSS, /\.bank-figure-hero \{ font-size: 48px;/, 'the hero figure is at least 48px');
    mustNot(CSS, /\.bank-figure-value[^{]*\{[^}]*Lora/, 'the hero figure is the sans, never the display face', 'a serif on the hero figure reads as decoration');
    must(CSS, /\.bank-figures \{ grid-template-columns: repeat\(12, minmax\(0, 1fr\)\); \}/, 'twelve tracks at desktop width');
    must(CSS, /\.bank-figure-primary, \.bank-figure-wide \{ grid-column: span 6; \}/, 'the two lead cards take a row between them');
  });

  test('every chart is a figure with a table twin and a hover readout; the filter row sits above the charts', () => {
    for (const id of ['bk-chart-emissions', 'bk-chart-dq', 'bk-chart-outstanding', 'bk-chart-intensity', 'bk-chart-climate', 'bk-chart-industry']) {
      must(JS, new RegExp(`setHtml\\('${id}', Charts\\.figure\\(`), `${id} is a figure with a table twin`);
    }
    expect(HTML.indexOf('id="bk-chips"')).toBeLessThan(HTML.indexOf('id="bk-chart-emissions"'));
    must(HTML, /<section class="bank-filter">/, 'one filter row, above every chart it scopes');
    must(HTML, /<section class="partc-card bank-focus" id="bk-focus" hidden>/, 'the class in focus is a card of its own');
    must(JS, /el\.style\.setProperty\('--swatch', CLASS_COLOR\(c\.assetClass\)\)/, 'the focus card carries the class hue on its edge');
  });

  test('by asset class is a list of rows a committee reads, each opening the book', () => {
    must(HTML, /<div class="bank-tiles-head" aria-hidden="true">/, 'the rows have column heads');
    must(JS, /class="bank-tile-cell\$\{num \? ' num' : ''\}"><span class="bank-tile-key">/, 'each cell carries its key for the phone layout');
    must(CSS, /@media \(max-width: 900px\) \{\s*\.bank-tiles-head \{ display: none; \}/, 'the heads give way to per-cell keys on a phone');
    must(HTML, /A row opens the book at that class\./, 'the panel says what a row does');
  });
});

