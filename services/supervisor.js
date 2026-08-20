/**
 * CarbonIQ FinTech — Multi-Agent Supervisor / Orchestrator
 *
 * Implements the AWS Bedrock / Confluent supervisor pattern:
 *   Supervisor receives a high-level task → resolves stage dependencies →
 *   dispatches agents (parallel where possible) → aggregates results →
 *   handles failures and human review gates.
 *
 * The supervisor is NOT an AI agent itself — it is a deterministic orchestrator
 * that delegates to the existing AI agents via bridge/agent.js. This keeps
 * the architecture predictable (no "AI deciding which AI to call") while
 * still enabling multi-agent workflows.
 *
 * Key design decisions:
 *   - Dependency resolution via topological sort (stages with no unmet deps run in parallel)
 *   - Authorization checked per-stage (caller must have permission for every agent in the pipeline)
 *   - Human review gates (covenants) pause the pipeline; resume via explicit API call
 *   - All state persisted to Firebase for audit trail and crash recovery
 */

'use strict';

const {
  PIPELINE_TEMPLATES,
  PIPELINE_STATUS,
  STAGE_STATUS,
  createPipelineRecord,
  generatePipelineId,
} = require('../models/pipeline');

const { AGENT_PERMISSION_MAP }  = require('../config/policies');
const { checkAccess }           = require('../middleware/authorization');
const { runAgent, runAgentSingleCall } = require('../bridge/agent');
const { savePipelineRun, updatePipelineRun } = require('../bridge/firebase');
const { AGENT_STATUS } = require('../models/agent-run');

// Agent modules — lazy-loaded to avoid circular deps
const AGENT_MODULES = {
  screening:       () => require('./agents/screening'),
  underwriting:    () => require('./agents/underwriting'),
  origination:     () => require('./agents/origination'),
  covenants:       () => require('./agents/covenants'),
  monitoring:      () => require('./agents/monitoring'),
  portfolio:       () => require('./agents/portfolio'),
  borrower_coaching: () => require('./agents/borrower-coaching'),
  decision_review: () => require('./agents/decision-review'),
};

// ---------------------------------------------------------------------------
// Pre-flight: validate the caller has permissions for every stage
// ---------------------------------------------------------------------------

/**
 * Check that the subject has authorization for every stage in the pipeline.
 *
 * @param {Object} subject   - Normalised auth subject
 * @param {Object} template  - Pipeline template
 * @param {Object} resource  - Resource attributes for ABAC
 * @returns {{ allowed: boolean, denied: Array }}
 */
function validatePipelineAccess(subject, template, resource = {}) {
  const denied = [];
  for (const stage of template.stages) {
    const result = checkAccess(subject, stage.permission, resource);
    if (!result.allowed) {
      denied.push({ stageId: stage.stageId, permission: stage.permission, message: result.message });
    }
  }
  return { allowed: denied.length === 0, denied };
}

// ---------------------------------------------------------------------------
// Stage dispatcher — runs the appropriate agent for a stage
// ---------------------------------------------------------------------------

/**
 * Execute a single pipeline stage by invoking its agent.
 *
 * @param {Object} stage       - Stage definition from the pipeline record
 * @param {Object} input       - Original pipeline input (request body)
 * @param {string} orgId       - Organisation ID
 * @param {Object} priorResults - Map of stageId → agent run result from completed stages
 * @returns {Promise<Object>}  Agent run record
 */
async function _dispatchStage(stage, input, orgId, priorResults) {
  const agentType = stage.agentType;
  const loader    = AGENT_MODULES[agentType];
  if (!loader) throw new Error(`No agent module registered for type: ${agentType}`);

  const agentModule = loader();

  // Build the user message — some agents have buildUserMessageWithResults for single-call
  let userMessage;
  let useSingleCall = false;

  if (agentType === 'screening' && agentModule.buildUserMessageWithResults) {
    userMessage   = agentModule.buildUserMessageWithResults(input);
    useSingleCall = true;
  } else if (agentModule.buildUserMessage) {
    // Enrich input with prior stage results for context
    const enrichedInput = _enrichInput(input, priorResults);
    userMessage = agentModule.buildUserMessage(enrichedInput);
  } else {
    userMessage = JSON.stringify(input);
  }

  if (useSingleCall) {
    return runAgentSingleCall({
      agentType,
      systemPrompt: agentModule.SYSTEM_PROMPT,
      userMessage,
      orgId,
      metadata: { pipeline: true, stageId: stage.stageId },
    });
  }

  return runAgent({
    agentType,
    systemPrompt:    agentModule.SYSTEM_PROMPT,
    toolDefinitions: agentModule.TOOL_DEFINITIONS,
    toolFunctions:   agentModule.TOOL_FUNCTIONS,
    userMessage,
    orgId,
    metadata: { pipeline: true, stageId: stage.stageId },
  });
}

/**
 * Enrich input with results from prior stages so downstream agents have context.
 */
function _enrichInput(input, priorResults) {
  if (!priorResults || Object.keys(priorResults).length === 0) return input;

  const enriched = { ...input };

  // If screening completed, add its verdict for downstream context
  if (priorResults.screen && priorResults.screen.status === 'completed') {
    enriched._priorScreeningResult = priorResults.screen.result;
  }

  // If origination completed, add its analysis for covenant design
  if (priorResults.originate && priorResults.originate.status === 'completed') {
    enriched._priorOriginationResult = priorResults.originate.result;
  }

  // If underwriting completed, add its result for triage
  if (priorResults.underwrite && priorResults.underwrite.status === 'completed') {
    enriched._priorUnderwritingResult = priorResults.underwrite.result;
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Topological execution — resolve dependencies, run parallel where possible
// ---------------------------------------------------------------------------

/**
 * Get the next batch of stages that are ready to run (all dependencies met).
 *
 * @param {Object[]} stages - Pipeline stages with current status
 * @returns {Object[]} Stages ready to dispatch
 */
function _getReadyStages(stages) {
  const completedIds = new Set(
    stages.filter(s => s.status === STAGE_STATUS.COMPLETED).map(s => s.stageId)
  );

  return stages.filter(s => {
    if (s.status !== STAGE_STATUS.PENDING) return false;
    return s.requires.every(depId => completedIds.has(depId));
  });
}

/**
 * Check if any required stage has failed (non-optional).
 */
function _hasBlockingFailure(stages) {
  return stages.some(s => s.status === STAGE_STATUS.FAILED && !s.optional);
}

/**
 * Check if the pipeline is paused (waiting for human review).
 */
function _isPaused(stages) {
  return stages.some(s => s.status === STAGE_STATUS.PAUSED);
}

// ---------------------------------------------------------------------------
// Main entry point: createAndRunPipeline
// ---------------------------------------------------------------------------

/**
 * Create and execute a multi-agent pipeline.
 *
 * @param {Object} params
 * @param {string} params.templateId - Pipeline template key
 * @param {Object} params.input      - Request body (shared across stages)
 * @param {Object} params.subject    - Authorised subject (from buildSubject)
 * @param {string} params.orgId      - Organisation ID
 * @param {Object} [params.metadata] - Extra context
 * @returns {Promise<Object>} Pipeline run record
 */
async function createAndRunPipeline({ templateId, input, subject, orgId, metadata = {} }) {
  const template = PIPELINE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown pipeline template: ${templateId}. Available: ${Object.keys(PIPELINE_TEMPLATES).join(', ')}`);
  }

  // Pre-flight authorization: check all stage permissions
  const accessCheck = validatePipelineAccess(subject, template, {
    orgId,
    loanAmount: input.loanAmount || null,
  });
  if (!accessCheck.allowed) {
    const deniedStages = accessCheck.denied.map(d => `${d.stageId} (${d.permission})`).join(', ');
    throw Object.assign(
      new Error(`Pipeline authorization failed. Denied stages: ${deniedStages}`),
      { statusCode: 403, denied: accessCheck.denied }
    );
  }

  // Create pipeline record
  const pipelineId = generatePipelineId();
  const pipeline   = createPipelineRecord({ pipelineId, templateId, orgId, input, subject, metadata });

  pipeline.status    = PIPELINE_STATUS.RUNNING;
  pipeline.startedAt = new Date().toISOString();

  await savePipelineRun(orgId, pipeline);

  // Execute stages in dependency order
  const priorResults = {};

  try {
    while (true) {
      // Check for blocking failures
      if (_hasBlockingFailure(pipeline.stages)) {
        pipeline.status = PIPELINE_STATUS.FAILED;
        const failedStage = pipeline.stages.find(s => s.status === STAGE_STATUS.FAILED && !s.optional);
        pipeline.error  = `Pipeline failed: required stage '${failedStage.stageId}' failed — ${failedStage.error}`;

        // Mark pending stages as skipped
        for (const s of pipeline.stages) {
          if (s.status === STAGE_STATUS.PENDING) s.status = STAGE_STATUS.SKIPPED;
        }
        break;
      }

      // Check for paused stages (human review gate)
      if (_isPaused(pipeline.stages)) {
        pipeline.status = PIPELINE_STATUS.PAUSED;
        break;
      }

      // Get next batch of ready stages
      const readyStages = _getReadyStages(pipeline.stages);
      if (readyStages.length === 0) {
        // No more stages to run — check if all completed
        const allDone = pipeline.stages.every(
          s => s.status === STAGE_STATUS.COMPLETED || s.status === STAGE_STATUS.SKIPPED
        );
        if (allDone) {
          pipeline.status      = PIPELINE_STATUS.COMPLETED;
          pipeline.completedAt = new Date().toISOString();
        }
        break;
      }

      // Dispatch ready stages in parallel
      const dispatches = readyStages.map(async (stage) => {
        const stageRef = pipeline.stages.find(s => s.stageId === stage.stageId);
        stageRef.status    = STAGE_STATUS.RUNNING;
        stageRef.startedAt = new Date().toISOString();

        try {
          const run = await _dispatchStage(stage, input, orgId, priorResults);

          stageRef.runId       = run.runId;
          stageRef.completedAt = new Date().toISOString();

          // Accumulate tokens
          if (run.tokensUsed) {
            pipeline.tokensUsed.input        += run.tokensUsed.input        || 0;
            pipeline.tokensUsed.output       += run.tokensUsed.output       || 0;
            pipeline.tokensUsed.cacheRead    += run.tokensUsed.cacheRead    || 0;
            pipeline.tokensUsed.cacheCreated += run.tokensUsed.cacheCreated || 0;
          }

          // Handle covenant human review gate
          if (stage.agentType === 'covenants' && run.status === AGENT_STATUS.COMPLETED) {
            stageRef.status = STAGE_STATUS.PAUSED;
            stageRef.result = run.result;
            return;
          }

          if (run.status === AGENT_STATUS.COMPLETED || run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW) {
            stageRef.status = run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW
              ? STAGE_STATUS.PAUSED
              : STAGE_STATUS.COMPLETED;
            stageRef.result = run.result;
            priorResults[stage.stageId] = run;
          } else {
            stageRef.status = STAGE_STATUS.FAILED;
            stageRef.error  = run.error || 'Agent run did not complete successfully';
          }
        } catch (err) {
          stageRef.status      = STAGE_STATUS.FAILED;
          stageRef.error       = err.message;
          stageRef.completedAt = new Date().toISOString();
        }
      });

      await Promise.all(dispatches);

      // Mid-pipeline save (best-effort)
      updatePipelineRun(orgId, pipelineId, {
        stages:     pipeline.stages,
        tokensUsed: pipeline.tokensUsed,
        status:     pipeline.status,
      }).catch(() => {});
    }
  } catch (err) {
    pipeline.status = PIPELINE_STATUS.FAILED;
    pipeline.error  = err.message;
  }

  // Final save
  pipeline.completedAt = pipeline.completedAt || new Date().toISOString();
  await updatePipelineRun(orgId, pipelineId, {
    status:      pipeline.status,
    stages:      pipeline.stages,
    tokensUsed:  pipeline.tokensUsed,
    error:       pipeline.error,
    completedAt: pipeline.completedAt,
  });

  return pipeline;
}

/**
 * Resume a paused pipeline after human review.
 * Called when a covenant review decision is submitted.
 *
 * @param {Object} pipeline  - The pipeline run record
 * @param {string} stageId   - The stage that was paused
 * @param {string} decision  - 'approved' | 'modified' | 'rejected'
 * @param {string} orgId     - Organisation ID
 * @returns {Promise<Object>} Updated pipeline record
 */
async function resumePipeline(pipeline, stageId, decision, orgId) {
  const stage = pipeline.stages.find(s => s.stageId === stageId);
  if (!stage) throw new Error(`Stage ${stageId} not found in pipeline`);

  if (decision === 'rejected') {
    stage.status = STAGE_STATUS.FAILED;
    stage.error  = 'Human review rejected';
    pipeline.status = PIPELINE_STATUS.FAILED;
    pipeline.error  = `Pipeline stopped: stage '${stageId}' rejected by human reviewer`;
  } else {
    stage.status      = STAGE_STATUS.COMPLETED;
    stage.completedAt = new Date().toISOString();
    pipeline.status   = PIPELINE_STATUS.RUNNING;
  }

  await updatePipelineRun(orgId, pipeline.pipelineId, {
    status: pipeline.status,
    stages: pipeline.stages,
    error:  pipeline.error,
  });

  // If approved/modified and pipeline still running, continue execution
  if (pipeline.status === PIPELINE_STATUS.RUNNING) {
    return createAndRunPipeline._continueExecution(pipeline, orgId);
  }

  return pipeline;
}

// Attach continueExecution as a private method for resumePipeline
createAndRunPipeline._continueExecution = async function _continueExecution(pipeline, orgId) {
  const priorResults = {};

  // Rebuild priorResults from completed stages
  for (const s of pipeline.stages) {
    if (s.status === STAGE_STATUS.COMPLETED && s.result) {
      priorResults[s.stageId] = { status: 'completed', result: s.result };
    }
  }

  try {
    while (true) {
      if (_hasBlockingFailure(pipeline.stages)) {
        pipeline.status = PIPELINE_STATUS.FAILED;
        const failedStage = pipeline.stages.find(s => s.status === STAGE_STATUS.FAILED && !s.optional);
        pipeline.error  = `Pipeline failed: required stage '${failedStage.stageId}' failed — ${failedStage.error}`;
        for (const s of pipeline.stages) {
          if (s.status === STAGE_STATUS.PENDING) s.status = STAGE_STATUS.SKIPPED;
        }
        break;
      }

      if (_isPaused(pipeline.stages)) {
        pipeline.status = PIPELINE_STATUS.PAUSED;
        break;
      }

      const readyStages = _getReadyStages(pipeline.stages);
      if (readyStages.length === 0) {
        const allDone = pipeline.stages.every(
          s => s.status === STAGE_STATUS.COMPLETED || s.status === STAGE_STATUS.SKIPPED
        );
        if (allDone) {
          pipeline.status      = PIPELINE_STATUS.COMPLETED;
          pipeline.completedAt = new Date().toISOString();
        }
        break;
      }

      const dispatches = readyStages.map(async (stage) => {
        const stageRef = pipeline.stages.find(s => s.stageId === stage.stageId);
        stageRef.status    = STAGE_STATUS.RUNNING;
        stageRef.startedAt = new Date().toISOString();

        try {
          const run = await _dispatchStage(stage, pipeline.input, orgId, priorResults);
          stageRef.runId       = run.runId;
          stageRef.completedAt = new Date().toISOString();

          if (run.tokensUsed) {
            pipeline.tokensUsed.input        += run.tokensUsed.input        || 0;
            pipeline.tokensUsed.output       += run.tokensUsed.output       || 0;
            pipeline.tokensUsed.cacheRead    += run.tokensUsed.cacheRead    || 0;
            pipeline.tokensUsed.cacheCreated += run.tokensUsed.cacheCreated || 0;
          }

          if (stage.agentType === 'covenants' && run.status === AGENT_STATUS.COMPLETED) {
            stageRef.status = STAGE_STATUS.PAUSED;
            stageRef.result = run.result;
            return;
          }

          if (run.status === AGENT_STATUS.COMPLETED || run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW) {
            stageRef.status = run.status === AGENT_STATUS.PENDING_HUMAN_REVIEW
              ? STAGE_STATUS.PAUSED
              : STAGE_STATUS.COMPLETED;
            stageRef.result = run.result;
            priorResults[stage.stageId] = run;
          } else {
            stageRef.status = STAGE_STATUS.FAILED;
            stageRef.error  = run.error || 'Agent run did not complete successfully';
          }
        } catch (err) {
          stageRef.status      = STAGE_STATUS.FAILED;
          stageRef.error       = err.message;
          stageRef.completedAt = new Date().toISOString();
        }
      });

      await Promise.all(dispatches);

      updatePipelineRun(orgId, pipeline.pipelineId, {
        stages:     pipeline.stages,
        tokensUsed: pipeline.tokensUsed,
        status:     pipeline.status,
      }).catch(() => {});
    }
  } catch (err) {
    pipeline.status = PIPELINE_STATUS.FAILED;
    pipeline.error  = err.message;
  }

  pipeline.completedAt = pipeline.completedAt || new Date().toISOString();
  await updatePipelineRun(orgId, pipeline.pipelineId, {
    status:      pipeline.status,
    stages:      pipeline.stages,
    tokensUsed:  pipeline.tokensUsed,
    error:       pipeline.error,
    completedAt: pipeline.completedAt,
  });

  return pipeline;
};

module.exports = {
  createAndRunPipeline,
  resumePipeline,
  validatePipelineAccess,
  _getReadyStages,
  _dispatchStage,
  _enrichInput,
};
