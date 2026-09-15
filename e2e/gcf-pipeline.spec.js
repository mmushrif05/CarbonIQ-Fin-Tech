/**
 * The GCF pipeline, driven.
 *
 * The source sweep in `tests/gcf-ui.test.js` proves the shape; a sweep cannot
 * prove any of it works. So: sign in, open the screen, and check what a bank
 * and the Fund would notice — the ten-stage cycle with every candidate on it,
 * the shipped sample marked as one until it is adopted and not after, a
 * project opening onto its checklist and its next step, a stage move dated
 * into the history with the Fund's service standard projected from it, a fact
 * recorded from the screen and read back, and nothing widening the page at a
 * phone width. Then the same screen as a preview visitor, offered no button
 * the server would refuse.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

/* An account of this spec's own: the limiter counts requests per signed-in
   user, so specs running in parallel on one shared account starve each other. */
const USER = { email: 'gcf@bank.lk', name: 'Ana Perera', role: 'admin', orgId: 'ui',
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
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
}

async function openPage(page) {
  await page.locator('.nav-item[data-page="gcf"]').click();
  await expect(page.locator('#page-gcf')).toBeVisible();
  await expect(page.locator('#gcfRail .gcf-rail-step')).toHaveCount(10);
}

const noOverflow = async page => {
  await page.setViewportSize({ width: 430, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });
};

test('the cycle is on screen, the sample is adopted, a project moves a stage and records a fact, and the page never widens', async ({ page, request }) => {
  await signIn(page, request);
  await openPage(page);

  /* The portfolio over the shipped sample, marked as one. */
  await expect(page.locator('#gcfPoolTable tbody tr.gcf-row')).toHaveCount(5);
  await expect(page.locator('#gcfSubtitle')).toContainText('B.36/10');
  await expect(page.locator('#gcfEnvelope')).toContainText('per project');
  await expect(page.locator('#gcfGate')).toContainText('Eligible');
  await expect(page.locator('#gcfActions li')).toHaveCount(5);
  await noOverflow(page);

  /* Adopt it from the intake tab: the pill goes, the book is the bank's. */
  await page.locator('#gcfTabs [data-panel="intake"]').click();
  await expect(page.locator('#gcfIntakeForm')).toBeVisible();
  const sampleBefore = await page.locator('#gcfSampleBanner').isVisible();
  if (sampleBefore) {
    await page.locator('#gcfAdopt').click();
    await expect(page.locator('#gcfIntakeHint')).toContainText('adopted');
  }
  await expect(page.locator('#gcfPanel-pipeline')).toBeVisible();
  await expect(page.locator('#gcfSampleBanner')).toBeHidden();
  await expect(page.locator('#gcfPoolTable tbody tr.gcf-row')).toHaveCount(5);

  /* Open a project: its checklist, its next step, its move control. */
  await page.locator('#gcfPoolTable tr[data-open="gcf_p1_jaffna_solar"]').click();
  await expect(page.locator('#gcfProject')).toBeVisible();
  await expect(page.locator('#gcfProjectTitle')).toContainText('GCF-P1');
  expect(await page.locator('#gcfProjectChecklist .gcf-check').count()).toBeGreaterThan(5);
  await expect(page.locator('#gcfProjectCriteria .gcf-crit')).toHaveCount(6);
  await expect(page.locator('#gcfProjectNext')).toContainText('Submit the concept note');
  await noOverflow(page);

  /* Move it to "concept note submitted", dated: the history holds the date
     and the Fund's six-week feedback is projected from it, marked projected. */
  await page.selectOption('#gcfMoveStage', 'cn_submitted');
  await page.fill('#gcfMoveAt', '2026-09-01');
  await page.fill('#gcfMoveNote', 'Submitted through the NDA');
  await page.locator('#gcfMoveGo').click();
  await expect(page.locator('#gcfProjectHint')).toContainText('Moved to');
  await expect(page.locator('#gcfProjectSteps .gcf-step.current')).toContainText('Concept note submitted');
  await expect(page.locator('#gcfProjectSteps')).toContainText('2026-09-01');
  await expect(page.locator('#gcfProjectTimeline')).toContainText('projected');
  await expect(page.locator('#gcfProjectTimeline')).toContainText('2026-10-13');

  /* Record the no-objection from the screen and read it back. */
  await page.selectOption('#gcfNdaStatus', 'issued');
  await page.fill('#gcfNdaRef', 'NDA/2026/14');
  await page.fill('#gcfExName', 'Jaffna Solar Co-operative');
  await page.locator('#gcfNdaSave').click();
  await expect(page.locator('#gcfProjectHint')).toHaveText('Saved.');
  await expect(page.locator('#gcfProjectNda')).toContainText('issued');
  await expect(page.locator('#gcfProjectNda')).toContainText('Jaffna Solar Co-operative');

  /* Back to the board: the row carries the new stage. */
  await page.locator('#gcfProjectBack').click();
  await expect(page.locator('#gcfPortfolio')).toBeVisible();
  await expect(page.locator('#gcfPoolTable tr[data-open="gcf_p1_jaffna_solar"]')).toContainText('Concept note submitted');
  await expect(page.locator('#gcfPoolTable tr[data-open="gcf_p1_jaffna_solar"]')).toContainText('issued');
  await expect(page.locator('#gcfUpcoming')).toContainText('projected');

  /* The pipeline downloads as a CSV. */
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#gcfBoardCsv').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gcf-pipeline-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('an assessor validates a project, downloads the report, and returns it to the sponsor', async ({ page, request }) => {
  await signIn(page, request);
  await openPage(page);

  /* Adopt the sample so there is a recorded project to validate. */
  await page.locator('#gcfTabs [data-panel="intake"]').click();
  await expect(page.locator('#gcfIntakeForm')).toBeVisible();
  if (await page.locator('#gcfSampleBanner').isVisible()) {
    await page.locator('#gcfAdopt').click();
    await expect(page.locator('#gcfIntakeHint')).toContainText('adopted');
  }
  await expect(page.locator('#gcfSampleBanner')).toBeHidden();

  /* Back to the board (the adopt may have been done by an earlier journey, in
     which case the panel is still the intake tab). */
  await page.locator('#gcfTabs [data-panel="pipeline"]').click();
  await expect(page.locator('#gcfPanel-pipeline')).toBeVisible();

  /* Open a recorded project; its validation panel reads as a draft. */
  await page.locator('#gcfPoolTable tr[data-open="gcf_p1_jaffna_solar"]').click();
  await expect(page.locator('#gcfProject')).toBeVisible();
  await expect(page.locator('#gcfValidationState')).toContainText('Draft');

  /* Start the review, then rate a criterion, recommend with conditions and
     sign off — the panel reloads between steps, so wait on the state text. */
  await page.locator('#gcfValStart').click();
  await expect(page.locator('#gcfValidationState')).toContainText('Under review');

  await page.selectOption('[data-rate="impactPotential"]', 'strong');
  await page.selectOption('[data-rate="paradigmShift"]', 'weak');
  await page.selectOption('#gcfValRec', 'recommend_with_conditions');
  await page.locator('#gcfValValidate').click();
  await expect(page.locator('#gcfValidationState')).toContainText('Validated');
  await expect(page.locator('#gcfValidationState')).toContainText('Recommend with conditions');
  await noOverflow(page);

  /* The assessment report downloads as a PDF. */
  const [reportPdf] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#gcfValidationDownload [data-report="pdf"]').click(),
  ]);
  expect(reportPdf.suggestedFilename()).toMatch(/^gcf-assessment-.*\.pdf$/);

  /* The return block is live now: a gap list and a return control. Return to
     the sponsor and the comparison appears. */
  await expect(page.locator('#gcfReturnBlock')).toBeVisible();
  expect(await page.locator('#gcfReturnGaps .gcf-gaps li').count()).toBeGreaterThan(0);
  await page.locator('#gcfReturnDo').click();
  await expect(page.locator('#gcfReturnComparison')).toContainText('Since the return of');

  /* The return letter downloads as a PDF. */
  const [letterPdf] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#gcfReturnActions [data-letter="pdf"]').click(),
  ]);
  expect(letterPdf.suggestedFilename()).toMatch(/^gcf-return-letter-.*\.pdf$/);
  await noOverflow(page);
});

test('a preview visitor sees the sample pipeline and is offered nothing the server would refuse', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-preview')).toBeVisible();
  await page.fill('#preview-email', `preview.${Date.now()}@bank.lk`);
  await page.locator('#preview-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });

  await openPage(page);
  await expect(page.locator('#gcfSampleBanner')).toBeVisible();
  await expect(page.locator('#gcfPoolTable tbody tr.gcf-row')).toHaveCount(5);

  await page.locator('#gcfPoolTable tr[data-open="gcf_p4_mangrove_coast"]').click();
  await expect(page.locator('#gcfProject')).toBeVisible();
  await expect(page.locator('#gcfProjectCriteria .gcf-crit')).toHaveCount(6);
  await expect(page.locator('#gcfMoveGo')).toHaveCount(0);
  await expect(page.locator('#gcfNdaSave')).toHaveCount(0);
  await expect(page.locator('#gcfProjectAdmin')).toBeHidden();
  await expect(page.locator('#gcfProjectMove')).toContainText('Illustrative record');

  const refused = await page.request.patch('/v1/gcf/pipeline/gcf_p4_mangrove_coast', { data: { name: 'x' } });
  expect([401, 403]).toContain(refused.status());
});
