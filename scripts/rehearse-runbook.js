#!/usr/bin/env node
'use strict';
/* global document, window */
/**
 * The Monday runbook, driven — `npm run rehearse`.
 *
 * Drives docs/DEMO-RUNBOOK.md step by step against a running site, in the
 * order a committee reads the screens: sign in, load the starter book with
 * the bank's name, record the entity's facts, open a row, edit it, send it
 * for review, approve it, reopen it with a reason, record a property in
 * square feet, open the lineage behind the headline, download the
 * disclosure in all three formats, read the checklist, and check that no
 * page widens at a phone width. Every step records what the screen showed,
 * how long it took and a full-page screenshot; console errors and failed
 * requests are collected for the whole session; the report is written
 * beside the screenshots.
 *
 * It performs the runbook's writes — the starter book, two approvals, one
 * reopen, one recorded property — so run it against the organisation you
 * will demonstrate, once, before the day, and never against a book that is
 * already the real one.
 *
 *   BASE=https://carboniqfintech.netlify.app EMAIL=you@bank.lk PASSWORD=… \
 *   BANK="Legal Name PLC" npm run rehearse
 *
 * PW_CHROMIUM names a local Chromium where Playwright's own is not installed;
 * OUT names the folder for the screenshots and the report (default
 * rehearsal-<date>/, ignored by git).
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE || 'http://127.0.0.1:3098';
const OUT = process.env.OUT || path.resolve(process.cwd(), `rehearsal-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = process.env.EMAIL || '';
const PASSWORD = process.env.PASSWORD || '';
const BANK = process.env.BANK || 'Amana Bank PLC';
const YEAR = '2025';

const report = { base: BASE, startedAt: new Date().toISOString(), steps: [], consoleErrors: [], failedRequests: [], findings: [] };
let shot = 0;
const step = async (name, fn, page) => {
  const t0 = Date.now();
  const entry = { name, ok: false, ms: 0, notes: [] };
  report.steps.push(entry);
  try {
    await fn(entry);
    entry.ok = true;
  } catch (err) {
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
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const api = (page, url, init) => page.evaluate(async ([u, i]) => {
  const r = await window.CARBONIQ_fetch(u, i);
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}, [url, init || undefined]);

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
    e.notes.push(`Sign-in offers: preview card ${await page.locator('#login-preview').isVisible() ? 'shown' : 'hidden'}, bootstrap card ${await page.locator('#login-bootstrap').isVisible() ? 'shown' : 'hidden'}`);
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.locator('#login-btn').click();
    await wait(page, '#sidebar');
    await page.waitForTimeout(1500);
    const landing = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).filter(n => n.classList.contains('active')).map(n => n.dataset.page).join(',') + ' / visible: ' + Array.from(document.querySelectorAll('[id^="page-"]')).filter(p => p.offsetParent !== null).map(p => p.id).join(','));
    e.notes.push(`Landing page after sign-in: ${landing}`);
    e.notes.push(`Sidebar workspace label: "${await text(page, '#nav-workspace')}"`);
  }, page);

  await step('Before the day 2 · load the starter book with the bank\'s name', async e => {
    await page.locator('.nav-item[data-page="bank"]').click();
    await wait(page, '#page-bank');
    await wait(page, '#bk-starter');
    e.notes.push(`Before loading: status "${await text(page, '#bk-status')}"; headline "${await text(page, '#bk-headline')}"`);
    await page.fill('#bk-starter-name', BANK);
    page.once('dialog', d => { e.notes.push(`Confirm dialog: "${d.message()}"`); d.accept(); });
    await page.locator('#bk-starter').click();
    await page.waitForFunction(() => /Starter book loaded|exposure\(s\) across/.test(document.getElementById('bk-status').textContent), null, { timeout: 30000 });
    e.notes.push(`Status: ${await text(page, '#bk-status')}`);
    await expectText(page, '#nav-workspace-entity', BANK);
    e.notes.push(`Sidebar now reads "${await text(page, '#nav-workspace')}"`);
    await wait(page, '#bk-body');
    e.notes.push(`Year selector: ${await page.locator('#bk-year').inputValue()}; headline ${await text(page, '#bk-headline')} ${await text(page, '#bk-headline-basis')}`);
  }, page);

  await step('Refusal · a second press is refused, not doubled', async e => {
    page.once('dialog', d => d.accept());
    await page.locator('#bk-starter').click();
    const s = await expectText(page, '#bk-status', 'already');
    e.notes.push(`Screen says: "${s}"`);
    const tiles = await page.locator('#bk-classes .bank-tile').count();
    e.notes.push(`${tiles} class tiles`);
  }, page);

  await step('Walkthrough 1 · the overview', async e => {
    for (const id of ['bk-headline', 'bk-s3', 'bk-coverage', 'bk-intensity', 'bk-ready', 'bk-approved']) {
      const v = await text(page, '#' + id);
      if (v === '—' || v === '') e.notes.push(`${id} is blank`);
      else e.notes.push(`${id}: ${v} ${(await page.locator(`#${id}-unit`).count()) ? await text(page, `#${id}-unit`) : ''}`);
    }
    for (const id of ['bk-chart-emissions', 'bk-chart-dq', 'bk-ring-coverage', 'bk-ring-approval', 'bk-chart-outstanding', 'bk-chart-intensity']) {
      if (!(await page.locator(`#${id} svg`).count())) throw new Error(`${id} has no drawing`);
    }
    e.notes.push(`Tiles: ${(await page.locator('#bk-classes .bank-tile').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim().slice(0, 60)).join(' | ')}`);
    e.notes.push(`Plan: ${(await text(page, '#bk-plan')).replace(/\s+/g, ' ').slice(0, 200)}`);
    e.notes.push(`Baselines: ${(await text(page, '#bk-baselines')).replace(/\s+/g, ' ').slice(0, 200)}`);
    e.notes.push(`Readiness: ${(await text(page, '#bk-readiness')).replace(/\s+/g, ' ').slice(0, 300)}`);
  }, page);

  await step('Walkthrough 2 · a class in focus', async e => {
    const chips = await page.locator('#bk-chips .bank-chip').allTextContents();
    e.notes.push(`Chips: ${chips.map(c => c.trim()).join(' | ')}`);
    await page.locator('#bk-chips .bank-chip[data-class="business-loans-unlisted-equity"]').click();
    await wait(page, '#bk-focus');
    e.notes.push(`Focus panel: ${(await text(page, '#bk-focus')).replace(/\s+/g, ' ').slice(0, 400)}`);
    if (!(await page.locator('#bk-focus .bank-focus-open').count())) throw new Error('no "Open in the book" control on the focus panel');
  }, page);

  await step('Walkthrough 4 · behind the headline', async e => {
    await page.locator('.bank [data-behind="headline"]').click();
    await wait(page, '#bk-behind');
    await page.waitForFunction(() => !/Reading the document lineage/.test(document.getElementById('bk-behind-body').textContent), null, { timeout: 30000 });
    const body = (await text(page, '#bk-behind-body')).replace(/\s+/g, ' ');
    for (const needle of ['PA-', 'SHA-256', 'baseline', 'Self-declared', 'provisional']) {
      if (!body.toLowerCase().includes(needle.toLowerCase())) e.notes.push(`drawer lacks "${needle}"`);
    }
    e.notes.push(`Drawer title: ${await text(page, '#bk-behind-title')}`);
    e.notes.push(`Drawer: ${body.slice(0, 600)}`);
  }, page);

  await step('Walkthrough 4 · behind coverage and approval', async e => {
    await page.locator('.bank [data-behind="coverage"]').click();
    await page.waitForTimeout(600);
    e.notes.push(`Coverage: ${(await text(page, '#bk-behind-body')).replace(/\s+/g, ' ').slice(0, 300)}`);
    await page.locator('.bank [data-behind="approved"]').click();
    await page.waitForTimeout(600);
    e.notes.push(`Approval: ${(await text(page, '#bk-behind-body')).replace(/\s+/g, ' ').slice(0, 300)}`);
    await page.locator('#bk-behind-close').click();
    await page.locator('#bk-chips .bank-chip[data-class=""]').click();
  }, page);

  await step('Before the day 3 · record the entity\'s facts', async e => {
    await page.locator('.nav-item[data-page="parta-position"]').click();
    await wait(page, '#page-parta-position');
    await wait(page, '#fe-body');
    await page.selectOption('#fe-year', YEAR).catch(() => {});
    await wait(page, '#fe-entity-form');
    const before = await page.locator('#fe-outstanding li, #fe-outstanding tr, #fe-outstanding .fe-item').count();
    e.notes.push(`Outstanding items before: ${before}: ${(await text(page, '#fe-outstanding')).replace(/\s+/g, ' ').slice(0, 400)}`);
    e.notes.push(`Entity name field prefilled: "${await page.locator('#fe-e-name').inputValue()}"`);
    await page.selectOption('#fe-e-approach', 'operational_control');
    await page.fill('#fe-e-fye', '12-31');
    await page.fill('#fe-e-gwp', 'IPCC AR6 GWP100');
    await page.fill('#fe-e-prep-name', 'Sustainability Unit');
    await page.fill('#fe-e-prep-role', 'Head of Sustainability');
    await page.fill('#fe-e-prep-date', '2026-09-21');
    await page.fill('#fe-e-appr-name', 'Chief Executive Officer');
    await page.fill('#fe-e-appr-role', 'CEO');
    await page.fill('#fe-e-appr-date', '2026-09-21');
    await page.locator('#fe-entity-save').click();
    await expectText(page, '#fe-entity-status', 'Recorded');
    await page.waitForTimeout(800);
    const after = await page.locator('#fe-outstanding li, #fe-outstanding tr, #fe-outstanding .fe-item').count();
    e.notes.push(`Outstanding items after: ${after}: ${(await text(page, '#fe-outstanding')).replace(/\s+/g, ' ').slice(0, 400)}`);
    e.notes.push(`Entity view: ${(await text(page, '#fe-entity-view')).replace(/\s+/g, ' ').slice(0, 300)}`);
  }, page);

  await step('Walkthrough 3 · the lending book, a row opens', async e => {
    await page.locator('.nav-item[data-page="parta-register"]').click();
    await wait(page, '#page-parta-register');
    await wait(page, '#pr-class');
    await page.selectOption('#pr-class', 'business-loans-unlisted-equity');
    await page.selectOption('#pr-year', YEAR).catch(() => {});
    await wait(page, '#pr-rows .pr-row');
    const rows = await page.locator('#pr-rows .pr-row').count();
    e.notes.push(`${rows} rows; position ${await text(page, '#pr-s12')} / DQ ${await text(page, '#pr-dq12')} / coverage ${await text(page, '#pr-coverage')}`);
    await page.locator('#pr-rows .pr-row').first().click();
    await wait(page, '#pr-detail');
    e.notes.push(`Detail: ${await text(page, '#pr-detail-title')} — state ${await text(page, '#pr-detail-state')}`);
    const body = (await text(page, '#pr-detail-body')).replace(/\s+/g, ' ');
    for (const needle of ['Option', 'SHA-256', 'Attribution']) if (!body.includes(needle)) e.notes.push(`detail lacks "${needle}"`);
    e.notes.push(`Detail body: ${body.slice(0, 500)}`);
  }, page);

  let editedName = '';
  await step('Walkthrough 3 · edit, the engine reruns', async e => {
    await page.locator('#pr-detail-edit').click();
    await wait(page, '#pr-record');
    editedName = await page.locator('#pr-f-name').inputValue();
    const was = await page.locator('#pr-f-outstanding').inputValue();
    const now = String(Math.round(Number(was) * 1.5));
    await page.fill('#pr-f-outstanding', now);
    e.notes.push(`${editedName}: outstanding ${was} → ${now}`);
    await page.locator('#pr-form-submit').click();
    const s = await expectText(page, '#pr-form-status', 'Saved');
    e.notes.push(s.slice(0, 200));
    await wait(page, '#pr-detail');
    e.notes.push(`State after edit: ${await text(page, '#pr-detail-state')}`);
  }, page);

  await step('Walkthrough 3 · send for review, approve, frozen', async e => {
    await page.locator('#pr-detail-review').click();
    await expectText(page, '#pr-detail-state', 'Under review');
    await page.locator('#pr-detail-approve').click();
    await expectText(page, '#pr-detail-state', 'Approved');
    const editVisible = await page.locator('#pr-detail-edit').isVisible();
    const removeVisible = await page.locator('#pr-detail-remove').isVisible();
    e.notes.push(`Approved: edit ${editVisible ? 'OFFERED (wrong)' : 'hidden'}, remove ${removeVisible ? 'OFFERED (wrong)' : 'hidden'}`);
    const body = (await text(page, '#pr-detail-body')).replace(/\s+/g, ' ');
    const m = body.match(/Approved by [^.·]{0,80}/);
    e.notes.push(m ? m[0] : 'no "Approved by" line');
    /* A second one, so the ring moves. */
    await page.locator('#pr-rows .pr-row').nth(1).click();
    await wait(page, '#pr-detail');
    await page.locator('#pr-detail-review').click();
    await expectText(page, '#pr-detail-state', 'Under review');
    await page.locator('#pr-detail-approve').click();
    await expectText(page, '#pr-detail-state', 'Approved');
    const states = await page.locator('#pr-rows .pr-row .pr-state').allTextContents();
    e.notes.push(`Row states: ${states.join(', ')}`);
  }, page);

  await step('Walkthrough 3 · reopen with a reason', async e => {
    page.once('dialog', d => d.accept('Facility repriced after the year-end audit'));
    await page.locator('#pr-detail-reopen').click();
    await expectText(page, '#pr-detail-state', 'Under review');
    const body = (await text(page, '#pr-detail-body')).replace(/\s+/g, ' ');
    if (!body.includes('Facility repriced')) throw new Error('the reason is not on the trail');
    e.notes.push('Reason printed on the trail');
    /* And a reopen cancelled at the prompt changes nothing. */
    await page.locator('#pr-detail-approve').click();
    await expectText(page, '#pr-detail-state', 'Approved');
    page.once('dialog', d => d.dismiss());
    await page.locator('#pr-detail-reopen').click();
    await page.waitForTimeout(500);
    e.notes.push(`Cancelled reopen leaves state: ${await text(page, '#pr-detail-state')}`);
  }, page);

  await step('Walkthrough 3 · record a property in square feet', async e => {
    await page.selectOption('#pr-class', 'commercial-real-estate');
    await wait(page, '#pr-record-toggle');
    if (await page.locator('#pr-record').isHidden()) await page.locator('#pr-record-toggle').click();
    await wait(page, '[data-class-form="commercial-real-estate mortgages"]');
    await page.fill('#pr-f-name', 'Kollupitiya Office Tower');
    await page.fill('#pr-f-ref', `CRE-REH-${Date.now()}`);
    await page.selectOption('#pr-f-building-type', 'office');
    await page.fill('#pr-f-re-outstanding', '250000000');
    await page.fill('#pr-f-re-value', '900000000');
    await page.fill('#pr-f-area', '48000');
    await page.selectOption('#pr-f-area-unit', 'ft2');
    e.notes.push(`Year selected ${await page.locator('#pr-year').inputValue()}; as-of date defaulted to "${await page.locator('#pr-f-re-asof').inputValue()}"`);
    await page.locator('#pr-form-submit').click();
    const s = await expectText(page, '#pr-form-status', 'Recorded');
    e.notes.push(s.slice(0, 200));
    await wait(page, '#pr-detail');
    const body = (await text(page, '#pr-detail-body')).replace(/\s+/g, ' ');
    for (const needle of ['ft²', '0.09290304', 'Option']) if (!body.includes(needle)) e.notes.push(`detail lacks "${needle}"`);
    e.notes.push(body.slice(0, 300));
  }, page);

  await step('Overview after the book moved', async e => {
    await page.locator('.nav-item[data-page="bank"]').click();
    await wait(page, '#bk-body');
    await page.waitForTimeout(1500);
    e.notes.push(`Approved tile: ${await text(page, '#bk-approved')} ${await text(page, '#bk-approved-unit')}`);
    e.notes.push(`Headline: ${await text(page, '#bk-headline')}; coverage ${await text(page, '#bk-coverage')}`);
    e.notes.push(`Readiness: ${(await text(page, '#bk-readiness')).replace(/\s+/g, ' ').slice(0, 300)}`);
  }, page);

  await step('Walkthrough 5 · the disclosure downloads', async e => {
    for (const [id, ext, magic] of [['bk-pdf', 'pdf', '%PDF-1.4'], ['bk-docx', 'docx', 'PK'], ['bk-csv', 'csv', '']]) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#' + id).click()]);
      const file = path.join(OUT, `disclosure.${ext}`);
      await dl.saveAs(file);
      const buf = fs.readFileSync(file);
      const head = buf.slice(0, 8).toString('latin1');
      if (magic && !head.startsWith(magic)) throw new Error(`${ext} starts with ${JSON.stringify(head)}`);
      const tail = buf.slice(-16).toString('latin1');
      e.notes.push(`${dl.suggestedFilename()}: ${buf.length} bytes${ext === 'pdf' ? (tail.includes('%%EOF') ? ', %%EOF present' : ', NO %%EOF') : ''}`);
      if (ext === 'csv') e.notes.push(`CSV head: ${buf.toString('utf8').split('\n')[0].slice(0, 200)} (${buf.toString('utf8').split('\n').length - 1} rows)`);
      e.notes.push(`Status line: ${await text(page, '#bk-status')}`);
    }
  }, page);

  await step('Walkthrough 5 · the checklist can fail, and says why', async e => {
    const r = await api(page, `/v1/pcaf/part-a/financed-emissions/${YEAR}/disclosure?format=json`);
    if (r.status !== 200) throw new Error(`disclosure JSON ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const rep = r.body.report || r.body;
    const items = (rep.checklist && rep.checklist.items) || [];
    const answered = items.filter(i => i.answer === 'Yes').length;
    e.notes.push(`Checklist: ${answered} of ${items.length} answered Yes`);
    for (const id of ['APR-1', 'INV-1', 'GOV-1', 'COV-2', 'MET-1', 'ASR-2']) {
      const it = items.find(i => i.id === id);
      if (it) e.notes.push(`${id} ${it.answer}: ${(it.justification || '').slice(0, 160)}`);
    }
    e.notes.push(`Cover: ${JSON.stringify({ reportId: rep.cover && rep.cover.reportId, entity: rep.cover && rep.cover.reportingEntity, assurance: rep.cover && rep.cover.assurance && rep.cover.assurance.mode })}`);
    const p = await api(page, `/v1/pcaf/part-a/financed-emissions/${YEAR}`);
    e.notes.push(`Position approval: ${JSON.stringify(p.body.approval)}`);
    e.notes.push(`Outstanding items: ${(p.body.outstandingItems || []).map(x => x.what).join(' · ')}`);
  }, page);

  await step('Phone width · nothing widens', async e => {
    await page.setViewportSize({ width: 430, height: 900 });
    for (const pg of ['bank', 'parta-position', 'parta-register', 'parta-sovereign', 'baselines']) {
      await page.locator(`.nav-item[data-page="${pg}"]`).click().catch(() => {});
      await page.waitForTimeout(1200);
      const o = await overflow(page);
      e.notes.push(`${pg}: overflow ${o}px`);
      if (o > 0) report.findings.push({ step: e.name, kind: 'overflow', detail: `${pg} widens by ${o}px at 430px` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.nav-item[data-page="bank"]').click();
    await page.waitForTimeout(800);
  }, page);

  await step('Sign out and back in · the name and the book survive', async e => {
    await api(page, '/v1/auth/logout', { method: 'POST' });
    await page.reload();
    await wait(page, '#login-screen');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.locator('#login-btn').click();
    await wait(page, '#sidebar');
    await expectText(page, '#nav-workspace-entity', BANK);
    e.notes.push(`Sidebar: "${await text(page, '#nav-workspace')}"`);
    await wait(page, '#bk-body');
    e.notes.push(`Landing headline: ${await text(page, '#bk-headline')}; approved ${await text(page, '#bk-approved')}`);
  }, page);

  report.finishedAt = new Date().toISOString();
  report.totalMs = report.steps.reduce((a, s) => a + s.ms, 0);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nScreenshots and report.json in ${OUT}`);
  console.log(`\n${report.steps.filter(s => s.ok).length}/${report.steps.length} steps ok · ${report.consoleErrors.length} console errors · ${report.failedRequests.length} failed requests`);
  for (const f of report.failedRequests) console.log(`  ${f.status} ${f.method} ${f.url}`);
  for (const c of report.consoleErrors) console.log(`  console: ${c}`);
  await browser.close();
  process.exit(report.steps.every(s => s.ok) ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
