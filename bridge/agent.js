/**
 * CarbonIQ FinTech — Agentic AI Orchestrator
 *
 * This is the heart of CarbonIQ's agentic layer.
 *
 * Instead of a single Claude call that returns one answer, an agent:
 *   1. Receives a high-level goal (e.g. "Assess this project for green loan eligibility")
 *   2. Reasons about what information it needs
 *   3. Calls tools (existing CarbonIQ services) to gather that information
 *   4. Reasons again about what the results mean
 *   5. Calls more tools if needed
 *   6. Produces a complete professional output when it has enough to conclude
 *
 * The loop continues until Claude issues a final text response with stop_reason
 * 'end_turn' and no pending tool_use blocks — meaning it's satisfied with its
 * reasoning and ready to deliver the result.
 *
 * Every step (tool calls, reasoning traces) is persisted to Firebase so bank
 * staff can audit exactly what the agent did and why.
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

  const client   = new Anthropic({ apiKey: config.anthropicApiKey });
  const messages = [{ role: 'user', content: userMessage }];
  let iterations = 0;

  try {
    // -----------------------------------------------------------------------
    // Agentic loop
    // -----------------------------------------------------------------------
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model:      config.anthropicModel,
        max_tokens: 8192,
        system:     systemPrompt,
        tools:      toolDefinitions,
        messages
      });

      // Accumulate token usage across all iterations
      run.tokensUsed.input  += response.usage.input_tokens;
      run.tokensUsed.output += response.usage.output_tokens;

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

      // Append the assistant's response (including tool_use blocks) to history
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

      // Return tool results to Claude so it can reason about them
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

module.exports = { runAgent };
