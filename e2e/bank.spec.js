/**
 * The Bank Overview, driven.
 *
 * Seed a book through the API the way a bank's integration would, sign in,
 * open the overview: the entity's name and the headline are on screen, a
 * class tile opens the lending book at that class, and nothing widens the
 * page at a phone width. Then the same screen as a preview visitor.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

const USER = { email: 'overview@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
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

/* Its own year: the position journey seeds FY2033 in the same organisation. */
const YEAR = 2034;
const asOf = `${YEAR}-12-31`;

async function seed(request) {
  const h = { 'x-api-key': KEY };
  const loan = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    counterparty: { name: `Overview Borrower ${Date.now()}`, sector: 'Textiles' },
    outstanding: { amount: 100000, asOf, currency: 'LKR' },
    denominator: { totalEquity: 600000, totalDebt: 400000, asOf, currency: 'LKR' },
    emissions: { scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) }, scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) }, scope3AbsentReason: 'not measured' },
  } });
  expect(loan.status()).toBe(201);
  const office = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: {
    assetClass: 'commercial-real-estate', reportingYear: YEAR, counterparty: { name: `Overview Tower ${Date.now()}` },
    buildingType: 'office', exposure: { outstanding: 5000000, currency: 'LKR', asOf }, value: { atOrigination: 20000000 },
    floorArea: { value: 10763.91, unit: 'ft2' },
  } });
  expect(office.status()).toBe(201);
  await request.put('/v1/pcaf/part-a/book', { headers: h, data: { reportingYear: YEAR, totalLoansAndInvestments: 50000000, currency: 'LKR', statedBy: 'Ana' } });
  const entity = await request.put('/v1/pcaf/part-a/settings', { headers: h, data: { reportingEntity: 'Overview Bank PLC' } });
  expect(entity.status()).toBe(200);
}

test('the overview is on screen, a class tile opens the lending book at that class, and the page never widens', async ({ page, request }) => {
  await seed(request);
  await signIn(page, request);
  /* The sidebar group is headed by the bank's own name, read after sign-in. */
  await expect(page.locator('#nav-workspace-entity')).toHaveText('Overview Bank PLC');
  await page.locator('.nav-item[data-page="bank"]').click();
  await expect(page.locator('#page-bank')).toBeVisible();
  await expect(page.locator('#bk-year')).toBeVisible();
  await page.selectOption('#bk-year', String(YEAR));
  await expect(page.locator('#bk-body')).toBeVisible();
  await expect(page.locator('#bk-headline')).not.toHaveText('—');
  await expect(page.locator('#bk-coverage')).toContainText('%');
  await expect(page.locator('#bk-classes .bank-tile[data-class="commercial-real-estate"]')).toBeVisible();
  await expect(page.locator('#bk-plan')).toContainText('Business loans');
  await expect(page.locator('#bk-baselines')).toContainText('baseline');

  await page.locator('#bk-classes .bank-tile[data-class="commercial-real-estate"]').click();
  await expect(page.locator('#page-parta-register')).toBeVisible();
  await expect(page.locator('#pr-subtitle')).toContainText('Commercial real estate');

  await page.locator('.nav-item[data-page="bank"]').click();
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a preview visitor sees the sample position on the overview and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('.nav-item[data-page="bank"]').click();
  await expect(page.locator('#bk-body')).toBeVisible();
  await expect(page.locator('#bk-headline')).not.toHaveText('—');
  await expect(page.locator('#bk-starter')).toBeHidden();
});
