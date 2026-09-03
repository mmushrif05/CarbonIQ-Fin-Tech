/**
 * The dashboard's layout, as opposed to its arithmetic.
 *
 * Reported from a screenshot: "The top portion is empty and white. The graphs
 * and graphics are coming at the bottom." Measured, both halves were true — the
 * first chart sat 1,604px down a 1034px-wide screen, and the position band was
 * 1,009px of prose tiles that did not fill their own rows.
 *
 * Two causes, and the second is the one worth remembering.
 *
 * **A column count that does not divide the tiles leaves white.** `auto-fit`
 * with `minmax()` picks whatever count fits, and a `span 2` tile that cannot
 * fit the last column wraps — stranding an entire empty column. Five tiles
 * into three columns, four into three, three into two: every one of those left
 * a hole. The counts are now declared per breakpoint so they always tile.
 *
 * **A flex item will not shrink below its content.** `main` sat beside a 240px
 * sidebar with the default `min-width: auto`, so the header controls held it at
 * 872px inside 794px of space and the page scrolled sideways — which is why the
 * right-hand column of every band was cut off in the screenshot.
 *
 * These are swept from the stylesheet rather than measured in a browser,
 * because the failure is a rule that is absent, and an absent rule is exactly
 * what a feature test walking a happy path does not notice.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const css = read('ui', 'styles.css');
const html = read('ui', 'index.html');

/** The dashboard's sections, in the order the markup puts them. */
const order = [...html.matchAll(/<section class="cap-section" id="(cap-[a-z]+)"/g)].map(m => m[1]);

describe('A graphic is on the first screen, not below two folds', () => {
  test('the capital band — which carries the allocation bar — comes first', () => {
    expect(order[0]).toBe('cap-capital');
  });

  test('the position band follows it, and the curve follows that', () => {
    expect(order.slice(0, 3)).toEqual(['cap-capital', 'cap-anchor', 'cap-curve']);
  });

  test('the curve is above the emissions bars, not below them', () => {
    expect(order.indexOf('cap-curve')).toBeLessThan(order.indexOf('cap-emissions'));
  });

  test('every section is still present — reordering is not deleting', () => {
    for (const id of ['cap-capital', 'cap-anchor', 'cap-curve', 'cap-emissions',
      'cap-portfolios', 'cap-pipeline']) {
      expect(order).toContain(id);
    }
  });
});

describe('A column count that does not divide the tiles is a count that leaves white', () => {
  /* Each of these grids holds a known number of tiles. The counts declared for
     it must divide them, or a row ends short and the screen shows a hole. */
  const grids = [
    { name: '.anch-grid', selector: /\.anch-grid \{[\s\S]*?\}/, tiles: 5, note: 'lead spans 2, so six cells' },
    { name: '.cap-kpis', selector: /\.cap-kpis \{[\s\S]*?\}/, tiles: 4 },
    { name: '.asm-grid', selector: /\.asm-grid \{[\s\S]*?\}/, tiles: 3 },
  ];

  test.each(grids)('$name does not use auto-fit, which picks a count it cannot know', ({ selector }) => {
    const block = css.match(selector)[0];
    expect(block).not.toMatch(/auto-fit|auto-fill/);
  });

  test('the position band declares 1, 2 and 3 columns — five tiles, six cells', () => {
    expect(css).toMatch(/\.anch-grid \{[\s\S]*?grid-template-columns: 1fr;/);
    expect(css).toMatch(/min-width: 620px\)[\s\S]{0,120}\.anch-grid \{ grid-template-columns: repeat\(2, 1fr\)/);
    expect(css).toMatch(/min-width: 1000px\)[\s\S]{0,120}\.anch-grid \{ grid-template-columns: repeat\(3, 1fr\)/);
  });

  test('only the lead tile spans — a second spanning tile brings the fragmentation back', () => {
    const spans = [...css.matchAll(/\.anch-(\w+)[^{]*\{[^}]*grid-column: span/g)].map(m => m[1]);
    expect(new Set(spans)).toEqual(new Set(['lead']));
  });

  test('the capital tiles use two or four columns and never three', () => {
    expect(css).toMatch(/\.cap-kpis \{ grid-template-columns: repeat\(2, 1fr\)/);
    expect(css).toMatch(/\.cap-kpis \{ grid-template-columns: repeat\(4, 1fr\)/);
    expect(css).not.toMatch(/\.cap-kpis \{ grid-template-columns: repeat\(3, 1fr\)/);
  });

  test('the assumptions use one column or three and never two', () => {
    expect(css).toMatch(/\.asm-grid \{ grid-template-columns: repeat\(3, 1fr\)/);
    expect(css).not.toMatch(/\.asm-grid \{ grid-template-columns: repeat\(2, 1fr\)/);
  });

  test('the reason is recorded, so the next auto-fit is a deliberate choice', () => {
    expect(css).toMatch(/a column count that does not divide the items is\s*\n?\s*a column count that leaves white/i);
  });
});

describe('Nothing is allowed to widen the page', () => {
  test('main can shrink — a flex item that cannot is a flex item that overflows', () => {
    const block = css.match(/\.main \{[\s\S]*?\}/)[0];
    expect(block).toMatch(/min-width: 0/);
  });

  test('the reason is recorded with the measurement that found it', () => {
    expect(css).toMatch(/872px inside 794px/);
  });

  test('the header rows shrink and wrap rather than pushing the layout out', () => {
    for (const rule of ['.topbar', '.topbar-right', '.cap-head', '.cap-head-actions', '.search-box']) {
      const re = new RegExp(`\\${rule} \\{[^}]*min-width: 0`);
      expect(css).toMatch(re);
    }
  });
});

describe('The position band reads as a dashboard, and loses no provenance', () => {
  test('the tile note is clamped rather than deleted', () => {
    expect(css).toMatch(/\.anch-note \{[\s\S]*?-webkit-line-clamp: 2/);
  });

  test('every note is still on the page in full, one click away', () => {
    expect(html).toContain('id="anch-defs-body"');
    expect(html).toMatch(/What each of these figures means, in full/);
  });

  test('the full notes are built from the same payload the tiles render', () => {
    const dashJs = read('ui', 'js', 'dashboard.js');
    const defs = dashJs.slice(dashJs.indexOf("$('anch-defs-body')"), dashJs.indexOf("$('anch-kinds')"));
    for (const src of ['a.totalOverLife.note', 'a.current.note', 'a.pending.note',
      'a.pledged.note', 'a.pipelineWouldAdd.note']) {
      expect(defs).toContain(src);
    }
  });

  test('the trade is stated — a figure without its provenance is not shown', () => {
    expect(read('ui', 'js', 'dashboard.js'))
      .toMatch(/a figure without its provenance is not a figure this/);
  });
});
