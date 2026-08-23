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

const config = require('./config');
const corsConfig = require('./config/cors');
const errorHandler = require('./middleware/error-handler');
const audit = require('./middleware/audit');
const v1Router = require('./routes/v1');

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

app.use(express.static(path.join(__dirname, 'ui')));

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
app.get('/health', (_req, res) => {
  const commit = process.env.COMMIT_REF || process.env.GIT_COMMIT || null;
  res.json({
    status: 'ok',
    service: 'carboniq-fintech',
    version: config.version,
    build: {
      commit: commit ? String(commit).slice(0, 12) : 'unknown (not a Netlify build)',
      branch: process.env.BRANCH || process.env.HEAD || null,
      deployId: process.env.DEPLOY_ID || null,
      context: process.env.CONTEXT || process.env.NODE_ENV || null
    },
    /* Whether this deployment can actually do its job, as booleans.
       "The dashboard shows 401" and "the AI does nothing" are both usually a
       variable that was never set on this context, and neither says so from a
       browser. Names and yes/no only — never a value. */
    configured: {
      uiKey: Boolean(process.env.UI_API_KEY),
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      firebase: Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT ||
        (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
      )
    },
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
  app.listen(port, () => {
    console.log(`CarbonIQ FinTech API running on port ${port}`);
    console.log(`Environment: ${config.env}`);
    console.log(`Dashboard: http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`API v1: http://localhost:${port}/v1`);

    // Startup diagnostics
    const hasFirebase = !!config.firebase.serviceAccount;
    const hasUiKey    = !!process.env.UI_API_KEY;
    const hasDevKey   = !!process.env.DEV_API_KEY;
    const hasAI       = !!config.anthropicApiKey;
    console.log(`Firebase: ${hasFirebase ? '✓ connected' : '✗ not configured (503 on DB routes)'}`);
    console.log(`UI Key:   ${hasUiKey   ? '✓ set (frontend auth enabled)' : '✗ not set (frontend will get 401)'}`);
    console.log(`Dev Key:  ${hasDevKey  ? '✓ set' : '— not set'}`);
    console.log(`AI:       ${hasAI      ? '✓ ready' : '✗ no ANTHROPIC_API_KEY'}`);
  });
}

module.exports = app;
