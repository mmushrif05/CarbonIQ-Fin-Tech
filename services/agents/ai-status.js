/**
 * CarbonIQ FinTech — is the AI layer actually working?
 *
 * The old check asked only whether ANTHROPIC_API_KEY was set. A key that is
 * present but wrong passes that check and fails much later, inside an agent
 * call, as `{"error":"ERROR","message":"401 terminated"}` — which tells a
 * user nothing and reads, from the screen, as an agent that simply does
 * nothing. "Configured" and "working" are different questions and this module
 * answers both.
 *
 * Two levels:
 *
 *   describe()  — free. Shape checks only: is a key present, does it look
 *                 like an Anthropic key, which models are configured.
 *
 *   probe()     — one cheap live call. Distinguishes a rejected key from an
 *                 unavailable model from a rate limit from a network block,
 *                 and says what to do about each.
 */

'use strict';

const config = require('../../config');

/** An Anthropic key looks like sk-ant-… and is far longer than a UUID. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

const AGENTS = [
  { id: 'partc-intake',     endpoint: 'POST /v1/pcaf/part-c/agent/intake',   purpose: 'Read a policy document and classify the cover' },
  { id: 'partc-mapping',    endpoint: 'POST /v1/pcaf/part-c/agent/map',      purpose: 'Resolve BOQ lines to material keys, densities and waste categories' },
  { id: 'partc-disclosure', endpoint: 'POST /v1/pcaf/part-c/agent/disclose', purpose: 'Write the insurer memo from tool output' },
  { id: 'underwriting',     endpoint: 'POST /v1/agent/underwriting',         purpose: 'Underwriting analysis with live carbon pricing' },
  { id: 'covenant',         endpoint: 'POST /v1/agent/covenant',             purpose: 'Covenant design and stress testing' },
  { id: 'monitoring',       endpoint: 'POST /v1/agent/monitoring',           purpose: 'Ongoing covenant monitoring' },
  { id: 'portfolio',        endpoint: 'POST /v1/agent/portfolio',            purpose: 'Portfolio-level carbon risk' },
  { id: 'screening',        endpoint: 'POST /v1/agent/screening',            purpose: 'Fast single-call screening' },
  { id: 'extraction',       endpoint: 'POST /v1/extract',                    purpose: 'Read a BOQ PDF with the vision model' }
];

/** What can be known without spending a request. */
function describe() {
  const key = config.anthropicApiKey || '';
  const present = key.length > 0;
  const wellFormed = KEY_SHAPE.test(key);

  return {
    configured: present,
    keyWellFormed: wellFormed,
    keyLength: key.length,
    keyPrefix: present ? `${key.slice(0, 7)}…` : null,
    models: {
      agentic: config.anthropicModel,
      vision:  config.anthropicVisionModel,
      fast:    config.anthropicFastModel
    },
    agents: AGENTS,
    /* A key of the wrong shape is worth saying immediately: it is the single
       most common cause of every agent appearing to do nothing. */
    shapeWarning: present && !wellFormed
      ? `ANTHROPIC_API_KEY is set but does not look like an Anthropic key (${key.length} characters; expected sk-ant-… and around 100). Every agent will fail at the first call.`
      : null
  };
}

/**
 * One cheap live call, to tell a rejected key from an unavailable model.
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=8000]
 * @returns {Promise<Object>} status, detail and remedy
 */
async function probe({ timeoutMs = 8000 } = {}) {
  const base = describe();

  if (!base.configured) {
    return {
      ...base,
      status: 'not_configured',
      ok: false,
      detail: 'ANTHROPIC_API_KEY is not set, so every agent endpoint answers 503.',
      remedy: 'Set ANTHROPIC_API_KEY in the deployment environment. On Netlify: Site configuration → Environment variables, then redeploy — environment changes do not take effect until the next deploy.',
      unaffected: 'The calculation engine, the reports and the disclosure are deterministic and need no API key.'
    };
  }

  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); }
  catch (err) {
    return { ...base, status: 'sdk_missing', ok: false,
      detail: `The Anthropic SDK could not be loaded: ${err.message}`,
      remedy: 'Reinstall dependencies (npm install) and redeploy.' };
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: timeoutMs, maxRetries: 0 });
  const started = Date.now();

  try {
    // The smallest useful request: one token from the configured model.
    const res = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ok' }]
    });
    return {
      ...base,
      status: 'ok',
      ok: true,
      latencyMs: Date.now() - started,
      servedBy: res.model || config.anthropicModel,
      detail: `The Anthropic API answered on ${res.model || config.anthropicModel}. Every agent endpoint is live.`,
      remedy: null
    };
  } catch (err) {
    const d = diagnose(err);
    return { ...base, status: d.status, ok: false, latencyMs: Date.now() - started,
      detail: d.message, remedy: d.remedy, httpStatus: d.httpStatus || null };
  }
}

/**
 * Turn an SDK failure into something a reader can act on.
 *
 * The SDK's own message for a rejected key is "401 terminated", which names
 * neither the cause nor the fix. Every branch here answers both.
 */
function diagnose(err) {
  const status = err && (err.status || err.statusCode);
  const raw = String((err && err.message) || err || '');
  const body = (err && err.error && err.error.error) || {};
  const apiMessage = body.message || '';

  if (status === 401 || /401/.test(raw)) {
    return { status: 'key_rejected', httpStatus: 401,
      message: 'The Anthropic API rejected the key (401). It is present but not valid for this account.',
      remedy: 'Check ANTHROPIC_API_KEY is a current key from console.anthropic.com, copied whole with no quotes or trailing newline, and redeploy so the function picks it up.' };
  }
  if (status === 403) {
    return { status: 'forbidden', httpStatus: 403,
      message: `The key is valid but not permitted to make this call (403). ${apiMessage}`.trim(),
      remedy: 'Check the key\'s workspace and permissions in the Anthropic console.' };
  }
  if (status === 404 || /model/i.test(apiMessage) && /not.*(found|exist)/i.test(apiMessage)) {
    return { status: 'model_unavailable', httpStatus: status || 404,
      message: `The configured model is not available to this key: ${apiMessage || raw}`,
      remedy: `Set ANTHROPIC_MODEL to a model this account can use, or clear it to take the default (${config.anthropicModel}).` };
  }
  if (status === 429) {
    return { status: 'rate_limited', httpStatus: 429,
      message: 'The account is rate limited (429). Agents will work again once the limit resets.',
      remedy: 'Wait for the limit to reset, or raise the limit in the Anthropic console. The calculation engine is unaffected.' };
  }
  if (status === 529 || status === 503) {
    return { status: 'overloaded', httpStatus: status,
      message: 'The Anthropic API is temporarily overloaded.',
      remedy: 'Retry shortly. The calculation engine is unaffected.' };
  }
  if (/timeout|timed out|aborted/i.test(raw)) {
    return { status: 'timeout',
      message: `The call to the Anthropic API did not complete in time: ${raw}`,
      remedy: 'A long document can exceed the function timeout. Try a shorter document, or paste the BOQ as text instead of uploading the PDF.' };
  }
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(raw)) {
    return { status: 'network_blocked',
      message: `The deployment could not reach the Anthropic API: ${raw}`,
      remedy: 'Check outbound network access from the function environment.' };
  }
  return { status: 'error', httpStatus: status || null,
    message: apiMessage || raw || 'The Anthropic API call failed for an unrecognised reason.',
    remedy: 'See the server log for the full error.' };
}

module.exports = { describe, probe, diagnose, AGENTS, KEY_SHAPE };
