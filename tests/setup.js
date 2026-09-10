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

/* A well-formed key that is not a key, for the same reason.
 *
 * `require-ai` refuses a call *before* the SDK when the key is absent or does
 * not have the shape of an Anthropic key — which is the right behaviour and
 * the reason the gate exists. But it means a suite that mocks the SDK never
 * reaches its mock unless something has put a plausible key on the
 * environment, and on a developer's machine `.env` quietly does. So
 * `tests/assess.test.js` and `tests/extract.test.js` passed here and failed in
 * CI, which has no `.env` — seven failures that no local run could produce.
 *
 * The value is deliberately not a credential: it has the shape the gate
 * checks and nothing else, the SDK is mocked in every suite that gets this
 * far, and a real call would be refused by Anthropic. The two suites that
 * test the gate itself assign their own unconditionally and keep it.
 *
 * The condition is the **shape**, not presence — `|| ` alone was not enough.
 * `npm run setup:env` writes `PASTE_YOUR_ANTHROPIC_API_KEY_HERE` into `.env`,
 * dotenv puts it on the environment before this file runs, and a presence
 * check then keeps the placeholder and the gate still refuses. That is the
 * same third state `/health` already distinguishes: absent, present but
 * unusable, usable. A real key in `.env` is left alone. */
const FAKE_ANTHROPIC_KEY = `sk-ant-api03-${'not-a-real-key'.repeat(6)}`;
if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(process.env.ANTHROPIC_API_KEY || '')) {
  process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC_KEY;
}
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
