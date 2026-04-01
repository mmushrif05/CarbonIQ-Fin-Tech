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
