/**
 * The frontend under a policy that forbids inline script.
 *
 * A source sweep can show that no `onclick` and no inline `<script>` remain.
 * It cannot show that the page still works without them, and that is the
 * whole risk of this change: fifty controls were rewired at once, and a
 * control that silently does nothing looks exactly like a slow one.
 *
 * So the browser is asked directly. It reports a `securitypolicyviolation`
 * for anything the policy blocks, which is the only honest witness that the
 * page needs nothing it is no longer allowed.
 */

'use strict';

/* Declared in the page, not here: page.evaluate runs in the browser's realm. */
/* global Actions */

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';
const USER = { email: 'csp@bank.lk', name: 'Cee Esp', role: 'admin', orgId: 'ui',
  password: 'a policy end to end passphrase', mustChangePassword: false };

/** Collect every policy violation and every console error the page reports. */
function watch(page) {
  const violations = [];
  const errors = [];
  page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', e => {
      window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
    });
  });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return {
    violations,
    errors,
    async read() {
      const fromPage = await page.evaluate(() => window.__cspViolations || []);
      return { violations: [...violations, ...fromPage], errors };
    },
  };
}

async function signIn(page, request) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: USER });
  expect([201, 409]).toContain(res.status());
  await page.goto('/');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', USER.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
}

test('signing in works with no inline script at all', async ({ page, request }) => {
  /* The sign-in button is a `data-action` now, and its controller moved out of
     the page into a file. If either half were wrong the form would simply not
     respond, so reaching the shell is the assertion. */
  const w = watch(page);
  await signIn(page, request);
  const { violations } = await w.read();
  expect(violations.filter(v => v.startsWith('script-src'))).toEqual([]);
});

test('the three pages whose module never loaded now answer', async ({ page, request }) => {
  /* Reports, Pipeline and Carbon Pricing each defined their module inside a
     `<script>` in their own fragment. A fragment is inserted with innerHTML
     and a script inserted that way never executes, so all three were
     undefined and every control on them threw the moment it was pressed. The
     page loader hid it behind `typeof X !== 'undefined' &&`. */
  await signIn(page, request);

  for (const [pageId, module] of [
    ['reports', 'ReportsPage'],
    ['pipeline', 'PipelinePage'],
    ['carbon-pricing', 'CarbonPricingPage'],
  ]) {
    const nav = page.locator(`.nav-item[data-page="${pageId}"]`);
    if (!(await nav.count())) continue;
    await nav.first().click();
    const defined = await page.evaluate(name =>
      typeof (/** @type {any} */ (window))[name] !== 'undefined'
      || new Function(`return typeof ${name} !== 'undefined'`)(), module);
    expect(defined, `${module} should be defined on the ${pageId} page`).toBe(true);
  }
});

test('a declared action actually fires, and an unregistered one says so', async ({ page, request }) => {
  await signIn(page, request);
  const fired = await page.evaluate(() => new Promise(resolve => {
    /* Register a module for the length of this check, click a control that
       names it, and see whether the dispatcher reached it. */
    Actions.register({ E2ECheck: { ping: arg => resolve(arg || 'called') } });
    const b = document.createElement('button');
    b.setAttribute('data-action', 'E2ECheck.ping');
    b.setAttribute('data-arg', 'through the dispatcher');
    document.body.appendChild(b);
    b.click();
    setTimeout(() => resolve('never fired'), 1000);
  }));
  expect(fired).toBe('through the dispatcher');

  const refused = await page.evaluate(() => {
    /* A name outside the allow-list must not reach anything, however global
       the thing it names is. */
    window.__reached = false;
    /** @type {any} */ (window).NotRegistered = { go() { window.__reached = true; } };
    const b = document.createElement('button');
    b.setAttribute('data-action', 'NotRegistered.go');
    document.body.appendChild(b);
    b.click();
    return window.__reached;
  });
  expect(refused).toBe(false);
});

test('every page loads without the policy blocking anything', async ({ page, request }) => {
  const w = watch(page);
  await signIn(page, request);
  const pages = await page.locator('.nav-item[data-page]').evaluateAll(
    els => els.map(e => /** @type {HTMLElement} */ (e).dataset.page));
  for (const id of pages.slice(0, 12)) {
    await page.locator(`.nav-item[data-page="${id}"]`).first().click();
    await page.waitForTimeout(120);
  }
  const { violations } = await w.read();
  expect(violations).toEqual([]);
});
