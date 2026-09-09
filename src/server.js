/**
 * CarbonIQ FinTech — Express Server
 *
 * Bank-facing API layer for construction carbon intelligence.
 * Wraps the existing CarbonIQ engine and exposes:
 * - Carbon Finance Score (0-100)
 * - PCAF v3 compliant output
 * - Taxonomy alignment (ASEAN, EU, HK, SG)
 * - Green loan covenant engine
 * - Portfolio aggregation
 *
 * Runs locally via `npm start` or as a Netlify Function via fintech-api.js adapter.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const path = require('path');

const config = require('./platform/config');
const corsConfig = require('./platform/config/cors');
const errorHandler = require('./platform/http/error-handler');
const audit = require('./platform/observability/audit');
const v1Router = require('./platform/http/router');

const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers (OWASP baseline)
app.use(helmet({
  contentSecurityPolicy: false, // Managed by Netlify headers in production
  crossOriginEmbedderPolicy: false
}));

// CORS — configured per environment
app.use(cors(corsConfig));

// Body parsing — 20 MB to accommodate base64-encoded PDF BOQ uploads (~15 MB PDF)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false, limit: '20mb' }));

// Request logging
if (config.env !== 'test') {
  app.use(morgan('short'));
}

// Audit trail — logs every request for compliance
app.use(audit);

// ---------------------------------------------------------------------------
// Static UI — serves the ui/ directory for local development.
// In production (Netlify), the publish directory handles this.
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, '..', 'ui')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — no auth required
/*
 * Health, and which build is answering.
 *
 * "The fix did not work" and "the fix has not been deployed" look identical
 * from a browser, and the second is far more common. Netlify sets COMMIT_REF
 * and DEPLOY_ID on every build, so the running commit is reported here: one
 * request settles which of the two it is, without guessing.
 */
app.get('/health', async (_req, res) => {
  /* COMMIT_REF is a build-time variable and is absent from the function's
     runtime environment, so reading it here answered "unknown" on every
     production deploy — the diagnostic built to tell a broken fix from an
     undeployed one could not, in fact, tell them apart. The build now stamps
     build-info.json and this reads that, falling back to the environment for
     a local run. Absent stays absent rather than being guessed. */
  const stamped = (() => {
    try { return require('../build-info.json'); } catch (_) { return {}; }
  })();
  const commit = stamped.commit || config.runtime.build.commit;
  res.json({
    status: 'ok',
    service: 'carboniq-fintech',
    version: config.version,
    build: {
      commit: commit ? String(commit).slice(0, 12) : 'unknown (not a Netlify build)',
      branch: stamped.branch || config.runtime.build.branch,
      deployId: stamped.deployId || config.runtime.build.deployId,
      context: stamped.context || config.runtime.build.context,
      builtAt: stamped.builtAt || null
    },
    /* Whether this deployment can actually do its job, as booleans.
       "The dashboard shows 401" and "the AI does nothing" are both usually a
       variable that was never set on this context, and neither says so from a
       browser. Names and yes/no only — never a value. */
    configured: {
      uiKey: Boolean(config.runtime.uiApiKey),
      anthropicKey: Boolean(config.runtime.anthropicApiKey),
      firebase: config.runtime.firebaseConfigured,
      /* Boot validation, by variable name only. A serverless function cannot
         refuse to start, so it says here what a server would have refused on. */
      ...(() => { const v = config.validate(); return v.ok ? {} : { problems: v.problems.map(p => p.variable) }; })()
    },
    /* What this deployment can actually persist, on the one endpoint that
       needs no key. "The data did not save" and "this deployment cannot save"
       look identical from a browser, and the second is the one a deploy can
       silently cause — the same reason /health already reports the running
       commit. Mode and yes/no only; no credential can reach the wire. */
    storage: await (async () => {
      const store = require('./platform/database/store');
      /* On PostgreSQL the probe also answers the async half — reachable, and
         whether the schema is current — within a bounded time. */
      const cap = store.capability().mode === 'postgres' ? await store.probe() : store.capability();
      /* `requested` and `reason` travel with the mode, because without them
         "STORAGE_BACKEND never reached this runtime" and "Blobs is unreachable"
         look identical from a browser — and the first is far more common. It
         cost this project a round trip once already: /health reported
         mode "firebase" and there was no way to tell from the response whether
         the variable had been set at all. Neither field can carry a
         credential: `requested` is one of four literals, and `reason` is
         written here. */
      return {
        mode: cap.mode,
        requested: store.requestedBackend(),
        chosen: cap.chosen === true,
        durable: cap.durable,
        writable: cap.writable,
        transactional: cap.transactional === true,
        reason: cap.reason,
        ...(cap.reachable !== undefined ? { reachable: cap.reachable } : {}),
        ...(cap.schema ? { schema: cap.schema } : {}),
        ...(cap.remedy ? { remedy: cap.remedy } : {})
      };
    })(),
    timestamp: new Date().toISOString()
  });
});

// API v1 routes
app.use('/v1', v1Router);

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

// No catch-all HTML fallback.
//
// The dashboard navigates by data-page attribute and never touches the URL
// path — there is no client-side router to rescue — so a catch-all that
// returned index.html for every unmatched path did nothing for the UI and
// answered 200 to requests for endpoints that do not exist. express.static
// above already serves index.html at '/' along with every asset, so an
// unmatched path is genuinely not found and says so.

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested endpoint does not exist.',
    docs: '/v1'
  });
});

// Centralized error handler
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server Start (local dev only — Netlify uses the adapter)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const port = config.port;
  /* A server refuses to start on a variable it cannot run safely with; a
     serverless function reports the same list on /health instead. */
  const validation = config.validate();
  if (!validation.ok) {
    for (const p of validation.problems) console.error(`[CONFIG] ${p.variable}: ${p.problem} — ${p.remedy}`);
    if (config.env === 'production') { console.error('[CONFIG] refusing to start.'); process.exit(1); }
  }
  app.listen(port, () => {
    console.log(`CarbonIQ FinTech API running on port ${port}`);
    console.log(`Environment: ${config.env}`);
    console.log(`Dashboard: http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`API v1: http://localhost:${port}/v1`);

    // Startup diagnostics
    const hasFirebase = !!config.firebase.serviceAccount;
    const hasUiKey    = !!config.runtime.uiApiKey;
    const hasDevKey   = !!config.runtime.devApiKey;
    const hasAI       = !!config.anthropicApiKey;
    console.log(`Firebase: ${hasFirebase ? '✓ connected' : '✗ not configured (503 on DB routes)'}`);
    console.log(`UI Key:   ${hasUiKey   ? '✓ set (frontend auth enabled)' : '✗ not set (frontend will get 401)'}`);
    console.log(`Dev Key:  ${hasDevKey  ? '✓ set' : '— not set'}`);
    console.log(`AI:       ${hasAI      ? '✓ ready' : '✗ no ANTHROPIC_API_KEY'}`);
  });
}

module.exports = app;
