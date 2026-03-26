/**
 * CarbonIQ FinTech — Agentic AI Orchestrator
 *
 * Executes multi-step AI workflows using Claude's tool-calling loop.
 * Every step (tool calls, reasoning traces) is persisted to Firebase for
 * regulatory audit trail compliance.
 *
 * --- Prompt Caching Strategy ---
 *
 * Three cache breakpoints are applied on every API call (max allowed: 4):
 *
 *   1. Tools (last tool definition)
 *      Tool schemas are large (~50 tokens each × 18 tools = ~900 tokens)
 *      and identical across all iterations of the same run.
 *      Render order: tools → system → messages, so caching tools gives
 *      the deepest prefix and highest cache hit rate.
 *
 *   2. System prompt
 *      200–400 line agent instructions. Same on every iteration.
 *      Cache reads cost ~10% of normal input token price.
 *
 *   3. Conversation history (rolling)
 *      After each tool-call round trip, the entire prior message history
 *      is stable — only the newest message is new. Placing cache_control
 *      on the last content block of the most-recently-appended user turn
 *      allows all prior history to be read from cache on the next iteration.
 *
 * For the underwriting agent (typically 5–7 iterations, 800–1200 tokens of
 * tools + system), this reduces effective input token spend by 60–80%.
 */

'use strict';

const crypto    = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const config    = require('../config');
const { saveAgentRun, updateAgentRun } = require('./firebase');
const { createRunRecord, AGENT_STATUS, STEP_TYPES } = require('../models/agent-run');

// Safety guard: never run more than this many loop iterations per agent run
const MAX_ITERATIONS = 20;

/**
 * Generate a unique run ID.
 * @returns {string} e.g. "run_1710000000000_a3f9"
 */
function generateRunId() {
  return `run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/**
 * Return a copy of the tool definitions array with cache_control on the
 * last entry. The last tool definition is the deepest cacheable position
 * in the tools prefix and gives the highest cache hit rate.
 *
 * Does NOT mutate the input array.
 *
 * @param {Object[]} toolDefs
 * @returns {Object[]}
 */
function _withCachedLastTool(toolDefs) {
  if (!toolDefs || toolDefs.length === 0) return toolDefs;
  const copy = toolDefs.slice();
  copy[copy.length - 1] = { ...copy[copy.length - 1], cache_control: { type: 'ephemeral' } };
  return copy;
}

/**
 * Return a copy of the messages array with cache_control placed on the
 * last content block of the most-recently-appended user message.
 *
 * This caches the entire conversation prefix up to that point so Claude
 * can read it cheaply on the next iteration instead of re-processing it.
 *
 * Does NOT mutate the input array or any message objects.
 *
 * @param {Array} messages
 * @returns {Array}
 */
function _withCachedLastUserMessage(messages) {
  if (!messages || messages.length === 0) return messages;

  // Find the index of the last user-role message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break; }
  }
  if (lastUserIdx === -1) return messages;

  const msg     = messages[lastUserIdx];
  const content = msg.content;

  let newContent;
  if (typeof content === 'string') {
    // Convert to block array so we can attach cache_control
    newContent = [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }];
  } else if (Array.isArray(content) && content.length > 0) {
    const blocks = content.slice();
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
    newContent = blocks;
  } else {
    return messages; // unexpected shape — don't touch
  }

  const copy = messages.slice();
  copy[lastUserIdx] = { ...msg, content: newContent };
  return copy;
}

/**
 * Accumulate cache token counters from a response into run.tokensUsed.
 */
function _accumulateTokens(run, usage) {
  run.tokensUsed.input       += usage.input_tokens                    || 0;
  run.tokensUsed.output      += usage.output_tokens                   || 0;
  run.tokensUsed.cacheRead   += usage.cache_read_input_tokens         || 0;
  run.tokensUsed.cacheCreated += usage.cache_creation_input_tokens    || 0;
}

// ---------------------------------------------------------------------------
// runAgent — multi-turn agentic loop
// ---------------------------------------------------------------------------

/**
 * Execute an agentic AI workflow.
 *
 * @param {Object}   params
 * @param {string}   params.agentType        - Agent identifier (e.g. 'underwriting')
 * @param {string}   params.systemPrompt     - The agent's role and instructions
 * @param {Object[]} params.toolDefinitions  - Claude tool schemas (name, description, input_schema)
 * @param {Object}   params.toolFunctions    - Map of toolName → async function(input)
 * @param {string}   params.userMessage      - The initial user request / task description
 * @param {string}   params.orgId            - Organisation ID for Firebase scoping
 * @param {Object}   [params.metadata]       - Extra context stored with the run
 *
 * @returns {Promise<Object>} Completed run record with steps, result, tokensUsed
 */
async function runAgent({ agentType, systemPrompt, toolDefinitions, toolFunctions, userMessage, orgId, metadata }) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Agentic AI is unavailable.');
  }

  const runId = generateRunId();
  const run   = createRunRecord({ runId, agentType, orgId, userMessage, metadata: metadata || {} });

  // Persist initial "running" state so callers can poll for progress
  await saveAgentRun(orgId, run);

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // Cache breakpoint 2: system prompt (same on every iteration)
  const cachedSystem = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];

  // Cache breakpoint 1: last tool definition (tools render before system,
  // so this gives the deepest prefix)
  const cachedTools = _withCachedLastTool(toolDefinitions);

  const messages = [{ role: 'user', content: userMessage }];
  let iterations = 0;

  try {
    // -----------------------------------------------------------------------
    // Agentic loop
    // -----------------------------------------------------------------------
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Cache breakpoint 3 (rolling): last user message in current history.
      // Caches the entire conversation prefix up to this point so the next
      // iteration reads prior history cheaply.
      const cachedMessages = _withCachedLastUserMessage(messages);

      const response = await client.messages.create({
        model:      config.anthropicModel,
        max_tokens: 8192,
        system:     cachedSystem,
        tools:      cachedTools,
        messages:   cachedMessages
      });

      _accumulateTokens(run, response.usage);

      const textBlocks    = response.content.filter(b => b.type === 'text');
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Record any reasoning text the agent emitted before/between tool calls
      if (textBlocks.length > 0) {
        run.steps.push({
          step:      run.steps.length + 1,
          type:      STEP_TYPES.REASONING,
          content:   textBlocks.map(b => b.text).join('\n'),
          timestamp: new Date().toISOString()
        });
      }

      // ------------------------------------------------------------------
      // No tool calls → agent has finished reasoning and produced its answer
      // ------------------------------------------------------------------
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        run.result      = textBlocks.map(b => b.text).join('\n');
        run.status      = AGENT_STATUS.COMPLETED;
        run.completedAt = new Date().toISOString();
        break;
      }

      // Append the assistant's full response (including tool_use blocks) to history
      messages.push({ role: 'assistant', content: response.content });

      // ------------------------------------------------------------------
      // Execute each tool the agent requested
      // ------------------------------------------------------------------
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const toolFn    = toolFunctions[toolUse.name];
        let   output    = null;
        let   toolError = null;

        try {
          if (!toolFn) {
            throw new Error(`Tool "${toolUse.name}" is not registered for this agent.`);
          }
          output = await toolFn(toolUse.input);
        } catch (err) {
          toolError = err.message;
          output    = { error: err.message };
        }

        // Log every tool call with its full input/output for audit trail
        run.steps.push({
          step:      run.steps.length + 1,
          type:      STEP_TYPES.TOOL_CALL,
          tool:      toolUse.name,
          input:     toolUse.input,
          output,
          error:     toolError || null,
          timestamp: new Date().toISOString()
        });

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolUse.id,
          content:     JSON.stringify(output)
        });
      }

      // Return tool results to Claude so it can reason about them.
      // This user message will be cached on the NEXT iteration (breakpoint 3).
      messages.push({ role: 'user', content: toolResults });

      // Persist progress to Firebase (non-blocking — best-effort mid-run save)
      updateAgentRun(orgId, runId, {
        steps:      run.steps,
        tokensUsed: run.tokensUsed
      }).catch(() => {});
    }

    // Safety: if we exited the loop without a result, mark as failed
    if (run.status === AGENT_STATUS.RUNNING) {
      run.status      = AGENT_STATUS.FAILED;
      run.error       = `Agent exceeded maximum iterations (${MAX_ITERATIONS}) without producing a final answer.`;
      run.completedAt = new Date().toISOString();
    }

  } catch (err) {
    run.status      = AGENT_STATUS.FAILED;
    run.error       = err.message;
    run.completedAt = new Date().toISOString();
  }

  // Final authoritative save to Firebase
  await updateAgentRun(orgId, runId, {
    status:      run.status,
    steps:       run.steps,
    result:      run.result,
    error:       run.error,
    tokensUsed:  run.tokensUsed,
    completedAt: run.completedAt
  });

  return run;
}

// ---------------------------------------------------------------------------
// runAgentSingleCall — single Claude call, no tool loop
// ---------------------------------------------------------------------------

/**
 * Run an agent with a single Claude API call (no tool-calling loop).
 *
 * Use this when tool results have already been pre-computed locally and
 * embedded in the userMessage. Claude just needs to write the final output.
 * Keeps execution under Netlify's 10-second function timeout.
 *
 * @param {Object} params - Same shape as runAgent, minus toolDefinitions/toolFunctions
 * @returns {Promise<Object>} Run record with status, result, tokensUsed
 */
async function runAgentSingleCall({ agentType, systemPrompt, userMessage, orgId, metadata }) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Agentic AI is unavailable.');
  }

  const runId = generateRunId();
  const run   = createRunRecord({ runId, agentType, orgId, userMessage, metadata: metadata || {} });

  await saveAgentRun(orgId, run);

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    const fastModel = process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5-20251001';

    const response = await client.messages.create({
      model:      fastModel,
      max_tokens: 2048,
      // Cache the system prompt — same for every call to this agent type
      system:   [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }]
    });

    _accumulateTokens(run, response.usage);

    run.result      = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    run.status      = AGENT_STATUS.COMPLETED;
    run.completedAt = new Date().toISOString();

    run.steps.push({
      step:      1,
      type:      STEP_TYPES.REASONING,
      content:   run.result,
      timestamp: run.completedAt
    });

  } catch (err) {
    run.status      = AGENT_STATUS.FAILED;
    run.error       = err.message;
    run.completedAt = new Date().toISOString();
  }

  await updateAgentRun(orgId, runId, {
    status:      run.status,
    steps:       run.steps,
    result:      run.result,
    error:       run.error,
    tokensUsed:  run.tokensUsed,
    completedAt: run.completedAt
  });

  return run;
}

module.exports = { runAgent, runAgentSingleCall, _withCachedLastTool, _withCachedLastUserMessage, _accumulateTokens };
