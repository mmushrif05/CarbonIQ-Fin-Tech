// @ts-check
/**
 * Agent health, and the run history.
 */

'use strict';

const { Router } = require('express');

const apiKeyAuth    = require('../../../../../platform/auth/api-key');
const { listView, paged } = require('../../../../../platform/http/pagination');
const { doc } = require('../../../../../platform/http/openapi-hints');
const { authorize } = require('../../../../../platform/auth/authorization');
const { PERMISSIONS } = require('../../../../../shared/policies');
const aiStatus      = require('../../../../../platform/ai/ai-status');
const { getAgentRun, listAgentRuns } = require('../../../../../platform/bridge/firebase');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/agent/underwrite
//
// Run the Green Loan Underwriting Agent against a BOQ and project details.
// Returns a full underwriting memo plus the complete tool-call audit trail.
// ---------------------------------------------------------------------------

/**
 * GET /v1/agent/health — is the AI layer working, and if not, why?
 *
 * "The agent is static" and "the agent is misconfigured" look identical from
 * a screen, and the second is far more common. This answers which, by name,
 * for every agent in the product.
 *
 * Free by default: shape checks only. `?probe=1` spends one token on a live
 * call, which is the only way to tell a rejected key from an unavailable
 * model from a network block.
 */
router.get('/health', apiKeyAuth, async (req, res, next) => {
  try {
    const live = req.query.probe === '1' || req.query.probe === 'true';

    /* Without a probe the shape is still decisive in two cases: no key at
       all, and a key that cannot be an Anthropic key. Reporting those as
       "not probed" would hide the answer the caller came for. */
    let state;
    if (live) {
      state = await aiStatus.probe();
    } else {
      const d = aiStatus.describe();
      state = {
        ...d,
        status: !d.configured ? 'not_configured'
          : !d.keyWellFormed ? 'key_malformed' : 'not_probed',
        remedy: !d.configured
          ? 'Set ANTHROPIC_API_KEY in the deployment environment and redeploy — on Netlify an environment variable does not reach a running function until the next deploy.'
          : !d.keyWellFormed
            ? 'Copy the key whole from console.anthropic.com — it begins sk-ant- and is around 100 characters — with no quotes and no trailing newline, then redeploy.'
            : null
      };
    }

    const usable = live ? state.ok : (state.configured && state.keyWellFormed);
    /* A diagnostic that answers "no" is still a successful diagnostic, so
       the transport status reflects whether the AI layer is usable rather
       than whether the check ran. */
    res.status(usable ? 200 : 503).json({
      ai: {
        usable,
        status: state.status,
        detail: state.detail || state.shapeWarning
          || (usable ? 'The key is present and well formed. Add ?probe=1 to confirm the API answers.'
            : 'No Anthropic API key is configured.'),
        remedy: state.remedy || null,
        probed: live,
        latencyMs: state.latencyMs || null,
        keyConfigured: state.configured,
        keyWellFormed: state.keyWellFormed,
        keyPrefix: state.keyPrefix,
        models: state.models
      },
      /* Every agent in the product, so "make sure every agent is active" has
         a single answer rather than nine separate experiments. */
      agents: state.agents.map(a => ({
        ...a,
        status: usable ? 'live' : 'unavailable',
        blockedBy: usable ? null : (state.status || 'not_configured')
      })),
      deterministic: {
        note: 'These need no API key and are unaffected by anything above.',
        endpoints: require('../../../../../platform/http/require-ai').UNAFFECTED
      },
      checkedAt: new Date().toISOString()
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /v1/agent/runs
//
// List recent agent runs for this organisation.
// ---------------------------------------------------------------------------

router.get('/runs',
  apiKeyAuth,
  authorize(PERMISSIONS.RUNS_READ),
  paged(),
  doc({ summary: 'Recent agent runs, newest first; twenty without a page' }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const paging = req.query.limit !== undefined || req.query.cursor !== undefined;
      const runs = await listAgentRuns(orgId, paging ? 500 : 20);
      const view = listView(req, res, runs);

      return res.status(200).json({
        success: true,
        orgId,
        count: view.items.length,
        ...(view.page ? { page: view.page } : {}),
        runs: view.items.map(r => ({
          runId:       r.runId,
          agentType:   r.agentType,
          status:      r.status,
          stepCount:   (r.steps || []).length,
          tokensUsed:  r.tokensUsed,
          metadata:    r.metadata,
          createdAt:   r.createdAt,
          completedAt: r.completedAt
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/agent/runs/:runId
//
// Get the full detail of a specific agent run, including every step.
// ---------------------------------------------------------------------------

router.get('/runs/:runId',
  apiKeyAuth,
  authorize(PERMISSIONS.RUNS_READ),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const { runId } = req.params;

      const run = await getAgentRun(orgId, runId);

      if (!run) {
        return res.status(404).json({
          error:   'RUN_NOT_FOUND',
          message: `Agent run ${runId} not found for this organisation.`
        });
      }

      return res.status(200).json({
        success: true,
        run
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
