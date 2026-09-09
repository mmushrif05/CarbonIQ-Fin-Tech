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

/* Against PostgreSQL when asked. Each worker uses the schema tests/global-setup.js
   migrated for it, so 91 suites can run in parallel on one database. */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SCHEMA = `test_w${process.env.JEST_WORKER_ID || 1}`;
  process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'postgres';
}
