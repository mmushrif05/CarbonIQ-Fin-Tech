'use strict';
/**
 * The chart module — geometry to one mark spec, and nothing of its own.
 *
 * Every drawing another screen places comes from here, so the rules a bar
 * has to keep are held once: it is thin, square at the baseline and rounded
 * at its data end; touching fills are parted by a gap in the surface colour
 * and never a stroke; the value sits at the tip; text wears the text tokens
 * and never the series colour; every mark answers hover and focus with a
 * readout built as text; every figure has a table twin behind a toggle. And
 * the module fetches nothing and sums nothing — a chart that computed its
 * own total would be a second engine.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'ui/js/charts.js'), 'utf8');
const CH = source('ui/js/charts.js');
const CARDS = source('ui/css/cards.css');
const Charts = vm.runInNewContext(`${SRC}\n;Charts`, {}, { timeout: 5000 });

const rows = [
  { key: 'a', label: 'Business loans', value: 8824, color: '#2c6b1c', segments: [{ label: 'Scope 1', value: 6000, color: '#2c6b1c' }, { label: 'Scope 2', value: 2824, color: '#8fb886' }] },
  { key: 'b', label: 'Mortgages', value: 13, color: '#953543' },
  { key: 'c', label: 'Not held', value: null, color: '#847200' },
];

describe('the module is geometry', () => {
  test('it fetches nothing, sums nothing and decides nothing', () => {
    mustNot(CH, /fetch\(|CARBONIQ_fetch|XMLHttpRequest/, 'a chart module that fetched would be a second reader of the book');
    mustNot(CH, /\.reduce\(/, 'a chart that summed would be a second engine');
    mustNot(CH, /innerHTML\s*[+=]/, 'the readout is built as text, never as markup');
    expect((CH.match(/<svg /g) || []).length).toBe((CH.match(/<svg [^>]*role="img"/g) || []).length);
  });

  test('a bar is square at the baseline and rounded at its data end, and never taller than the spec', () => {
    const svg = Charts.hbars([{ key: 'a', label: 'A', value: 100, color: '#2c6b1c' }], { label: 'Test' });
    expect(svg).toMatch(/<path d="M190\.0,[\d.]+h[\d.]+a4,4 0 0 1 4,4v[\d.]+a4,4 0 0 1 -4,4h-[\d.]+z"/);
    must(CH, /const BH = compact \? 10 : 14;/, 'a bar is at most 14px thick');
    must(CH, /<line class="ch-axis"/, 'the baseline is a hairline');
  });

  test('touching fills are parted by a gap in the surface colour, never a stroke', () => {
    const svg = Charts.hbars(rows, { label: 'Test' });
    expect(svg).toMatch(/<rect class="ch-gap" x="[\d.]+" y="[\d.]+" width="2"/);
    expect(svg).not.toMatch(/stroke="#|stroke:#/);
    must(CARDS, /\.ch-gap \{ fill: var\(--ch-surface, var\(--card-surface\)\); \}/, 'the gap is the surface colour');
  });

  test('the value sits at the tip, and an absent value is a dash and never nought', () => {
    const svg = Charts.hbars(rows, { label: 'Test', decimals: 0 });
    expect(svg).toContain('>8,824</text>');
    expect(svg).toContain('>—</text>');
    expect(svg).not.toContain('>0</text>');
  });

  test('text wears the text tokens, never the series colour', () => {
    const svg = Charts.hbars(rows, { label: 'Test' });
    for (const m of svg.matchAll(/<text[^>]*>/g)) expect(m[0]).not.toMatch(/fill|style=/);
    must(CARDS, /\.ch-label \{ font-size: 12px; fill: var\(--card-ink-2\); \}/, 'labels take the secondary ink');
  });
});

describe('every mark answers hover and focus, and every figure has a table twin', () => {
  test('each row is focusable and carries its readout as data', () => {
    const svg = Charts.hbars(rows, { label: 'Test', unit: 'tCO2e' });
    const g = svg.match(/<g class="ch-row"[^>]*>/g) || [];
    expect(g).toHaveLength(3);
    for (const open of g) {
      expect(open).toContain('tabindex="0"');
      expect(open).toMatch(/data-tip="\{/);
    }
    const tip = JSON.parse(svg.match(/data-tip="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    expect(tip.t).toBe('Business loans');
    expect(tip.r).toEqual([['Value', '8,824 tCO2e'], ['Scope 1', '6,000 tCO2e'], ['Scope 2', '2,824 tCO2e']]);
    expect(Charts.ring(41.2, { label: 'Coverage' })).toContain('data-tip=');
    expect(Charts.shares([{ key: 'a', label: 'A', segments: [{ label: 'Score 2', share: 0.6, color: '#0d9488' }] }])).toContain('data-tip=');
  });

  test('the readout is mounted once, built with textContent, and answers focus as it answers hover', () => {
    must(CH, /tipEl\.setAttribute\('role', 'tooltip'\)/, 'the readout is a tooltip');
    must(CH, /t\.textContent = data\.t;/, 'the title is text');
    must(CH, /val\.textContent = v;/, 'the value is text');
    must(CH, /document\.addEventListener\('focusin'/, 'focus shows the same readout');
    must(CH, /document\.addEventListener\('pointerover'/, 'hover shows it');
    must(CH, /ev\.key === 'Escape'/, 'Escape dismisses it');
    must(CH, /if \(mounted \|\| typeof document === 'undefined' \|\| !document\.body\) return;/, 'mounted once');
  });

  test('a figure carries the chart, the legend, the table twin behind a toggle, and the toggle is wired once', () => {
    const fig = Charts.figure(Charts.hbars(rows, { label: 'Test' }), rows, { title: 'tCO₂e', legend: [{ label: 'Scope 1', color: '#000' }] });
    expect(fig).toMatch(/<figure class="ch-fig" data-view="chart">/);
    expect(fig).toMatch(/<button type="button" class="ch-view-btn is-on" data-view="chart" aria-pressed="true"/);
    expect(fig).toMatch(/<button type="button" class="ch-view-btn" data-view="table" aria-pressed="false"/);
    expect(fig).toMatch(/<div class="ch-fig-table" id="chf-[a-z0-9]+-table" hidden>/);
    expect(fig).toContain('<table class="ch-table">');
    expect(fig).toContain('<th scope="row">Business loans</th><td class="num">8,824</td>');
    expect(fig).toContain('<tr class="ch-table-seg"><th scope="row">Scope 1</th><td class="num">6,000</td></tr>');
    expect(fig).toContain('<div class="ch-legend" role="list">');
    must(CH, /btn\.closest\('\.ch-fig'\)/, 'the toggle is delegated');
    must(CARDS, /\.ch-fig \[hidden\] \{ display: none !important; \}/, 'hidden beats any display the figure sets');
  });

  test('the table twin prints a share as a percentage', () => {
    const t = Charts.table([{ key: 'a', label: 'A', segments: [{ label: 'Score 2', share: 0.6 }] }]);
    expect(t).toContain('<th scope="col" class="num">Share</th>');
    expect(t).toContain('<td class="num">60.0%</td>');
  });

  test('the scale is a category, never a fraction of five', () => {
    must(CH, /1 · highest quality/, 'the scale names its ends');
    mustNot(CH, /\/\s*5\b/, 'never "2 / 5"');
  });
});
