/**
 * CarbonIQ FinTech — Test Setup
 *
 * Configures test environment: mock Firebase, set env vars.
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.FINTECH_API_PORT = '3099';
process.env.FINTECH_API_ENABLED = 'true';
process.env.API_KEY_SALT = 'test-salt-for-hashing-do-not-use-in-production';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.WEBHOOK_SIGNING_SECRET = 'test-webhook-secret';
