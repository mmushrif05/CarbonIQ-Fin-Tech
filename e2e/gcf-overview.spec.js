/**
 * The GCF Overview, driven.
 *
 * The source sweep in `tests/gcf-overview-ui.test.js` proves the shape; a
 * sweep cannot prove any of it works. So: sign in, open the screen on the
 * shipped illustrative pipeline, load the starter projects from it, and
 * check what a chief executive would notice — the figures band filled from
 * the portfolio, the drawings rendered, the gap register by owner, a
 * candidate chip opening its panel, the disclosure downloaded as a PDF, and
 * nothing widening the page at a phone width. Then the same screen as a
 * preview visitor, offered no button the server would refuse.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

/* An account and an organisation of this spec's own, so the starter book
   it loads is never the one another journey adopted. */
const USER = { email: 'gcf-overview@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'gcf-overview-e2e',
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
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
}

async function openPage(page) {
  await page.locator('.nav-item[data-page="gcf-overview"]').click();
  await expect(page.locator('#page-gcf-overview')).toBeVisible();
  await expect(page.locator('#go-figures')).toBeVisible({ timeout: 15000 });
}

const noOverflow = async page => {
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });
};

test('the figures are the portfolio’s, the starter loads from the screen, a candidate opens its panel, the file downloads, and the page never widens', async ({ page, request }) => {
  await signIn(page, request);
  await openPage(page);

  /* The illustrative pipeline first, marked as one. */
  await expect(page.locator('#go-sample')).toBeVisible();
  await expect(page.locator('#go-ask')).not.toHaveText('—');
  await expect(page.locator('#go-chart-stages svg[role="img"]')).toHaveCount(1);
  await expect(page.locator('#go-chart-owners svg[role="img"]')).toHaveCount(1);
  await expect(page.locator('#go-chart-results svg[role="img"]')).toHaveCount(1);

  /* The starter, recorded from the screen; the sample banner goes. */
  page.once('dialog', d => d.accept());
  await page.locator('#go-starter').click();
  await expect(page.locator('#go-sample')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#go-status')).toContainText('recorded pipeline');
  await expect(page.locator('#go-projects tbody tr')).toHaveCount(3);

  /* A chip opens the candidate's own panel, with its blocking items. */
  await page.locator('#go-chips .gov-chip').first().click();
  await expect(page.locator('#go-focus')).toBeVisible();
  await expect(page.locator('#go-focus .gov-items li').first()).toBeVisible();

  /* The gap register by owner, and the drawer behind the gate. */
  await expect(page.locator('#go-blocking')).not.toHaveText('—');
  await page.locator('[data-behind="gate"]').first().click();
  await expect(page.locator('#go-behind')).toBeVisible();
  await expect(page.locator('#go-behind-body')).toContainText('Board decision');
  await page.locator('#go-behind-close').click();
  await expect(page.locator('#go-behind')).toBeHidden();

  /* The disclosure, in one press, as a PDF. */
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#go-pdf').click()]);
  expect(download.suggestedFilename()).toBe('gcf-disclosure.pdf');

  await noOverflow(page);
});

test('a preview visitor sees the illustrative pipeline and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible({ timeout: 15000 });
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
  await openPage(page);
  await expect(page.locator('#go-sample')).toBeVisible();
  await expect(page.locator('#go-starter')).toBeHidden();
  await noOverflow(page);
});
