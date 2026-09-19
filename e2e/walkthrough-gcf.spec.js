/**
 * The GCF walkthrough, driven.
 *
 * Load the starter projects from the GCF Overview, open the GCF Walkthrough:
 * the readiness rows are the pipeline's own facts. Starting it puts the
 * strip on the overview at step one — the dashboard over every candidate —
 * and Next follows one candidate, the served example, from the door to the
 * Fund across the real screens: the register behind the figure, the intake
 * form filled from the example and recorded live, the candidate open on the
 * cycle with the board folded, the decision tab with it marked, the
 * assessor's form and the assessment signed off live, the NDA informed and
 * saved, the Concept Note package with its download marked, the stage moved
 * and dated, and the overview with the file's press marked. Finish takes
 * the strip away, and the candidate can be removed to rehearse again.
 */

'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_KEY = 'ck_test_e2eadmin000000000000000000000000';

/* An account and an organisation of this spec's own, so the starter book it
   loads is never one another journey adopted. The journey and the checks
   around it sign in as two people at the one bank: a session is allowed a
   hundred requests a minute, the journey drives ten steps and four writes
   at machine speed, and a reload of the shell beside it is what tipped it
   over — at a presenter's pace the same journey sits well under the line. */
const ORG = 'gcf-walkthrough-e2e';
const USER = { email: 'gcf-walkthrough@bank.lk', name: 'Ana Perera', role: 'admin', orgId: ORG,
  password: 'an end to end passphrase', mustChangePassword: false };
const SECOND = { email: 'gcf-walkthrough-2@bank.lk', name: 'Ruwan Silva', role: 'admin', orgId: ORG,
  password: 'an end to end passphrase', mustChangePassword: false };

test.describe.configure({ mode: 'serial' });

async function signIn(page, request, user = USER) {
  const res = await request.post('/v1/auth/users', { headers: { 'x-api-key': ADMIN_KEY }, data: user });
  expect([201, 409]).toContain(res.status());
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.fill('#login-email', user.email);
  await page.fill('#login-password', user.password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#sidebar')).toBeVisible({ timeout: 15000 });
}

test('the GCF track follows one candidate from the door to the Fund across the real screens', async ({ page, request }) => {
  await signIn(page, request);
  await page.evaluate(() => { localStorage.removeItem('carboniq.walkthrough'); });

  /* The entity's own pipeline first: the starter, loaded from the overview. */
  await page.locator('.nav-item[data-page="gcf-overview"]').click();
  await expect(page.locator('#go-figures')).toBeVisible({ timeout: 15000 });
  if (await page.locator('#go-sample').isVisible()) {
    page.once('dialog', d => d.accept());
    await page.locator('#go-starter').click();
    await expect(page.locator('#go-sample')).toBeHidden({ timeout: 15000 });
  }

  /* The GCF Walkthrough: the readiness rows are the pipeline's, and the
     walkthrough's own candidate is not recorded yet. */
  await page.locator('.nav-item[data-page="gcf-walkthrough"]').click();
  await expect(page.locator('#page-gcf-walkthrough')).toBeVisible();
  await expect(page.locator('#gwt-steps-title')).toContainText('ten steps');
  await expect(page.locator('#gwt-readiness-rows tr')).toHaveCount(8);
  await expect(page.locator('#gwt-readiness-rows')).toContainText('candidate(s) recorded');
  await expect(page.locator('#gwt-readiness-rows')).toContainText('Tea Factory');
  await expect(page.locator('#gwt-readiness-rows')).toContainText('Not yet');
  await expect(page.locator('#gwt-readiness-rows')).toContainText('checklist items answered Yes');
  await expect(page.locator('#gwt-steps .wt-step')).toHaveCount(10);
  await expect(page.locator('#wt-strip')).toBeHidden();

  await expect(page.locator('#gwt-start')).toBeVisible();
  await expect(page.locator('#gwt-end')).toBeHidden();

  /* Step 1: where we stand — the dashboard over every candidate. */
  await page.locator('#gwt-start').click();
  await expect(page.locator('#page-gcf-overview')).toBeVisible();
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 1 of 10');
  await expect(page.locator('#go-ask')).not.toHaveText('—');
  const signedBefore = await page.locator('#go-signed').textContent();

  /* Step 2: the register, open behind the figure. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 2 of 10');
  await expect(page.locator('#go-behind')).toBeVisible();
  await expect(page.locator('#go-behind-title')).toContainText('Behind the register');

  /* Step 3: a candidate comes in — the intake form filled from the served
     example, the record press marked; recorded live. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 3 of 10');
  await expect(page.locator('#page-gcf')).toBeVisible();
  await expect(page.locator('#gcfPanel-intake')).toBeVisible();
  await expect(page.locator('#gcfI-code')).toHaveValue('DFCC-EX', { timeout: 15000 });
  await expect(page.locator('#gcfI-lifetime')).toHaveValue('270000');
  await expect(page.locator('#gcfI-lifetime-tier')).toHaveValue('modelled');
  await expect(page.locator('#gcfIntakeSave')).toHaveClass(/wt-cue/);
  await page.locator('#gcfIntakeSave').click();
  await expect(page.locator('#gcfProject')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#gcfProjectTitle')).toContainText('Tea Factory');

  /* Step 4: on the cycle — that candidate, open on its own, the board folded. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 4 of 10');
  await expect(page.locator('#gcfProject')).toBeVisible();
  await expect(page.locator('#gcfPortfolio')).toBeHidden();
  await expect(page.locator('#gcfProjectTitle')).toContainText('Tea Factory');
  await expect(page.locator('#gcfProjectSteps')).toBeVisible();

  /* Step 5: screened and structured — the decision tab, the candidate marked. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 5 of 10');
  await expect(page.locator('#gcfPanel-decision')).toBeVisible();
  await expect(page.locator('#gcfPanel-decision .gcf-focus').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#gcfPanel-decision .gcf-focus').first()).toContainText('DFCC-EX');
  await expect(page.locator('#gcfFocusChips .is-on')).toContainText('DFCC-EX');

  /* Step 6: assessed and signed — the assessor's form on the same candidate,
     its next control marked; reviewed, rated in words, recommended and
     validated live. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 6 of 10');
  await expect(page.locator('#gcfProject')).toBeVisible();
  await expect(page.locator('#gcfProjectTitle')).toContainText('Tea Factory');
  await expect(page.locator('#gcfValStart')).toHaveClass(/wt-cue/, { timeout: 15000 });
  await page.locator('#gcfValStart').click();
  await expect(page.locator('#gcfValidationState')).toContainText('Under review');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#gcfValValidate')).toBeVisible();
  await page.selectOption('[data-rate="impactPotential"]', 'strong');
  await page.selectOption('#gcfValRec', 'recommend');
  await page.locator('#gcfValValidate').click();
  await expect(page.locator('#gcfValidationState')).toContainText('Validated', { timeout: 15000 });

  /* Step 7: the NDA is informed — the form set, the save marked; saved live. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 7 of 10');
  await expect(page.locator('#gcfProjectTitle')).toContainText('Tea Factory');
  await expect(page.locator('#gcfNdaSave')).toHaveClass(/wt-cue/, { timeout: 15000 });
  await expect(page.locator('#gcfNdaStatus')).toHaveValue('informed');
  await expect(page.locator('#gcfNdaReq')).not.toHaveValue('');
  await page.locator('#gcfNdaSave').click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#gcfProjectNda')).toContainText(/informed/i, { timeout: 15000 });

  /* Step 8: the Concept Note package on the same candidate, its download marked. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 8 of 10');
  await expect(page.locator('#gcfPanel-cn')).toBeVisible();
  await expect(page.locator('#gcfCnProject')).toHaveValue('gcf_dfcc_ex', { timeout: 15000 });
  await expect(page.locator('#gcfCnPdf')).toHaveClass(/wt-cue/);
  await expect(page.locator('#gcfCnExternal')).toBeVisible();

  /* Step 9: submitted — the move control set to the next stage, dated, the
     press marked; recorded live and dated into the history. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 9 of 10');
  await expect(page.locator('#gcfProjectTitle')).toContainText('Tea Factory');
  await expect(page.locator('#gcfMoveGo')).toHaveClass(/wt-cue/, { timeout: 15000 });
  await expect(page.locator('#gcfMoveStage')).toHaveValue('cn_submitted');
  await expect(page.locator('#gcfMoveNote')).not.toHaveValue('');
  await page.locator('#gcfMoveGo').click();
  await expect(page.locator('#gcfProjectStageLine')).toContainText(/submitted/i, { timeout: 15000 });

  /* Step 10: in the file — the overview, the signed count moved, the press marked. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 10 of 10');
  await expect(page.locator('#page-gcf-overview')).toBeVisible();
  await expect(page.locator('#go-pdf')).toHaveClass(/wt-cue/, { timeout: 15000 });
  await expect(page.locator('#go-behind-title')).toContainText('Behind the file');
  await expect(page.locator('#go-signed')).not.toHaveText(signedBefore);
  await expect(page.locator('#wt-strip-next')).toHaveText('Finish');

  /* Finish takes the strip away. */
  await page.locator('#wt-strip-next').click();
  await expect(page.locator('#wt-strip')).toBeHidden();
});

test('a bank walkthrough left running never captures the page, and the candidate can be removed to rehearse again', async ({ page, request }) => {
  await signIn(page, request, SECOND);

  /* A bank walkthrough left running must not capture this page: Start is
     still offered, the strip says the bank's step is elsewhere, and Start
     here begins the GCF track in its place. */
  await page.evaluate(() => localStorage.setItem('carboniq.walkthrough', JSON.stringify({ track: 'financed', step: 2, open: true })));
  await page.reload();
  await page.locator('#sidebar').waitFor({ timeout: 15000 });
  await page.locator('.nav-item[data-page="gcf-walkthrough"]').click();
  await expect(page.locator('#gwt-steps .wt-step')).toHaveCount(10);
  await expect(page.locator('#wt-strip')).toBeVisible();
  await expect(page.locator('#wt-strip-n')).toHaveText('Step 3 of 7');
  await expect(page.locator('#wt-strip-where')).toContainText('Lending Book');
  await expect(page.locator('#gwt-start')).toBeVisible();
  await expect(page.locator('#gwt-end')).toBeHidden();

  /* The candidate the journey recorded reads Recorded on the readiness rows,
     with the removal that rehearses from the door again. */
  await expect(page.locator('#gwt-readiness-rows')).toContainText('Recorded', { timeout: 15000 });
  await expect(page.locator('#gwt-readiness-rows [data-remove]')).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.locator('#gwt-readiness-rows [data-remove]').click();
  await expect(page.locator('#gwt-readiness-rows')).toContainText('Not yet', { timeout: 15000 });
  await page.evaluate(() => { localStorage.removeItem('carboniq.walkthrough'); });
});
