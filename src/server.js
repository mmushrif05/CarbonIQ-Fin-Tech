// @ts-check
/**
 * CarbonIQ FinTech — Express Server
 *
 * Bank-facing API layer for construction carbon intelligence.
 * Wraps the existing CarbonIQ engine and exposes:
 * - Carbon Finance Score (0-100)
 * - Attributed embodied carbon (A1-A3) for lending
 * - Taxonomy alignment (ASEAN, EU, HK, SG)
 * - Green loan covenant engine
 * - Portfolio aggregation
 *
 * Runs locally via `npm start` or as a Netlify Function via fintech-api.js adapter.
 */

'use strict';

const express = require('express');
const helmet = /** @type {any} */ (require('helmet'));
const cors = require('cors');
const morgan = require('morgan');

const path = require('path');

const config = require('./platform/config');
const corsConfig = require('./platform/config/cors');
const errorHandler = require('./platform/http/error-handler');
const audit = require('./platform/observability/audit');
const logger = require('./platform/observability/logger');
const errors = require('./platform/observability/errors');
const envelope = require('./platform/http/envelope');
const deadlineMiddleware = require('./platform/http/deadline');
const csp = require('./platform/http/csp');
const jobQueue = require('./platform/jobs/queue');
/* The job handlers: the engines, registered on the platform's queue. */
require('./jobs');
const v1Router = require('./platform/http/router');

/*
 * The sample book a preview visitor is shown, handed to the platform rather
 * than reached for by it.
 *
 * `src/platform/auth/preview.js` decides when the book is installed and knows
 * nothing about what is in it; the book is Part C's, and the platform never
 * imports a domain (`tests/architecture.test.js` fails the build on it). This
 * file is a composition root, so the wiring belongs here — the same shape as
 * `require('./jobs')` above, which registers the domain engines on the
 * platform's queue.
 */
require('./platform/auth/preview').registerSampleBook(orgId =>
  require('./domains/pcaf-part-c/application/partc-demo-data').seedDemoBook(
    require('./domains/pcaf-part-c/application/partc-registry'),
    orgId,
    require('./domains/pcaf-part-c/application/partc-boq')));
const { doc, body, str, obj, orNull } = require('./platform/http/openapi-hints');

/* Express ships no types of its own; the app is untyped here, typed by the routes' Joi schemas at the boundary. */
const app = /** @type {any} */ (express());

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers (OWASP baseline)
/* The Content Security Policy is one string (platform/http/csp.js), applied
   here to what the function answers and, from netlify.toml, to what the CDN
   serves; a test holds the two to each other. */
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: csp.helmetDirectives() },
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

// The response envelope, where the caller asks for it (docs/API-CONTRACT.md)
app.use(envelope);

// The one clock every call in a request shares, read off the invocation
app.use(deadlineMiddleware);

// ---------------------------------------------------------------------------
// Static UI — serves the ui/ directory for local development.
// In production (Netlify), the publish directory handles this.
// ---------------------------------------------------------------------------

/* The source tree for local work; the built output (`npm run build:ui`) when
   UI_DIR names it, which is what the browser tests drive. */
app.use(express.static(path.resolve(__dirname, '..', config.runtime.uiDir)));

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
app.get('/health',
  doc({ summary: 'Health check — no credential required',
    description: 'Reports the running commit, because "the fix did not work" and "the fix has '
      + 'not been deployed" look identical from a browser and the second is far more common. '
      + 'The storage block says which store was **asked for** as well as which is running: '
      + '"the variable never took" and "the store is unreachable" look identical too. Names '
      + 'and yes/no only — no value can reach the wire.',
    response: body({
      status: str, service: str, version: str, commit: orNull(str),
      configured: obj, storage: obj, observability: obj,
    }, ['status', 'service']) }),
  async (_req, res) => {
  /* COMMIT_REF is a build-time variable and is absent from the function's
     runtime environment, so reading it here answered "unknown" on every
     production deploy — the diagnostic built to tell a broken fix from an
     undeployed one could not, in fact, tell them apart. The build now stamps
     build-info.json and this reads that, falling back to the environment for
     a local run. Absent stays absent rather than being guessed. */
  const stamped = (() => {
    try { return require('../build-info.json'); } catch (_) { return {}; }
  })();
  const commit = stamped.commit || config.runtime.build.commit;
  res.json({
    status: 'ok',
    service: 'carboniq-fintech',
    version: config.version,
    build: {
      commit: commit ? String(commit).slice(0, 12) : 'unknown (not a Netlify build)',
      branch: stamped.branch || config.runtime.build.branch,
      deployId: stamped.deployId || config.runtime.build.deployId,
      context: stamped.context || config.runtime.build.context,
      builtAt: stamped.builtAt || null
    },
    /* Whether this deployment can actually do its job, as booleans.
       "The dashboard shows 401" and "the AI does nothing" are both usually a
       variable that was never set on this context, and neither says so from a
       browser. Names and yes/no only — never a value. */
    configured: {
      /* Shape, not presence. These were `Boolean(…)` on the raw variable, so
         a deployment that had run `npm run setup:env` — which writes literal
         placeholders — answered all three true while the same process logged
         that the service account was not valid base64. */
      uiKey: config.runtime.capabilities.uiKey,
      anthropicKey: config.runtime.capabilities.anthropicKey,
      firebase: config.runtime.capabilities.firebase,
      /* Whether anyone can sign in at all. A deployment with no accounts
         answers 503 to every sign-in naming the command that fixes it, and
         "nobody has been created yet" is otherwise indistinguishable from
         "the password is wrong" from a browser. A count, never a name. */
      accounts: Boolean(await require('./platform/auth/users').countUsers()
        .catch(logger.fallback('health.accounts', 0))),
      /* Whether the first administrator can still be created over HTTP. An
         operator setting up a serverless deployment has no shell beside the
         database, so `npm run user:create` is not open to them; this says
         whether the one route that is, still answers. A boolean — the token
         itself never reaches the wire, here or anywhere. */
      bootstrap: Boolean((await require('./platform/http/auth-routes').bootstrapState()
        .catch(logger.fallback('health.bootstrap', { available: false }))).available),
      /* Boot validation, by variable name only. A problem is what the
         function refuses every other route on, so this is where the cause is
         read; a warning is what nothing refuses on and an operator should
         still see — the environment-size estimate is one. Either key is
         present only when it has something in it. */
      ...(() => {
        const v = config.validate();
        return {
          ...(v.problems.length ? { problems: v.problems.map(p => p.variable) } : {}),
          ...(v.warnings.length ? { warnings: v.warnings.map(p => p.variable) } : {}),
        };
      })()
    },
    /* What this deployment can actually persist, on the one endpoint that
       needs no key. "The data did not save" and "this deployment cannot save"
       look identical from a browser, and the second is the one a deploy can
       silently cause — the same reason /health already reports the running
       commit. Mode and yes/no only; no credential can reach the wire. */
    /* How this deployment can be watched: whether an error sink is
       configured (never which), the log level, where the metrics are. */
    observability: {
      logging: 'json',
      logLevel: config.log.level,
      errorTracking: errors.configured(),
      metrics: '/v1/metrics'
    },
    /* The job queue: which mode, how deep, and how a queued job gets worked. */
    jobs: await jobQueue.health(),
    contract: { openapi: '/v1/openapi.json', envelope: 'opt-in; see docs/API-CONTRACT.md' },
    /* Whether a rate limit covers the deployment or only this process. On a
       platform that runs many instances the second is not a limit, and from
       a response the two look identical. */
    rateLimits: require('./platform/http/rate-limit').describe(),
    storage: await (async () => {
      const store = require('./platform/database/store');
      /* On PostgreSQL the probe also answers the async half — reachable, and
         whether the schema is current — within a bounded time. */
      const cap = store.capability().mode === 'postgres' ? await store.probe() : store.capability();
      /* `requested` and `reason` travel with the mode, because without them
         "STORAGE_BACKEND never reached this runtime" and "Blobs is unreachable"
         look identical from a browser — and the first is far more common. It
         cost this project a round trip once already: /health reported
         mode "firebase" and there was no way to tell from the response whether
         the variable had been set at all. Neither field can carry a
         credential: `requested` is one of four literals, and `reason` is
         written here. */
      return {
        mode: cap.mode,
        requested: store.requestedBackend(),
        chosen: cap.chosen === true,
        durable: cap.durable,
        writable: cap.writable,
        transactional: cap.transactional === true,
        reason: cap.reason,
        ...(cap.reachable !== undefined ? { reachable: cap.reachable } : {}),
        ...(cap.schema ? { schema: cap.schema } : {}),
        ...(cap.remedy ? { remedy: cap.remedy } : {})
      };
    })(),
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

/* A rejection nobody caught and an exception nobody caught are reported
   with the same fields as a 500, so they alert with a module and a release
   rather than dying quietly in a function log. The process still ends on an
   uncaught exception — it is no longer in a state anyone can vouch for — but
   only after the report has been sent. */
if (!config.runtime.isTest) {
  process.on('unhandledRejection', reason => { errors.capture(/** @type {any} */ (reason), { source: 'unhandledRejection' }); });
  process.on('uncaughtException', err => {
    errors.capture(err, { source: 'uncaughtException' }).finally(() => process.exit(1));
  });
}

// ---------------------------------------------------------------------------
// Server Start (local dev only — Netlify uses the adapter)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const port = config.port;
  /* A server refuses to start on a variable it cannot run safely with; a
     serverless function reports the same list on /health instead. */
  const validation = config.validate();
  if (!validation.ok) {
    const log = logger.for('server');
    for (const p of validation.problems) log.error({ variable: p.variable, remedy: p.remedy }, `${p.variable}: ${p.problem}`);
    if (config.env === 'production') { log.fatal('refusing to start on the configuration problems above'); process.exit(1); }
  }
  app.listen(port, () => {
    console.log(`CarbonIQ FinTech API running on port ${port}`);
    console.log(`Environment: ${config.env}`);
    console.log(`Dashboard: http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`API v1: http://localhost:${port}/v1`);

    /* Startup diagnostics, on the same shape checks /health uses.
       `✓ connected` on a placeholder service account, and `✓ ready` on a key
       that is not an Anthropic key, are worse than saying nothing: the first
       thing a developer does with a banner is believe it. Three states, not
       two — absent, present but unusable, and usable. */
    const cap = config.runtime.capabilities;
    const state = (usable, present, ready, missing, malformed) =>
      (usable ? ready : present ? malformed : missing);
    console.log(`Firebase: ${state(cap.firebase, !!config.firebase.serviceAccount,
      '✓ connected', '✗ not configured (503 on DB routes)',
      '✗ set but unusable — FIREBASE_SERVICE_ACCOUNT is not base64 service-account JSON')}`);
    console.log(`UI Key:   ${state(cap.uiKey, !!config.runtime.uiApiKey,
      '✓ set (frontend auth enabled)', '✗ not set (frontend will get 401)',
      '✗ set but not of the form ck_test_/ck_live_ + 32 — the dashboard will get 401')}`);
    console.log(`Dev Key:  ${config.runtime.devApiKey ? '✓ set' : '— not set'}`);
    console.log(`AI:       ${state(cap.anthropicKey, !!config.anthropicApiKey,
      '✓ ready', '✗ no ANTHROPIC_API_KEY',
      '✗ set but not an Anthropic key — every agent fails at the first call')}`);
  });
}

module.exports = app;
