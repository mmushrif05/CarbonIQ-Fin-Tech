/**
 * CarbonIQ FinTech — the gate in front of every agent endpoint
 *
 * The earlier gate asked one question: is ANTHROPIC_API_KEY set? A key that
 * is present but wrong passed it, and the failure surfaced much later from
 * inside the Anthropic SDK as "401 terminated" — which names neither the
 * cause nor the fix, and on screen reads as an agent that simply does
 * nothing.
 *
 * This gate answers the question a user actually has: can the agents work
 * right now, and if not, what do I do? A missing key and a malformed key are
 * different failures with different remedies, so they are reported
 * differently, and both name what still works without any key.
 */

'use strict';

const config = require('../config');
const { describe } = require('../services/agents/ai-status');

/** What the calculation side can still do while the AI layer is down. */
const UNAFFECTED = [
  'POST /v1/pcaf/part-c/assess — the calculation engine',
  'POST /v1/pcaf/part-c/report — PDF, Word and JSON reports',
  'GET  /v1/pcaf/part-c/methodology — the methodology statement',
  'GET  /v1/partc/disclosure/:year — the annual disclosure',
  'The whole insurance book, BOQ revisions, assessments and locking'
];

function requireAI(_req, res, next) {
  const ai = describe();

  if (!ai.configured) {
    return res.status(503).json({
      error: 'AI_UNAVAILABLE',
      reason: 'not_configured',
      message: 'ANTHROPIC_API_KEY is not set in this deployment, so document reading, policy classification and BOQ mapping cannot run.',
      remedy: 'Set ANTHROPIC_API_KEY in the deployment environment and redeploy — on Netlify an environment variable does not reach a running function until the next deploy.',
      diagnose: 'GET /v1/agent/health',
      unaffected: UNAFFECTED
    });
  }

  /* A key of the wrong shape fails at the first call every time, so it is
     refused here with the reason rather than 20 seconds later with none. */
  if (!ai.keyWellFormed) {
    return res.status(503).json({
      error: 'AI_UNAVAILABLE',
      reason: 'key_malformed',
      message: ai.shapeWarning,
      remedy: 'Copy the key whole from console.anthropic.com — it begins sk-ant- and is around 100 characters — with no surrounding quotes and no trailing newline, then redeploy.',
      diagnose: 'GET /v1/agent/health',
      unaffected: UNAFFECTED
    });
  }

  return next();
}

/** Kept so the gate can be reasoned about in tests without an HTTP round trip. */
requireAI.state = () => ({ configured: !!config.anthropicApiKey, ...describe() });
requireAI.UNAFFECTED = UNAFFECTED;

module.exports = requireAI;
