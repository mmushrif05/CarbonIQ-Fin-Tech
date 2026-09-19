/**
 * The Bank Overview when the book cannot be read.
 *
 * "You have recorded nothing" and "your book could not be reached" look the
 * same on a screen that treats a failed read as an empty answer, and they
 * call for opposite actions: the first says load a starter book, the second
 * says fix the connection. The screen used to swallow both year reads and
 * then state, of a bank's own book, that no asset class held anything —
 * while offering to load a starter book over the top of it.
 *
 * Signed in as an organisation of its own, the way a bank's administrator
 * is, because every other journey signs in as the dashboard's organisation.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'unread@amana.lk', name: 'Nimal Fernando', role: 'admin', orgId: 'amana-read',
  password: 'an end to end passphrase', mustChangePassword: false };

test('an unreadable book is never reported as an empty one', async ({ page, request }) => {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await page.goto('/');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();

  /* A bank's own organisation lands on its overview, not the sample dashboard. */
  await page.evaluate(() => window.CARBONIQ_navigateTo('bank'));
  await expect(page.locator('#bk-status')).toContainText('No asset class holds exposures');
  /* Reachable and empty: the starter book is the right offer. */
  await expect(page.locator('#bk-empty')).toBeVisible();

  /* Now the registers answer nothing at all, as a database that has gone
     away would. The screen must not make a claim about the book. */
  await page.route('**/v1/pcaf/part-a/years', (route) => route.abort('failed'));
  await page.route('**/v1/pcaf/part-a/sovereign/years', (route) => route.abort('failed'));
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.evaluate(() => window.CARBONIQ_navigateTo('bank'));

  await expect(page.locator('#bk-status')).toContainText('could not be read');
  await expect(page.locator('#bk-status')).toContainText("Nothing below is this bank's position");
  /* And no starter book over a book that is merely out of reach. */
  await expect(page.locator('#bk-empty')).toBeHidden();

  /* The read is retried on a return visit, so a database that came back does
     not need the whole page reloaded. */
  await page.unroute('**/v1/pcaf/part-a/years');
  await page.unroute('**/v1/pcaf/part-a/sovereign/years');
  await page.evaluate(() => window.CARBONIQ_navigateTo('dashboard'));
  await page.evaluate(() => window.CARBONIQ_navigateTo('bank'));
  await expect(page.locator('#bk-status')).toContainText('No asset class holds exposures');
});
