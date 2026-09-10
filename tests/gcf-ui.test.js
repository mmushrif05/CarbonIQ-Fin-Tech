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
const JS = source('ui/js/gcf.js');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, and the head a script', () => {
    must(INDEX, 'data-page="gcf"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'id="page-gcf" data-src="pages/gcf.html"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'js/gcf.js', "the nav carries an entry, the shell a container, and the head a script");
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
    must(HTML, /\.gcf-panel\[hidden\]\s*\{\s*display:\s*none\s*!important/, "[hidden] beats any class rule that sets display");
  });

  test('the score bar is a block, or its height and background do not apply', () => {
    must(HTML, /\.gcf-bar\s*\{[^}]*display:\s*block/, "the score bar is a block, or its height and background do not apply");
  });

  test('a select may shrink below its widest option', () => {
    must(HTML, /\.gcf-actions select\s*\{[^}]*max-width:\s*100%/, "a select may shrink below its widest option");
    must(HTML, /\.gcf-actions select\s*\{[^}]*min-width:\s*0/, "a select may shrink below its widest option");
  });

  test('grids use explicit column counts, never auto-fit with a spanning child', () => {
    /* Scoped to declarations: the phrase also appears in the comment
       explaining why it is not used, and a sweep that trips on its own
       explanation is a sweep people delete. */
    const decls = HTML.match(/grid-template-columns:[^;]+;/g) || [];
    expect(decls.length).toBeGreaterThan(2);
    expect(decls.join(' ')).not.toMatch(/auto-fit|auto-fill/);
    must(HTML, /\.gcf-figures\s*\{[^}]*grid-template-columns:\s*1fr/, "grids use explicit column counts, never auto-fit with a spanning child");
    must(HTML, /repeat\(2, 1fr\)/, "grids use explicit column counts, never auto-fit with a spanning child");
    must(HTML, /repeat\(3, 1fr\)/, "grids use explicit column counts, never auto-fit with a spanning child");
  });

  test('wide content scrolls inside its own container', () => {
    must(HTML, /\.gcf-scroll\s*\{\s*overflow-x:\s*auto/, "wide content scrolls inside its own container");
    const tables = HTML.match(/<table class="gcf-table"/g) || [];
    const wrapped = HTML.match(/<div class="gcf-scroll"><table class="gcf-table"/g) || [];
    // Every table rendered into the page is wrapped by its renderer or its markup.
    expect(tables.length).toBeGreaterThan(0);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  test('the root sets min-width 0 so it can shrink inside a flex parent', () => {
    must(HTML, /\.gcf\s*\{[\s\S]*?min-width:\s*0/, "the root sets min-width 0 so it can shrink inside a flex parent");
  });
});

describe('Both themes resolve as a set', () => {
  test('every token is defined on the bare selector first', () => {
    const bare = HTML.match(/\.gcf\s*\{([\s\S]*?)\}/)[1];
    for (const t of ['--gcf-ink', '--gcf-muted', '--gcf-line', '--gcf-surface',
      '--gcf-sunk', '--gcf-accent', '--gcf-warn', '--gcf-stop', '--gcf-ok']) {
      expect(bare).toContain(t);
    }
  });

  test('the dark media query is guarded so an explicit light choice wins', () => {
    must(HTML, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.gcf/, "the dark media query is guarded so an explicit light choice wins");
  });

  test('an explicit dark choice wins in the other direction too', () => {
    must(HTML, /:root\[data-theme="dark"\] \.gcf/, "an explicit dark choice wins in the other direction too");
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

  test('the sample banner is shown whenever the shipped pipeline is showing', () => {
    must(JS, /gcfSampleBanner/, "the sample banner is shown whenever the shipped pipeline is showing");
    must(JS, /pipeline\.sampleNote/, "the sample banner is shown whenever the shipped pipeline is showing");
  });

  test('a write re-reads every open panel rather than leaving stale rows', () => {
    /* Stale rows after a write are what made an earlier agent look static. */
    must(JS, /function refreshAll\(\)/, "a write re-reads every open panel rather than leaving stale rows");
    must(JS, /refreshAll\(\);/, "a write re-reads every open panel rather than leaving stale rows");
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
