/**
 * Where each section stands, on its own chip.
 *
 * The rail said which section you were on. It now also says where each one
 * stands, and the two kinds of problem are kept apart because one mark for
 * both would be wrong half the time:
 *
 *   needs attention   a control the browser refuses — Record will not go
 *                     through until it is fixed
 *   the report will   a figure the engine raised a material finding about —
 *   note this         the record is valid and the report will say so
 *
 * Neither is this module's judgement. The first is the browser's, the second
 * the engine's, matched to the control carrying that figure by the name the
 * engine itself put on the finding.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'marks@bank.lk', name: 'Sanduni Rathnayake', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

const chip = (page, label) => page.locator('#pr-form .fs-tab')
  .filter({ has: page.locator('.fs-tab-label', { hasText: new RegExp(`^${label}$`) }) });

async function openForm(page, request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await request.post('/v1/pcaf/part-a/starter', { headers: { 'x-api-key': KEY },
    data: { reportingEntity: 'Amana Bank' } });
  await page.goto('/');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.evaluate(() => window.CARBONIQ_navigateTo('parta-register'));
  await expect(page.locator('#pr-class')).toBeVisible();
  await page.locator('#pr-record-toggle').click();
  await expect(page.locator('#pr-form .fs-tab').first()).toBeVisible();
}

test('a section answered is marked answered, and the mark carries its words', async ({ page, request }) => {
  await openForm(page, request);
  /* The borrower is the one section holding a field the form insists on, so
     it is "partly answered" until the name is given. */
  await expect(chip(page, 'The borrower')).toHaveAttribute('data-fs-state', 'started');
  await page.fill('#pr-f-name', `Marks ${Date.now()}`);
  await expect(chip(page, 'The borrower')).toHaveAttribute('data-fs-state', 'answered');
  /* Never colour alone: the state is in the button's own label. */
  await expect(chip(page, 'The borrower')).toHaveAttribute('aria-label', /answered/);
});

test('a section nobody has reached carries no mark', async ({ page, request }) => {
  await openForm(page, request);
  await expect(chip(page, 'Company value')).not.toHaveAttribute('data-fs-state', /.+/);
  await chip(page, 'Company value').click();
  await page.fill('#pr-f-equity', '600000');
  await expect(chip(page, 'Company value')).toHaveAttribute('data-fs-state', /answered|started/);
});

test('a control the browser refuses marks its section', async ({ page, request }) => {
  await openForm(page, request);
  await page.fill('#pr-f-name', 'Somebody');
  await expect(chip(page, 'The borrower')).toHaveAttribute('data-fs-state', 'answered');
  await page.fill('#pr-f-name', '');
  await expect(chip(page, 'The borrower')).toHaveAttribute('data-fs-state', 'attention');
  await expect(chip(page, 'The borrower')).toHaveAttribute('aria-label', /needs attention/);
});

test('a figure the engine objects to marks the section holding it', async ({ page, request }) => {
  await openForm(page, request);
  /* A borrower that reports scope 1 and 2 and no scope 3, with no reason
     given: the engine raises a material finding naming `emissions.scope3`,
     and the control carrying that figure says so with data-engine-path. */
  await page.fill('#pr-f-name', `Scope3 ${Date.now()}`);
  await chip(page, 'Outstanding at year-end').click();
  await page.fill('#pr-f-outstanding', '1000000');
  await chip(page, 'Company value').click();
  await page.fill('#pr-f-equity', '600000');
  await page.fill('#pr-f-debt', '400000');
  await chip(page, 'How the borrower’s emissions are known').click();
  await page.fill('#pr-f-s1', '1000');
  await page.fill('#pr-f-s2', '100');
  /* The engine has to have answered before the rail can carry its finding. */
  await expect(page.locator('#pr-preview')).toBeVisible();
  const emissions = chip(page, 'How the borrower’s emissions are known');
  await expect(emissions).toHaveAttribute('data-fs-state', 'noted');
  await expect(emissions).toHaveAttribute('aria-label', /the report will note this/);

  /* It is a note, not an error: the record is valid and Record is offered. */
  await expect(page.locator('#pr-form-submit')).toBeVisible();

  /* And it is the section holding that figure, not the whole rail: the
     facility carries nothing the engine objected to. */
  await expect(chip(page, 'The facility')).not.toHaveAttribute('data-fs-state', 'noted');

  /* SCOPE_3_NOT_REPORTED is the finding that can never be cleared — the
     reason is its remedy's content, not a way to remove it — which is why
     it is a note rather than something asking to be fixed. */
  await page.fill('#pr-f-s3-reason', 'The borrower does not measure its scope 3.');
  await expect(emissions).toHaveAttribute('data-fs-state', 'noted');
});
