/**
 * The Baselines screen.
 *
 * Swept for the four mechanical faults this codebase has already shipped once
 * each — an inline bar that renders as nothing, a `<select>` that sets the
 * page width, a class rule beating `[hidden]`, and state read after the first
 * fetch instead of before it — plus the two rules this screen adds: a
 * provisional figure is never dressed as a released one, and no value appears
 * without the provenance behind it.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const html = source('ui/pages/baselines.html');
const js = source('ui/js/baselines.js');
const shell = source('ui/index.html');
const app = source('ui/app.js');

describe('The screen is registered where a screen has to be', () => {
  test('it has a nav entry, a container, a script and a title', () => {
    must(shell, /data-page="baselines"/, "it has a nav entry, a container, a script and a title");
    must(shell, /id="page-baselines"/, "it has a nav entry, a container, a script and a title");
    must(shell, /js\/baselines\.js/, "it has a nav entry, a container, a script and a title");
    /* A page missing from the title map shows its own id as its heading —
       which has happened here before. */
    must(app, /'baselines':\s*{\s*title: 'Baselines'/, "it has a nav entry, a container, a script and a title");
    must(app, /'baselines': \{[\s\S]*?src:\s*'pages\/baselines\.html'/, "it has a nav entry, a container, a script and a title");
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    must(app, /'baselines': \{[\s\S]*?refresh:/, "a return visit re-reads rather than showing what it said last time");
  });
});

describe('The four mechanical faults', () => {
  test('every bar is display: block', () => {
    /* An inline element takes no height, so a bar drawn on a span renders as
       nothing — which reads as zero rather than as a missing element. */
    const fill = html.match(/\.bl-fill\s*{[^}]*}/);
    expect(fill).not.toBeNull();
    expect(fill[0]).toMatch(/display:\s*block/);
  });

  test('no class rule sets display on a [hidden] element', () => {
    /* `[hidden]` is display:none from the user-agent sheet, and any class rule
       setting display beats it. */
    for (const id of ['bl-empty', 'bl-msg', 'cap-baseline']) {
      const file = id === 'cap-baseline' ? shell : html;
      must(file, new RegExp(`id="${id}"[^>]*hidden`),
        `${id} is hidden in the markup, not by a class rule a stylesheet can beat`);
    }
    mustNot(html, /\.bl-msg\s*{[^}]*display:/, "no class rule sets display on a [hidden] element");
    mustNot(html, /\.bl-empty\s*{[^}]*display:/, "no class rule sets display on a [hidden] element");
  });

  test('every control and grid child may shrink below its content', () => {
    /* A grid or flex item is min-width:auto, so one long option sets the page
       width. `<select>` sizes to its widest option, not its container. */
    must(html, /\.bl-actions select, \.bl-actions input\s*{\s*min-width:\s*0/, "every control and grid child may shrink below its content");
    must(html, /\.bl-form input, \.bl-form select\s*{[\s\S]*?min-width:\s*0/, "every control and grid child may shrink below its content");
    must(html, /\.bl-card\s*{[\s\S]*?min-width:\s*0/, "every control and grid child may shrink below its content");
  });

  test('the wide table scrolls inside its own container', () => {
    must(html, /\.bl-scroll\s*{[^}]*overflow-x:\s*auto/, "the wide table scrolls inside its own container");
    must(html, /<div class="bl-scroll">\s*<table class="bl-table">/, "the wide table scrolls inside its own container");
  });

  test('a grid that must collapse uses the shrinkable auto-fit form', () => {
    const fits = html.match(/repeat\(auto-fit,\s*minmax\([^)]*\)/g) || [];
    expect(fits.length).toBeGreaterThan(0);
    for (const f of fits) expect(f).toMatch(/minmax\(min\(100%,/);
  });

  test('what changes the first request is wired before it is sent', () => {
    const init = js.slice(js.indexOf('function init()'));
    const country = init.indexOf("$('bl-country')");
    const load = init.indexOf('return load()');
    expect(country).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(country);
  });
});

describe('The theme resolves as a set in all three states', () => {
  test('the bare palette is complete and both stamped states redefine it', () => {
    const bare = html.match(/\.bl\s*{[^}]*}/);
    expect(bare[0]).toMatch(/--bl-ink:/);
    expect(bare[0]).toMatch(/--bl-surface:/);
    must(html, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.bl/, "the bare palette is complete and both stamped states redefine it");
    must(html, /:root\[data-theme="dark"\] \.bl/, "the bare palette is complete and both stamped states redefine it");
  });
});

describe('A figure never appears without what stands behind it', () => {
  test('a released baseline shows its version and an illustrative one says so', () => {
    must(js, /Illustrative dataset — not client records\./, "a released baseline shows its version and an illustrative one says so");
    must(js, /Released · version \$\{r\.version\}/, "a released baseline shows its version and an illustrative one says so");
  });

  test('the pledge is shown as stated by the entity, with its reference', () => {
    must(js, /Stated by \$\{esc\(pledged\.statedBy\)\}/, "the pledge is shown as stated by the entity, with its reference");
    must(js, /Reference: \$\{esc\(pledged\.reference\)\}/, "the pledge is shown as stated by the entity, with its reference");
  });

  test('the dashboard names the baseline its screened figures rest on', () => {
    const dash = source('ui/js/dashboard.js');
    must(dash, /baselines\/effective\?metric=construction_intensity_kgCO2e_m2/,
      'the dashboard resolves the band from the baseline registry rather than a literal');
    must(dash, /Intensity screen: \$\{r\.values\.green\} green/,
      'the screened figure prints the band it was screened against');
  });
});
