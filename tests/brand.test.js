/**
 * The Datum Solutions mark.
 *
 * The requirement is "on every page", and the way to fail it is to paste the
 * lockup into each page fragment: twenty copies drift, and the one that drifts
 * is the page nobody opened this month. So the mark lives in the shell — the
 * sidebar and a footer that sits after every page container — and is rendered
 * from one module.
 *
 * This suite is a sweep rather than a walk. It asserts the single source, the
 * shell placements, and that no page fragment has started keeping its own copy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const INDEX = read('ui/index.html');
const BRAND_JS = read('ui/js/brand.js');
const BRAND_CSS = read('ui/css/brand.css');

describe('One source', () => {
  test('the name, the legal name and the mark are defined once, in brand.js', () => {
    expect(BRAND_JS).toMatch(/name: 'Datum Solutions'/);
    expect(BRAND_JS).toMatch(/legalName: 'Datum Solutions \(Private\) Limited'/);
    expect(BRAND_JS).toMatch(/mark: \(\) =>/);
  });

  test('no page fragment or page module keeps a copy of its own', () => {
    /* Twenty pasted copies drift, and the one that drifts is the page nobody
       opened this month. A grep, not a walk of one code path. */
    const offenders = [];
    for (const dir of ['ui/pages', 'ui/js']) {
      for (const file of fs.readdirSync(path.join(ROOT, dir))) {
        if (file === 'brand.js') continue;
        const body = read(path.join(dir, file));
        if (/Datum\s+Solutions/.test(body)) offenders.push(`${dir}/${file}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the shell carries placeholders, never the words themselves', () => {
    expect(INDEX).toContain('data-brand="sidebar"');
    expect(INDEX).toContain('data-brand="footer"');
    expect(INDEX).toContain('data-brand="login"');
    expect(INDEX).not.toMatch(/Datum\s+Solutions/);
  });

  test('swapping in a supplied logo file is a one-line change, and it says so', () => {
    expect(BRAND_JS).toMatch(/Replacing this with the supplied logo file/);
    expect(BRAND_JS).toMatch(/assets\/datum-logo\.svg/);
    expect(BRAND_CSS).toMatch(/\.brand-logo-img/);
  });
});

describe('It is on every page, structurally', () => {
  test('the footer sits in the shell after every page container', () => {
    /* Placed after the last `.page` div and inside the page-content container,
       so it renders under whichever page is showing. A footer inside a page
       fragment would be on that page only. */
    const lastPage = INDEX.lastIndexOf('<div class="page" id="page-');
    const footer = INDEX.indexOf('<footer class="page-footer">');
    const closes = INDEX.indexOf('</main>');
    expect(lastPage).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(lastPage);
    expect(footer).toBeLessThan(closes);
  });

  test('the sidebar lockup sits in the sidebar, which every page shares', () => {
    const sidebarStart = INDEX.indexOf('<aside class="sidebar"');
    const lockup = INDEX.indexOf('data-brand="sidebar"');
    const sidebarEnd = INDEX.indexOf('</aside>', sidebarStart);
    expect(lockup).toBeGreaterThan(sidebarStart);
    expect(lockup).toBeLessThan(sidebarEnd);
  });

  test('the stylesheet and the module are both loaded by the shell', () => {
    expect(INDEX).toContain('css/brand.css');
    expect(INDEX).toContain('js/brand.js');
    /* Rendered on DOMContentLoaded, so the shell's own placeholders fill
       without waiting on a navigation. */
    expect(BRAND_JS).toMatch(/DOMContentLoaded[\s\S]{0,60}Brand\.render\(\)/);
  });
});

describe('It renders correctly wherever it lands', () => {
  test('one asset serves both themes, because the mark inherits currentColor', () => {
    /* A second colour variant is a second thing to keep in step, and the
       sidebar is dark while the page is light. */
    expect(BRAND_JS).toMatch(/stroke="currentColor"/);
    expect(BRAND_JS).toMatch(/fill="currentColor"/);
    expect(BRAND_JS).not.toMatch(/stroke="#|fill="#/);
  });

  test('the mark is a block, or it sits on the text baseline and looks misaligned', () => {
    expect(BRAND_CSS).toMatch(/\.brand-logo-svg,[\s\S]{0,40}\.brand-logo-img\s*\{[\s\S]*?display:\s*block/);
  });

  test('the name carries a real space, so it copies and is announced correctly', () => {
    /* A flex gap looks identical and copies as "DatumSolutions" — which is
       what a screen reader announces and what lands in a pasted citation. */
    expect(BRAND_JS).toContain('</b> `');
    expect(BRAND_CSS).not.toMatch(/\.brand-word\s*\{[^}]*gap:/);
  });

  test('the mark is decorative and is hidden from assistive technology', () => {
    /* The name is right beside it in text, so announcing the mark as well
       would read the company twice. */
    expect(BRAND_JS).toMatch(/aria-hidden="true"/);
    expect(BRAND_JS).toMatch(/focusable="false"/);
  });

  test('rendering twice does not rebuild what is already there', () => {
    expect(BRAND_JS).toMatch(/brandRendered === 'true'/);
  });
});
