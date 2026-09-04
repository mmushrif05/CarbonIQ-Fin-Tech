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
    expect(BRAND_JS).toMatch(/lockup: \(variant\) =>/);
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

  test('the artwork is the supplied lockup, not a redrawing of it', () => {
    expect(BRAND_JS).toMatch(/datum-lockup\.png/);
    expect(BRAND_JS).toMatch(/datum-lockup-white\.png/);
    /* No hand-drawn substitute survives beside it — one mark, one file. */
    expect(BRAND_JS).not.toMatch(/<svg/);
  });

  test('every referenced asset is actually in the publish directory', () => {
    /* A missing brand file is a broken image on every page, and it is the one
       thing nobody checks after a rename. */
    for (const file of [...BRAND_JS.matchAll(/\$\{LOGO\.base\}([a-z0-9.-]+)/g)].map(m => m[1])) {
      expect(fs.existsSync(path.join(ROOT, 'ui/brand', file))).toBe(true);
    }
    for (const href of [...INDEX.matchAll(/href="(brand\/[a-z0-9.-]+)"/g)].map(m => m[1])) {
      expect(fs.existsSync(path.join(ROOT, 'ui', href))).toBe(true);
    }
  });

  test('the brand sheet ships beside the assets it governs', () => {
    expect(fs.existsSync(path.join(ROOT, 'ui/brand/BRAND.md'))).toBe(true);
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
  test('the knocked-out variant is used on the dark sidebar, per the brand sheet', () => {
    /* The sheet forbids the colour lockup on a dark ground. The sidebar is
       dark in every theme, so it takes the white file outright rather than
       switching with the page. */
    expect(BRAND_JS).toMatch(/if \(variant === 'onDark'\) return dark;/);
    expect(BRAND_CSS).toMatch(/\.brand-lockup-sidebar \.is-on-dark,/);
  });

  test('both theme states swap the footer and login lockups', () => {
    /* The default setting stamps nothing on the root, so prefers-color-scheme
       is the only signal there; an explicit choice must win in both
       directions. */
    expect(BRAND_CSS).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\)/);
    expect(BRAND_CSS).toMatch(/:root\[data-theme="dark"\] \.brand-lockup-footer \.is-on-light/);
  });

  test('the sign-in screen takes the knocked-out variant too', () => {
    /* It has its own dark styling and is dark in every theme. A first pass
       drew the colour lockup there: navy on near-black. */
    expect(BRAND_JS).toMatch(/login: \(\) => `[\s\S]{0,200}LOGO\.lockup\('onDark'\)/);
    expect(BRAND_CSS).toMatch(/\.brand-lockup-login\s+\.is-on-dark \{ display: block; \}/);
  });

  test('height is set and width follows, so the lockup is never stretched', () => {
    /* 2.70 : 1. Stretching it is the one thing the brand sheet forbids
       outright, and `width: auto` beside a set height is what prevents it. */
    expect(BRAND_CSS).toMatch(/\.brand-lockup-img\s*\{[\s\S]*?height:\s*30px/);
    expect(BRAND_CSS).toMatch(/\.brand-lockup-img\s*\{[\s\S]*?width:\s*auto/);
    expect(BRAND_CSS).not.toMatch(/\.brand-lockup-img[^}]*width:\s*\d+px/);
  });

  test('no placement falls below the sheet\'s 28px floor', () => {
    /* The brand sheet sets 28px as the smallest the lockup may be drawn;
       below that it says use the mark alone. A first pass shipped it at 24px
       in the sidebar and the footer, where the two-line wordmark inside the
       artwork stopped being legible. */
    const heights = [...BRAND_CSS.matchAll(/height:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(28);
  });

  test('it is a block, or it sits on the text baseline and looks misaligned', () => {
    expect(BRAND_CSS).toMatch(/\.brand-lockup-img\s*\{[\s\S]*?display:\s*block/);
  });

  test('the name is announced once, as the image alt text', () => {
    /* The lockup already reads DATUM SOLUTIONS, so a text wordmark beside it
       would say the name twice — once drawn, once spoken. */
    expect(BRAND_JS).toMatch(/alt="\$\{LOGO\.name\}"/);
    expect(BRAND_JS).not.toMatch(/brand-word/);
  });

  test('rendering twice does not rebuild what is already there', () => {
    expect(BRAND_JS).toMatch(/brandRendered === 'true'/);
  });
});

describe('The browser tab carries it too', () => {
  test('the supplied favicon set is linked', () => {
    expect(INDEX).toMatch(/rel="icon" href="brand\/favicon\.ico" sizes="any"/);
    expect(INDEX).toMatch(/sizes="32x32" href="brand\/datum-mark-32\.png"/);
    expect(INDEX).toMatch(/rel="apple-touch-icon" href="brand\/apple-touch-icon-180\.png"/);
  });
});
