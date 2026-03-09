/**
 * CarbonIQ FinTech — Centralized Configuration
 *
 * Reads environment variables and exposes a frozen config object.
 * Defaults are safe for local development.
 */

const pkg = require('../package.json');

const config = Object.freeze({
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.FINTECH_API_PORT, 10) || 3001,
  version: pkg.version,
  enabled: process.env.FINTECH_API_ENABLED !== 'false',

  // Firebase
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
  },

  // API key management
  apiKey: {
    salt: process.env.API_KEY_SALT || '',
    defaultRateLimit: parseInt(process.env.API_KEY_DEFAULT_RATE_LIMIT, 10) || 100,
  },

  // Encryption
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY,

  // PCAF
  pcaf: {
    version: process.env.PCAF_VERSION || '3.0',
    defaultAttribution: parseFloat(process.env.PCAF_DEFAULT_ATTRIBUTION) || 1.0,
  },

  // Taxonomy
  taxonomy: {
    aseanVersion: parseInt(process.env.TAXONOMY_ASEAN_VERSION, 10) || 3,
    euVersion: parseInt(process.env.TAXONOMY_EU_VERSION, 10) || 2024,
    hkVersion: parseInt(process.env.TAXONOMY_HK_VERSION, 10) || 2024,
  },

  // Webhooks
  webhook: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS, 10) || 5000,
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES, 10) || 3,
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET,
  },

  // Feature flags
  features: {
    covenantEngine: process.env.FF_COVENANT_ENGINE !== 'false',
    portfolioAggregation: process.env.FF_PORTFOLIO_AGGREGATION !== 'false',
    taxonomyChecker: process.env.FF_TAXONOMY_CHECKER !== 'false',
    certificateGeneration: process.env.FF_CERTIFICATE_GENERATION === 'true',
    insuranceOutput: process.env.FF_INSURANCE_OUTPUT === 'true',
  },

  // Logging
  log: {
    level: process.env.LOG_LEVEL || 'info',
    verbose: process.env.LOG_VERBOSE === 'true',
  },
});

module.exports = config;
