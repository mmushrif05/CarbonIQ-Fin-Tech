/**
 * The Sovereign Book, driven.
 *
 * The source sweep in `tests/parta-sovereign-ui.test.js` proves the shape; a
 * sweep cannot prove any of it works. So: seed a sovereign book through the API
 * the way a bank's treasury integration would, sign in, open the screen, and
 * check what a reader would notice — the position is on screen, a holding opens
 * with its findings, coverage becomes a percentage once the book total is
 * stated, recompute reports what moved, and nothing widens the page at a phone
 * width. Then the same screen as a preview visitor, who sees the sample
 * sovereign book and is offered no button the server would refuse.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

const USER = { email: 'ana@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

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

const YEAR = 2032;
const holding = (country, ref) => ({
  reportingYear: YEAR, country, instrument: 'sovereign-bond',
  exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: ref },
});

async function seed(request) {
  const h = { 'x-api-key': KEY };
  const sg = await request.post('/v1/pcaf/part-a/sovereign/exposures', { headers: h, data: holding('SG', `E2E-SG-${Date.now()}`) });
  expect(sg.status()).toBe(201);
  const hk = await request.post('/v1/pcaf/part-a/sovereign/exposures', { headers: h, data: holding('HK', `E2E-HK-${Date.now()}`) });
  expect(hk.status()).toBe(201);
  return { sg: await sg.json() };
}

async function openPage(page) {
  await page.locator('.nav-item[data-page="parta-sovereign"]').click();
  await expect(page.locator('#page-parta-sovereign')).toBeVisible();
  await expect(page.locator('#ps-year')).toBeVisible();
}

test('a seeded sovereign book is on screen, a holding opens with its findings, and the page never widens', async ({ page, request }) => {
  const { sg } = await seed(request);
  await signIn(page, request);
  await openPage(page);

  await page.selectOption('#ps-year', String(YEAR));
  await expect(page.locator('#ps-body')).toBeVisible();
  await expect(page.locator('#ps-status')).toContainText(`in FY${YEAR}`);

  /* The position: the engine's figure, a dash for coverage until the book is
     stated, and the scale stated beside the score. */
  await expect(page.locator('#ps-s1-excl')).not.toHaveText('—');
  await expect(page.locator('#ps-coverage')).toHaveText('—');
  await expect(page.locator('#ps-weighting-note')).toContainText('1 is the highest quality');

  /* Open Singapore: the shipped figure is EDGAR 2018 excl-LULUCF only, so it
     raises the emissions-lag and one-sided-LULUCF findings, inline with what
     clears them. */
  const row = page.locator(`#ps-rows .ps-row[data-id="${sg.exposure.exposureId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.ps-verdict')).not.toHaveText('clean');
  await row.click();
  await expect(page.locator('#ps-detail')).toBeVisible();
  await expect(page.locator('#ps-detail-body')).toContainText('What clears it');
  await expect(page.locator('#ps-detail-body')).toContainText('LULUCF');

  /* State the book total from the screen: coverage becomes a percentage. */
  await page.fill('#ps-book-total', '100000000');
  await page.fill('#ps-book-by', 'Ana Perera');
  await page.locator('#ps-book-form button[type="submit"]').click();
  await expect(page.locator('#ps-book-status')).toHaveText('Stated.');
  await expect(page.locator('#ps-coverage')).toContainText('%');

  /* Recompute reports what moved — nothing, on the same input. */
  await page.locator('#ps-detail-recompute').click();
  await expect(page.locator('#ps-detail-status')).toContainText('same figures and the same score');

  /* A phone width: the page body never scrolls sideways. */
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a preview visitor sees the sample sovereign book and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();

  await openPage(page);
  await expect(page.locator('#ps-body')).toBeVisible();
  /* Three sovereign holdings — Singapore, Hong Kong, Sri Lanka. */
  await expect(page.locator('#ps-status')).toContainText('3 holding(s)');
  await expect(page.locator('#ps-rows .ps-row')).toHaveCount(3);

  /* Every write control is withheld, and the server refuses anyway. */
  for (const id of ['ps-record-toggle', 'ps-book-form']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await page.locator('#ps-rows .ps-row').first().click();
  await expect(page.locator('#ps-detail')).toBeVisible();
  await expect(page.locator('#ps-detail-recompute')).toBeHidden();
  await expect(page.locator('#ps-detail-remove')).toBeHidden();
  const refused = await page.request.post('/v1/pcaf/part-a/sovereign/exposures', { data: holding('SG', 'x') });
  expect([401, 403]).toContain(refused.status());
});
