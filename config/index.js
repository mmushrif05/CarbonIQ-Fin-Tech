/**
 * CarbonIQ FinTech — Centralized Configuration
 *
 * All environment variables and defaults in one place.
 * Import this module instead of reading process.env directly.
 */

const path = require('path');

// Load .env in development (not in Netlify production)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (_) {
    // dotenv is optional — env vars can be set externally
  }
}

const config = {
  // --- Server ---
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.FINTECH_API_PORT, 10) || 3001,
  version: require('../package.json').version,
  apiEnabled: process.env.FINTECH_API_ENABLED !== 'false',

  // --- Firebase (shared with core platform) ---
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT
  },

  // --- AI ---
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  // Vision model used for PDF BOQ extraction — Opus for complex table layouts
  anthropicVisionModel: process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-6',
  anthropicFastModel: process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5',
  /* A serverless function is killed at a fixed wall clock (26s on Netlify
     Pro), so an SDK call must give up before that and say why. Without a
     ceiling the platform kills the request instead, the browser sees a
     truncated response, and the screen sits on "working…" for ever. */
  anthropicTimeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS) || 20000,
  /* Zero on purpose. A retry doubles the wall clock, and a serverless request
     has none to spare: 20s per call with one retry is 40s against a function
     killed at 26s, so the process died before the SDK ever gave up and the
     browser received no explanation at all. */
  anthropicMaxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES ?? 0),
  /* The wall clock a request actually runs against — netlify.toml sets the
     function timeout to 26s (Netlify Pro maximum). Everything in a request
     shares this budget; see services/agents/deadline.js. */
  functionTimeoutMs: Number(process.env.FUNCTION_TIMEOUT_MS) || 26000,

  // --- Security ---
  encryptionKey: process.env.DATA_ENCRYPTION_KEY,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.LLOWED_ORIGINS || '').split(',').filter(Boolean),

  // --- API Keys ---
  apiKey: {
    salt: process.env.API_KEY_SALT || 'default-dev-salt-change-in-production',
    defaultRateLimit: parseInt(process.env.API_KEY_DEFAULT_RATE_LIMIT, 10) || 100
  },

  // --- PCAF ---
  pcaf: {
    version: process.env.PCAF_VERSION || '3.0',
    defaultAttribution: parseFloat(process.env.PCAF_DEFAULT_ATTRIBUTION) || 1.0
  },

  // --- Taxonomy ---
  taxonomy: {
    aseanVersion: parseInt(process.env.TAXONOMY_ASEAN_VERSION, 10) || 3,
    euVersion: parseInt(process.env.TAXONOMY_EU_VERSION, 10) || 2024,
    hkVersion: parseInt(process.env.TAXONOMY_HK_VERSION, 10) || 2024
  },

  // --- Webhooks ---
  webhook: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS, 10) || 5000,
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 3,
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || ''
  },

  // --- Feature Flags ---
  features: {
    covenantEngine: process.env.FF_COVENANT_ENGINE !== 'false',
    portfolioAggregation: process.env.FF_PORTFOLIO_AGGREGATION !== 'false',
    taxonomyChecker: process.env.FF_TAXONOMY_CHECKER !== 'false',
    certificateGeneration: process.env.FF_CERTIFICATE_GENERATION === 'true',
    insuranceOutput: process.env.FF_INSURANCE_OUTPUT === 'true'
  },

  // --- Logging ---
  log: {
    level: process.env.LOG_LEVEL || 'info',
    verbose: process.env.LOG_VERBOSE === 'true'
  }
};

module.exports = Object.freeze(config);
