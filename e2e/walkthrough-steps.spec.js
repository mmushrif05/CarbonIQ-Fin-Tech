/**
 * The walkthroughs, read one step at a time.
 *
 * Both tracks used to print every step's title, action and note down the
 * page, so a presenter looking for the step they were on scrolled past the
 * six either side of it. Each track is a flow now: one step on screen, a
 * numbered rail naming the rest, Back and Next.
 *
 * The rule that matters is that the rail does not argue with the
 * walkthrough's own state. The walkthrough already knows which step is being
 * presented — the strip on every screen reads it — so the rail follows that.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const KEY = 'ck_test_e2e00000000000000000000000000000';
const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'wtsteps@bank.lk', name: 'Dilini Jayawardena', role: 'admin', orgId: 'ui',
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

const shown = (page, prefix) =>
  page.locator(`#${prefix}-steps .wt-step`).filter({ visible: true });

test('each track is a flow: one step on screen, the rest on the rail', async ({ page, request }) => {
  await signIn(page, request);

  for (const [pageId, prefix, steps] of [['walkthrough', 'wt', 7], ['gcf-walkthrough', 'gwt', 10]]) {
    await page.evaluate((p) => window.CARBONIQ_navigateTo(p), pageId);
    await expect(page.locator(`#${prefix}-steps .fs-tab`)).toHaveCount(steps);
    await expect(page.locator(`#${prefix}-steps .fs-status`)).toHaveText(`Section 1 of ${steps}`);
    await expect(shown(page, prefix)).toHaveCount(1);

    /* Next walks them, Back comes home. */
    await page.locator(`#${prefix}-steps .fs-next`).click();
    await expect(page.locator(`#${prefix}-steps .fs-status`)).toHaveText(`Section 2 of ${steps}`);
    await expect(shown(page, prefix)).toHaveCount(1);
    await page.locator(`#${prefix}-steps .fs-back`).click();
    await expect(page.locator(`#${prefix}-steps .fs-status`)).toHaveText(`Section 1 of ${steps}`);
  }
});

test('the two tracks never share a rail', async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => window.CARBONIQ_navigateTo('walkthrough'));
  await expect(page.locator('#wt-steps .fs-tab')).toHaveCount(7);
  await page.evaluate(() => window.CARBONIQ_navigateTo('gcf-walkthrough'));
  await expect(page.locator('#gwt-steps .fs-tab')).toHaveCount(10);
  /* The bank's rail is still its own seven, not seventeen. */
  await expect(page.locator('#wt-steps .fs-tab')).toHaveCount(7);
});

test('the rail follows the presenter rather than arguing with them', async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => window.CARBONIQ_navigateTo('walkthrough'));
  await expect(page.locator('#wt-steps .fs-tab')).toHaveCount(7);

  await page.locator('#wt-start').click();
  await page.locator('#wt-strip-next').click();
  await page.evaluate(() => window.CARBONIQ_navigateTo('walkthrough'));
  /* The strip moved to step 2, so the rail is on step 2 as well. */
  await expect(page.locator('#wt-steps .fs-tab.is-on .fs-num')).toHaveText('2');
  await page.locator('#wt-end').click();
});

test('neither track widens the page at a phone width', async ({ page, request }) => {
  await signIn(page, request);
  await page.setViewportSize({ width: 430, height: 900 });
  for (const [pageId, prefix] of [['walkthrough', 'wt'], ['gcf-walkthrough', 'gwt']]) {
    await page.evaluate((p) => window.CARBONIQ_navigateTo(p), pageId);
    await expect(page.locator(`#${prefix}-steps .fs-tab`).first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${pageId} widened the page`).toBeLessThanOrEqual(0);
  }
});
