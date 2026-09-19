/**
 * The Walkthrough, driven.
 *
 * Seed a book, sign in, open the Walkthrough: the readiness rows are the
 * position's own facts, including what the bank has stated under SLFRS S2 and
 * how much of its book it has classified. Starting it puts the strip on the
 * overview at step one, and Next follows one loan from the door to the file
 * across the real screens — the file and its index, the record form filled in
 * from the example the API serves and recorded live, a second borrower that
 * does not know its emissions priced on the sector library with the preview
 * shown before Record, the loan open, reviewed and approved live, and the
 * class in focus with the approved count moved.
 * Every step changes the screen and marks the control it asks for; Finish
 * takes the strip away; a reload keeps a walkthrough that is on.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { fillIn, openSectionOf } = require('./helpers/steps');

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
  await expect(page.locator('#wt-steps .wt-step')).toHaveCount(7);
  await expect(page.locator('#wt-strip')).toBeHidden();

  /* Start: the overview, step one — the position. */
  await page.locator('#wt-start').click();
  await expect(page.locator('#page-bank')).toBeVisible();
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 1 of 7');
  /* Presenter mode: the shell's chrome leaves, the page takes the whole
     width, and the rail is a header at the top of the page rather than a
     bar floating over it. Menu brings the sidebar back over the page. */
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  expect((await page.locator('#wt-strip').boundingBox()).y).toBe(0);
  expect((await page.locator('#main').boundingBox()).x).toBe(0);
  await page.locator('#wt-strip-menu').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#wt-strip-menu').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#wt-strip-say-row')).toBeHidden();
  await page.locator('#wt-strip-notes').check();
  await expect(page.locator('#wt-strip-say-row')).toBeVisible();
  await page.selectOption('#bk-year', String(YEAR));
  await expect(page.locator('#bk-headline')).not.toHaveText('—');
  const approvedBefore = await page.locator('#bk-approved').textContent();

  /* Step 2: the file. The same screen, but visibly changed: the index behind
     the file is open and the one press that produces it is marked. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 2 of 7');
  await expect(page.locator('#bk-pdf')).toContainText('SLFRS S2 disclosure');
  await expect(page.locator('#bk-pdf')).toHaveClass(/wt-cue/);
  await expect(page.locator('#bk-behind-title')).toContainText('SLFRS S2');
  await expect(page.locator('#bk-behind-body')).toContainText('S2 §29(a)(vi)');

  /* Step 3: a loan comes in — the record form open on the lending book, every
     field already filled from the example the API serves; the presenter
     presses Record and the engine runs. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 3 of 7');
  await expect(page.locator('#page-parta-register')).toBeVisible();
  await expect(page.locator('#pr-subtitle')).toContainText('Business loans');
  await expect(page.locator('#pr-record')).toBeVisible();
  await expect(page.locator('#pr-f-name')).toHaveValue('Lanka Textiles (Pvt) Ltd');
  /* The client asked for 250 million; the numerator is what is owed at the
     year-end after three quarterly instalments. The facility is the
     commitment, and the preview shows the life of the loan as a projection. */
  await expect(page.locator('#pr-f-fac-committed')).toHaveValue('250000000');
  await expect(page.locator('#pr-f-outstanding')).toHaveValue('212500000');
  await expect(page.locator('#pr-fac-scheduled')).toContainText('212,500,000');
  await expect(page.locator('#pr-preview-body')).toContainText('The life of the loan');
  await expect(page.locator('#pr-preview-body')).toContainText('fully drawn');
  await expect(page.locator('#pr-f-cl-transition')).toHaveValue('vulnerable');
  await expect(page.locator('#pr-form-submit')).toHaveClass(/wt-cue/);
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-form-status')).toContainText('Recorded Lanka Textiles');
  await expect(page.locator('#pr-detail')).toBeVisible();

  /* Step 4: the borrower that does not know its emissions — the form open on
     a second borrower with the sector path chosen, the preview beneath it
     showing Option 3a at score 4 on the held factor and what would raise it,
     before anything is written; then recorded live. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 4 of 7');
  await expect(page.locator('#pr-record')).toBeVisible();
  await expect(page.locator('#pr-f-name')).toHaveValue('Ruhunu Rice Millers (Pvt) Ltd');
  await expect(page.locator('#pr-f-known-sector')).toBeChecked();
  await expect(page.locator('#pr-f-sector-key')).toHaveValue('agriculture_rice');
  await expect(page.locator('#pr-known-reported')).toBeHidden();
  await expect(page.locator('#pr-preview')).toBeVisible();
  await expect(page.locator('#pr-preview-body')).toContainText('Option 3a');
  await expect(page.locator('#pr-preview-body')).toContainText('sector-factors');
  await expect(page.locator('#pr-preview-body')).toContainText('What would raise the score');
  /* With the revenue cleared the same borrower falls to the outstanding alone.
     The revenue sits on the section that asks how the emissions are known. */
  await openSectionOf(page, 'pr-f-revenue');
  await page.fill('#pr-f-revenue', '');
  await expect(page.locator('#pr-preview-body')).toContainText('Option 3b');
  await page.fill('#pr-f-revenue', '1500000000');
  await expect(page.locator('#pr-preview-body')).toContainText('Option 3a');
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-form-status')).toContainText('Recorded Ruhunu Rice Millers');
  await expect(page.locator('#pr-detail')).toBeVisible();

  /* Step 5: what the standard made of it — the loan just recorded, open,
     with the option and the factor set. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 5 of 7');
  await expect(page.locator('#pr-detail')).toBeVisible();
  await expect(page.locator('#pr-detail-title')).toContainText('Ruhunu Rice Millers');
  await expect(page.locator('#pr-detail-body')).toContainText('Option 3a');
  await expect(page.locator('#pr-detail-body')).toContainText('estimated on the sector library');
  await expect(page.locator('#pr-record')).toBeHidden();

  /* Step 6: reviewed, approved, frozen — the controls marked, pressed live. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 6 of 7');
  await expect(page.locator('#pr-detail-review')).toHaveClass(/wt-cue/);
  await page.locator('#pr-detail-review').click();
  await expect(page.locator('#pr-detail-state')).toContainText('Under review');
  await page.locator('#pr-detail-approve').click();
  await expect(page.locator('#pr-detail-state')).toContainText('Approved');
  await expect(page.locator('#pr-detail-edit')).toBeHidden();

  /* A reload keeps the walkthrough on, and presenter mode with it. */
  await page.reload();
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 6 of 7');

  /* Step 7: on the dashboard — the class in focus, the approved count moved;
     Finish ends it. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 7 of 7');
  await expect(page.locator('#page-bank')).toBeVisible();
  await page.selectOption('#bk-year', String(YEAR));
  await expect(page.locator('#bk-focus')).toBeVisible();
  await expect(page.locator('#bk-focus')).toContainText('Business loans');
  await expect(page.locator('#bk-approved')).not.toHaveText(approvedBefore);
  await expect(page.locator('#wt-strip-next')).toHaveText('Finish');
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip')).toBeHidden();
  await expect(page.locator('#sidebar')).toBeVisible();

  /* A phone width: the page body never scrolls sideways. */
  await page.locator('.nav-item[data-page="walkthrough"]').click();
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
