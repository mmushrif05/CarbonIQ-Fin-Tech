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
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.join(__dirname, '..');
const HTML = source('ui/pages/desk.html');
const JS = source('ui/js/desk.js');
const INDEX = source('ui/index.html');
const APP = source('ui/app.js');

describe('The page is reachable and named', () => {
  test('the nav carries an entry, the shell a container, and the head a script', () => {
    must(INDEX, 'data-page="desk"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'id="page-desk" data-src="pages/desk.html"', "the nav carries an entry, the shell a container, and the head a script");
    must(INDEX, 'js/desk.js', "the nav carries an entry, the shell a container, and the head a script");
  });

  test('it is registered with a real title, not left to show its own id', () => {
    must(APP, /'desk':\s*\{[\s\S]*?title: 'Fund Desk'/, "it is registered with a real title, not left to show its own id");
    must(APP, /'desk':\s*\{[\s\S]*?init:/, "it is registered with a real title, not left to show its own id");
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    must(APP, /'desk':\s*\{[\s\S]*?refresh:/, "a return visit re-reads rather than showing what it said last time");
    must(JS, /function refresh\(\)\s*\{\s*return load\(\);/, "a return visit re-reads rather than showing what it said last time");
  });

  test('the GCF Pipeline tab is untouched and still registered beside it', () => {
    /* The research screen stays exactly as it was. This one is a second view
       over the same records, not a replacement for it. */
    must(INDEX, 'data-page="gcf"', "the GCF Pipeline tab is untouched and still registered beside it");
    must(APP, /'gcf':\s*\{[\s\S]*?title: 'GCF Pipeline'/, "the GCF Pipeline tab is untouched and still registered beside it");
  });
});

describe('The four mechanical rules', () => {
  test('[hidden] is stated explicitly, so no class rule can beat it', () => {
    must(HTML, /\.dk \[hidden\]\s*\{\s*display:\s*none\s*!important/, "[hidden] is stated explicitly, so no class rule can beat it");
  });

  test('every bar is a block, or it renders as nothing', () => {
    must(HTML, /\.dk-bar\s*\{[^}]*display:\s*block/, "every bar is a block, or it renders as nothing");
    must(HTML, /\.dk-bar\s*>\s*i\s*\{[^}]*display:\s*block/, "every bar is a block, or it renders as nothing");
    must(HTML, /\.dk-mini\s*\{[^}]*display:\s*block/, "every bar is a block, or it renders as nothing");
    must(HTML, /\.dk-mini\s*>\s*i\s*\{[^}]*display:\s*block/, "every bar is a block, or it renders as nothing");
    must(HTML, /\.dk-split\s*>\s*i\s*\{[^}]*display:\s*block/, "every bar is a block, or it renders as nothing");
  });

  test('a select is told it may shrink below its widest option', () => {
    must(HTML, /\.dk-controls select[^{]*\{[\s\S]*?max-width:\s*100%/, "a select is told it may shrink below its widest option");
    must(HTML, /\.dk-controls select[^{]*\{[\s\S]*?min-width:\s*0/, "a select is told it may shrink below its widest option");
  });

  test('the controls are wired before the first fetch is sent', () => {
    const wired = JS.indexOf("on('deskBasisOutstanding'");
    const first = JS.indexOf('return load();');
    expect(wired).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(wired);
  });

  test('wide content scrolls inside its own container, not the page body', () => {
    must(HTML, /\.dk-scroll\s*\{\s*overflow-x:\s*auto/, "wide content scrolls inside its own container, not the page body");
    must(HTML, '<div class="dk-scroll"><table class="dk-table" id="deskTable">', "wide content scrolls inside its own container, not the page body");
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
    must(HTML, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.dk/, "the un-stamped system default and the explicit stamp are both covered");
    must(HTML, /:root\[data-theme="dark"\] \.dk/, "the un-stamped system default and the explicit stamp are both covered");
  });
});

describe('The claims the screen must never merge', () => {
  test('three emission claims are three tiles, and the note says so', () => {
    must(JS, "tile('At full commitment'", "three emission claims are three tiles, and the note says so");
    must(JS, "tile('Carried today'", "three emission claims are three tiles, and the note says so");
    must(JS, "tile('Still to arrive'", "three emission claims are three tiles, and the note says so");
    must(HTML, '<h4>Attributed emissions</h4>', "three emission claims are three tiles, and the note says so");
  });

  test('nothing on the screen nets a credit against the inventory', () => {
    must(JS, "tile('Basis', 'PCAF Part A', 'Reported separately from the inventory, p.126')", "nothing on the screen nets a credit against the inventory");
    /* No arithmetic anywhere in the renderer subtracts a credit from an
       inventory line. A sweep, not a walk of one code path. */
    mustNot(JS, /reduction\s*[-+]\s*(incurred|forward|carried)/, "nothing on the screen nets a credit against the inventory");
    mustNot(JS, /(incurred|forward|carried)[^\n]*-\s*e\.separatelyStated/, "nothing on the screen nets a credit against the inventory");
  });

  test('the money bars share one scale rather than being laid end to end', () => {
    /* Committed sits inside allocated and paid inside committed. Stacked, they
       would count the same dollar three times. */
    must(JS, /scaleRow\('Allocated'[\s\S]{0,60}m\.allocated, m\.allocated/, "the money bars share one scale rather than being laid end to end");
    must(JS, /scaleRow\('Committed'[\s\S]{0,60}m\.committed, m\.allocated/, "the money bars share one scale rather than being laid end to end");
    must(JS, /scaleRow\('Paid out'[\s\S]{0,60}m\.paid, m\.allocated/, "the money bars share one scale rather than being laid end to end");
  });

  test('hatching means not measured, and it is the only texture on the page', () => {
    must(HTML, /repeating-linear-gradient/, "hatching means not measured, and it is the only texture on the page");
    must(JS, 'Hatched — not measured', "hatching means not measured, and it is the only texture on the page");
    /* Both unmeasured series carry it: the forward projection and the
       emissions that follow money not yet drawn. */
    must(JS, /Expected over the remaining term[\s\S]{0,200}'is-pending'/, "hatching means not measured, and it is the only texture on the page");
  });

  test('an intention shows a dash, never a zero', () => {
    /* `Number(null)` is 0 and 0 is finite. Three defects in this book came
       from that, so absence is checked before the number is. */
    must(JS, /const absent = v =>/, "an intention shows a dash, never a zero");
    must(JS, /r\.held \? num\(r\.carried_tCO2e\) : '—'/, "an intention shows a dash, never a zero");
  });

  test('the two lifecycle axes are rendered separately and labelled', () => {
    must(HTML, 'id="deskDeliverySplit"', "the two lifecycle axes are rendered separately and labelled");
    must(HTML, 'id="deskPositionSplit"', "the two lifecycle axes are rendered separately and labelled");
    must(JS, "DELIVERY_LABEL", "the two lifecycle axes are rendered separately and labelled");
    must(JS, "STATUS_LABEL", "the two lifecycle axes are rendered separately and labelled");
  });

  test('the sample banner exists, so baseline figures cannot read as recorded ones', () => {
    must(HTML, 'id="deskSample"', "the sample banner exists, so baseline figures cannot read as recorded ones");
    must(JS, /show\('deskSample', Boolean\(p\.sample\)\)/, "the sample banner exists, so baseline figures cannot read as recorded ones");
  });

  test('a failed read clears the screen rather than leaving stale figures standing', () => {
    must(JS, /state\.position = null;[\s\S]{0,200}setHtml\('deskTable', ''\)/, "a failed read clears the screen rather than leaving stale figures standing");
  });
});

describe('The data-quality scale is never written as a fraction', () => {
  test('no rendering says "/ 5", which inverts the meaning', () => {
    /* 1 is the highest quality and 5 the lowest, so "3 / 5" reads as a mark
       out of five and inverts it for anyone who has not opened the standard. */
    mustNot(JS, /\/\s*5['"`\s]/, "no rendering says \"/ 5\", which inverts the meaning");
    must(JS, 'PCAF scale 1–5, 1 is best', "no rendering says \"/ 5\", which inverts the meaning");
  });
});

describe('Stage 4 — the candidates band', () => {
  test('the gate is a chip with three states, and excluded keeps its row', () => {
    must(JS, /GATE_CHIP = \{[\s\S]*?eligible[\s\S]*?flagged[\s\S]*?excluded/, "the gate is a chip with three states, and excluded keeps its row");
    /* Rows are rendered from what the endpoint returns; nothing filters an
       excluded project out, and the copy says why it stays. */
    mustNot(JS, /rows\.filter\([^)]*verdict\s*!==\s*'excluded'/, "the gate is a chip with three states, and excluded keeps its row");
    must(HTML, 'Excluded candidates remain listed with the reason for exclusion', "the gate is a chip with three states, and excluded keeps its row");
  });

  test('rank is shown with the stream it is a rank within', () => {
    /* Two projects legitimately hold rank 1. A bare "#1" on a merged list
       would be a sort key defunding adaptation. */
    must(JS, /#\$\{r\.rank\}[\s\S]{0,80}in \$\{esc\(r\.stream\)\}/, "rank is shown with the stream it is a rank within");
    must(HTML, 'Ranked within stream', "rank is shown with the stream it is a rank within");
  });

  test('an unranked candidate shows a dash, not a zero', () => {
    must(JS, /r\.rank === null \? '—'/, "an unranked candidate shows a dash, not a zero");
  });

  test('the impact unit differs by stream and never mixes the two', () => {
    must(JS, /r\.stream === 'adaptation' \? 'people \/ \$M ask' : 'tCO2e·yr \/ \$M ask'/, "the impact unit differs by stream and never mixes the two");
  });

  test('a gate reason is clipped for the row but never thrown away', () => {
    must(JS, /const clip = /, "a gate reason is clipped for the row but never thrown away");
    must(JS, /title="\$\{esc\(r\.gate\.reasons\.join/, "a gate reason is clipped for the row but never thrown away");
  });

  test('adoption states that recorded records replace the baseline entirely', () => {
    must(JS, /Recorded portfolios replace the illustrative dataset in full/, "adoption states that recorded records replace the baseline entirely");
    must(JS, /No portfolio has been recorded/, "adoption states that recorded records replace the baseline entirely");
  });
});

describe('Stage 5 — the scenario drawer', () => {
  test('the drawer is shut at load, and the guard is what keeps it shut', () => {
    /* The drawer sets display:flex in a class rule, which beats [hidden] from
       the user-agent sheet. The .dk [hidden] rule above is the only reason it
       is not covering the page from load — that exact defect has shipped here. */
    must(HTML, /<aside class="dk-drawer" id="deskDrawer" hidden/, "the drawer is shut at load, and the guard is what keeps it shut");
    must(HTML, /\.dk-drawer\s*\{[\s\S]*?display:\s*flex/, "the drawer is shut at load, and the guard is what keeps it shut");
    must(HTML, /\.dk \[hidden\]\s*\{\s*display:\s*none\s*!important/, "the drawer is shut at load, and the guard is what keeps it shut");
  });

  test('only a project still waiting can be selected', () => {
    /* A held position is already on the book, so modelling writing it would be
       modelling a decision that has been taken. */
    must(JS, /const selectable = r\.status === 'pipeline'/, "only a project still waiting can be selected");
    must(JS, /\$\{selectable \? '' : 'disabled'\}/, "only a project still waiting can be selected");
  });

  test('shortfall and remainder are different words for different facts', () => {
    /* A selection that does not fit reports a shortfall, never a negative
       remainder. */
    must(JS, /f\.affordable \? 'Left over' : 'Shortfall'/, "shortfall and remainder are different words for different facts");
  });

  test('the impact is four separate lines and no total combines them', () => {
    must(JS, /Reduction \(reported separately\)/, "the impact is four separate lines and no total combines them");
    must(JS, /Avoided \(reported separately\)/, "the impact is four separate lines and no total combines them");
    mustNot(JS, /forward_tCO2e\s*[-+]\s*i\.(reduction|avoided)/, "the impact is four separate lines and no total combines them");
  });

  test('a selection is a question and the screen says nothing is written down', () => {
    must(JS, /sc\.storedNote/, "a selection is a question and the screen says nothing is written down");
    must(JS, /sc\.storedNote/, "a selection is a question and the screen says nothing is written down");
  });

  test('escape closes it, so nobody gets stuck behind a panel', () => {
    must(JS, /ev\.key === 'Escape'[\s\S]{0,60}deskDrawer/, "escape closes it, so nobody gets stuck behind a panel");
  });
});

describe('Stage 6 — year end', () => {
  test('the disclosure count is answered from the report, so it can fail', () => {
    must(JS, /tile\('Outstanding items'/, "the disclosure count is answered from the report, so it can fail");
    must(JS, /checklistMet[\s\S]{0,60}checklistTotal/, "the disclosure count is answered from the report, so it can fail");
    must(HTML, 'Outstanding items for the SLFRS S1 / S2 disclosure', "the disclosure count is answered from the report, so it can fail");
  });

  test('entity facts are shown as recorded-of-total, never as a percentage complete', () => {
    must(JS, /tile\('Entity disclosures', `\$\{num\(r\.entity\.recorded\)\} \/ \$\{num\(r\.entity\.total\)\}`/, "entity facts are shown as recorded-of-total, never as a percentage complete");
  });

  test('readiness is labelled as what is held, not as nearness to a submission', () => {
    must(JS, /Concept Note inputs outstanding/, "readiness is labelled as what is held, not as nearness to a submission");
    must(JS, /r\.conceptNotes\.note/, "readiness is labelled as what is held, not as nearness to a submission");
  });

  test('the full workings stay on the GCF Pipeline screen, and the page says so', () => {
    must(HTML, 'Full detail is on the GCF Pipeline screen', "the full workings stay on the GCF Pipeline screen, and the page says so");
    must(JS, /further items — see the GCF Pipeline screen/, "the full workings stay on the GCF Pipeline screen, and the page says so");
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
