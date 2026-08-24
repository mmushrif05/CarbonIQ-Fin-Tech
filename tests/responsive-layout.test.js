/**
 * The application has to work on a phone, and one report proved it did not:
 * "in the mobile app sign in option is not shown".
 *
 * The button was there the whole time. `.login-screen` is
 * `position: fixed; inset: 0`, which pins it to the viewport and takes it out
 * of flow — so the page behind it has nothing to scroll — and it centred its
 * card with `align-items: center` and no `overflow-y`. A card taller than the
 * screen is then pushed off BOTH ends at once. Measured on a 390x844 phone:
 * the card was 1,526px tall, its top sat at -341px, and Sign In sat at
 * +1,104px. Rendered, in the DOM, and physically unreachable.
 *
 * Two more faults compounded it once signed in. A table wider than its card
 * was clipped by `overflow: hidden` rather than scrolling, and a mobile
 * browser widens the layout viewport to fit overflowing content — which
 * stretched every fixed element with it, so the top bar measured 401px
 * against a 390px screen. And `.charts-row` used a bare `1fr`, whose implicit
 * `min-width: auto` refuses to shrink below the content's intrinsic width.
 *
 * These assertions read the stylesheets, because that is where each fault
 * lived. The browser sweep that found them is not runnable here.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'ui', ...p), 'utf8');

/** The declarations of the first rule whose selector list matches. */
function ruleBody(css, selector) {
  const re = new RegExp(`(^|[},])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  return m ? m[2] : null;
}

describe('The sign-in layer can always reach its button', () => {
  const css = read('css', 'login.css');
  const body = ruleBody(css, '.login-screen');

  test('the rule exists and is a fixed full-screen layer', () => {
    expect(body).not.toBeNull();
    expect(body).toMatch(/position:\s*fixed/);
  });

  test('it scrolls its own content — a fixed layer has no page scroll behind it', () => {
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  test('it does not centre with align-items, which clips instead of scrolling', () => {
    // align-items:center on an overflowing flex container pushes content off
    // both ends and makes it unreachable. margin:auto on the child centres
    // while it fits and yields to scrolling when it does not.
    expect(body).not.toMatch(/align-items:\s*center/);
    expect(ruleBody(css, '.login-container')).toMatch(/margin:\s*auto/);
  });

  test('the primary action is full width and tappable on a phone', () => {
    // Apple's HIG minimum is 44px; anything less is a miss-tap.
    const mobile = css.slice(css.indexOf('@media (max-width: 520px)'));
    expect(mobile).toMatch(/\.login-actions\s*\{[^}]*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.login-btn\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d)px/);
  });
});

describe('Nothing forces the page wider than the screen', () => {
  const css = read('styles.css');

  test('a table too wide for its card scrolls inside it rather than being cut off', () => {
    const card = ruleBody(css, '.table-card');
    expect(card).toMatch(/overflow-x:\s*auto/);
    expect(card).not.toMatch(/overflow:\s*hidden/);
  });

  test('the table may exceed its card, but never shrinks below it', () => {
    const table = ruleBody(css, '.data-table');
    expect(table).toMatch(/width:\s*max-content/);
    expect(table).toMatch(/min-width:\s*100%/);
  });

  test('grid tracks use minmax(0, …) so content cannot blow them out', () => {
    // A bare `1fr` keeps min-width:auto and refuses to shrink below its
    // content — which is why collapsing to a single column changed nothing.
    const rows = css.match(/\.charts-row\s*\{[^}]*grid-template-columns:[^;]*/g) || [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toMatch(/minmax\(\s*0/);
    }
    expect(ruleBody(css, '.chart-card')).toMatch(/min-width:\s*0/);
  });
});

describe('The document declares itself to mobile browsers', () => {
  test('index.html carries a viewport meta that allows zoom', () => {
    const html = read('index.html');
    const m = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);

    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/width=device-width/);
    // Blocking zoom fails WCAG 1.4.4 and strands anyone who needs to magnify.
    expect(m[0]).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(m[0]).not.toMatch(/maximum-scale\s*=\s*1\b/i);
  });
});
