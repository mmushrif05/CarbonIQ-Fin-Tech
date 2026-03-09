/**
 * CarbonIQ FinTech — API v1 Router
 *
 * All v1 endpoints are mounted under /v1 by server.js.
 * Authentication is enforced on all routes except the
 * service info endpoint.
 *
 * Route groups (to be built in subsequent steps):
 *   /v1/score      — Carbon Finance Score
 *   /v1/pcaf       — PCAF v3 output
 *   /v1/taxonomy   — Taxonomy alignment
 *   /v1/covenants  — Green loan covenants
 *   /v1/portfolio  — Portfolio aggregation
 *   /v1/webhooks   — Webhook management
 */

const { Router } = require('express');
const config = require('../../config');
const { initFirebase } = require('../../config/firebase');
const { authenticate } = require('../../middleware/auth');
const { globalLimiter, clientLimiter } = require('../../middleware/rate-limiter');

const router = Router();

// ---------------------------------------------------------------------------
// Global rate limiter for all v1 routes
// ---------------------------------------------------------------------------
router.use(globalLimiter);

// ---------------------------------------------------------------------------
// Public routes (no auth required)
// ---------------------------------------------------------------------------

// Service info — returns API version and available features
router.get('/', (_req, res) => {
  res.json({
    service: 'carboniq-fintech',
    version: `v1 (${config.version})`,
    features: config.features,
    endpoints: [
      'GET  /v1              — This service info',
      'POST /v1/score        — Calculate Carbon Finance Score',
      'POST /v1/pcaf         — Generate PCAF v3 output',
      'POST /v1/taxonomy     — Check taxonomy alignment',
      'POST /v1/covenants    — Evaluate green loan covenants',
      'POST /v1/portfolio    — Aggregate portfolio emissions',
      'POST /v1/webhooks     — Manage webhook subscriptions',
    ],
  });
});

// ---------------------------------------------------------------------------
// Authenticated routes — everything below requires a valid API key
// ---------------------------------------------------------------------------
const db = initFirebase();
router.use(authenticate(db));
router.use(clientLimiter);

// --- Carbon Finance Score ---
router.post('/score', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Carbon Finance Score endpoint — coming in Step 4.',
    client: req.client.name,
  });
});

// --- PCAF v3 Output ---
router.post('/pcaf', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'PCAF v3 output endpoint — coming in Step 6.',
    client: req.client.name,
  });
});

// --- Taxonomy Alignment ---
router.post('/taxonomy', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Taxonomy alignment endpoint — coming in Step 8.',
    client: req.client.name,
  });
});

// --- Green Loan Covenants ---
router.post('/covenants', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Covenant engine endpoint — coming in Step 10.',
    client: req.client.name,
  });
});

// --- Portfolio Aggregation ---
router.post('/portfolio', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Portfolio aggregation endpoint — coming in Step 12.',
    client: req.client.name,
  });
});

// --- Webhook Management ---
router.post('/webhooks', (req, res) => {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Webhook management endpoint — coming in Step 14.',
    client: req.client.name,
  });
});

module.exports = router;
