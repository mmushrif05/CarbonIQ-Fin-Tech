#!/usr/bin/env node
/* global document, window, localStorage */
/**
 * Rehearse the GCF walkthrough against a site — docs/DEMO-RUNBOOK.md, "The
 * GCF walkthrough".
 *
 * The same driver as `npm run rehearse`, over the other track: sign in, load
 * the entity's own pipeline from the GCF Overview where the illustrative set
 * is showing, read the readiness rows off the Walkthrough on the GCF track,
 * then run the ten steps across the real screens — the register behind the
 * figure, the intake form filled from the served example and recorded live,
 * the candidate on the cycle, the decision tab with it marked, the assessor's
 * form and the sign-off, the NDA informed, the Concept Note package, the
 * stage moved and dated, and the disclosure downloaded — with a
 * full-page screenshot at every step and a report of what refused.
 *
 *   BASE=https://carboniqfintech.netlify.app EMAIL=you@bank.lk PASSWORD=… \
 *   npm run rehearse:gcf
 *
 * Nothing here computes a figure; every check reads what a screen printed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE || 'http://127.0.0.1:3098';
const OUT = process.env.OUT || path.resolve(process.cwd(), `rehearsal-gcf-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = process.env.EMAIL || '';
const PASSWORD = process.env.PASSWORD || '';

const report = { base: BASE, track: 'gcf', startedAt: new Date().toISOString(), steps: [], consoleErrors: [], failedRequests: [], findings: [] };
let shot = 0;
const step = async (name, fn, page) => {
  const t0 = Date.now();
  const entry = { name, ok: false, ms: 0, notes: [] };
  report.steps.push(entry);
  try { await fn(entry); entry.ok = true; }
  catch (err) {
    entry.error = String(err && err.message || err).split('\n').slice(0, 6).join('\n');
    report.findings.push({ step: name, kind: 'failure', detail: entry.error });
  }
  entry.ms = Date.now() - t0;
  if (page) {
    const file = `${String(++shot).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    try { await page.screenshot({ path: path.join(OUT, file), fullPage: true }); entry.screenshot = file; } catch (_) { /* no page */ }
  }
  console.log(`${entry.ok ? 'ok  ' : 'FAIL'} ${String(entry.ms).padStart(6)} ms  ${name}${entry.error ? '\n      ' + entry.error : ''}`);
};

const wait = (page, sel, opts) => page.waitForSelector(sel, { state: 'visible', timeout: 15000, ...opts });
const text = async (page, sel) => (await page.locator(sel).first().textContent() || '').trim();
const expectText = async (page, sel, needle) => {
  await page.locator(sel).first().waitFor({ state: 'visible', timeout: 15000 });
  const deadline = Date.now() + 15000;
  for (;;) {
    const t = await text(page, sel);
    if (t.includes(needle)) return t;
    if (Date.now() > deadline) throw new Error(`${sel} reads "${t.slice(0, 160)}", expected to contain "${needle}"`);
    await page.waitForTimeout(200);
  }
};
const expectClass = async (page, sel, cls) => {
  const deadline = Date.now() + 15000;
  for (;;) {
    const has = await page.locator(sel).first().evaluate((el, c) => el.classList.contains(c), cls).catch(() => false);
    if (has) return;
    if (Date.now() > deadline) throw new Error(`${sel} never carried the class ${cls}`);
    await page.waitForTimeout(200);
  }
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const next = async page => { await page.locator('#wt-strip-next').click(); await page.waitForTimeout(1200); };
const download = async (page, sel) => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator(sel).click()]);
  const file = path.join(OUT, d.suggestedFilename());
  await d.saveAs(file);
  return { name: d.suggestedFilename(), bytes: fs.statSync(file).size };
};

if (!EMAIL || !PASSWORD) {
  console.error('EMAIL and PASSWORD name the administrator account to sign in as; BASE the site (default http://127.0.0.1:3098).');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('requestfailed', r => report.failedRequests.push({ status: 'failed', url: r.url().slice(0, 160), method: r.method(), reason: r.failure() && r.failure().errorText }));
  page.on('response', r => { if (r.status() >= 400) report.failedRequests.push({ status: r.status(), url: r.url().replace(BASE, ''), method: r.request().method() }); });

  await step('Before the day 1 · sign in', async e => {
    await page.goto(BASE + '/');
    await wait(page, '#login-screen');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.locator('#login-btn').click();
    await wait(page, '#sidebar');
    await page.evaluate(() => { localStorage.removeItem('carboniq.walkthrough'); });
    e.notes.push(`Signed in as ${EMAIL}`);
  }, page);

  await step('Before the day 2 · the entity’s own pipeline', async e => {
    await page.locator('.nav-item[data-page="gcf-overview"]').click();
    await wait(page, '#go-figures');
    const sample = await page.locator('#go-sample').isVisible();
    if (sample) {
      page.once('dialog', d => d.accept());
      await page.locator('#go-starter').click();
      await page.locator('#go-sample').waitFor({ state: 'hidden', timeout: 15000 });
      e.notes.push('Starter projects loaded from the overview');
    } else e.notes.push('The organisation already holds candidates; nothing loaded');
    e.notes.push(`Status: ${await text(page, '#go-status')}`);
    e.notes.push(`Entity: ${await text(page, '#go-entity')} — ${await text(page, '#go-subtitle')}`);
  }, page);

  await step('Before the day 4 · readiness on the GCF track', async e => {
    await page.locator('.nav-item[data-page="gcf-walkthrough"]').click();
    await expectText(page, '#gwt-steps-title', 'ten steps');
    await wait(page, '#gwt-readiness-rows tr');
    const rows = await page.locator('#gwt-readiness-rows tr').evaluateAll(trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).slice(0, 3).map(td => td.textContent.trim()).join(' · ')));
    e.notes.push(...rows);
  }, page);

  await step('Step 1 · where we stand', async e => {
    await page.locator('#gwt-start').click();
    await wait(page, '#page-gcf-overview');
    await expectText(page, '#wt-strip-n', 'Step 1 of 10');
    await wait(page, '#go-figures');
    e.notes.push(`GCF ask ${await text(page, '#go-ask')} · gate ${await text(page, '#go-gate')} · blocking ${await text(page, '#go-blocking')} · signed ${await text(page, '#go-signed')}`);
    e.signedBefore = await text(page, '#go-signed');
  }, page);

  await step('Step 2 · what is blocking, and who holds the key', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 2 of 10');
    await expectText(page, '#go-behind-title', 'Behind the register');
    e.notes.push(`Drawer: ${(await text(page, '#go-behind-body')).slice(0, 200)}`);
  }, page);

  await step('Step 3 · a candidate comes in', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 3 of 10');
    await wait(page, '#gcfPanel-intake');
    await page.waitForFunction(() => (document.getElementById('gcfI-code') || {}).value === 'DFCC-EX', null, { timeout: 15000 });
    await expectClass(page, '#gcfIntakeSave', 'wt-cue');
    e.notes.push(`Form: ${await page.locator('#gcfI-name').inputValue()} · lifetime ${await page.locator('#gcfI-lifetime').inputValue()} (${await page.locator('#gcfI-lifetime-tier').inputValue()})`);
    await page.locator('#gcfIntakeSave').click();
    await wait(page, '#gcfProject');
    e.notes.push(`Recorded: ${await text(page, '#gcfProjectTitle')}`);
  }, page);

  await step('Step 4 · on the cycle', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 4 of 10');
    await wait(page, '#gcfProject');
    e.notes.push(`${await text(page, '#gcfProjectTitle')} — ${await text(page, '#gcfProjectStageLine')}`);
    e.notes.push(`Readiness: ${await text(page, '#gcfProjectReadyPct')}`);
  }, page);

  await step('Step 5 · screened and structured', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 5 of 10');
    await wait(page, '#gcfPanel-decision');
    await wait(page, '#gcfPanel-decision .gcf-focus');
    e.notes.push(`Marked on the decision tab: ${(await text(page, '#gcfPanel-decision .gcf-focus')).slice(0, 120)}`);
  }, page);

  await step('Step 6 · assessed and signed', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 6 of 10');
    await wait(page, '#gcfProject');
    await expectClass(page, '#gcfValStart', 'wt-cue');
    await page.locator('#gcfValStart').click();
    await expectText(page, '#gcfValidationState', 'Under review');
    await page.waitForLoadState('networkidle');
    await page.selectOption('[data-rate="impactPotential"]', 'strong');
    await page.selectOption('[data-rate="countryOwnership"]', 'adequate');
    await page.selectOption('#gcfValRec', 'recommend');
    await page.locator('#gcfValValidate').click();
    await expectText(page, '#gcfValidationState', 'Validated');
    e.notes.push(await text(page, '#gcfValidationState'));
    const d = await download(page, '#gcfValidationDownload [data-report="pdf"]');
    e.notes.push(`Assessment report: ${d.name}, ${d.bytes} bytes`);
  }, page);

  await step('Step 7 · the NDA is informed', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 7 of 10');
    await wait(page, '#gcfProject');
    await expectClass(page, '#gcfNdaSave', 'wt-cue');
    e.notes.push(`NDA form: ${await page.locator('#gcfNdaStatus').inputValue()} on ${await page.locator('#gcfNdaReq').inputValue()}`);
    await page.locator('#gcfNdaSave').click();
    await page.waitForLoadState('networkidle');
    await expectText(page, '#gcfProjectNda', 'nformed');
    e.notes.push(`Saved: ${(await text(page, '#gcfProjectNda')).slice(0, 160)}`);
  }, page);

  await step('Step 8 · the Concept Note package', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 8 of 10');
    await wait(page, '#gcfPanel-cn');
    await expectClass(page, '#gcfCnPdf', 'wt-cue');
    e.notes.push(`Package: ${(await text(page, '#gcfCnReadiness')).slice(0, 200)}`);
    const d = await download(page, '#gcfCnPdf');
    e.notes.push(`Concept Note package: ${d.name}, ${d.bytes} bytes`);
  }, page);

  await step('Step 9 · submitted — the stage moves, dated', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 9 of 10');
    await wait(page, '#gcfProject');
    await expectClass(page, '#gcfMoveGo', 'wt-cue');
    e.notes.push(`Move: to ${await page.locator('#gcfMoveStage').inputValue()} on ${await page.locator('#gcfMoveAt').inputValue()} — ${await page.locator('#gcfMoveNote').inputValue()}`);
    await page.locator('#gcfMoveGo').click();
    await expectText(page, '#gcfProjectStageLine', 'ubmitted');
    e.notes.push(`Now: ${await text(page, '#gcfProjectStageLine')}`);
  }, page);

  await step('Step 10 · in the file', async e => {
    await next(page);
    await expectText(page, '#wt-strip-n', 'Step 10 of 10');
    await wait(page, '#page-gcf-overview');
    await expectClass(page, '#go-pdf', 'wt-cue');
    await expectText(page, '#go-behind-title', 'Behind the file');
    const signed = await text(page, '#go-signed');
    e.notes.push(`Signed: ${signed} (was ${report.steps.find(s => s.name.startsWith('Step 1')).signedBefore})`);
    const d = await download(page, '#go-pdf');
    e.notes.push(`GCF disclosure: ${d.name}, ${d.bytes} bytes`);
    await expectText(page, '#wt-strip-next', 'Finish');
    await page.locator('#wt-strip-next').click();
    await page.locator('#wt-strip').waitFor({ state: 'hidden', timeout: 5000 });
  }, page);

  await step('Phone width · nothing widens', async e => {
    await page.setViewportSize({ width: 430, height: 900 });
    for (const pg of ['gcf-overview', 'gcf', 'gcf-walkthrough']) {
      await page.locator(`.nav-item[data-page="${pg}"]`).click().catch(() => {});
      await page.waitForTimeout(1200);
      const o = await overflow(page);
      e.notes.push(`${pg}: overflow ${o}px`);
      if (o > 0) report.findings.push({ step: e.name, kind: 'overflow', detail: `${pg} widens by ${o}px at 430px` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }, page);

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nScreenshots and report.json in ${OUT}`);
  console.log(`\n${report.steps.filter(s => s.ok).length}/${report.steps.length} steps ok · ${report.consoleErrors.length} console errors · ${report.failedRequests.length} failed requests`);
  for (const f of report.failedRequests) console.log(`  ${f.status} ${f.method} ${f.url}`);
  for (const c of report.consoleErrors) console.log(`  console: ${c}`);
  await browser.close();
  process.exit(report.steps.every(s => s.ok) ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
