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
    /* The class is part of what the first request says. */
    expect(init.indexOf("on('pr-class'")).toBeLessThan(firstLoad);
    expect(init.indexOf('applyClass()')).toBeLessThan(firstLoad);
  });
});

describe('The screen renders the engine rather than repeating it', () => {
  test('the held vocabulary is loaded before the first request, and the form offers it', () => {
    must(JS, /await loadVocabulary\(\);\s*applyClass\(\);\s*await loadYears\(\);/, 'the vocabulary and the class are settled before the first request is sent');
    must(HTML, /id="pr-f-sector-key"/, 'the form carries a select over the held sectors');
    must(JS, /sectorKey: str\('pr-f-sector-key'\)/, 'the mapped sector reaches the request');
    must(JS, /plausibility: \{ revenue: num\('pr-f-revenue'\) \}/, 'the revenue for the band check reaches the request');
    must(HTML, /Leave the sector factors empty to use the held factor/, 'the form says the held factor applies when none is typed');
    must(JS, /sf === undefined \? undefined/, 'an empty factor field is an absent factor, so the held one is used');
    must(JS, /Factor set<\/h5>/, 'the detail names the factor set an estimated figure rests on');
    must(JS, /x\.factorRelease\.checksum\.slice\(0, 16\)/, 'with its checksum');
  });

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

describe('One register, every built class', () => {
  test('the class is chosen on the screen, every request names it, and each class has its own form block', () => {
    must(HTML, /id="pr-class"/, 'a class selector');
    must(JS, /\/position\/\$\{year\}\?assetClass=\$\{encodeURIComponent\(cls\)\}/, 'the position is read per class');
    must(JS, /&assetClass=\$\{encodeURIComponent\(cls\)\}&limit=200/, 'the rows are read per class');
    for (const c of ['business-loans-unlisted-equity', 'commercial-real-estate mortgages', 'project-finance', 'listed-equity-corporate-bonds', 'motor-vehicle-loans']) {
      must(HTML, new RegExp(`data-class-form="${c}"`), `a form block for ${c}`);
    }
    must(JS, /el\.hidden = !el\.getAttribute\('data-class-form'\)\.split\(' '\)\.includes\(cls\)/, 'the blocks toggle through [hidden]');
  });

  test('a floor area travels with its unit and is never converted here', () => {
    must(HTML, /id="pr-f-area-unit"/, 'the unit is chosen beside the area');
    must(HTML, /<option value="ft2">ft²<\/option>/, 'square feet is offered');
    must(JS, /body\.floorArea = \{ value: area, unit: str\('pr-f-area-unit'\) \|\| 'm2' \}/, 'the area and its unit reach the request as keyed');
    mustNot(JS, /0\.0929|10\.764|\* ?0\.3048/, 'no conversion factor lives in the browser');
    must(JS, /Floor area as keyed/, 'the detail shows the area as keyed');
    must(JS, /floorAreaConversion/, 'and the conversion the engine ran');
  });

  test('a vehicle’s efficiency and distance travel as keyed, and the browser derives no option', () => {
    must(HTML, /id="pr-f-mv-eff-unit"/, 'the efficiency unit is chosen beside the figure');
    must(HTML, /id="pr-f-mv-km-basis"/, 'the distance basis is chosen beside the distance');
    must(JS, /unit: str\('pr-f-mv-eff-unit'\) \|\| 'km\/L', basis: 'make-model'/, 'the efficiency reaches the request in its own unit');
    mustNot(JS, /100 \/ [a-z]+\b.*km\/L|\* 8\.94|\* 9\.97/, 'no unit conversion and no energy content in the browser');
    mustNot(JS, /option: '(1a|1b|2a|2b|3a|3b)'/, 'the option is the engine’s to derive');
    must(HTML, /Two options score 1 in this class/, 'the form says what the table says');
  });

  test('the groupings and the downloads follow the class', () => {
    must(JS, /Array\.isArray\(p\.groupings\)/, 'the groups table reads the class’s own groupings');
    must(JS, /show\('pr-pdf', cls === DEFAULT_CLASS\)/, 'the §5.2 disclosure is offered for §5.2 only');
    must(HTML, /never averaged with another/, 'the screen says a class is never averaged with another');
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

  test('an exposure is edited through the same form and the same collectors, saved through PUT, and the engine reruns', () => {
    must(HTML, /id="pr-detail-edit"[^>]*data-writes/, 'the edit control is on the detail and is a write control');
    must(JS, /on\('pr-detail-edit', 'click', startEdit\)/, 'and it starts an edit');
    must(JS, /await put\(`\/exposures\/\$\{encodeURIComponent\(editing\)\}`, collect\(\)\)/, 'a save is a PUT of what the collectors build — never a hand-made body');
    must(JS, /fill\(\{ \.\.\.\(current\.input \|\| \{\}\), facility: current\.facility \|\| null \}\)/, 'the form is prefilled from the input the register holds');
    for (const fn of ['fillBusinessLoan', 'fillProperty', 'fillVehicle', 'fillProject', 'fillListed']) {
      must(JS, new RegExp(`function ${fn}\\(i\\)`), `${fn} fills its class's block`);
    }
    mustNot(JS, /0\.09290304|0\.3048/, 'no conversion factor lives in the browser, on the way in or out');
    must(JS, /textContent = 'Save changes'/, 'the button says what it will do');
  });

  test('review is a move the server makes, in words, and an approved exposure offers no edit', () => {
    must(JS, /post\(`\/exposures\/\$\{encodeURIComponent\(openId\)\}\/status`/, 'a move is a POST to the status route');
    must(JS, /const STATE_LABEL = \{ recorded: 'Recorded', under_review: 'Under review', approved: 'Approved' \}/, 'the state is a word, never a number');
    must(JS, /window\.prompt\('Why is this approved exposure being reopened/, 'reopening asks for the reason the server records');
    must(JS, /allow\('pr-detail-edit', st !== 'approved'\)/, 'an approved exposure offers no edit');
    must(JS, /allow\('pr-detail-remove', st !== 'approved'\)/, 'nor removal');
    must(HTML, /id="pr-detail-state"/, 'the state is on the detail');
  });

  /* A read that was refused and a book that is empty are different claims,
     and the screen made them look the same: the failure was written to the
     status line and then overwritten by the count the position returned, so
     a refused list drew "7 exposure(s)" over an empty table. */
  test('a list that could not be read is never reported as a book with nothing in it', () => {
    must(JS, /catch \(err\) \{ unread = err; \}/, 'the failure is held, not written where the next line overwrites it');
    must(JS, /say\('pr-status', unread[\s\S]{0,240}?exposures could not be read/, 'the status says the read failed');
    mustNot(JS, /catch \(err\) \{ say\('pr-status', err\.message\); \}\s*\n\s*rows = list;/,
      'the exposure count never lands on top of the failure it replaced');
  });

  test('the write controls are marked, so a preview visitor is not offered a button the server refuses', () => {
    for (const id of ['pr-record-toggle', 'pr-record', 'pr-book-form', 'pr-detail-edit', 'pr-detail-recompute', 'pr-detail-remove', 'pr-detail-review', 'pr-detail-approve', 'pr-detail-draft', 'pr-detail-reopen']) {
      must(HTML, new RegExp(`id="${id}"[^>]*data-writes|data-writes[^>]*id="${id}"`), `${id} carries data-writes`);
    }
  });
});

describe('The exposure detail is figures first, reasons on request (CARDS-3)', () => {
  test('four cards, the lines drawn and tabled, the score on its scale, the attribution as a ring, the review as steps', () => {
    must(JS, /<div class="pr-stats">/, 'the stat cards open the detail');
    must(JS, /Charts\.hbars\(bars, \{ label: 'Financed scope 1, scope 2 and scope 3 apart, tCO2e', decimals: 2, compact: true \}\)/, 'the lines are drawn, scope 3 apart');
    must(JS, /Charts\.scale\(dq\.scope1And2\.score, \{ label: 'Data quality score, scope 1 and 2', colors: DQ_RAMP \}\)/, 'the score sits on the five-cell scale');
    must(JS, /const DQ_RAMP = \[1, 2, 3, 4, 5\]\.map\(n => `var\(--dq\$\{n\}\)`\)/, 'the scale takes the shared ramp');
    must(JS, /Charts\.ring\(attributionPct, \{ label: 'Attribution share'/, 'the attribution factor is drawn as the share it is');
    must(JS, /<table class="partc-table pr-lines">/, 'the seven lines are a table');
    must(JS, /<details class="pr-why"><summary>Why<\/summary>/, 'an absent line keeps the standard’s sentence behind a disclosure');
    must(JS, /<ol class="pr-steps" aria-label="Review">/, 'the review is steps');
    must(JS, /What clears it\./, 'a finding still says what clears it');
    must(source('ui/css/parta-register.css'), /\.parta-register \.pr-stats \{[\s\S]*?minmax\(min\(100%, 210px\), 1fr\)/, 'the cards collapse rather than push the page');
  });
  test('the scale is a category, never a fraction of five', () => {
    const CH = source('ui/js/charts.js');
    must(CH, /1 · highest quality/, 'the scale names its ends');
    mustNot(CH, /\/\s*5\b/, 'never "2 / 5"');
    must(CH, /function scale\(score, opts = \{\}\)/, 'the scale is a drawing in the chart module');
  });
});

describe('How the borrower’s emissions are known, and the engine’s answer before Record (KNOWN-2)', () => {
  test('the form asks which path the data is on rather than inferring it from which boxes hold a number', () => {
    must(HTML, /<input type="radio" name="pr-known" id="pr-f-known-reported" value="reported" checked>/, 'reported by the borrower is the first path, and the default');
    must(HTML, /<input type="radio" name="pr-known" id="pr-f-known-sector" value="sector">/, 'not known — estimated from its industry is the second');
    must(HTML, /Option 3, score 4 or 5/, 'the sector path says what it earns on its face');
    must(HTML, /id="pr-known-sector" hidden/, 'the sector path’s fields are hidden until it is chosen');
    must(JS, /function knownPath\(\)/, 'the module reads the path from the control');
    must(HTML, /<input type="radio" name="pr-size" id="pr-f-size-revenue" value="revenue" checked>/, 'which of the two sector options applies is asked');
    must(HTML, /<input type="radio" name="pr-size" id="pr-f-size-none" value="none">/, 'and the outstanding-alone path is the second answer');
    must(JS, /function sizePath\(\)/, 'the module reads that answer from the control');
    must(JS, /const basis = sizePath\(\) === 'revenue' \? 'revenue-sector' : 'assets-sector';/,
      'the option follows the answer, never whether a revenue happens to be keyed: that field is the band '
      + 'check, and reading it as the switch moved an exposure to 3a — which needs a company value — with '
      + 'nothing on screen saying so');
    must(JS, /set\('pr-f-size-revenue', onRevenue\); set\('pr-f-size-none', !onRevenue\);/,
      'an edit reopens on the option the stored figure rests on');
    must(JS, /activity: \{ revenue: basis === 'revenue-sector' \? revenue : undefined/, 'the revenue travels on the line for Option 3a');
    must(JS, /const onSector = SECTOR_BASES\.includes\(s1\.basis \|\| s2\.basis\);/, 'an edit reopens on the path the stored input is on');
    must(JS, /el\.type === 'checkbox' \|\| el\.type === 'radio'/, 'the setter fills a radio');
  });

  test('the preview is the engine’s answer through the preview route, marked as one, never a record', () => {
    must(HTML, /<div class="pr-preview" id="pr-preview" hidden aria-live="polite">/, 'the card is hidden until an answer exists');
    must(HTML, /Preview — nothing is written until Record/, 'and says so on its face');
    must(JS, /await post\('\/exposures\/preview', body\)/, 'the answer is the preview route’s, over the same body Record sends');
    must(JS, /on\('pr-form', 'input', \(\) => schedulePreview\(\)\)/, 'every change re-asks the engine');
    must(JS, /if \(seq !== previewSeq\) return;/, 'a late answer never overwrites a newer one');
    must(JS, /The standard would refuse this as it stands\./, 'a refusal reaches the form before Record');
    must(JS, /What would raise the score/, 'and the better options are listed');
    must(JS, /st\.needs/, 'each with what it needs, the server’s words');
    must(JS, /Charts\.scale\(dq\.scope1And2\.score/, 'the score is drawn on the scale');
    mustNot(JS, /score\s*[-+*/]\s*\d|\d\s*[-+*/]\s*score/, 'no score arithmetic in the browser');
  });

  test('every row and the detail say which basis the figure rests on', () => {
    must(JS, /const BASIS_WORD = \{ 1: 'reported by the borrower', 2: 'from the borrower’s activity', 3: 'estimated on the sector library'/, 'one word per option family');
    must(JS, /\$\{basisChip\(dq\.scope1And2 && dq\.scope1And2\.option\)\}<\/td>/, 'the rows carry it under the score');
    must(JS, /<span class="pr-stat-unit">\$\{basisChip\(dq\.scope1And2\.option\)\}<\/span>/, 'the detail carries it beside the score');
  });
});


describe('The facility behind the loan — the numerator is the year-end balance, never the commitment (FAC-5)', () => {
  test('the form records the facility on every loan class and never on a holding, and asks the engine for the scheduled balance', () => {
    must(HTML, /data-class-form="business-loans-unlisted-equity commercial-real-estate mortgages motor-vehicle-loans project-finance"/, 'one facility block for the five loan classes');
    mustNot(HTML, /data-class-form="[^"]*listed-equity-corporate-bonds[^"]*facility|id="pr-f-fac-committed"[^]*data-class-form="listed-equity/, 'a listed holding is never offered a facility');
    must(HTML, /id="pr-f-fac-committed"/, 'the sanctioned amount');
    must(HTML, /id="pr-f-fac-disbursed"/, 'drawn to date');
    must(HTML, /id="pr-f-fac-profile"[^]*?value="bullet"/, 'the repayment profile');
    must(HTML, /PCAF Part A §5\.2, p\.56/, 'the block cites the clause');
    must(HTML, /id="pr-fac-use">Use the scheduled balance</, 'the scheduled balance is offered as a control');
    must(JS, /post\('\/facility\/schedule', \{ facility, asOf: positionDate\(\) \}\)/, 'the scheduled balance comes from the engine’s own read');
    must(JS, /const FACILITY_CLASSES = \['business-loans-unlisted-equity', 'commercial-real-estate', 'mortgages', 'motor-vehicle-loans', 'project-finance'\]/, 'the classes that carry one');
    must(JS, /if \(facility\) body\.facility = facility;/, 'sent only when a commitment is keyed');
    must(JS, /fillFacility\(i\.facility \|\| null\)/, 'an edit prefills it from the record');
    must(JS, /fill\(\{ \.\.\.\(current\.input \|\| \{\}\), facility: current\.facility \|\| null \}\)/, 'from the record, where the engine’s input has it stripped');
  });
  test('taking the scheduled figure records the basis; typing a balance restores the ledger’s; the chip says which', () => {
    must(JS, /facilityBasis = 'scheduled';\s*applyFacilityBasis\(\);\s*schedulePreview\(0\);/, 'Use the scheduled balance records the basis and previews');
    must(JS, /on\(id, 'input', \(\) => \{ facilityBasis = 'ledger'; applyFacilityBasis\(\); \}\)/, 'a typed balance is the ledger’s');
    must(JS, /outstandingBasis: facilityBasis,/, 'the basis travels on the record');
    must(JS, /taken from the repayment schedule — the loan account’s balance replaces it before the disclosure is filed/, 'the chip says what a scheduled basis means');
  });
  test('the panel draws sanctioned, drawn and outstanding on one scale, the §6.2 line apart, and the life of the loan hatched with its assumptions', () => {
    must(JS, /function facilityPanel\(x, ccy\)/, 'one panel for the preview and the detail');
    must(JS, /\$\{facilityPanel\(x, ccy\)\}\s*\$\{climatePanel\(e\.climate\)\}/, 'on the detail');
    must(JS, /\$\{facilityPanel\(x, \(x\.exposure && x\.exposure\.outstanding/, 'and on the preview');
    must(JS, /label: 'Sanctioned', value: t\.committed/, 'the commitment is a bar of its own');
    must(JS, /label: 'Outstanding at year-end', value: r\.outstanding/, 'the outstanding is a bar of its own, never stacked inside it');
    must(JS, /Undrawn commitment — §6\.2, reported apart/, 'the §6.2 line has its own heading');
    must(JS, /Unweighted — shall/, 'with its duty');
    must(JS, /value: row\.scheduledOutstanding, color: 'var\(--p-accent, #0d9488\)', projected: true/, 'every life-of-loan row is a projection');
    must(JS, /Hatched: a projection\./, 'and the caption says what the texture means');
    must(JS, /\(p\.assumptions \|\| \[\]\)\.map/, 'the assumptions print beneath');
    mustNot(JS, /scheduledOutstanding\s*[-+*/]\s*|committed\s*-\s*disbursed|\.reduce\(\(s, r\) => s \+ \(r\.scheduled/, 'no balance is scheduled or summed in the browser');
    must(CSS, /\.pr-fac-scheduled \{ display: flex; flex-wrap: wrap;/, 'the offer wraps at a phone width');
  });
});
