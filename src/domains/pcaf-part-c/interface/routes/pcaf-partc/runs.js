/**
 * A run that pauses for the client: start, resume, history.
 */

'use strict';

const { Router } = require('express');

const { fallback } = require('../../../../../platform/observability/logger');
const authenticate   = require('../../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../../platform/http/pagination');
const { doc } = require('../../../../../platform/http/openapi-hints');
const validate     = require('../../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const { runPartC }        = require('../../../domain');
const { buildRegisters }  = require('../../../application/partc-registers');
const { buildForm, formAnswersToEngineInput } = require('../../../agents/form');
const runStore            = require('../../../application/partc-run-store');
const { recordLearnings } = require('../../../application/learning-store');
const {
  createPartCRun, addStep, generatePartCRunId, isAwaitingInputs,
  PARTC_STATUS, PARTC_STEP_TYPES
} = require('../../../../../shared/models/partc-run');
const {
  startRunRequestSchema, resumeRunRequestSchema
} = require('../../schemas/pcaf-partc');
const { _publicRegisters, _shapeResult } = require('./shared');

const router = Router();

// ---------------------------------------------------------------------------
// POST /runs/start — begin a run and pause for client input
//
// This is the pause point that makes the flow agentic rather than batch: the
// documents have been read and mapped, the form is built and gated, and the
// run now waits for the client. It may wait across sessions.
// ---------------------------------------------------------------------------
router.post('/runs/start', authenticate, defaultLimiter,
  validate({ body: startRunRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.orgId;
      const runId = generatePartCRunId();

      const form = buildForm({
        policy:    req.body.policy,
        materials: req.body.materials,
        prefill:   req.body.prefill
      });

      const run = createPartCRun({ runId, orgId, projectName: req.body.projectName });
      run.policy          = req.body.policy;
      run.materials       = req.body.materials;
      run.demolitionItems = req.body.demolitionItems;
      run.form            = form;
      run.context         = req.body.context;
      run.status          = PARTC_STATUS.AWAITING_INPUTS;

      addStep(run, {
        type: PARTC_STEP_TYPES.FORM,
        summary: `Form built for a ${form.policyType || 'unclassified'} policy — ` +
                 `${form.summary.fieldsToAnswer} fields to answer, ` +
                 `${form.summary.hiddenSections} section(s) hidden by the policy gate.`
      });

      const { durable } = await runStore.saveRun(orgId, run);

      res.status(201).json({
        runId,
        status: run.status,
        projectName: run.projectName,
        form,
        durable,
        next: `POST /v1/pcaf/part-c/runs/${runId}/resume with the completed answers`,
        ...(durable ? {} : { warning: 'Firebase is not configured — this run is held in memory only and will not survive a restart.' })
      });
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /runs/:runId/resume — the client has answered; compute and complete
// ---------------------------------------------------------------------------
router.post('/runs/:runId/resume', authenticate, defaultLimiter,
  validate({ body: resumeRunRequestSchema }),
  async (req, res, next) => {
    const orgId = req.orgId;
    const { runId } = req.params;
    try {
      const run = await runStore.getRun(orgId, runId);
      if (!run) {
        return res.status(404).json({ error: 'RUN_NOT_FOUND', message: `No Part C run ${runId}.` });
      }
      if (!isAwaitingInputs(run)) {
        return res.status(409).json({
          error: 'RUN_NOT_AWAITING_INPUTS',
          message: `Run ${runId} is "${run.status}", not awaiting client input. A completed run cannot be resumed; start a new one.`,
          status: run.status
        });
      }

      // Client factor overrides apply for this calculation only.
      const overrides = req.body.overrides || {};

      const input = formAnswersToEngineInput({
        policy:          run.policy || {},
        materials:       run.materials || [],
        demolitionItems: run.demolitionItems || [],
        answers:         req.body.answers
      });
      input.hasEPD = req.body.hasEPD;
      /* The overrides go in as an argument and are in force for exactly this
         call; there is no set-and-clear pair to get wrong, and a concurrent
         resume in the same container cannot see them. */
      const result    = runPartC(input, { overrides });
      const registers = buildRegisters(result);

      const learnings = await recordLearnings({
        orgId, runId, result,
        context:   run.context || {},
        materials: run.materials || [],
        overrides
      }).catch(fallback('partc.recordLearnings', null));

      const completedAt = new Date().toISOString();
      const updates = {
        status:      PARTC_STATUS.COMPLETED,
        formAnswers: req.body.answers,
        overrides,
        result:      result.summary,
        registers:   _publicRegisters(registers).badges,
        disclosure:  result.disclosureNote,
        learnings:   learnings ? learnings.counts : null,
        completedAt,
        updatedAt:   completedAt
      };
      await runStore.updateRun(orgId, runId, updates);

      res.json(_shapeResult(result, registers, {
        runId,
        status: PARTC_STATUS.COMPLETED,
        projectName: run.projectName || null,
        learnings: learnings ? learnings.counts : null
      }));
    } catch (err) {
      await runStore.updateRun(orgId, runId, {
        status: PARTC_STATUS.FAILED, error: err.message, updatedAt: new Date().toISOString()
      }).catch(fallback('partc.runs.markFailed'));
      next(err);
    }
  });

// ---------------------------------------------------------------------------
// GET /runs, GET /runs/:runId
// ---------------------------------------------------------------------------
router.get('/runs', authenticate, defaultLimiter, paged(), doc({ summary: 'Recent Part C runs, newest first; twenty without a page' }), async (req, res, next) => {
  try {
    if (req.query.limit === undefined && req.query.cursor === undefined) {
      return res.json({ runs: await runStore.listRuns(req.orgId, 20) });
    }
    sendList(req, res, 'runs', await runStore.listRuns(req.orgId, 500));
  } catch (err) { next(err); }
});

router.get('/runs/:runId', authenticate, defaultLimiter, async (req, res, next) => {
  try {
    const run = await runStore.getRun(req.orgId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND', message: `No Part C run ${req.params.runId}.` });
    res.json({ run });
  } catch (err) { next(err); }
});

module.exports = router;
