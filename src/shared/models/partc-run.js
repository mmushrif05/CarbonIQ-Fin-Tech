// @ts-check
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
/**
 * A Part C run, which is not one request and one response.
 *
 * The agent ingests documents, then **pauses** for the client to complete the
 * form, then resumes and computes. Everything the pause has to survive is on
 * this record — the extracted policy, the mapped materials, the form and its
 * answers — because the client may answer through the UI, through the API, or
 * in a session days later, and none of those share a process.
 *
 * `overrides` are the client's own factor prices. They are held here and
 * passed into `runPartC(input, { overrides })` as an argument for the duration
 * of that one call. They used to be a module-level variable set before the
 * calculation and cleared in a `finally`, so a throw left them standing and
 * two resumes in one container shared one global — which is one insured
 * party's quarry certificate pricing another party's concrete.
 *
 * @typedef {object} PartCRun
 * @property {string} runId
 * @property {string} orgId
 * @property {string|null} projectName
 * @property {string} status       one of `PARTC_STATUS`
 * @property {string} createdAt    ISO 8601
 * @property {string} updatedAt    ISO 8601
 * @property {string|null} completedAt
 * @property {object|null} policy          extracted by the intake agent
 * @property {object[]} materials          mapped by the mapping agent
 * @property {object[]} demolitionItems
 * @property {object|null} form            what the client is asked
 * @property {object|null} formAnswers     what the client answered
 * @property {Record<string, any>} overrides  the client's own factor prices
 * @property {object|null} result          the engine's output, once it has run
 * @property {object|null} registers       assumptions, data gaps, audit trail
 * @property {object|null} disclosure
 * @property {object|null} learnings
 * @property {PartCRunStep[]} steps
 * @property {string|null} error
 * @property {{input: number, output: number, cacheRead: number, cacheCreated: number}} tokensUsed
 */

/**
 * One step in a run's history.
 * @typedef {object} PartCRunStep
 * @property {string} type     one of `PARTC_STEP_TYPES`
 * @property {string} [summary]
 * @property {any} [data]
 * @property {string} [at]     ISO 8601
 */

/**
 * @param {{runId?: string, orgId: string, projectName?: string|null, metadata?: any}} init
 * @returns {PartCRun}
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
