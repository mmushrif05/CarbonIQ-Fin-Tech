// @ts-check
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
  SCREENING:         'screening',
  UNDERWRITING:      'underwriting',
  ORIGINATION:       'origination',       // Stage 2: Green Loan Origination
  COVENANTS:         'covenants',
  MONITORING:        'monitoring',
  PORTFOLIO:         'portfolio',
  BORROWER_COACHING: 'borrower_coaching', // Stage 2: AI-guided borrower coaching
  DECISION_REVIEW:   'decision_review'    // Stage 2: Tier 2 AI-assisted decision review
};

const AGENT_STATUS = {
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  // EU AI Act Article 22 — high-risk AI systems in financial services must
  // pause for mandatory human review before decisions take legal effect.
  // Covenant Design (Stage 3) sets this status after AI recommendation.
  PENDING_HUMAN_REVIEW: 'pending_human_review',
  HUMAN_APPROVED:       'human_approved',
  HUMAN_MODIFIED:       'human_modified',
  HUMAN_REJECTED:       'human_rejected'
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
/**
 * One agent execution, end to end.
 *
 * `tokensUsed` carries the cache fields separately because prompt caching is
 * the largest single cost lever here and a combined input figure would hide
 * whether it is working.
 *
 * `humanReview` is null on every run but a covenant one: the EU AI Act review
 * is a gate on that agent's output, not a field every agent happens to have.
 *
 * @typedef {object} AgentRun
 * @property {string} runId
 * @property {string} agentType     one of `AGENT_TYPES`
 * @property {string} orgId
 * @property {string} status        one of `AGENT_STATUS`
 * @property {string} userMessage
 * @property {AgentStep[]} steps
 * @property {any} result           null until the run completes
 * @property {string|null} error
 * @property {{input: number, output: number, cacheRead: number, cacheCreated: number}} tokensUsed
 * @property {Record<string, any>} metadata
 * @property {string} createdAt     ISO 8601
 * @property {string|null} completedAt
 * @property {object|null} humanReview  covenant runs only
 */

/**
 * One step inside a run — a reasoning turn or a tool call, in the order the
 * agent took them. `step` is that order, 1-based, and it is on the record
 * rather than left to the array index because the audit trail is read back
 * from storage where nothing guarantees the array survived intact.
 *
 * A tool call carries its full input and output. That is deliberate and it is
 * what makes the trail an audit trail: an agent's conclusion is only checkable
 * if what it was told is recoverable.
 *
 * @typedef {object} AgentStep
 * @property {number} step       1-based position in the run
 * @property {string} type       one of `STEP_TYPES`
 * @property {string} timestamp  ISO 8601
 * @property {string} [content]  the reasoning text, on a reasoning step
 * @property {string} [tool]     the tool name, on a tool call
 * @property {any} [input]       what the tool was given
 * @property {any} [output]      what it returned
 * @property {string|null} [error]
 */

/**
 * @param {{runId: string, agentType: string, orgId: string, userMessage: string,
 *          metadata?: Record<string, any>}} init
 * @returns {AgentRun}
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
    tokensUsed: { input: 0, output: 0, cacheRead: 0, cacheCreated: 0 },
    metadata,
    createdAt: new Date().toISOString(),
    completedAt: null,
    // Populated when agentType === 'covenants' after EU AI Act human review
    humanReview: null
  };
}

module.exports = { AGENT_TYPES, AGENT_STATUS, STEP_TYPES, createRunRecord };
