/**
 * CarbonIQ FinTech — Agent Run Model
 *
 * Defines the structure and constants for agentic AI run records.
 * Stored in Firebase under: fintech/agentRuns/{orgId}/{runId}
 *
 * A "run" is a single end-to-end agent execution: from the initial user
 * request, through all tool calls and reasoning steps, to the final output.
 */

const AGENT_TYPES = {
  SCREENING:    'screening',
  UNDERWRITING: 'underwriting',
  COVENANTS:    'covenants',
  MONITORING:   'monitoring',
  PORTFOLIO:    'portfolio'
};

const AGENT_STATUS = {
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed'
};

const STEP_TYPES = {
  TOOL_CALL: 'tool_call',
  REASONING: 'reasoning'
};

/**
 * Create a new agent run record (initial state before execution starts).
 *
 * @param {Object} params
 * @param {string} params.runId          - Unique run ID (e.g. run_1234_abcd)
 * @param {string} params.agentType      - One of AGENT_TYPES values
 * @param {string} params.orgId          - Organisation / API key owner
 * @param {string} params.userMessage    - The initial instruction sent to the agent
 * @param {Object} [params.metadata]     - Extra context (projectId, loanAmount, etc.)
 * @returns {Object} Initial run record ready for Firebase storage
 */
function createRunRecord({ runId, agentType, orgId, userMessage, metadata = {} }) {
  return {
    runId,
    agentType,
    orgId,
    status: AGENT_STATUS.RUNNING,
    userMessage,
    steps: [],
    result: null,
    error: null,
    tokensUsed: { input: 0, output: 0 },
    metadata,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

module.exports = { AGENT_TYPES, AGENT_STATUS, STEP_TYPES, createRunRecord };
