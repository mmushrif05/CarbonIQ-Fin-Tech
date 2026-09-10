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

async function signIn(page) {
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.fill('#login-name', 'Ana Perera');
  await page.fill('#login-email', 'ana@bank.lk');
  await page.fill('#login-org', 'Test Bank');
  await page.locator('.stakeholder-card[data-role="admin"]').click();
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

test('the shell signs in, shows the sidebar and the mark, and knows the deployment', async ({ page }) => {
  await signIn(page);
  const mark = page.locator('#sidebar img[alt*="Datum"], #sidebar [data-brand] img').first();
  await expect(mark).toBeVisible();
  expect(await mark.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  const health = await page.request.get('/health');
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.storage.mode).toBe('memory');
  expect(body.contract.openapi).toBe('/v1/openapi.json');
});

test('the Part C book page reaches the API and renders a record it created', async ({ page }) => {
  const created = await page.request.post('/v1/partc/clients', { headers: { 'x-api-key': KEY }, data: { name: 'Browser Client', country: 'LK' } });
  expect(created.status()).toBe(201);
  await signIn(page);
  const nav = page.locator('.nav-item[data-page="partc-book"]');
  await nav.click();
  await expect(page.locator('#page-partc-book')).toBeVisible();
  await expect(page.locator('#page-partc-book')).toContainText('Browser Client', { timeout: 15_000 });
});

test('every response the page asked for carried the request id and the envelope marker', async ({ page }) => {
  const headers = [];
  page.on('response', res => { if (res.url().includes('/v1/')) headers.push(res.headers()); });
  await signIn(page);
  await page.locator('.nav-item[data-page="partc-book"]').click();
  await expect.poll(() => headers.length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const h of headers) {
    expect(h['x-request-id']).toBeTruthy();
    expect(h['x-api-envelope']).toBe('legacy');
  }
});

test('the content security policy reaches the browser and the page still runs under it', async ({ page }) => {
  const res = await page.goto('/');
  const csp = res.headers()['content-security-policy'] || '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await signIn(page);
  expect(errors.filter(e => /Content Security Policy/i.test(e))).toEqual([]);
});

test('no page scrolls sideways at a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await signIn(page);
  for (const id of ['dashboard', 'partc-book', 'desk', 'gcf']) {
    /* At a phone width the sidebar is off-canvas; the shell's own router is
       the way a tap on the mobile navigation reaches a page. */
    await page.evaluate(pageId => window.CARBONIQ_navigateTo(pageId), id);
    await page.waitForTimeout(600);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${id} at 430px`).toBeLessThanOrEqual(430);
  }
});
