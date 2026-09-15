/**
 * The whole assessor flow, end to end — Phase 1 close-out (Stage 7).
 *
 * One test walks the path a bank actually takes through the assessor product,
 * through the store so it runs on both backends, and asserts the modules agree
 * with one another rather than each passing its own unit test in isolation:
 *
 *   record a project
 *     → the assessor starts a review, rates the criteria, signs off with
 *       conditions
 *     → the assessment report carries that sign-off
 *     → returning to the sponsor snapshots the gap list
 *     → the sponsor strengthens a criterion and resubmits
 *     → the comparison shows the gap resolved
 *
 * A distinctive rating is set once and followed everywhere it is read, so a
 * value that was re-keyed or recomputed somewhere would show.
 */

'use strict';

const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const report = require('../src/domains/gcf/application/assessment-report');
const returnLoop = require('../src/domains/gcf/domain/return-loop');
const { logframe } = require('../src/domains/gcf/domain/logframe');

const ORG = 'ui';
const base = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects[1]));

beforeEach(() => platformStore._resetMemory());

test('an assessor validates, reports, returns and sees a resubmitted gap resolve', async () => {
  // 1. Record the project.
  await gcf.put(ORG, { ...base(), id: 'gcf_journey' }, { by: 'Analyst' });

  // 2. The assessor starts a review and rates two criteria — one weak.
  await gcf.setValidation(ORG, 'gcf_journey', { to: 'under_review' }, { by: 'Assessor A' });
  await gcf.setValidation(ORG, 'gcf_journey', {
    ratings: { impactPotential: { rating: 'strong' }, paradigmShift: { rating: 'weak', note: 'no M&E plan yet' } },
  }, { by: 'Assessor A' });

  // 3. Sign off with conditions.
  const signed = await gcf.setValidation(ORG, 'gcf_journey', {
    to: 'validated', recommendation: 'recommend_with_conditions',
  }, { by: 'Assessor A' });
  expect(signed.validation.state).toBe('validated');
  expect(signed.validation.validatedBy).toBe('Assessor A');

  // 4. The assessment report carries the sign-off and the distinctive rating.
  const rpt = report.assessmentJSON(signed, { logframe: logframe(signed) });
  expect(rpt.validated).toBe(true);
  expect(rpt.recommendation).toBe('recommend_with_conditions');
  expect(rpt.criteria.find(c => c.id === 'paradigmShift').rating).toBe('weak');
  expect(rpt.criteria.find(c => c.id === 'impactPotential').rating).toBe('strong');

  // The weak criterion is a gap the return will carry.
  const preReturn = returnLoop.gaps(signed);
  expect(preReturn.returnable).toBe(true);
  expect(preReturn.items.some(g => g.kind === 'rating' && g.criterionId === 'paradigmShift')).toBe(true);

  // 5. Return to the sponsor — the gap list is snapshotted.
  const returned = await gcf.returnToSponsor(ORG, 'gcf_journey', { by: 'Assessor A' });
  expect(returned.validation.returns).toHaveLength(1);
  const snap = returned.validation.returns[0];
  expect(snap.gaps.some(g => g.criterionId === 'paradigmShift' && g.kind === 'rating')).toBe(true);

  // Right after the return, nothing has changed: the weak-rating gap is outstanding.
  const beforeFix = returnLoop.comparison(returned);
  expect(beforeFix.hasReturn).toBe(true);
  expect(beforeFix.outstanding.some(g => g.criterionId === 'paradigmShift' && g.kind === 'rating')).toBe(true);
  expect(beforeFix.resolved).toEqual([]);

  // 6. The sponsor strengthens the criterion and resubmits. Reopening clears
  //    the sign-off; re-rating paradigmShift strong resolves the gap.
  await gcf.setValidation(ORG, 'gcf_journey', { to: 'under_review', note: 'sponsor resubmitted' }, { by: 'Assessor A' });
  const fixed = await gcf.setValidation(ORG, 'gcf_journey', {
    ratings: { paradigmShift: { rating: 'strong' } },
  }, { by: 'Assessor A' });

  // The returns snapshot survives the lifecycle change, so the comparison holds.
  expect(fixed.validation.returns).toHaveLength(1);

  // 7. The comparison shows the paradigm-shift gap resolved and no longer outstanding.
  const afterFix = returnLoop.comparison(fixed);
  expect(afterFix.resolved.some(g => g.criterionId === 'paradigmShift' && g.kind === 'rating')).toBe(true);
  expect(afterFix.outstanding.some(g => g.criterionId === 'paradigmShift' && g.kind === 'rating')).toBe(false);
});
