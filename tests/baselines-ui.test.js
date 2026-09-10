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

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'ui/pages/baselines.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'ui/js/baselines.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');

describe('The screen is registered where a screen has to be', () => {
  test('it has a nav entry, a container, a script and a title', () => {
    expect(shell).toMatch(/data-page="baselines"/);
    expect(shell).toMatch(/id="page-baselines"/);
    expect(shell).toMatch(/js\/baselines\.js/);
    /* A page missing from the title map shows its own id as its heading —
       which has happened here before. */
    expect(app).toMatch(/'baselines':\s*{\s*title: 'Baselines'/);
    expect(app).toMatch(/'baselines': \{[\s\S]*?src:\s*'pages\/baselines\.html'/);
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    expect(app).toMatch(/'baselines': \{[\s\S]*?refresh:/);
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
      const source = id === 'cap-baseline' ? shell : html;
      expect(source).toMatch(new RegExp(`id="${id}"[^>]*hidden`));
    }
    expect(html).not.toMatch(/\.bl-msg\s*{[^}]*display:/);
    expect(html).not.toMatch(/\.bl-empty\s*{[^}]*display:/);
  });

  test('every control and grid child may shrink below its content', () => {
    /* A grid or flex item is min-width:auto, so one long option sets the page
       width. `<select>` sizes to its widest option, not its container. */
    expect(html).toMatch(/\.bl-actions select, \.bl-actions input\s*{\s*min-width:\s*0/);
    expect(html).toMatch(/\.bl-form input, \.bl-form select\s*{[\s\S]*?min-width:\s*0/);
    expect(html).toMatch(/\.bl-card\s*{[\s\S]*?min-width:\s*0/);
  });

  test('the wide table scrolls inside its own container', () => {
    expect(html).toMatch(/\.bl-scroll\s*{[^}]*overflow-x:\s*auto/);
    expect(html).toMatch(/<div class="bl-scroll">\s*<table class="bl-table">/);
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
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.bl/);
    expect(html).toMatch(/:root\[data-theme="dark"\] \.bl/);
  });
});

describe('A figure never appears without what stands behind it', () => {
  test('a released baseline shows its version and an illustrative one says so', () => {
    expect(js).toMatch(/Illustrative dataset — not client records\./);
    expect(js).toMatch(/Released · version \$\{r\.version\}/);
  });

  test('the pledge is shown as stated by the entity, with its reference', () => {
    expect(js).toMatch(/Stated by \$\{esc\(pledged\.statedBy\)\}/);
    expect(js).toMatch(/Reference: \$\{esc\(pledged\.reference\)\}/);
  });

  test('the dashboard names the baseline its screened figures rest on', () => {
    const dash = fs.readFileSync(path.join(ROOT, 'ui/js/dashboard.js'), 'utf8');
    expect(dash).toMatch(/baselines\/effective\?metric=construction_intensity_kgCO2e_m2/);
    expect(dash).toMatch(/Intensity screen: \$\{r\.values\.green\} green/);
  });
});
