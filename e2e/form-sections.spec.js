/**
 * The screens sectioned in phase one, each driven.
 *
 * Four more screens read one section at a time: the Part A engine and the
 * PCAF calculator are forms, and Part C's intake and the Insurance Book are
 * runs of numbered cards down a page. What has to be true is the same for
 * all of them — the rail names the sections a reader can actually reach,
 * one is on screen, Back and Next walk them, and no page scrolls sideways.
 *
 * The Insurance Book earns its own check: its cards are revealed as the work
 * proceeds, so the rail has to follow rather than being drawn once.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'sections2@bank.lk', name: 'Ishara Perera', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

async function signIn(page, request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await page.goto('/');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

const rail = (page, pageId) => page.locator(`#page-${pageId} .fs-tab .fs-tab-label`);

async function open(page, pageId) {
  await page.evaluate((p) => window.CARBONIQ_navigateTo(p), pageId);
  await expect(page.locator(`#page-${pageId} .fs-tab`).first()).toBeVisible();
}

test('the Part A engine is its own fieldsets, and the conditional ones stay off the rail', async ({ page, request }) => {
  await signIn(page, request);
  await open(page, 'pcaf-parta');
  /* Seven fieldsets; generation and the reduction inputs are hidden until the
     shape of the exposure asks for them, so five apply at rest. */
  await expect(rail(page, 'pcaf-parta')).toHaveText([
    'The exposure', 'Attribution', "The project's emissions", 'Scope 3 and removals', 'Data quality',
  ]);
  await expect(page.locator('#page-pcaf-parta .fs-status')).toHaveText('Section 1 of 5');
  await page.locator('#page-pcaf-parta .fs-next').click();
  await expect(page.locator('#page-pcaf-parta .fs-tab.is-on .fs-tab-label')).toHaveText('Attribution');
  await page.locator('#page-pcaf-parta .fs-back').click();
  await expect(page.locator('#page-pcaf-parta .fs-tab.is-on .fs-tab-label')).toHaveText('The exposure');
});

test('the PCAF calculator sections its inputs and leaves the results alone', async ({ page, request }) => {
  await signIn(page, request);
  await open(page, 'pcaf');
  await expect(rail(page, 'pcaf')).toHaveText(['Project finance details', 'Emissions data']);
  /* The results are a panel beside the form, not a step in it. */
  await expect(page.locator('#resultsPanel')).toBeVisible();
  await page.locator('#page-pcaf .fs-next').click();
  await expect(page.locator('#page-pcaf .fs-tab.is-on .fs-tab-label')).toHaveText('Emissions data');
  await expect(page.locator('#resultsPanel')).toBeVisible();
});

test('Part C intake is its five numbered cards, one at a time', async ({ page, request }) => {
  await signIn(page, request);
  await open(page, 'pcaf-partc');
  await expect(rail(page, 'pcaf-partc')).toHaveText([
    'Policy document', 'Bill of quantities', 'Policy', 'Construction stage', 'Use stage',
  ]);
  /* One card on screen: the second is put away until it is asked for. */
  await expect(page.locator('#partcPolicyFile')).toBeVisible();
  await page.locator('#page-pcaf-partc .fs-next').click();
  await expect(page.locator('#partcPolicyFile')).toBeHidden();
});

test('the Insurance Book rail follows the cards the page reveals', async ({ page, request }) => {
  await signIn(page, request);
  await open(page, 'partc-book');
  /* At rest only the two cards a new book can act on. */
  await expect(rail(page, 'partc-book')).toHaveText(['Reporting entity', 'Clients']);

  /* Revealing a card is exactly what the page does once a client exists. */
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#page-partc-book [data-step-group]')) el.hidden = false;
  });
  await expect(rail(page, 'partc-book')).toHaveText([
    'Reporting entity', 'Clients', 'Projects', 'Project detail', 'Bill of quantities', 'Assessments',
  ]);

  /* And it follows back the other way. */
  await page.evaluate(() => { document.querySelector('#bookProjectsCard').hidden = true; });
  await expect(rail(page, 'partc-book')).not.toContainText(['Projects']);
});

test('none of the four scrolls sideways at a phone width', async ({ page, request }) => {
  await signIn(page, request);
  await page.setViewportSize({ width: 430, height: 900 });
  for (const id of ['pcaf-parta', 'pcaf', 'pcaf-partc', 'partc-book']) {
    await open(page, id);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${id} widened the page`).toBeLessThanOrEqual(0);
  }
});
