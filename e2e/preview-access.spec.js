/**
 * Preview access, driven.
 *
 * The source sweeps in `tests/preview-access.test.js` prove the shape of the
 * panel — that it is hidden with `[hidden]`, that its input may shrink, that
 * availability is asked before the panel could be pressed. What they cannot
 * prove is that any of it works, and each of the four mechanical faults this
 * codebase has shipped once passed a sweep on its way out.
 *
 * So: press the button, land in the product, and check the three things a
 * visitor would notice — that the sample book is on screen, that the page says
 * what it is, and that a screen the visitor may not have is not offered.
 */

'use strict';

/* `Auth` is declared in the page, not here: page.evaluate runs its function in
   the browser's realm, where a top-level `const` in a classic script is a
   global lexical binding rather than a property of `window`. */
/* global Auth */

const { test, expect } = require('@playwright/test');

const address = () => `preview.${Date.now()}.${Math.floor(Math.random() * 1e6)}@bank.lk`;

async function openSampleBook(page) {
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  /* The panel is revealed by the answer to GET /v1/auth/preview, so waiting
     for it to be visible is also the assertion that the check ran. */
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', address());
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

test('an address alone opens the sample book, and the page says that is what it is', async ({ page }) => {
  await openSampleBook(page);

  const mark = page.locator('#preview-mark');
  await expect(mark).toBeVisible();
  await expect(mark).toContainText('Sample book');

  /* A visitor who forgets which book they are looking at is the failure the
     mark exists to prevent, so it survives moving between screens. */
  const partc = page.locator('.nav-item[data-page="partc-book"]');
  if (await partc.count()) {
    await partc.first().click();
    await expect(page.locator('#preview-mark')).toBeVisible();
  }
});

test('the sidebar offers what a preview may reach and not what it may not', async ({ page }) => {
  await openSampleBook(page);
  /* Accounts is administrators only, and every route behind it needs the
     `admin` scope — so offering it to a preview visitor would be a menu entry
     that can only answer 403. */
  const accounts = page.locator('.nav-item[data-page="accounts"]');
  if (await accounts.count()) await expect(accounts.first()).toBeHidden();
  await expect(page.locator('.nav-item[data-page="dashboard"]').first()).toBeVisible();
});

test('a preview session is refused a write by the server, not only by the screen', async ({ page }) => {
  await openSampleBook(page);
  /* Hiding a control is a courtesy. This is the control. */
  const refusal = await page.evaluate(async () => {
    /* `Auth` is a top-level `const` in a classic script, so it is a global
       lexical binding rather than a property of `window`. */
    const token = Auth.getToken();
    const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/partc/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Should Not Persist' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
  expect(refusal.status).toBe(403);
  expect(refusal.body.error).toBe('SCOPE_REQUIRED');
});

test('the panel does not widen the page at a phone width', async ({ page }) => {
  /* A flex item's min-width is auto, and a long address in a row with a button
     is exactly the shape that has pushed this page sideways before — twice,
     once through a `<select>` and once through an input. */
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', 'a.very.long.address.that.someone.might.actually.use@a-long-bank-domain.example.lk');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

/**
 * The first-run window, open.
 *
 * The offer shipped nested inside the sign-in card, and `_showPane()` hides
 * that whole card to show another. So on a deployment holding no accounts with
 * a bootstrap token set — which is every deployment on its first day — the
 * offer was revealed by one check and hidden by the other, and a visitor saw it
 * appear and go.
 *
 * This server cannot be put in that state: it sets no ADMIN_BOOTSTRAP_TOKEN and
 * other journeys create accounts in it, which is exactly why the journeys above
 * were green while the live site was not. The bootstrap answer is therefore the
 * one thing stubbed; everything else — the preview check, the session, the
 * sample book — is the real server.
 */
for (const delayMs of [0, 250]) {
  test(`the offer survives the first-run pane, whichever answer lands first (${delayMs}ms)`, async ({ page }) => {
    await page.route('**/v1/auth/bootstrap', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true, reason: null, remedy: null }),
      });
    });

    await page.goto('/');
    await expect(page.locator('#login-bootstrap')).toBeVisible();
    await expect(page.locator('#login-card-signin')).toBeHidden();

    /* Both answers are in by now, in one order or the other. */
    await expect(page.locator('#login-preview')).toBeVisible();

    /* And it is an offer that works, not a card that survived being drawn. */
    await page.fill('#preview-email', address());
    await page.locator('#preview-btn').click();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#preview-mark')).toBeVisible();
  });
}
