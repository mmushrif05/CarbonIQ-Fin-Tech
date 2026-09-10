// @ts-check
/**
 * CarbonIQ FinTech — Centralized Configuration
 *
 * All environment variables and defaults in one place.
 * Import this module instead of reading process.env directly.
 */

'use strict';

const path = require('path');
/* One coercion for every environment variable that is a number. `parseInt`
   of an unset variable is NaN, and `NaN || 3001` happens to give the default —
   which is the right answer arrived at by accident, and reads as though the
   variable were being parsed. */
const { intOr, numberOr } = require('../../shared/numbers');

/* The shapes a credential has to have to be able to work.
 *
 * `/health` and the boot banner reported these as *presence* checks, so a
 * deployment that had run `npm run setup:env` — which writes literal
 * placeholders — printed `Firebase: ✓ connected` and `AI: ✓ ready` and
 * answered all three booleans true, while the same process logged that the
 * service account was not valid base64. A block built to tell "the variable
 * was never set" from "the service is down" could not tell either from "the
 * variable is a placeholder", which is the most common of the three on a
 * fresh checkout.
 *
 * Declared here because `config.validate()` already holds the same rule for
 * the dashboard key, and two copies of a shape are two answers to one
 * question. `platform/ai/ai-status.js` imports the Anthropic one. */
const KEY_SHAPES = Object.freeze({
  /** `ck_test_`/`ck_live_` plus 32 alphanumerics — what `key:create` issues. */
  uiApiKey: /^ck_(live|test)_[a-zA-Z0-9]{32}$/,
  /** `sk-ant-…`, far longer than a UUID and never a placeholder. */
  anthropicApiKey: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
});

/** A Firebase service account is usable only if it decodes to JSON naming a project. */
function firebaseServiceAccountUsable(raw) {
  if (!raw) return false;
  try {
    const json = JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
    return Boolean(json && json.project_id && json.client_email && json.private_key);
  } catch (_) {
    return false;
  }
}

// Load .env in development (not in Netlify production)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
  } catch (_) {
    // dotenv is optional — env vars can be set externally
  }
}

const config = {
  // --- Server ---
  env: process.env.NODE_ENV || 'development',
  port: intOr(process.env.FINTECH_API_PORT, 3001),
  version: require('../../../package.json').version,
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
  anthropicTimeoutMs: numberOr(process.env.ANTHROPIC_TIMEOUT_MS, 20000),
  /* Zero on purpose. A retry doubles the wall clock, and a serverless request
     has none to spare: 20s per call with one retry is 40s against a function
     killed at 26s, so the process died before the SDK ever gave up and the
     browser received no explanation at all. */
  anthropicMaxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES ?? 0),
  /* The wall clock a request actually runs against — netlify.toml sets the
     function timeout to 26s (Netlify Pro maximum). Everything in a request
     shares this budget; see src/platform/ai/deadline.js. */
  functionTimeoutMs: numberOr(process.env.FUNCTION_TIMEOUT_MS, 26000),

  // --- Security ---
  encryptionKey: process.env.DATA_ENCRYPTION_KEY,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.LLOWED_ORIGINS || '').split(',').filter(Boolean),

  // --- API Keys ---
  apiKey: {
    salt: process.env.API_KEY_SALT || 'default-dev-salt-change-in-production',
    defaultRateLimit: intOr(process.env.API_KEY_DEFAULT_RATE_LIMIT, 100)
  },

  // --- PCAF ---
  pcaf: {
    version: process.env.PCAF_VERSION || '3.0',
    defaultAttribution: numberOr(process.env.PCAF_DEFAULT_ATTRIBUTION, 1.0)
  },

  // --- Taxonomy ---
  taxonomy: {
    aseanVersion: intOr(process.env.TAXONOMY_ASEAN_VERSION, 3),
    euVersion: intOr(process.env.TAXONOMY_EU_VERSION, 2024),
    hkVersion: intOr(process.env.TAXONOMY_HK_VERSION, 2024)
  },

  // --- Webhooks ---
  webhook: {
    timeoutMs: intOr(process.env.WEBHOOK_TIMEOUT_MS, 5000),
    maxRetries: intOr(process.env.WEBHOOK_MAX_RETRIES, 3),
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
    /* Silent under test unless asked for, so a suite's output is the suite's. */
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    verbose: process.env.LOG_VERBOSE === 'true'
  },

  /* --- Read at the moment of use ---
     Everything above is read once, at load. These are read on every access,
     because they are the variables a deployment context, a test or an
     operator changes while the process runs — the storage backend, the
     database, the dashboard key — and the store, the health check and the
     tests all expect to see the change. They are still the only place the
     variable is named: a test asserts no `process.env` is read outside this
     file. */
  runtime: {
    get uiApiKey() { return process.env.UI_API_KEY || ''; },
    get devApiKey() { return process.env.DEV_API_KEY || ''; },
    get storageBackend() { return process.env.STORAGE_BACKEND || ''; },
    get isServerless() { return !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT); },
    get isTest() { return process.env.NODE_ENV === 'test'; },
    get databaseUrl() { return process.env.DATABASE_URL || ''; },
    get databaseSchema() { return process.env.DATABASE_SCHEMA || ''; },
    get databaseSsl() { return process.env.DATABASE_SSL || ''; },
    get databasePoolMax() { return process.env.DATABASE_POOL_MAX || ''; },
    get loanAmountThreshold() { return intOr(process.env.LOAN_AMOUNT_THRESHOLD, 50_000_000); },
    get coreAppUrl() { return process.env.CORE_APP_URL || process.env.APP_URL || ''; },
    get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || ''; },
    /* Error reporting is inert without a DSN; /health says whether one is set, never what it is. */
    get sentryDsn() { return process.env.SENTRY_DSN || ''; },
    get sentryEnvironment() { return process.env.SENTRY_ENVIRONMENT || ''; },
    /* The job queue: a shared token lets the API poke the background worker,
       and the site's own URL is where the worker lives. JOBS_INLINE runs a
       job inside the request that enqueued it — the local-development and
       test mode, and the honest answer where no database holds a queue. */
    get jobsToken() { return process.env.JOBS_TOKEN || ''; },
    get siteUrl() { return process.env.JOBS_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || ''; },
    get jobsInline() { return process.env.JOBS_INLINE === '1' || process.env.JOBS_INLINE === 'true'; },
    /* A grace period for keys issued before scopes existed. Unset, such a
       key is held to `read`; set, it keeps everything it could always do.
       It is a migration switch, and config.validate() refuses it in
       production so the grace cannot become the arrangement. */
    get allowUnscopedKeys() { return process.env.ALLOW_UNSCOPED_KEYS === '1' || process.env.ALLOW_UNSCOPED_KEYS === 'true'; },
    /* The directory the local server serves as the dashboard: the source
       tree, or the built output when the browser tests ask for it. */
    get uiDir() { return process.env.UI_DIR || 'ui'; },
    get firebaseConfigured() {
      return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT ||
        (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY));
    },
    /**
     * What this deployment can actually do — shape, not presence.
     *
     * `firebaseConfigured` above stays as it is because callers use it to
     * decide whether to *attempt* Firebase; this says whether the attempt can
     * succeed, which is the question `/health` and the banner are asking.
     */
    get capabilities() {
      const ui = process.env.UI_API_KEY || '';
      const anthropic = process.env.ANTHROPIC_API_KEY || '';
      const account = process.env.FIREBASE_SERVICE_ACCOUNT;
      const parts = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
      return {
        uiKey: KEY_SHAPES.uiApiKey.test(ui),
        anthropicKey: KEY_SHAPES.anthropicApiKey.test(anthropic),
        firebase: account ? firebaseServiceAccountUsable(account) : Boolean(parts),
      };
    },
    /* What the platform stamped on this build, where it did. */
    get build() {
      return {
        commit: process.env.COMMIT_REF || process.env.GIT_COMMIT || null,
        branch: process.env.BRANCH || process.env.HEAD || null,
        deployId: process.env.DEPLOY_ID || null,
        context: process.env.CONTEXT || process.env.NODE_ENV || null,
      };
    },
  },
};

/**
 * Boot-time validation: the variables a production deployment cannot run
 * without, or cannot run safely with. Names only in the result — never a
 * value — because /health prints it.
 *
 * @returns {{ ok: boolean, problems: {variable: string, problem: string, remedy: string}[] }}
 */
function validate({ env = config.env } = {}) {
  const problems = [];
  /* Staging is a production-shaped context: the same refusals apply, so a
     variable that would be unsafe in production is caught one deploy early. */
  const production = env === 'production' || env === 'staging';
  const salt = process.env.API_KEY_SALT || '';
  if (production && (!salt || salt === 'default-dev-salt-change-in-production')) {
    problems.push({ variable: 'API_KEY_SALT', problem: 'unset or the development default', remedy: "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" });
  }
  const ui = process.env.UI_API_KEY;
  if (ui && !KEY_SHAPES.uiApiKey.test(ui)) {
    problems.push({ variable: 'UI_API_KEY', problem: 'set, but not of the form ck_test_ or ck_live_ plus 32 alphanumerics', remedy: 'Issue one with npm run key:create -- --test and set it here.' });
  }
  /* A service account that does not decode is a problem only where Firebase is
     the store this deployment is going to use. Every PostgreSQL deployment
     carries the variable and never reads it — `npm run setup:env` writes a
     placeholder — and refusing to serve on that would stop a deployment that
     does not need Firebase at all. What it must not do is report itself as
     configured, and `runtime.capabilities.firebase` no longer does. */
  const account = process.env.FIREBASE_SERVICE_ACCOUNT;
  const firebaseIsTheStore = !process.env.DATABASE_URL
    && (process.env.STORAGE_BACKEND || 'auto') !== 'memory'
    && (process.env.STORAGE_BACKEND || 'auto') !== 'blobs';
  if (account && firebaseIsTheStore && !firebaseServiceAccountUsable(account)) {
    problems.push({ variable: 'FIREBASE_SERVICE_ACCOUNT', problem: 'set, but does not decode to a service-account JSON with project_id, client_email and private_key — and this deployment has no DATABASE_URL, so Firebase is the store', remedy: 'base64 the service account JSON: base64 -w0 service-account.json' });
  }
  const url = process.env.DATABASE_URL;
  if (url && !/^postgres(ql)?:\/\//.test(url)) {
    problems.push({ variable: 'DATABASE_URL', problem: 'set, but not a postgresql:// URL', remedy: 'postgresql://user:password@host:5432/database?sslmode=require' });
  }
  if (production && process.env.DEV_API_KEY) {
    problems.push({ variable: 'DEV_API_KEY', problem: 'set in production — the local-development bypass must not exist on a deployed site', remedy: 'Unset it on this context.' });
  }
  const dsn = process.env.SENTRY_DSN;
  if (dsn && !/^https?:\/\/[^@\s]+@[^\/\s]+\/(?:.*\/)?\d+\/?$/.test(dsn)) {
    problems.push({ variable: 'SENTRY_DSN', problem: 'set, but not of the form https://<key>@<host>/<project id>', remedy: 'Copy the DSN from the Sentry project settings, or unset it to run without error reporting.' });
  }
  if (production && process.env.STORAGE_BACKEND === 'memory') {
    problems.push({ variable: 'STORAGE_BACKEND', problem: 'memory in production — every write is lost when the process ends', remedy: 'Unset it, or set postgres / firebase / blobs.' });
  }
  return { ok: problems.length === 0, problems };
}

module.exports = Object.freeze({ ...config, validate, KEY_SHAPES, firebaseServiceAccountUsable });
