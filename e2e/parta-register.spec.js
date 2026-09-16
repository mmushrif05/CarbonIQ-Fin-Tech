/**
 * The Lending Book, driven.
 *
 * The source sweep in `tests/parta-register-ui.test.js` proves the shape:
 * that the page is wired, that toggles go through [hidden], that the select
 * may shrink, that the year is wired before the first request. What a sweep
 * cannot prove is that any of it works — each of the four mechanical faults
 * this codebase has shipped once passed a sweep on its way out.
 *
 * So: seed a book through the API the way a bank's integration would, sign
 * in, open the screen, and check the things a reader would notice — the
 * position is on screen, an exposure opens with its findings, coverage is a
 * real percentage once the book total is stated, and nothing widens the page
 * at a phone width. Then the same screen as a preview visitor, who sees the
 * sample lending book and is offered no button the server would refuse.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

/* An account of this spec's own. The limiter counts requests per signed-in
   user, so specs running in parallel on one shared account starve each other
   — a 429 on the years list left the select without the seeded year and this
   journey timing out on CI while every step of it was right. */
const USER = { email: 'lending@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
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

const YEAR = 2031;
const asOf = `${YEAR}-12-31`;
const exposure = (name, over = {}) => ({
  reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name, sector: 'Textiles' },
  outstanding: { amount: 100000, asOf, currency: 'LKR' },
  denominator: { totalEquity: 600000, totalDebt: 400000, asOf, currency: 'LKR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) },
    scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) },
    scope3: { value: 5000, basis: 'reported-unverified', period: String(YEAR) },
  },
  ...over,
});

async function seed(request) {
  const h = { 'x-api-key': KEY };
  const a = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: exposure(`Browser Borrower ${Date.now()}`) });
  expect(a.status()).toBe(201);
  const b = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: exposure(`Revolving Borrower ${Date.now()}`, {
    instrument: 'overdraft',
    outstanding: { amount: 50000, averageOutstanding: 200000, asOf, currency: 'LKR' },
  }) });
  expect(b.status()).toBe(201);
  return { plain: await a.json(), revolving: await b.json() };
}

async function openPage(page) {
  await page.locator('.nav-item[data-page="parta-register"]').click();
  await expect(page.locator('#page-parta-register')).toBeVisible();
  await expect(page.locator('#pr-year')).toBeVisible();
}

test('a seeded book is on screen, an exposure opens with its findings, and the page never widens', async ({ page, request }) => {
  const { revolving } = await seed(request);
  await signIn(page, request);
  await openPage(page);

  await page.selectOption('#pr-year', String(YEAR));
  await expect(page.locator('#pr-body')).toBeVisible();
  await expect(page.locator('#pr-status')).toContainText(`in FY${YEAR}`);

  /* The position: figures from the engine, a dash for coverage until the book
     total is stated, and the scale stated beside the score. */
  await expect(page.locator('#pr-s12')).not.toHaveText('—');
  await expect(page.locator('#pr-coverage')).toHaveText('—');
  await expect(page.locator('#pr-weighting-note')).toContainText('1 is the highest quality');

  /* The plan names the footnote 71 finding the overdraft raised. */
  await expect(page.locator('#pr-plan')).toContainText('footnote 71');

  /* Open the revolving exposure: its finding is inline with what clears it. */
  const row = page.locator(`#pr-rows .pr-row[data-id="${revolving.exposure.exposureId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.pr-verdict')).not.toHaveText('clean');
  await row.click();
  await expect(page.locator('#pr-detail')).toBeVisible();
  await expect(page.locator('#pr-detail-body')).toContainText('below the average balance');
  await expect(page.locator('#pr-detail-body')).toContainText('What clears it');
  await expect(page.locator('#pr-detail-body')).toContainText('footnote 71');

  /* State the book total from the screen: coverage becomes a percentage. */
  await page.fill('#pr-book-total', '1000000');
  await page.fill('#pr-book-by', 'Ana Perera');
  await page.locator('#pr-book-form button[type="submit"]').click();
  await expect(page.locator('#pr-book-status')).toHaveText('Stated.');
  await expect(page.locator('#pr-coverage')).toContainText('%');

  /* Recompute from the screen reports what moved — nothing, on the same input. */
  await page.locator('#pr-detail-recompute').click();
  await expect(page.locator('#pr-detail-status')).toContainText('same figures and the same scores');

  /* Edit from the screen: the form opens prefilled, the outstanding is changed,
     the engine reruns and the row carries the new figure. */
  await page.locator('#pr-detail-edit').click();
  await expect(page.locator('#pr-record')).toBeVisible();
  await expect(page.locator('#pr-f-outstanding')).toHaveValue('50000');
  await expect(page.locator('#pr-form-submit')).toHaveText('Save changes');
  await page.fill('#pr-f-outstanding', '75000');
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-form-status')).toContainText('Saved');
  await expect(page.locator('#pr-detail')).toBeVisible();
  await expect(row.locator('td').nth(2)).toContainText('75,000');
  await expect(page.locator('#pr-form-submit')).toHaveText('Record');

  /* A phone width: the page body never scrolls sideways. */
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a property is recorded from the screen in square feet, and the trace shows the conversion the engine ran', async ({ page, request }) => {
  await signIn(page, request);
  await page.locator('.nav-item[data-page="parta-register"]').click();
  await expect(page.locator('#pr-class')).toBeVisible();
  await page.selectOption('#pr-class', 'commercial-real-estate');
  await expect(page.locator('#pr-subtitle')).toContainText('Commercial real estate');
  /* The §5.2 disclosure is §5.2's; it is not offered for a property book. */
  await expect(page.locator('#pr-pdf')).toBeHidden();

  await page.locator('#pr-record-toggle').click();
  await expect(page.locator('[data-class-form="commercial-real-estate mortgages"]')).toBeVisible();
  await expect(page.locator('[data-class-form="business-loans-unlisted-equity"]')).toBeHidden();
  await page.fill('#pr-f-name', 'Colombo Office Tower');
  await page.fill('#pr-f-ref', `CRE-${Date.now()}`);
  await page.selectOption('#pr-f-building-type', 'office');
  await page.fill('#pr-f-re-outstanding', '5000000');
  await page.fill('#pr-f-re-value', '20000000');
  await page.fill('#pr-f-area', '10763.91');
  await page.selectOption('#pr-f-area-unit', 'ft2');
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-detail')).toBeVisible();
  await expect(page.locator('#pr-detail-body')).toContainText('Floor area as keyed');
  await expect(page.locator('#pr-detail-body')).toContainText('ft²');
  await expect(page.locator('#pr-detail-body')).toContainText('× 0.09290304');
  await expect(page.locator('#pr-detail-body')).toContainText('Option 2b');
  await expect(page.locator('#pr-s12')).not.toHaveText('—');

  /* Back on the loan book, the property is not in the count. */
  await page.selectOption('#pr-class', 'business-loans-unlisted-equity');
  await expect(page.locator('#pr-subtitle')).toContainText('Business loans');
  await expect(page.locator('#pr-detail')).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a preview visitor sees the sample lending book and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();

  await openPage(page);
  await expect(page.locator('#pr-body')).toBeVisible();
  /* Six exposures, a stated book total, a real coverage figure. */
  await expect(page.locator('#pr-status')).toContainText('7 exposure(s)');
  await expect(page.locator('#pr-coverage')).toContainText('%');
  await expect(page.locator('#pr-rows .pr-row')).toHaveCount(7);

  /* Every write control is withheld, and the server refuses anyway. */
  for (const id of ['pr-record-toggle', 'pr-book-form']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await page.locator('#pr-rows .pr-row').first().click();
  await expect(page.locator('#pr-detail')).toBeVisible();
  await expect(page.locator('#pr-detail-recompute')).toBeHidden();
  await expect(page.locator('#pr-detail-remove')).toBeHidden();
  const refused = await page.request.post('/v1/pcaf/part-a/exposures', { data: exposure('x') });
  expect([401, 403]).toContain(refused.status());
});
