/**
 * The dashboard, driven (gap H3).
 *
 * Against the built frontend on the memory store: sign in, see the shell,
 * reach a page that calls the API and get real records back, and hold the
 * one rule every page has broken once — the page never scrolls sideways at
 * a phone width. Five journeys, not fifty: the source sweeps in tests/
 * catch the mechanical faults; these catch the ones only a browser sees.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

/* One account, created through the API the same way an administrator would.
   409 means a previous test in this run already made it. */
const USER = { email: 'ana@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui', password: 'an end to end passphrase' };

async function ensureAccount(request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
}

async function signIn(page, request) {
  await ensureAccount(request);
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

test('the shell signs in, shows the sidebar and the mark, and knows the deployment', async ({ page, request }) => {
  await signIn(page, request);
  const mark = page.locator('#sidebar img[alt*="Datum"], #sidebar [data-brand] img').first();
  await expect(mark).toBeVisible();
  expect(await mark.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  const health = await page.request.get('/health');
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.storage.mode).toBe('memory');
  expect(body.contract.openapi).toBe('/v1/openapi.json');
});

test('the Part C book page reaches the API and renders a record it created', async ({ page, request }) => {
  const created = await page.request.post('/v1/partc/clients', { headers: { 'x-api-key': KEY }, data: { name: 'Browser Client', country: 'LK' } });
  expect(created.status()).toBe(201);
  await signIn(page, request);
  const nav = page.locator('.nav-item[data-page="partc-book"]');
  await nav.click();
  await expect(page.locator('#page-partc-book')).toBeVisible();
  await expect(page.locator('#page-partc-book')).toContainText('Browser Client', { timeout: 15_000 });
});

test('every response the page asked for carried the request id and the envelope marker', async ({ page, request }) => {
  const headers = [];
  page.on('response', res => { if (res.url().includes('/v1/')) headers.push(res.headers()); });
  await signIn(page, request);
  await page.locator('.nav-item[data-page="partc-book"]').click();
  await expect.poll(() => headers.length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const h of headers) {
    expect(h['x-request-id']).toBeTruthy();
    expect(h['x-api-envelope']).toBe('legacy');
  }
});

test('the content security policy reaches the browser and the page still runs under it', async ({ page, request }) => {
  const res = await page.goto('/');
  const csp = res.headers()['content-security-policy'] || '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await signIn(page, request);
  expect(errors.filter(e => /Content Security Policy/i.test(e))).toEqual([]);
});

test('no page scrolls sideways at a phone width', async ({ page, request }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await signIn(page, request);
  for (const id of ['dashboard', 'partc-book', 'desk', 'gcf']) {
    /* At a phone width the sidebar is off-canvas; the shell's own router is
       the way a tap on the mobile navigation reaches a page. */
    await page.evaluate(pageId => window.CARBONIQ_navigateTo(pageId), id);
    /* Poll rather than sample once after a fixed wait. A page mid-render is
       briefly wider than its container while its tables are still outside
       their scroll box, so a single reading of a half-drawn frame reported
       an overflow the settled page does not have. The rule is unchanged and
       a page that genuinely overflows still fails, at the timeout. */
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth),
        { message: `${id} at 430px`, timeout: 10_000 })
      .toBeLessThanOrEqual(430);
  }
});
