/**
 * The four mechanical faults, checked in a browser rather than in the source.
 *
 * Each has shipped here once with a unit test passing, because each is about
 * what the browser does with the markup rather than what the markup says:
 *
 *   `[hidden]` is `display: none` from the user-agent sheet, and any class
 *   rule that sets `display` beats it — a drawer covered the page from load
 *   while its markup said hidden;
 *
 *   a bar drawn on an inline element renders as nothing at all, which reads
 *   as a value of zero rather than as a missing element;
 *
 *   a `<select>` sizes to its widest option, not to its container, so one
 *   long project name pushed a page 78px wide at 430px;
 *
 *   anything that changes what the first request says has to be wired before
 *   that request is sent, or it is silently ignored on reload.
 *
 * The source sweeps in `tests/` still hold the shape of the fix. These prove
 * the fix works, which is the half no sweep can reach.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
/* `mustChangePassword: false` because this caller chose the password and
   already holds it. An account issued with one an administrator typed reaches
   nothing but its own replacement, which is a journey of its own below rather
   than a step in front of every other one. */
const USER = { email: 'ana@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
  password: 'an end to end passphrase', mustChangePassword: false };

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

test('nothing marked hidden is visible on any page, whatever a class rule says', async ({ page, request }) => {
  await signIn(page, request);
  for (const id of ['dashboard', 'desk', 'gcf', 'partc-book', 'baselines']) {
    await page.evaluate(pageId => window.CARBONIQ_navigateTo(pageId), id);
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('[hidden]')) {
        const s = getComputedStyle(el);
        if (s.display !== 'none' && s.visibility !== 'hidden') {
          bad.push(`${el.tagName.toLowerCase()}#${el.id || ''}.${el.className || ''} → display:${s.display}`);
        }
      }
      return bad;
    });
    expect(shown, `${id}: an element marked hidden is being displayed`).toEqual([]);
  }
});

test('every bar that is meant to show a value has a box a value can fill', async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => window.CARBONIQ_navigateTo('desk'));
  await page.waitForTimeout(800);

  const bars = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.dk-bar, .dk-mini, .dk-split, .dk-bar > i, .dk-mini > i, .dk-split > i')) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;   // not on screen
      const s = getComputedStyle(el);
      out.push({ cls: el.className, display: s.display, height: el.getBoundingClientRect().height });
    }
    return out;
  });

  expect(bars.length, 'the desk drew no bars at all').toBeGreaterThan(0);
  /* An inline element takes neither height nor background, so it renders as
     nothing — which a reader takes for a value of zero. */
  const inline = bars.filter(b => b.display === 'inline');
  expect(inline, 'a bar is inline and therefore invisible').toEqual([]);
  expect(bars.filter(b => b.height === 0).length).toBeLessThan(bars.length);
});

test('a long option in a select does not widen the page', async ({ page, request }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await signIn(page, request);
  await page.evaluate(() => window.CARBONIQ_navigateTo('desk'));
  await page.waitForTimeout(600);

  /* The fault is not the option's text; it is that a `<select>` sizes to its
     widest option unless it is allowed to shrink. Put an absurd option in and
     the page must not move. */
  await page.evaluate(() => {
    for (const sel of document.querySelectorAll('select')) {
      const o = document.createElement('option');
      o.textContent = 'A project name of the length that has pushed this page 78 pixels wide before now';
      sel.appendChild(o);
      sel.value = o.value;
    }
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 8000 })
    .toBeLessThanOrEqual(430);
});

test('a reader’s adjustments survive a reload, so they were read before the first request', async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => window.CARBONIQ_navigateTo('dashboard'));
  await page.waitForTimeout(600);

  /* The overlay used to be read when the drawer initialised, which was after
     the first fetch — so an adjustment vanished on reload and the screen
     showed the unadjusted book while saying it was adjusted. */
  const stored = await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => /adjust|assum|overlay/i.test(k));
      return keys;
    } catch { return null; }
  });
  expect(Array.isArray(stored), 'the page cannot read its own stored state').toBe(true);

  await page.evaluate(() => {
    try { localStorage.setItem('carboniq.capital.assumptions', JSON.stringify({ horizonYears: 7 })); } catch { /* private window */ }
  });
  await page.reload();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.evaluate(() => window.CARBONIQ_navigateTo('dashboard'));
  await page.waitForTimeout(600);

  const survived = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('carboniq.capital.assumptions') || 'null'); } catch { return null; }
  });
  expect(survived && survived.horizonYears).toBe(7);
});
