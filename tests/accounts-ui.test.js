/**
 * The Accounts screen.
 *
 * Swept for the four mechanical faults this codebase has already shipped once
 * each — an inline bar that renders as nothing, a `<select>` that sets the
 * page width, a class rule beating `[hidden]`, and state read after the first
 * fetch instead of before it — plus the rule this screen exists to keep: the
 * role, the standing and the access window are three facts and never one
 * column, because a customer told the wrong one calls the wrong person.
 */

'use strict';

const { source, must, mustNot } = require('./helpers/ui-source');

const html = source('ui/pages/accounts.html');
const js = source('ui/js/accounts.js');
const shell = source('ui/index.html');
const app = source('ui/app.js');
const auth = source('ui/js/auth.js');

describe('The screen is registered where a screen has to be', () => {
  test('it has a nav entry, a container, a script and a title', () => {
    must(shell, /data-page="accounts"/, 'it has a nav entry, a container, a script and a title');
    must(shell, /id="page-accounts"/, 'it has a nav entry, a container, a script and a title');
    must(shell, /js\/accounts\.js/, 'it has a nav entry, a container, a script and a title');
    /* A page missing from the title map shows its own id as its heading —
       which has happened here before. */
    must(app, /'accounts':\s*{\s*title: 'Accounts'/, 'it has a nav entry, a container, a script and a title');
    must(app, /'accounts': \{[\s\S]*?src:\s*'pages\/accounts\.html'/, 'it has a nav entry, a container, a script and a title');
  });

  test('a return visit re-reads rather than showing what it said last time', () => {
    must(app, /'accounts': \{[\s\S]*?refresh:/, 'a return visit re-reads rather than showing what it said last time');
  });

  test('the nav entry is administrators only', () => {
    /* The control is the `admin` scope on every route behind it; hiding the
       entry keeps a screen that could only refuse out of everyone else's way. */
    must(auth, /'accounts':\s*100/, 'the nav entry is administrators only');
  });
});

describe('The four mechanical faults', () => {
  test('no class rule sets display on a [hidden] element', () => {
    /* `[hidden]` is display:none from the user-agent sheet, and any class rule
       setting display beats it. */
    for (const id of ['ac-empty', 'ac-msg', 'ac-secret', 'ac-create-msg']) {
      must(html, new RegExp(`id="${id}"[^>]*hidden`),
        `${id} is hidden in the markup, not by a class rule a stylesheet can beat`);
    }
    for (const cls of ['ac-msg', 'ac-empty', 'ac-secret']) {
      mustNot(html, new RegExp(`\\.${cls}\\s*{[^}]*display:`), 'no class rule sets display on a [hidden] element');
    }
    /* The three sign-in panes are the same trap in the shell. */
    for (const id of ['login-change', 'login-bootstrap']) {
      must(shell, new RegExp(`id="${id}"[^>]*hidden`), `${id} is hidden in the markup`);
    }
    must(shell, /el\.hidden = name !== which/, 'the pane switcher toggles [hidden] rather than a display class');
  });

  test('every control and grid child may shrink below its content', () => {
    /* A grid or flex item is min-width:auto, so one long option sets the page
       width. `<select>` sizes to its widest option, not its container — and
       this screen has a role select on every row. */
    must(html, /\.ac-form select, \.ac-form input, \.ac-table select\s*{\s*max-width:\s*100%;\s*min-width:\s*0/,
      'every control and grid child may shrink below its content');
    must(html, /\.ac-card\s*{[\s\S]*?min-width:\s*0/, 'every control and grid child may shrink below its content');
    must(html, /\.ac\s*{[\s\S]*?min-width:\s*0/, 'every control and grid child may shrink below its content');
  });

  test('the wide table scrolls inside its own container', () => {
    must(html, /\.ac-scroll\s*{[^}]*overflow-x:\s*auto/, 'the wide table scrolls inside its own container');
    must(html, /<div class="ac-scroll">\s*<table class="ac-table">/, 'the wide table scrolls inside its own container');
  });

  test('a grid that must collapse uses the shrinkable auto-fit form', () => {
    const fits = html.match(/repeat\(auto-fit,\s*minmax\([^)]*\)/g) || [];
    expect(fits.length).toBeGreaterThan(0);
    for (const f of fits) expect(f).toMatch(/minmax\(min\(100%,/);
  });

  test('what changes the first request is wired before it is sent', () => {
    const init = js.slice(js.indexOf('function init()'));
    const listeners = init.indexOf("addEventListener('click'");
    const first = init.indexOf('refresh()');
    expect(listeners).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(listeners);
  });
});

describe('The theme resolves as a set in all three states', () => {
  test('the bare palette is complete and both stamped states redefine it', () => {
    const bare = html.match(/\.ac\s*{[^}]*}/);
    expect(bare[0]).toMatch(/--ac-ink:/);
    expect(bare[0]).toMatch(/--ac-surface:/);
    must(html, /@media \(prefers-color-scheme: dark\)[\s\S]*?:root:not\(\[data-theme="light"\]\) \.ac/,
      'the bare palette is complete and both stamped states redefine it');
    must(html, /:root\[data-theme="dark"\] \.ac/, 'the bare palette is complete and both stamped states redefine it');
  });
});

describe('Three facts, three columns', () => {
  test('the table shows the role, the standing and the access window apart', () => {
    must(html, /<th>Role<\/th><th>Standing<\/th>\s*<th>Access<\/th>/,
      'the role, the standing and the window are separate columns');
  });

  test('an ended window is not rendered as a disabled account', () => {
    /* Two functions, so neither can borrow the other's wording. */
    must(js, /function windowCell\(u\)/, 'the window has its own renderer');
    must(js, /function standingCell\(u\)/, 'the standing has its own renderer');
    must(js, /Ended \$\{esc\(day\(a\.endsAt\)\)\}/, 'an ended window names the date it ended');
    must(js, /Disabled/, 'a disabled account says disabled');
  });

  test('an account still on an issued password says what it can reach', () => {
    must(js, /Password not yet set/, 'an issued password is visible as a state');
    must(js, /Can reach its own password and nothing else/, 'and the screen says what that means');
  });

  test('a password is shown once, where it can be read', () => {
    /* The server stores a hash and can never read it back, so a password not
       rendered here is a password nobody has. */
    must(js, /shown once/i, 'the password is shown once');
    must(html, /id="ac-secret"/, 'and there is somewhere to show it');
  });

  test('the screen never invents a figure for an account it has not read', () => {
    mustNot(js, /Number\(u\.access\)/, 'no coercion of an absent window to a number');
    must(js, /return '<span class="ac-sub">No end date<\/span>'/,
      'an account with no window says so rather than showing a date');
  });
});
