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
    expect(HTML).toContain('<h4>Attributed emissions</h4>');
  });

  test('nothing on the screen nets a credit against the inventory', () => {
    expect(JS).toContain("tile('Basis', 'PCAF Part A', 'Reported separately from the inventory, p.126')");
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
    expect(JS).toContain('Hatched — not measured');
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

describe('Stage 4 — the candidates band', () => {
  test('the gate is a chip with three states, and excluded keeps its row', () => {
    expect(JS).toMatch(/GATE_CHIP = \{[\s\S]*?eligible[\s\S]*?flagged[\s\S]*?excluded/);
    /* Rows are rendered from what the endpoint returns; nothing filters an
       excluded project out, and the copy says why it stays. */
    expect(JS).not.toMatch(/rows\.filter\([^)]*verdict\s*!==\s*'excluded'/);
    expect(HTML).toContain('Excluded candidates remain listed with the reason for exclusion');
  });

  test('rank is shown with the stream it is a rank within', () => {
    /* Two projects legitimately hold rank 1. A bare "#1" on a merged list
       would be a sort key defunding adaptation. */
    expect(JS).toMatch(/#\$\{r\.rank\}[\s\S]{0,80}in \$\{esc\(r\.stream\)\}/);
    expect(HTML).toContain('Ranked within stream');
  });

  test('an unranked candidate shows a dash, not a zero', () => {
    expect(JS).toMatch(/r\.rank === null \? '—'/);
  });

  test('the impact unit differs by stream and never mixes the two', () => {
    expect(JS).toMatch(/r\.stream === 'adaptation' \? 'people \/ \$M ask' : 'tCO2e·yr \/ \$M ask'/);
  });

  test('a gate reason is clipped for the row but never thrown away', () => {
    expect(JS).toMatch(/const clip = /);
    expect(JS).toMatch(/title="\$\{esc\(r\.gate\.reasons\.join/);
  });

  test('adoption states that recorded records replace the baseline entirely', () => {
    expect(JS).toMatch(/Recorded portfolios replace the illustrative dataset in full/);
    expect(JS).toMatch(/No portfolio has been recorded/);
  });
});

describe('Stage 5 — the scenario drawer', () => {
  test('the drawer is shut at load, and the guard is what keeps it shut', () => {
    /* The drawer sets display:flex in a class rule, which beats [hidden] from
       the user-agent sheet. The .dk [hidden] rule above is the only reason it
       is not covering the page from load — that exact defect has shipped here. */
    expect(HTML).toMatch(/<aside class="dk-drawer" id="deskDrawer" hidden/);
    expect(HTML).toMatch(/\.dk-drawer\s*\{[\s\S]*?display:\s*flex/);
    expect(HTML).toMatch(/\.dk \[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test('only a project still waiting can be selected', () => {
    /* A held position is already on the book, so modelling writing it would be
       modelling a decision that has been taken. */
    expect(JS).toMatch(/const selectable = r\.status === 'pipeline'/);
    expect(JS).toMatch(/\$\{selectable \? '' : 'disabled'\}/);
  });

  test('shortfall and remainder are different words for different facts', () => {
    /* A selection that does not fit reports a shortfall, never a negative
       remainder. */
    expect(JS).toMatch(/f\.affordable \? 'Left over' : 'Shortfall'/);
  });

  test('the impact is four separate lines and no total combines them', () => {
    expect(JS).toMatch(/Reduction \(reported separately\)/);
    expect(JS).toMatch(/Avoided \(reported separately\)/);
    expect(JS).not.toMatch(/forward_tCO2e\s*[-+]\s*i\.(reduction|avoided)/);
  });

  test('a selection is a question and the screen says nothing is written down', () => {
    expect(JS).toMatch(/sc\.storedNote/);
    expect(JS).toMatch(/sc\.storedNote/);
  });

  test('escape closes it, so nobody gets stuck behind a panel', () => {
    expect(JS).toMatch(/ev\.key === 'Escape'[\s\S]{0,60}deskDrawer/);
  });
});

describe('Stage 6 — year end', () => {
  test('the disclosure count is answered from the report, so it can fail', () => {
    expect(JS).toMatch(/tile\('Outstanding items'/);
    expect(JS).toMatch(/checklistMet[\s\S]{0,60}checklistTotal/);
    expect(HTML).toContain('Outstanding items for the SLFRS S1 / S2 disclosure');
  });

  test('entity facts are shown as recorded-of-total, never as a percentage complete', () => {
    expect(JS).toMatch(/tile\('Entity disclosures', `\$\{num\(r\.entity\.recorded\)\} \/ \$\{num\(r\.entity\.total\)\}`/);
  });

  test('readiness is labelled as what is held, not as nearness to a submission', () => {
    expect(JS).toMatch(/Concept Note inputs outstanding/);
    expect(JS).toMatch(/r\.conceptNotes\.note/);
  });

  test('the full workings stay on the GCF Pipeline screen, and the page says so', () => {
    expect(HTML).toContain('Full detail is on the GCF Pipeline screen');
    expect(JS).toMatch(/further items — see the GCF Pipeline screen/);
  });
});

describe('Nothing was taken off the GCF Pipeline screen', () => {
  const GCF_HTML = fs.readFileSync(path.join(ROOT, 'ui/pages/gcf.html'), 'utf8');

  test('all seven sub-tabs are still there', () => {
    for (const panel of ['pipeline', 'emissions', 'decision', 'instruments', 'reporting', 'cn', 'intake']) {
      expect(GCF_HTML).toContain(`data-panel="${panel}"`);
      expect(GCF_HTML).toContain(`id="gcfPanel-${panel}"`);
    }
  });
});
