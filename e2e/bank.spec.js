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
    climate: { transitionRisk: { verdict: 'vulnerable', horizon: 'medium' }, physicalRisk: { verdict: 'not_vulnerable', horizon: 'long' },
      opportunity: { verdict: 'not_aligned' } },
  } });
  expect(loan.status()).toBe(201);
  const office = await request.post('/v1/pcaf/part-a/exposures', { headers: h, data: {
    assetClass: 'commercial-real-estate', reportingYear: YEAR, counterparty: { name: `Overview Tower ${Date.now()}` },
    buildingType: 'office', exposure: { outstanding: 5000000, currency: 'LKR', asOf }, value: { atOrigination: 20000000 },
    floorArea: { value: 10763.91, unit: 'ft2' },
  } });
  expect(office.status()).toBe(201);
  await request.put('/v1/pcaf/part-a/book', { headers: h, data: { reportingYear: YEAR, totalLoansAndInvestments: 50000000, currency: 'LKR', statedBy: 'Ana' } });
  const entity = await request.put('/v1/pcaf/part-a/settings', { headers: h, data: {
    reportingEntity: 'Overview Bank PLC',
    /* One pillar stated and the other three not, so the S2 strip on the hero
       shows both states rather than one. */
    /* Wording chosen not to coincide with the illustrative pack, including
       the enum: an answer equal to the pack reads as illustrative, which is
       the mechanism working and would make this assertion about the wrong
       thing. */
    climate: { governance: { body: 'The Board Sustainability Committee of Overview Bank PLC.', frequency: 'half_yearly',
      oversight: 'Set out in that committee’s own terms of reference.', managementRole: 'The Chief Risk Officer, reporting to the committee.' } },
  } });
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
  await expect(page.locator('#bk-approved')).toContainText(' of ');
  await expect(page.locator('#bk-ring-approval svg')).toBeVisible();
  await expect(page.locator('#bk-classes .bank-tile[data-class="commercial-real-estate"]')).toBeVisible();
  await expect(page.locator('#bk-plan')).toContainText('Business loans');
  await expect(page.locator('#bk-baselines')).toContainText('baseline');

  /* The charts are drawn from the position, and a class in focus follows the
     choice into its own panel. */
  await expect(page.locator('#bk-chart-emissions svg')).toBeVisible();
  await expect(page.locator('#bk-chart-dq svg')).toBeVisible();
  await expect(page.locator('#bk-ring-coverage svg')).toBeVisible();
  await page.locator('#bk-chips .bank-chip[data-class="commercial-real-estate"]').click();
  await expect(page.locator('#bk-focus')).toBeVisible();
  await expect(page.locator('#bk-focus')).toContainText('Commercial real estate');
  await page.locator('#bk-chips .bank-chip[data-class=""]').click();
  await expect(page.locator('#bk-focus')).toBeHidden();

  /* Behind the headline: the document's reference and content hash, the factor
     sets, the baselines in force and who stands behind the figures. */
  await page.locator('.bank [data-behind="headline"]').click();
  await expect(page.locator('#bk-behind')).toBeVisible();
  await expect(page.locator('#bk-behind-body')).toContainText('PA-');
  await expect(page.locator('#bk-behind-body')).toContainText('SHA-256');
  await expect(page.locator('#bk-behind-body')).toContainText('baseline');
  await page.locator('#bk-behind-close').click();
  await expect(page.locator('#bk-behind')).toBeHidden();

  /* The SLFRS S2 strip: the four pillars, the two S2 metric views, and the
     index behind the file. The property is deliberately unclassified, so the
     bands show a real unassessed share rather than a book that classifies
     itself. */
  await expect(page.locator('#bk-s2')).toBeVisible();
  await expect(page.locator('#bk-s2-summary')).toContainText('stated by the bank');
  await expect(page.locator('#bk-s2-pillars .bank-s2-pillar[data-pillar="governance"]')).toContainText('Stated by the bank');
  await expect(page.locator('#bk-s2-pillars .bank-s2-pillar[data-pillar="strategy"]')).toContainText('Not stated');
  await expect(page.locator('#bk-chart-climate svg')).toBeVisible();
  await expect(page.locator('#bk-climate')).toContainText('S2 §29(b)');
  await expect(page.locator('#bk-climate')).toContainText('Not yet assessed');
  await expect(page.locator('#bk-chart-industry svg')).toBeVisible();
  await expect(page.locator('#bk-industry')).toContainText('Carbon-related lending');

  await page.locator('.bank [data-behind="s2"]').click();
  await expect(page.locator('#bk-behind-title')).toContainText('SLFRS S2');
  await expect(page.locator('#bk-behind-body')).toContainText('S2 §29(a)(vi)');
  await page.locator('#bk-behind-close').click();

  /* A pillar opens the form that answers it, at that pillar. */
  await page.locator('#bk-s2-pillars .bank-s2-pillar[data-pillar="riskManagement"]').click();
  await expect(page.locator('#page-parta-position')).toBeVisible();
  await expect(page.locator('#fe-cl-tabs .cl-tab.is-on')).toContainText('Risk management');

  await page.locator('.nav-item[data-page="bank"]').click();
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
