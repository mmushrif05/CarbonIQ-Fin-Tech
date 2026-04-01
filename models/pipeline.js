/**
 * CarbonIQ FinTech — Pipeline Run Model
 *
 * Defines the structure for multi-agent supervisor pipeline runs.
 * A pipeline orchestrates a sequence of agent stages with dependency
 * resolution, parallel execution, and failure handling.
 *
 * Stored in Firebase under: fintech/pipelineRuns/{orgId}/{pipelineId}
 *
 * Follows the AWS Bedrock / Confluent multi-agent supervisor pattern:
 *   Supervisor → delegates → Agent 1, Agent 2, ... → aggregates results
 */

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Pipeline templates — pre-defined multi-agent workflows
// ---------------------------------------------------------------------------

/**
 * Pipeline templates define the sequence of agent stages.
 *
 * Each stage specifies:
 *   agentType     — maps to an agent in services/agents/
 *   requires      — stage IDs that must complete before this stage starts
 *   optional      — if true, failure doesn't block downstream stages
 *   passthrough   — fields to extract from the previous stage's result and
 *                   inject into this stage's input
 */
const PIPELINE_TEMPLATES = {
  /**
   * Full Green Loan Pipeline — end-to-end from screening to covenant design.
   * Matches the 5-stage lifecycle: Screen → Originate → Covenants
   * (Monitoring and Portfolio are post-disbursement, not part of origination pipeline)
   */
  green_loan_origination: {
    label: 'Green Loan Origination Pipeline',
    description: 'End-to-end: screening → origination → covenant design with human review gate',
    stages: [
      {
        stageId:   'screen',
        agentType: 'screening',
        requires:  [],
        optional:  false,
        permission: 'agent:screen',
      },
      {
        stageId:   'originate',
        agentType: 'origination',
        requires:  ['screen'],
        optional:  false,
        permission: 'agent:originate',
      },
      {
        stageId:   'covenants',
        agentType: 'covenants',
        requires:  ['originate'],
        optional:  false,
        permission: 'agent:covenants',
      },
    ],
  },

  /**
   * Quick Assessment — screening + underwriting in parallel, then triage.
   */
  quick_assessment: {
    label: 'Quick Assessment Pipeline',
    description: 'Parallel screening + underwriting, followed by decision triage',
    stages: [
      {
        stageId:   'screen',
        agentType: 'screening',
        requires:  [],
        optional:  false,
        permission: 'agent:screen',
      },
      {
        stageId:   'underwrite',
        agentType: 'underwriting',
        requires:  [],       // runs in parallel with screen
        optional:  false,
        permission: 'agent:underwrite',
      },
      {
        stageId:   'triage',
        agentType: 'decision_review',
        requires:  ['screen', 'underwrite'],
        optional:  false,
        permission: 'agent:triage',
      },
    ],
  },

  /**
   * Monitoring Review — monitoring + portfolio update.
   */
  monitoring_review: {
    label: 'Monitoring Review Pipeline',
    description: 'Covenant monitoring with portfolio impact update',
    stages: [
      {
        stageId:   'monitor',
        agentType: 'monitoring',
        requires:  [],
        optional:  false,
        permission: 'agent:monitor',
      },
      {
        stageId:   'portfolio',
        agentType: 'portfolio',
        requires:  ['monitor'],
        optional:  true,
        permission: 'agent:portfolio',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Pipeline status constants
// ---------------------------------------------------------------------------

const PIPELINE_STATUS = {
  PENDING:     'pending',      // created, not yet started
  RUNNING:     'running',      // at least one stage is executing
  COMPLETED:   'completed',    // all stages completed successfully
  FAILED:      'failed',       // a required stage failed
  CANCELLED:   'cancelled',    // cancelled by user
  PAUSED:      'paused',       // waiting for human review (covenant stage)
};

const STAGE_STATUS = {
  PENDING:     'pending',
  RUNNING:     'running',
  COMPLETED:   'completed',
  FAILED:      'failed',
  SKIPPED:     'skipped',      // skipped because a dependency failed
  PAUSED:      'paused',       // waiting for human review
};

// ---------------------------------------------------------------------------
// Pipeline run record factory
// ---------------------------------------------------------------------------

/**
 * Create a new pipeline run record.
 *
 * @param {Object} params
 * @param {string} params.pipelineId   - Unique pipeline ID
 * @param {string} params.templateId   - Template key from PIPELINE_TEMPLATES
 * @param {string} params.orgId        - Organisation ID
 * @param {Object} params.input        - Original request body (shared across stages)
 * @param {Object} params.subject      - Authorised subject who created the pipeline
 * @param {Object} [params.metadata]   - Extra context
 * @returns {Object} Pipeline run record
 */
function createPipelineRecord({ pipelineId, templateId, orgId, input, subject, metadata = {} }) {
  const template = PIPELINE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown pipeline template: ${templateId}`);
  }

  return {
    pipelineId,
    templateId,
    templateLabel: template.label,
    orgId,
    status:     PIPELINE_STATUS.PENDING,
    input,
    subject: {
      type:  subject.type,
      role:  subject.role,
      orgId: subject.orgId,
      uid:   subject.uid || null,
      email: subject.email || null,
    },
    stages: template.stages.map(s => ({
      stageId:    s.stageId,
      agentType:  s.agentType,
      requires:   s.requires,
      optional:   s.optional,
      permission: s.permission,
      status:     STAGE_STATUS.PENDING,
      runId:      null,
      result:     null,
      error:      null,
      startedAt:  null,
      completedAt: null,
    })),
    tokensUsed:  { input: 0, output: 0, cacheRead: 0, cacheCreated: 0 },
    metadata,
    createdAt:   new Date().toISOString(),
    startedAt:   null,
    completedAt: null,
    error:       null,
  };
}

/**
 * Generate a unique pipeline ID.
 * @returns {string} e.g. "pipe_1710000000000_a3f9b2"
 */
function generatePipelineId() {
  return `pipe_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = {
  PIPELINE_TEMPLATES,
  PIPELINE_STATUS,
  STAGE_STATUS,
  createPipelineRecord,
  generatePipelineId,
};
