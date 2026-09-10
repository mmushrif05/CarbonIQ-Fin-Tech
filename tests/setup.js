// @ts-check
/**
 * CarbonIQ FinTech — Test Setup
 *
 * Configures test environment: mock Firebase, set env vars.
 */

'use strict';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.FINTECH_API_PORT = '3099';
process.env.FINTECH_API_ENABLED = 'true';
process.env.API_KEY_SALT = 'test-salt-for-hashing-do-not-use-in-production';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.WEBHOOK_SIGNING_SECRET = 'test-webhook-secret';

/* The credential and the store, set once here.
 *
 * `UI_API_KEY` was set in 34 suites with 7 distinct literals, and
 * `STORAGE_BACKEND` in 20, each before its own `require('../src/server')` —
 * so adding a suite meant knowing which two lines to copy, and changing the
 * key format meant a 34-file edit. Both have a default here now, and a suite
 * that needs its own value still sets it: these are `||` defaults, and the
 * four suites that deliberately hold a distinct key (api-contract,
 * authentication, jobs, observability) assign unconditionally and keep it.
 *
 * `tests/helpers/api.js` is the other half — one `auth()` and one `api()`
 * rather than 25 copies. */
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';
if (!process.env.TEST_DATABASE_URL) {
  process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';
}

/* The suite's output is the suite's. A .env in the checkout may set
   LOG_LEVEL; it is overridden here, and TEST_LOG_LEVEL=info shows the lines
   when a test is being driven by hand. */
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'silent';

/* Against PostgreSQL when asked. Each worker uses the schema tests/global-setup.js
   migrated for it, so 91 suites can run in parallel on one database. */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SCHEMA = `test_w${process.env.JEST_WORKER_ID || 1}`;
  process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'postgres';
}
