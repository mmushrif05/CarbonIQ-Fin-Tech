/**
 * The Walkthrough, driven.
 *
 * Seed a book, sign in, open the Walkthrough: the readiness rows are the
 * position's own facts, including what the bank has stated under SLFRS S2 and
 * how much of its book it has classified. Starting it puts the strip on the
 * overview at step one, Next follows all eight steps across the real screens
 * with each one applied — the S2 index, the climate view, the lending book at
 * a class, that class in focus, the lineage drawer — and Finish takes the
 * strip away. A reload keeps a walkthrough that is on.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

const USER = { email: 'walkthrough@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

/* Its own year: the other journeys seed FY2033 and FY2034 in the same organisation. */
const YEAR = 2035;
const asOf = `${YEAR}-12-31`;

async function seed(request) {
  const h = { 'x-api-key': KEY };
  const loan = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    counterparty: { name: `Walkthrough Borrower ${Date.now()}`, sector: 'Textiles' },
    outstanding: { amount: 100000, asOf, currency: 'LKR' },
    denominator: { totalEquity: 600000, totalDebt: 400000, asOf, currency: 'LKR' },
    emissions: { scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) }, scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) }, scope3AbsentReason: 'not measured' },
    climate: { transitionRisk: { verdict: 'vulnerable', horizon: 'medium' }, physicalRisk: { verdict: 'not_vulnerable', horizon: 'long' },
      opportunity: { verdict: 'not_aligned' } },
  } });
  expect(loan.status()).toBe(201);
  await request.put('/v1/pcaf/part-a/book', { headers: h, data: { reportingYear: YEAR, totalLoansAndInvestments: 50000000, currency: 'LKR', statedBy: 'Ana' } });
}

async function signIn(page, request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

test('the readiness rows are the position’s, and the strip follows the steps across the real screens', async ({ page, request }) => {
  await seed(request);
  await signIn(page, request);
  await page.evaluate(() => localStorage.removeItem('carboniq.walkthrough'));
  await page.locator('.nav-item[data-page="walkthrough"]').click();
  await expect(page.locator('#page-walkthrough')).toBeVisible();
  await expect(page.locator('#wt-year')).toBeVisible();
  await page.selectOption('#wt-year', String(YEAR));
  await expect(page.locator('#wt-readiness-rows tr')).toHaveCount(8);
  await expect(page.locator('#wt-readiness-rows')).toContainText('exposure(s) across');
  await expect(page.locator('#wt-readiness-rows')).toContainText('Reference PA-');
  /* The two SLFRS S2 rows, read off the position like every other row. */
  await expect(page.locator('#wt-readiness-rows')).toContainText('stated by the bank');
  await expect(page.locator('#wt-readiness-rows')).toContainText('assessed for transition risk');
  await expect(page.locator('#wt-steps .wt-step')).toHaveCount(8);
  await expect(page.locator('#wt-strip')).toBeHidden();

  /* Start: the overview, step one — the position. */
  await page.locator('#wt-start').click();
  await expect(page.locator('#page-bank')).toBeVisible();
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 1 of 8');
  await expect(page.locator('#wt-strip-say-row')).toBeHidden();
  await page.locator('#wt-strip-notes').check();
  await expect(page.locator('#wt-strip-say-row')).toBeVisible();
  await page.selectOption('#bk-year', String(YEAR));

  /* Step 2: the S2 file is the button on the hero. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 2 of 8');
  await expect(page.locator('#bk-pdf')).toContainText('SLFRS S2 disclosure');

  /* Step 3: what S2 asks — the pillars, and the index behind the file. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 3 of 8');
  await expect(page.locator('#bk-s2-pillars')).toBeVisible();
  await expect(page.locator('#bk-behind-title')).toContainText('SLFRS S2');
  await expect(page.locator('#bk-behind-body')).toContainText('S2 §29(a)(vi)');

  /* Step 4: the climate view, with what is not yet assessed drawn beside it. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 4 of 8');
  await expect(page.locator('#bk-chart-climate svg')).toBeVisible();
  await expect(page.locator('#bk-climate')).toContainText('Not yet assessed');

  /* Step 5: what a loan carries, on the lending book at that class. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 5 of 8');
  await expect(page.locator('#page-parta-register')).toBeVisible();
  await expect(page.locator('#pr-subtitle')).toContainText('Business loans');

  /* Step 6: back on the overview with that class in focus. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 6 of 8');
  await expect(page.locator('#bk-focus')).toBeVisible();
  await expect(page.locator('#bk-focus')).toContainText('Business loans');

  /* Step 7: the lineage behind the headline. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 7 of 8');
  await expect(page.locator('#bk-behind')).toBeVisible();
  await expect(page.locator('#bk-behind-body')).toContainText('SHA-256');

  /* A reload keeps the walkthrough on. */
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 7 of 8');

  /* Step 8: the detail screen; Finish ends it. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 8 of 8');
  await expect(page.locator('#page-parta-position')).toBeVisible();
  await expect(page.locator('#wt-strip-next')).toHaveText('Finish');
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip')).toBeHidden();

  /* A phone width: the page body never scrolls sideways. */
  await page.locator('.nav-item[data-page="walkthrough"]').click();
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
