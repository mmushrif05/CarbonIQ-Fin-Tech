/**
 * CarbonIQ FinTech — PCAF Part C Run Model
 *
 * A Part C assessment is not a single request/response: the agent ingests
 * documents, then PAUSES for the client to complete the form, then resumes
 * and computes. The run record carries that state across the pause so the
 * client can answer via UI, API or later session without losing context.
 *
 * Lifecycle:
 *   created -> ingesting -> awaiting_inputs -> computing -> completed
 *                                \-> failed
 */

'use strict';

const crypto = require('crypto');

const PARTC_STATUS = {
  CREATED:         'created',
  INGESTING:       'ingesting',
  AWAITING_INPUTS: 'awaiting_inputs',
  COMPUTING:       'computing',
  COMPLETED:       'completed',
  FAILED:          'failed'
};

const PARTC_STEP_TYPES = {
  INTAKE:      'intake',
  MAPPING:     'mapping',
  FORM:        'form',
  CALCULATION: 'calculation',
  DISCLOSURE:  'disclosure',
  LEARNING:    'learning'
};

function generatePartCRunId() {
  return `partc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * @param {Object} params
 * @param {string} params.runId
 * @param {string} params.orgId
 * @param {string} [params.projectName]
 * @param {Object} [params.metadata]
 */
function createPartCRun({ runId, orgId, projectName, metadata }) {
  const now = new Date().toISOString();
  return {
    runId:       runId || generatePartCRunId(),
    orgId,
    projectName: projectName || null,
    status:      PARTC_STATUS.CREATED,
    createdAt:   now,
    updatedAt:   now,
    completedAt: null,

    // Populated by the intake and mapping agents
    policy:     null,
    materials:  [],
    demolitionItems: [],

    // The form the client is asked to complete, and their answers
    form:        null,
    formAnswers: null,
    overrides:   {},

    // Populated once the engine runs
    result:      null,
    registers:   null,
    disclosure:  null,
    learnings:   null,

    steps:      [],
    error:      null,
    tokensUsed: { input: 0, output: 0, cacheRead: 0, cacheCreated: 0 }
  };
}

function addStep(run, { type, summary, data }) {
  run.steps.push({
    step: run.steps.length + 1,
    type,
    summary: summary || null,
    data: data || null,
    timestamp: new Date().toISOString()
  });
  run.updatedAt = new Date().toISOString();
  return run;
}

/** True when the run is parked waiting on the client. */
function isAwaitingInputs(run) {
  return run && run.status === PARTC_STATUS.AWAITING_INPUTS;
}

module.exports = {
  PARTC_STATUS, PARTC_STEP_TYPES,
  generatePartCRunId, createPartCRun, addStep, isAwaitingInputs
};
