/**
 * The Fund Desk screen — the rules the source has to carry.
 *
 * This sweeps the source rather than trusting the paths a feature test happens
 * to walk. Every rule below is a way to draw a confident screen that is wrong,
 * and the first four have each already cost this codebase a defect that reached
 * a browser with its unit test passing:
 *
 *   `[hidden]` is display:none from the user-agent sheet and ANY class rule
 *   that sets display beats it — that has covered a page from load once.
 *
 *   A bar drawn on an inline element renders as nothing at all, which reads as
 *   a value of zero rather than as a missing element.
 *
 *   A <select> sizes to its widest option, not to its container, so one long
 *   name pushed a page 78px wide at 430px.
 *
 *   Anything that changes what the first request says must be wired BEFORE
 *   that request is sent.
 *
 * The rest guard the claims this screen exists to keep apart.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML  = fs.readFileSync(path.join(ROOT, 'ui/pages/desk.html'), 'utf8');
const JS    = fs.readFileSync(path.join(ROOT, 'ui/js/desk.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const APP   = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, and the head a script', () => {
    expect(INDEX).toContain('data-page="desk"');
    expect(INDEX).toContain('id="page-desk" data-src="pages/desk.html"');
    expect(INDEX).toContain('js/desk.js');
  });

  test('it is registered with a real title, not left to show its own id', () => {
    expect(APP).toMatch(/'desk':\s*\{[\s\S]*?title: 'Fund Desk'/);
    expect(APP).toMatch(/'desk':\s*\{[\s\S]*?init:/);
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    expect(APP).toMatch(/'desk':\s*\{[\s\S]*?refresh:/);
    expect(JS).toMatch(/function refresh\(\)\s*\{\s*return load\(\);/);
  });

  test('the GCF Pipeline tab is untouched and still registered beside it', () => {
    /* The research screen stays exactly as it was. This one is a second view
       over the same records, not a replacement for it. */
    expect(INDEX).toContain('data-page="gcf"');
    expect(APP).toMatch(/'gcf':\s*\{[\s\S]*?title: 'GCF Pipeline'/);
  });
});

describe('The four mechanical rules', () => {
  test('[hidden] is stated explicitly, so no class rule can beat it', () => {
    expect(HTML).toMatch(/\.dk \[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test('every bar is a block, or it renders as nothing', () => {
    expect(HTML).toMatch(/\.dk-bar\s*\{[^}]*display:\s*block/);
    expect(HTML).toMatch(/\.dk-bar\s*>\s*i\s*\{[^}]*display:\s*block/);
    expect(HTML).toMatch(/\.dk-mini\s*\{[^}]*display:\s*block/);
    expect(HTML).toMatch(/\.dk-mini\s*>\s*i\s*\{[^}]*display:\s*block/);
    expect(HTML).toMatch(/\.dk-split\s*>\s*i\s*\{[^}]*display:\s*block/);
  });

  test('a select is told it may shrink below its widest option', () => {
    expect(HTML).toMatch(/\.dk-controls select[^{]*\{[\s\S]*?max-width:\s*100%/);
    expect(HTML).toMatch(/\.dk-controls select[^{]*\{[\s\S]*?min-width:\s*0/);
  });

  test('the controls are wired before the first fetch is sent', () => {
    const wired = JS.indexOf("on('deskBasisOutstanding'");
    const first = JS.indexOf('return load();');
    expect(wired).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(wired);
  });

  test('wide content scrolls inside its own container, not the page body', () => {
    expect(HTML).toMatch(/\.dk-scroll\s*\{\s*overflow-x:\s*auto/);
    expect(HTML).toContain('<div class="dk-scroll"><table class="dk-table" id="deskTable">');
  });
});

describe('Both themes resolve as a set', () => {
  test('the complete palette is declared on the bare selector first', () => {
    const bare = HTML.match(/\n\s*\.dk\s*\{([\s\S]*?)\}/);
    expect(bare).not.toBeNull();
    for (const token of ['--dk-ink', '--dk-muted', '--dk-line', '--dk-surface', '--dk-sunk',
      '--dk-accent', '--dk-signal', '--dk-ok', '--dk-warn', '--dk-neutral']) {
      expect(bare[1]).toContain(token);
    }
  });

  test('the un-stamped system default and the explicit stamp are both covered', () => {
    expect(HTML).toMatch(/@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.dk/);
    expect(HTML).toMatch(/:root\[data-theme="dark"\] \.dk/);
  });
});

describe('The claims the screen must never merge', () => {
  test('three emission claims are three tiles, and the note says so', () => {
    expect(JS).toContain("tile('At full commitment'");
    expect(JS).toContain("tile('Carried today'");
    expect(JS).toContain("tile('Still to arrive'");
    expect(HTML).toContain('Three claims, never one figure');
  });

  test('nothing on the screen nets a credit against the inventory', () => {
    expect(JS).toContain("tile('Netted against the inventory', 'None'");
    /* No arithmetic anywhere in the renderer subtracts a credit from an
       inventory line. A sweep, not a walk of one code path. */
    expect(JS).not.toMatch(/reduction\s*[-+]\s*(incurred|forward|carried)/);
    expect(JS).not.toMatch(/(incurred|forward|carried)[^\n]*-\s*e\.separatelyStated/);
  });

  test('the money bars share one scale rather than being laid end to end', () => {
    /* Committed sits inside allocated and paid inside committed. Stacked, they
       would count the same dollar three times. */
    expect(JS).toMatch(/scaleRow\('Allocated'[\s\S]{0,60}m\.allocated, m\.allocated/);
    expect(JS).toMatch(/scaleRow\('Committed'[\s\S]{0,60}m\.committed, m\.allocated/);
    expect(JS).toMatch(/scaleRow\('Paid out'[\s\S]{0,60}m\.paid, m\.allocated/);
  });

  test('hatching means not measured, and it is the only texture on the page', () => {
    expect(HTML).toMatch(/repeating-linear-gradient/);
    expect(JS).toContain('Hatched means not measured');
    /* Both unmeasured series carry it: the forward projection and the
       emissions that follow money not yet drawn. */
    expect(JS).toMatch(/Expected over the remaining term[\s\S]{0,200}'is-pending'/);
  });

  test('an intention shows a dash, never a zero', () => {
    /* `Number(null)` is 0 and 0 is finite. Three defects in this book came
       from that, so absence is checked before the number is. */
    expect(JS).toMatch(/const absent = v =>/);
    expect(JS).toMatch(/r\.held \? num\(r\.carried_tCO2e\) : '—'/);
  });

  test('the two lifecycle axes are rendered separately and labelled', () => {
    expect(HTML).toContain('id="deskDeliverySplit"');
    expect(HTML).toContain('id="deskPositionSplit"');
    expect(JS).toContain("DELIVERY_LABEL");
    expect(JS).toContain("STATUS_LABEL");
  });

  test('the sample banner exists, so baseline figures cannot read as recorded ones', () => {
    expect(HTML).toContain('id="deskSample"');
    expect(JS).toMatch(/show\('deskSample', Boolean\(p\.sample\)\)/);
  });

  test('a failed read clears the screen rather than leaving stale figures standing', () => {
    expect(JS).toMatch(/state\.position = null;[\s\S]{0,200}setHtml\('deskTable', ''\)/);
  });
});

describe('The data-quality scale is never written as a fraction', () => {
  test('no rendering says "/ 5", which inverts the meaning', () => {
    /* 1 is the highest quality and 5 the lowest, so "3 / 5" reads as a mark
       out of five and inverts it for anyone who has not opened the standard. */
    expect(JS).not.toMatch(/\/\s*5['"`\s]/);
    expect(JS).toContain('PCAF scale 1–5, 1 is best');
  });
});
