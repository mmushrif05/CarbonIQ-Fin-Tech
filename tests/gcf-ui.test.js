/**
 * The GCF screen — the rules the source has to carry.
 *
 * Every one of these was found by driving the page in a browser, not by
 * reading it, and each is a way to render a confident screen that is wrong:
 *
 *   A [hidden] panel must actually be hidden. `[hidden]` is display:none from
 *   the user-agent sheet and ANY class rule that sets display beats it — that
 *   has covered a page from load once already in this codebase.
 *
 *   A bar drawn on an inline element renders as nothing, which reads as a
 *   score of zero rather than as a missing element.
 *
 *   A <select> sizes to its widest option, not to its container, so one long
 *   project name pushed the page 78px wide at 430px.
 *
 *   State that changes what the first request says must be read BEFORE that
 *   request is sent. This is the fourth instance of that shape here.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/gcf.html');
const CSS = source('ui/css/gcf.css');
const JS = source('ui/js/gcf.js');
const PIPE = source('ui/js/gcf-pipeline.js');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, and the head a script', () => {
    must(INDEX, 'data-page="gcf"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'id="page-gcf" data-src="pages/gcf.html"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'js/gcf.js', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'css/gcf.css', "the stylesheet is linked in the shell");
    /* The pipeline module defines the global the shell calls, so it loads first. */
    expect(INDEX.indexOf('js/gcf-pipeline.js')).toBeLessThan(INDEX.indexOf('js/gcf.js'));
    mustNot(HTML, /<style/, "the page fragment carries no inline stylesheet; the rules live in css/gcf.css");
  });

  test('it is registered with a real title, not left to show its own id', () => {
    must(APP, /'gcf':\s*\{[\s\S]*?title: 'GCF Pipeline'/, "it is registered with a real title, not left to show its own id");
    must(APP, /'gcf':\s*\{[\s\S]*?init:/, "it is registered with a real title, not left to show its own id");
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    must(APP, /'gcf':\s*\{[\s\S]*?refresh:/, "a return visit re-reads rather than showing what it said last time");
  });
});

describe('Layout rules that were broken before they were written down', () => {
  test('[hidden] beats any class rule that sets display', () => {
    must(CSS, /\.gcf-panel\[hidden\]\s*\{\s*display:\s*none\s*!important/, "[hidden] beats any class rule that sets display");
    must(CSS, /\.gcf \[hidden\]\s*\{\s*display:\s*none\s*!important/, "[hidden] beats any class rule that sets display, on every element of the screen");
  });

  test('the score bar is a block, or its height and background do not apply', () => {
    must(CSS, /\.gcf-bar\s*\{[^}]*display:\s*block/, "the score bar is a block, or its height and background do not apply");
  });

  test('a select may shrink below its widest option', () => {
    must(CSS, /\.gcf-actions select\s*\{[^}]*max-width:\s*100%/, "a select may shrink below its widest option");
    must(CSS, /\.gcf-actions select\s*\{[^}]*min-width:\s*0/, "a select may shrink below its widest option");
    must(CSS, /\.gcf select\s*\{[^}]*min-width:\s*0/, "every select on the screen may shrink, the inline forms included");
  });

  test('grids use explicit column counts, never auto-fit with a spanning child', () => {
    /* Scoped to declarations: the phrase also appears in the comment
       explaining why it is not used, and a sweep that trips on its own
       explanation is a sweep people delete. */
    const decls = CSS.match(/grid-template-columns:[^;]+;/g) || [];
    expect(decls.length).toBeGreaterThan(2);
    expect(decls.join(' ')).not.toMatch(/auto-fit|auto-fill/);
    must(CSS, /\.gcf-figures\s*\{[^}]*grid-template-columns:\s*1fr/, "grids use explicit column counts, never auto-fit with a spanning child");
    must(CSS, /repeat\(2, 1fr\)/, "grids use explicit column counts, never auto-fit with a spanning child");
    must(CSS, /repeat\(3, 1fr\)/, "grids use explicit column counts, never auto-fit with a spanning child");
  });

  test('wide content scrolls inside its own container', () => {
    must(CSS, /\.gcf-scroll\s*\{\s*overflow-x:\s*auto/, "wide content scrolls inside its own container");
    must(CSS, /\.gcf-rail\s*\{[^}]*overflow-x:\s*auto/, "the cycle rail scrolls inside its own container");
    must(CSS, /\.gcf-steps\s*\{[^}]*overflow-x:\s*auto/, "the stage steps scroll inside their own container");
    const tables = HTML.match(/<table class="gcf-table"/g) || [];
    const wrapped = HTML.match(/<div class="gcf-scroll"><table class="gcf-table"/g) || [];
    // Every table rendered into the page is wrapped by its renderer or its markup.
    expect(tables.length).toBeGreaterThan(0);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  test('the root sets min-width 0 so it can shrink inside a flex parent', () => {
    must(CSS, /\.gcf\s*\{[\s\S]*?min-width:\s*0/, "the root sets min-width 0 so it can shrink inside a flex parent");
  });
});

describe('Both themes resolve as a set', () => {
  test('every token is defined on the bare selector first', () => {
    const bare = CSS.match(/\.gcf\s*\{([\s\S]*?)\}/)[1];
    for (const t of ['--gcf-ink', '--gcf-muted', '--gcf-line', '--gcf-surface',
      '--gcf-sunk', '--gcf-accent', '--gcf-warn', '--gcf-stop', '--gcf-ok', '--gcf-project']) {
      expect(bare).toContain(t);
    }
  });

  test('the dark media query is guarded so an explicit light choice wins', () => {
    must(CSS, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.gcf/, "the dark media query is guarded so an explicit light choice wins");
  });

  test('an explicit dark choice wins in the other direction too', () => {
    must(CSS, /:root\[data-theme="dark"\] \.gcf/, "an explicit dark choice wins in the other direction too");
  });
});

describe('The renderer obeys the engine rules', () => {
  test('the overlay is read before the first request, not when its panel opens', () => {
    /* The fourth instance of this shape in this codebase. State loaded after
       the first fetch is state that vanishes on reload. */
    const init = JS.slice(JS.indexOf('async function init()'));
    const load = init.indexOf('loadWeights()');
    const firstCall = init.indexOf("call('/reference')");
    expect(load).toBeGreaterThan(-1);
    expect(load).toBeLessThan(firstCall);
  });

  test('reset removes the stored override rather than writing defaults back', () => {
    must(JS, /removeItem\(WEIGHT_KEY\)/, "reset removes the stored override rather than writing defaults back");
    must(JS, /Removes the override rather than writing the defaults back/, "reset removes the stored override rather than writing defaults back");
  });

  test('only a changed weight is sent', () => {
    must(JS, /v !== state\.defaults\[k\]/, "only a changed weight is sent");
  });

  test('documents are fetched as a blob, never opened as a plain link', () => {
    /* A plain link arrives unauthenticated, which reads to a user as a broken
       download rather than a rejected one. */
    must(JS, /URL\.createObjectURL/, "documents are fetched as a blob, never opened as a plain link");
    mustNot(JS, /window\.open\(/, "documents are fetched as a blob, never opened as a plain link");
    must(PIPE, /URL\.createObjectURL/, "the pipeline download is a blob too");
    mustNot(PIPE, /window\.open\(/, "the pipeline download is a blob too");
  });

  test('the adaptation co-benefit is never folded into the mitigation headline', () => {
    must(JS, /Adaptation co-benefit/, "the adaptation co-benefit is never folded into the mitigation headline");
    mustNot(JS, /headline\.annual_tCO2e\s*\+\s*adaptationCoBenefit/, "the adaptation co-benefit is never folded into the mitigation headline");
    mustNot(JS, /annual_tCO2e\s*-\s*.*embodied/i, "the adaptation co-benefit is never folded into the mitigation headline");
  });

  test('financed emissions are named as living elsewhere, not omitted', () => {
    must(JS, /Financed emissions', 'in the capital book'/, "financed emissions are named as living elsewhere, not omitted");
  });

  test('every figure entered carries an evidence tier control beside it', () => {
    must(JS, /const tierSelect =/, "every figure entered carries an evidence tier control beside it");
    must(JS, /kind: 'tiered'/, "every figure entered carries an evidence tier control beside it");
    const tiered = (JS.match(/kind: 'tiered'/g) || []).length;
    expect(tiered).toBeGreaterThanOrEqual(4);
  });

  test('the sample banner is shown whenever the shipped pipeline is showing, and only then', () => {
    must(JS, /gcfSampleBanner/, "the sample banner is shown whenever the shipped pipeline is showing");
    must(JS, /pipeline\.sampleNote/, "the sample banner is shown whenever the shipped pipeline is showing");
    /* It used to be switched on and never off, so an adopted book still read
       as the sample. The pill follows the server's answer both ways. */
    must(JS, /b\.hidden = !sample/, "the pill is switched off the moment a record replaces the sample");
    must(PIPE, /deps\.onSample\(r\.sample, r\.sampleNote\)/, "the portfolio load reports what is showing");
  });

  test('a write re-reads every open panel rather than leaving stale rows', () => {
    /* Stale rows after a write are what made an earlier agent look static. */
    must(JS, /function refreshAll\(\)/, "a write re-reads every open panel rather than leaving stale rows");
    must(JS, /refreshAll\(\);/, "a write re-reads every open panel rather than leaving stale rows");
  });
});

describe('The pipeline is a portfolio, a cycle and one project at a time', () => {
  test('the dashboard reads the portfolio route and the project view reads readiness; nothing is summed on the page', () => {
    must(PIPE, /deps\.call\('\/portfolio'\)/, "the dashboard reads the portfolio route");
    must(PIPE, /\/readiness`\)/, "the project view reads the readiness route");
    /* The engines own every figure. A `+` between two fields of the payload
       would be the renderer computing, which is the rule the desk set. */
    mustNot(PIPE, /r\.beneficiaries\.direct\s*\+|\.direct\s*\+\s*[a-z.]*indirect/, "direct and indirect beneficiaries are never summed");
    mustNot(PIPE, /lifetime_tCO2e\s*\+|adaptationCoBenefit[^;]*\+\s*[a-z.]*mitigation/, "the co-benefit is never added to the headline");
  });

  test('a projected date is marked as one wherever it is drawn', () => {
    must(PIPE, /u\.projected \? '<span class="gcf-pill gcf-pill-project">projected<\/span>'/, "the upcoming list marks projections");
    must(PIPE, /gcf-pill-project">projected<\/span> \$\{esc\(m\.milestone\)\}/, "the project timeline marks projections");
    must(CSS, /\.gcf-pill-project\s*\{[^}]*--gcf-project/, "the projected pill has its own colour, read from a token");
  });

  test('the ten-stage rail, the board and the project steps are on the page', () => {
    for (const id of ['gcfRail', 'gcfGate', 'gcfActions', 'gcfUpcoming', 'gcfPoolTable', 'gcfProject', 'gcfProjectSteps',
      'gcfProjectChecklist', 'gcfProjectNextChecklist', 'gcfProjectCriteria', 'gcfProjectTimeline', 'gcfProjectMove', 'gcfBoardCsv']) {
      must(HTML, `id="${id}"`, `the page carries ${id}`);
    }
    must(HTML, /id="gcfProject" hidden/, "the project view is hidden at rest");
  });

  test('every write control is hidden where the server would refuse it, and the sample says to adopt first', () => {
    must(PIPE, /const canWrite = \(\) => Boolean\(deps && deps\.canWrite\(\)\) && view\.source === 'recorded'/, "writes need a recorded project and a session that may write");
    must(PIPE, /adopt the shipped pipeline on the Intake tab to edit it/, "the sample says to adopt first");
    must(PIPE, /\[data-writes\]/, "write controls are marked in the markup");
    must(JS, /#gcfPanel-intake \[data-writes\]/, "the intake's controls are withheld from a read-only session");
    must(JS, /#gcfPanel-reporting \[data-writes\]/, "the reporting panel's controls are withheld from a read-only session");
  });

  test('a stage move goes through the stage route, dated, and a change through PATCH — never a whole-record overwrite', () => {
    must(PIPE, /\/stage`, \{ method: 'POST'/, "a move is a POST to the stage route");
    must(PIPE, /method: 'PATCH'/, "a change is a merge");
    mustNot(PIPE, /call\(`\/pipeline`, \{ method: 'POST'/, "the project view never re-posts the whole record");
  });

  test('the intake offers what the schema accepts, from the reference', () => {
    must(JS, /refInstruments\(\)\.map\(i => \[i\.id, i\.name\]\)/, "instruments come from the catalogue");
    must(JS, /refBarriers\(\)\.map\(b => \[b\.id, b\.label\]\)/, "barriers come from the vocabulary");
    must(JS, /refStages\(\)\.map\(\(\[k, v\]\) => \[k, v\.label\]\)/, "stages come from the cycle, labelled");
    must(JS, /reason\.length < 40/, "the forty-character minimum is enforced before the request");
    mustNot(JS, /instrument: 'concessional_credit_line'/, "the instrument is no longer hard-coded");
    mustNot(JS, /band: 'green' \}/, "the taxonomy band is no longer hard-coded");
  });

  test('the Concept Note select carries one change listener however often the panel reloads', () => {
    must(JS, /sel\.onchange = renderCn/, "one listener");
    mustNot(JS, /sel\.addEventListener\('change'/, "not one per reload");
  });

  test('the page is gated to the analyst level in the access matrix', () => {
    must(source('ui/js/auth.js'), /'gcf':\s*60/, "the GCF screen is in the access matrix");
  });
});

describe('Every sub-tab exists in both the markup and the router', () => {
  const PANELS = ['pipeline', 'emissions', 'decision', 'instruments', 'reporting', 'cn', 'intake'];

  test('each has a tab button, a panel and a loader', () => {
    for (const p of PANELS) {
      must(HTML, `data-panel="${p}"`, "each has a tab button, a panel and a loader");
      must(HTML, `id="gcfPanel-${p}"`, "each has a tab button, a panel and a loader");
      must(JS, new RegExp(`\\b${p}:\\s*load`), "each has a tab button, a panel and a loader");
    }
  });

  test('the router list matches the markup exactly', () => {
    const list = JS.match(/const PANELS = \[([^\]]+)\]/)[1]
      .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
    expect(list.sort()).toEqual([...PANELS].sort());
  });

  test('only the first panel is visible at rest', () => {
    const panels = HTML.match(/<section class="gcf-panel"[^>]*>/g);
    expect(panels).toHaveLength(PANELS.length);
    expect(panels.filter(p => !p.includes('hidden'))).toHaveLength(1);
  });
});

describe('The assessor validation panel (Phase 1 Stage 4)', () => {
  test('the project page carries the panel and its containers', () => {
    must(HTML, 'id="gcfValidationState"', "the validation panel has a state container");
    must(HTML, 'id="gcfValidationCriteria"', "the validation panel has a per-criterion container");
    must(HTML, 'id="gcfValidationHistory"', "the validation panel has a history container");
  });

  test('the sign-off form is a validate-gated control, not a write one', () => {
    /* Hidden where the server would refuse: the validate scope is the
       assessor's, and the screen must not draw a button the server rejects. */
    must(HTML, /id="gcfValidationForm"[^>]*data-validates/, "the sign-off form is gated by data-validates");
    must(PIPE, /\[data-validates\]/, "the module hides the validate controls where the caller cannot validate");
    must(PIPE, /canValidate/, "the module asks whether the caller may validate");
  });

  test('the rating is a word, never a number', () => {
    /* The rating is the assessor's judgement in words; a number here would be
       read as a GCF or a PCAF score, which is exactly the confusion the
       evidence tiers are kept apart to prevent. */
    must(PIPE, /RATING_LABEL/, "ratings render as words");
    mustNot(PIPE, /rating[^)]*\/\s*5/, "a rating is never rendered as a fraction");
  });

  test('the validation is fetched before the project renders, not after', () => {
    /* Part of the same Promise.all as the project and readiness reads, so the
       panel is populated on first paint rather than a beat later. */
    must(PIPE, /\/validation`\),/, "the validation is fetched alongside the project");
  });

  test('the assessment report is downloadable, and it is a read not a validate control', () => {
    /* The report is a read anyone may take (read scope), so its download sits
       outside the validate-gated form — a viewer can download it without being
       able to sign anything off. */
    must(HTML, 'id="gcfValidationDownload"', "the validation panel has a report-download row");
    mustNot(HTML, /id="gcfValidationDownload"[^>]*data-validates/, "the download row is not gated by data-validates");
    must(PIPE, /assessment-report\?format=/, "the module fetches the assessment report by format");
    must(PIPE, /data-report/, "the module wires the report-download buttons");
  });
});
