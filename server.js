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

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// Request logging
if (config.env !== 'test') {
  app.use(morgan('short'));
}

// Audit trail — logs every request for compliance
app.use(audit);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — no auth required
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'carboniq-fintech',
    version: config.version,
    timestamp: new Date().toISOString()
  });
});

// API v1 routes
app.use('/v1', v1Router);

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

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
