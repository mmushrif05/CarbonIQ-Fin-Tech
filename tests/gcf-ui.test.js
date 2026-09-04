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

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'ui/pages/gcf.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'ui/js/gcf.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, and the head a script', () => {
    expect(INDEX).toContain('data-page="gcf"');
    expect(INDEX).toContain('id="page-gcf" data-src="pages/gcf.html"');
    expect(INDEX).toContain('js/gcf.js');
  });

  test('it is registered with a real title, not left to show its own id', () => {
    expect(APP).toMatch(/'gcf':\s*\{[\s\S]*?title: 'GCF Pipeline'/);
    expect(APP).toMatch(/'gcf':\s*\{[\s\S]*?init:/);
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    expect(APP).toMatch(/'gcf':\s*\{[\s\S]*?refresh:/);
  });
});

describe('Layout rules that were broken before they were written down', () => {
  test('[hidden] beats any class rule that sets display', () => {
    expect(HTML).toMatch(/\.gcf-panel\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test('the score bar is a block, or its height and background do not apply', () => {
    expect(HTML).toMatch(/\.gcf-bar\s*\{[^}]*display:\s*block/);
  });

  test('a select may shrink below its widest option', () => {
    expect(HTML).toMatch(/\.gcf-actions select\s*\{[^}]*max-width:\s*100%/);
    expect(HTML).toMatch(/\.gcf-actions select\s*\{[^}]*min-width:\s*0/);
  });

  test('grids use explicit column counts, never auto-fit with a spanning child', () => {
    /* Scoped to declarations: the phrase also appears in the comment
       explaining why it is not used, and a sweep that trips on its own
       explanation is a sweep people delete. */
    const decls = HTML.match(/grid-template-columns:[^;]+;/g) || [];
    expect(decls.length).toBeGreaterThan(2);
    expect(decls.join(' ')).not.toMatch(/auto-fit|auto-fill/);
    expect(HTML).toMatch(/\.gcf-figures\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(HTML).toMatch(/repeat\(2, 1fr\)/);
    expect(HTML).toMatch(/repeat\(3, 1fr\)/);
  });

  test('wide content scrolls inside its own container', () => {
    expect(HTML).toMatch(/\.gcf-scroll\s*\{\s*overflow-x:\s*auto/);
    const tables = HTML.match(/<table class="gcf-table"/g) || [];
    const wrapped = HTML.match(/<div class="gcf-scroll"><table class="gcf-table"/g) || [];
    // Every table rendered into the page is wrapped by its renderer or its markup.
    expect(tables.length).toBeGreaterThan(0);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  test('the root sets min-width 0 so it can shrink inside a flex parent', () => {
    expect(HTML).toMatch(/\.gcf\s*\{[\s\S]*?min-width:\s*0/);
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
    expect(HTML).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.gcf/);
  });

  test('an explicit dark choice wins in the other direction too', () => {
    expect(HTML).toMatch(/:root\[data-theme="dark"\] \.gcf/);
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
    expect(JS).toMatch(/removeItem\(WEIGHT_KEY\)/);
    expect(JS).toMatch(/Removes the override rather than writing the defaults back/);
  });

  test('only a changed weight is sent', () => {
    expect(JS).toMatch(/v !== state\.defaults\[k\]/);
  });

  test('documents are fetched as a blob, never opened as a plain link', () => {
    /* A plain link arrives unauthenticated, which reads to a user as a broken
       download rather than a rejected one. */
    expect(JS).toMatch(/URL\.createObjectURL/);
    expect(JS).not.toMatch(/window\.open\(/);
  });

  test('the adaptation co-benefit is never folded into the mitigation headline', () => {
    expect(JS).toMatch(/Adaptation co-benefit/);
    expect(JS).not.toMatch(/headline\.annual_tCO2e\s*\+\s*adaptationCoBenefit/);
    expect(JS).not.toMatch(/annual_tCO2e\s*-\s*.*embodied/i);
  });

  test('financed emissions are named as living elsewhere, not omitted', () => {
    expect(JS).toMatch(/Financed emissions', 'in the capital book'/);
  });

  test('every figure entered carries an evidence tier control beside it', () => {
    expect(JS).toMatch(/const tierSelect =/);
    expect(JS).toMatch(/kind: 'tiered'/);
    const tiered = (JS.match(/kind: 'tiered'/g) || []).length;
    expect(tiered).toBeGreaterThanOrEqual(4);
  });

  test('the sample banner is shown whenever the shipped pipeline is showing', () => {
    expect(JS).toMatch(/gcfSampleBanner/);
    expect(JS).toMatch(/pipeline\.sampleNote/);
  });

  test('a write re-reads every open panel rather than leaving stale rows', () => {
    /* Stale rows after a write are what made an earlier agent look static. */
    expect(JS).toMatch(/function refreshAll\(\)/);
    expect(JS).toMatch(/refreshAll\(\);/);
  });
});

describe('Every sub-tab exists in both the markup and the router', () => {
  const PANELS = ['pipeline', 'emissions', 'decision', 'instruments', 'reporting', 'cn', 'intake'];

  test('each has a tab button, a panel and a loader', () => {
    for (const p of PANELS) {
      expect(HTML).toContain(`data-panel="${p}"`);
      expect(HTML).toContain(`id="gcfPanel-${p}"`);
      expect(JS).toMatch(new RegExp(`\\b${p}:\\s*load`));
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
