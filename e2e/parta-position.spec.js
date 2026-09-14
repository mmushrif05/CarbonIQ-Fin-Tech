/**
 * The Financed Emissions screen, driven.
 *
 * The source sweep in `tests/parta-position-ui.test.js` proves the shape; a
 * sweep cannot prove any of it works. So: seed a lending exposure and a
 * sovereign holding through the API the way a bank's integrations would, sign
 * in, open the screen, and check what a reader would notice — both classes on
 * the class table, the outstanding items naming what Chapter 6 still needs,
 * the entity facts recorded from the screen and the list shrinking, the
 * disclosure downloading as a real PDF, and nothing widening the page at a
 * phone width. Then the dashboard band, and the same screen as a preview
 * visitor who is offered no button the server would refuse.
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
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
}

const YEAR = 2033;
const asOf = `${YEAR}-12-31`;

async function seed(request) {
  const h = { 'x-api-key': KEY };
  const a = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: {
    reportingYear: YEAR, instrument: 'business-loan', borrowerListed: false,
    counterparty: { name: `Position Borrower ${Date.now()}`, sector: 'Textiles' },
    outstanding: { amount: 100000, asOf, currency: 'LKR' },
    denominator: { totalEquity: 600000, totalDebt: 400000, asOf, currency: 'LKR' },
    emissions: {
      scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) },
      scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) },
      scope3: { value: 5000, basis: 'reported-unverified', period: String(YEAR) },
    },
  } });
  expect(a.status()).toBe(201);
  const s = await request.post('/v1/pcaf/part-a/sovereign/exposures', { headers: h, data: {
    reportingYear: YEAR, country: 'SG', instrument: 'sovereign-bond',
    exposure: { amount: 1e6, currency: 'USD' }, identifiers: { accountNumber: `E2E-POS-${Date.now()}` },
  } });
  expect(s.status()).toBe(201);
}

async function openPage(page) {
  await page.locator('.nav-item[data-page="parta-position"]').click();
  await expect(page.locator('#page-parta-position')).toBeVisible();
  await expect(page.locator('#fe-year')).toBeVisible();
}

test('both classes are on screen, the entity facts record from the screen, the disclosure downloads, and the page never widens', async ({ page, request }) => {
  await seed(request);
  await signIn(page, request);
  await openPage(page);

  await page.selectOption('#fe-year', String(YEAR));
  await expect(page.locator('#fe-body')).toBeVisible();
  await expect(page.locator('#fe-status')).toContainText(`in FY${YEAR}`);

  /* The class table: §5.2 and §5.9 recorded, the rest named with a reason. */
  const classes = page.locator('#fe-classes tbody tr');
  await expect(classes).toHaveCount(10);
  await expect(page.locator('#fe-classes')).toContainText('Business loans and unlisted equity');
  await expect(page.locator('#fe-classes')).toContainText('Sovereign debt');
  await expect(page.locator('#fe-classes .fe-state-recorded')).toHaveCount(2);
  await expect(page.locator('#fe-headline')).not.toHaveText('—');
  await expect(page.locator('#fe-s3')).not.toHaveText('—');

  /* The outstanding list names the entity facts Chapter 6 still needs. */
  await expect(page.locator('#fe-outstanding')).toContainText('legal name');
  const before = await page.locator('#fe-outstanding .fe-item').count();
  expect(before).toBeGreaterThan(3);

  /* Record the entity from the screen: the list shrinks. */
  await page.fill('#fe-e-name', 'Browser Bank PLC');
  await page.selectOption('#fe-e-approach', 'operational_control');
  await page.fill('#fe-e-fye', '12-31');
  await page.fill('#fe-e-gwp', 'IPCC AR6, 100-year');
  await page.fill('#fe-e-prep-name', 'Ana Perera');
  await page.fill('#fe-e-prep-role', 'Head of Sustainable Finance');
  await page.fill('#fe-e-appr-name', 'Chief Risk Officer');
  await page.locator('#fe-entity-save').click();
  await expect(page.locator('#fe-entity-status')).toHaveText('Recorded.');
  await expect(page.locator('#fe-entity-view')).toContainText('Browser Bank PLC');
  const after = await page.locator('#fe-outstanding .fe-item').count();
  expect(after).toBeLessThan(before);
  await expect(page.locator('#fe-outstanding')).not.toContainText('legal name');

  /* State the book total from the screen: coverage becomes a percentage. */
  await page.fill('#fe-book-total', '10000000');
  await page.fill('#fe-book-by', 'Ana Perera');
  await page.locator('#fe-book-form button[type="submit"]').click();
  await expect(page.locator('#fe-book-status')).toHaveText('Stated.');
  await expect(page.locator('#fe-coverage')).toContainText('%');
  /* The sovereign class is in USD against an LKR book: excluded and named. */
  await expect(page.locator('#fe-book')).toContainText('Excluded from the share');

  /* The disclosure downloads as a real PDF. */
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#fe-pdf').click(),
  ]);
  expect(download.suggestedFilename()).toBe(`part-a-financed-emissions-fy${YEAR}.pdf`);
  const stream = await download.createReadStream();
  const head = await new Promise((resolve, reject) => {
    stream.once('data', chunk => { stream.destroy(); resolve(chunk.slice(0, 5).toString()); });
    stream.once('error', reject);
  });
  expect(head).toBe('%PDF-');
  await expect(page.locator('#fe-status')).toContainText('downloaded');

  /* A phone width: the page body never scrolls sideways. */
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the dashboard carries the latest position in one band, and opens the screen', async ({ page, request }) => {
  await seed(request);
  await signIn(page, request);
  await expect(page.locator('#cap-financed')).toBeVisible();
  await expect(page.locator('#fe-band-year')).toContainText('FY');
  await expect(page.locator('#fe-band-headline')).not.toHaveText('—');
  await page.locator('#fe-band-open').click();
  await expect(page.locator('#page-parta-position')).toBeVisible();
  await expect(page.locator('#fe-body')).toBeVisible();
});

test('a preview visitor sees the sample position and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();

  await openPage(page);
  await expect(page.locator('#fe-body')).toBeVisible();
  /* The sample book installs the lending book and the sovereign book, so
     at least the §5.2 class is recorded and the coverage is a real figure. */
  await expect(page.locator('#fe-classes .fe-state-recorded').first()).toBeVisible();
  await expect(page.locator('#fe-classes')).toContainText('Business loans and unlisted equity');
  await expect(page.locator('#fe-coverage')).toContainText('%');

  for (const id of ['fe-entity-form', 'fe-book-form']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await expect(page.locator('#fe-outstanding .fe-item-go')).toHaveCount(0);
  const refused = await page.request.put('/v1/pcaf/part-a/settings', { data: { reportingEntity: 'x' } });
  expect([401, 403]).toContain(refused.status());
});
