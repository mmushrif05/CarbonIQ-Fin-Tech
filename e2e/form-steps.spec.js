/**
 * A sectioned form, driven.
 *
 * The record form was one column of six sections and a person filling it
 * scrolled past all of them to reach Record. It is read a section at a time
 * now, so what has to be true is that every section is reachable, that the
 * rail follows the asset class rather than offering another class's
 * sections, that the button which records is never the thing that goes
 * missing, and that a required field left empty on a section nobody is
 * looking at brings itself back rather than leaving Record doing nothing.
 *
 * Every step here is a press or a keystroke a person makes. Nothing is
 * revealed through the module's own API, because the question is whether the
 * form can be filled by hand.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'sections@bank.lk', name: 'Nimali Silva', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

async function signIn(page, request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await request.post('/v1/pcaf/part-a/starter', { headers: { 'x-api-key': KEY },
    data: { reportingEntity: 'Amana Bank' } });
  await page.goto('/');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

const railOf = (page, form) => page.locator(`${form} .fs-tab .fs-tab-label`);

/* A chip by its exact name. `hasText` is a substring match, and "The
   borrower" is a substring of "How the borrower's emissions are known", so
   the loose form picks two chips and the click is refused. */
const chip = (page, form, label) =>
  page.locator(`${form} .fs-tab .fs-tab-label`)
    .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });

async function openRecordForm(page) {
  await page.evaluate(() => window.CARBONIQ_navigateTo('parta-register'));
  await expect(page.locator('#pr-class')).toBeVisible();
  await page.locator('#pr-record-toggle').click();
  await expect(page.locator('#pr-record')).toBeVisible();
}

test('every section is reachable by hand, and the rail follows the asset class', async ({ page, request }) => {
  await signIn(page, request);
  await openRecordForm(page);

  /* A business loan: the six sections the standard asks for, in order. */
  await expect(railOf(page, '#pr-form')).toHaveText([
    'The borrower',
    'Outstanding at year-end',
    'Company value',
    'How the borrower’s emissions are known',
    'The facility',
    'Climate risk and opportunity',
  ]);
  await expect(page.locator('#pr-form .fs-status')).toHaveText('Section 1 of 6');

  /* Next walks them, and each one puts its own fields on screen. */
  await expect(page.locator('#pr-f-name')).toBeVisible();
  await page.locator('#pr-form .fs-next').click();
  await expect(page.locator('#pr-f-outstanding')).toBeVisible();
  await expect(page.locator('#pr-f-name')).toBeHidden();
  await page.locator('#pr-form .fs-back').click();
  await expect(page.locator('#pr-f-name')).toBeVisible();

  /* A chip opens its own section directly. */
  await chip(page, '#pr-form', 'Company value').click();
  await expect(page.locator('#pr-f-equity')).toBeVisible();

  /* Record belongs to the form, not to its last section: it is there
     whichever section is in hand. */
  await expect(page.locator('#pr-form-submit')).toBeVisible();

  /* A property loan asks different questions, and never the business loan's:
     the rail is the class's own. */
  await page.selectOption('#pr-class', 'commercial-real-estate');
  await expect(railOf(page, '#pr-form')).toContainText(['The borrower']);
  const property = await railOf(page, '#pr-form').allTextContents();
  expect(property).toContain('How the building’s energy is known');
  expect(property).not.toContain('Company value');
  expect(property).not.toContain('How the vehicle’s use is known');

  /* Its leading fields sit above that block's first heading and are part of
     the opening section — they were unreachable when they were not. */
  await expect(page.locator('#pr-f-building-type')).toBeVisible();
});

test('a required field left empty brings its own section back', async ({ page, request }) => {
  await signIn(page, request);
  await openRecordForm(page);

  /* Walk away from the section holding the required field. The gate holds
     Record shut and the checklist names the field wherever you are standing,
     and its line is the way back to it. The browser's own refusal — which it
     reports to the console rather than to the person, and which the module
     answers by opening the offending control's section — is still wired and
     is swept for in tests/form-steps.test.js; it is the path a form without
     a gate takes. */
  await chip(page, '#pr-form', 'Company value').click();
  await expect(page.locator('#pr-f-name')).toBeHidden();
  await expect(page.locator('#pr-form-submit')).toBeDisabled();
  await page.locator('#pr-form .fs-check-row', { hasText: 'Counterparty name' }).click();
  await expect(page.locator('#pr-form .fs-tab.is-on .fs-tab-label')).toHaveText('The borrower');
  await expect(page.locator('#pr-f-name')).toBeVisible();
});

test('a loan is recorded section by section and lands on the book', async ({ page, request }) => {
  await signIn(page, request);
  await openRecordForm(page);

  const name = `Sectioned Borrower ${Date.now()}`;
  await page.fill('#pr-f-name', name);
  await chip(page, '#pr-form', 'Outstanding at year-end').click();
  await page.fill('#pr-f-outstanding', '1000000');
  await chip(page, '#pr-form', 'Company value').click();
  await page.fill('#pr-f-equity', '600000');
  await page.fill('#pr-f-debt', '400000');
  await chip(page, '#pr-form', 'How the borrower\u2019s emissions are known').click();
  await page.fill('#pr-f-s1', '1000');
  await page.fill('#pr-f-s2', '100');
  await page.fill('#pr-f-s3-reason', 'not measured');
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-form-status')).toContainText('Recorded');
  await expect(page.locator('#pr-body')).toContainText(name);
});

test('the page never widens at a phone width, whichever section is open', async ({ page, request }) => {
  await signIn(page, request);
  await page.setViewportSize({ width: 430, height: 900 });
  await openRecordForm(page);
  for (const label of ['The borrower', 'Company value', 'Climate risk and opportunity']) {
    await chip(page, '#pr-form', label).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  }
});

/* The borrower that cannot state its emissions — the largest shape on a Sri
   Lankan book, and the one that used to refuse without saying why. Typing a
   revenue moved the exposure to Option 3a, which attributes by outstanding
   over equity plus debt, so a form with the company value deliberately empty
   was refused for a balance-sheet date it had never been asked for. The
   method is chosen now, and the revenue is only the band check it says it
   is. */
test('a borrower with no figures of its own records on the sector library', async ({ page, request }) => {
  await signIn(page, request);
  await openRecordForm(page);

  const name = `Sector Borrower ${Date.now()}`;
  await page.fill('#pr-f-name', name);
  await page.selectOption('#pr-f-sector-key', 'manufacturing_cement');
  await chip(page, '#pr-form', 'Outstanding at year-end').click();
  await page.fill('#pr-f-outstanding', '1000000');
  await page.fill('#pr-f-revenue', '500000000');
  await chip(page, '#pr-form', 'How the borrower’s emissions are known').click();
  await page.check('#pr-f-known-sector');

  /* The revenue is keyed and the company value is not, which is exactly the
     shape that used to refuse. On the outstanding-alone option it records. */
  await page.check('#pr-f-size-none');
  await expect(page.locator('#pr-sector-path')).toContainText('Option 3b');
  await page.fill('#pr-f-s3-reason', 'the borrower states none');
  await page.locator('#pr-form-submit').click();
  await expect(page.locator('#pr-form-status')).toContainText('Recorded');
  await expect(page.locator('#pr-body')).toContainText(name);
});

/* The gate. A button that is always live answers a press with a refusal from
   the engine, and where the refusal names a clause rather than a field, the
   person pressing it learns nothing. */
test('Record is refused until the checklist is answered, and says how many', async ({ page, request }) => {
  await signIn(page, request);
  await openRecordForm(page);

  const record = page.locator('#pr-form-submit');
  await expect(record).toBeDisabled();
  await expect(record).toContainText('still needed');
  await expect(page.locator('#pr-form .fs-checklist')).toContainText('Before this can be recorded');
  /* The list reads in the order the sections do, so the counterparty leads. */
  await expect(page.locator('#pr-form .fs-check-row').first()).toContainText('Counterparty name');
  await expect(page.locator('#pr-form .fs-check-row', { hasText: 'Outstanding amount at year-end' })).toHaveCount(1);

  /* A line in the list is the way to the field it names. */
  await page.locator('#pr-form .fs-check-row', { hasText: 'Outstanding amount at year-end' }).click();
  await expect(page.locator('#pr-f-outstanding')).toBeVisible();
  await expect(page.locator('#pr-f-outstanding')).toBeFocused();

  await page.fill('#pr-f-outstanding', '1000000');
  /* The company value is one requirement between three fields, because the
     standard accepts the total balance sheet where equity and debt cannot be
     obtained. Answering any one of them answers it. */
  await chip(page, '#pr-form', 'Company value').click();
  await expect(page.locator('#pr-form .fs-check-row', { hasText: 'Company value' })).toHaveCount(1);
  await page.fill('#pr-f-assets', '5000000');
  await chip(page, '#pr-form', 'How the borrower’s emissions are known').click();
  await page.fill('#pr-f-s1', '1000');
  await page.fill('#pr-f-s2', '100');
  await chip(page, '#pr-form', 'The borrower').click();
  await page.fill('#pr-f-name', `Gated Borrower ${Date.now()}`);

  await expect(record).toBeEnabled();
  await expect(record).toHaveText('Record');
  await expect(page.locator('#pr-form .fs-checklist')).toContainText('Everything this record needs is here');
  await record.click();
  await expect(page.locator('#pr-form-status')).toContainText('Recorded');

  /* The button's words are the page's, not the gate's: the register renames
     it while an exposure is being edited, and the gate appends its count to
     whatever the page last called it. */
  await page.locator('#pr-detail-edit').click();
  await expect(record).toHaveText('Save changes');
  await chip(page, '#pr-form', 'Outstanding at year-end').click();
  await page.fill('#pr-f-outstanding', '');
  await expect(record).toContainText('Save changes — 1 still needed');
});
