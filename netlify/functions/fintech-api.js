/**
 * CarbonIQ FinTech — Netlify Function Adapter
 *
 * Wraps the Express app as a Netlify serverless function.
 * This allows the same Express app to run both locally (npm start)
 * and as a serverless function on Netlify.
 *
 * Routes:
 *   /bank/*  → fintech-api (via netlify.toml redirects)
 *   /v1/*    → fintech-api (via netlify.toml redirects)
 */

/*
 * Error reporting is started BEFORE the app is required, so a failure while
 * the app itself is loading is still reported. It is a no-op unless
 * SENTRY_DSN is set.
 */
require('../../services/observability').init();

const serverless = require('serverless-http');
const app = require('../../server');

/**
 * Response types that must survive as bytes.
 *
 * Without this list serverless-http hands the body back as a UTF-8 string.
 * Every byte above 127 is then re-encoded as a multi-byte sequence — a 34KB
 * PDF arrived as 63KB of mangled text, which downloads but will not open,
 * so a report looked empty. Naming the binary types makes the adapter
 * base64-encode the body and set isBase64Encoded, and the bytes arrive
 * exactly as written.
 */
const BINARY_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
  'image/*',
  'font/*'
];

const handler = serverless(app, { binary: BINARY_TYPES });

exports.handler = async (event, context) => {
  // Netlify may provide rawPath instead of path depending on invocation method.
  // Normalise to event.path so serverless-http always has a valid string.
  const rawPath = event.path || event.rawPath || '/';

  // Strip the function path prefix so Express sees clean routes
  // Direct call: /.netlify/functions/fintech-api/v1/projects/123 → /v1/projects/123
  // Redirect invocation: /v1/projects/123 → /v1/projects/123 (no-op)
  event.path = rawPath.includes('/.netlify/functions/fintech-api')
    ? rawPath.replace('/.netlify/functions/fintech-api', '') || '/'
    : rawPath;

  return handler(event, context);
};
