// @ts-check
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

const serverless = require('serverless-http');
const app = require('../../src/server');
const errors = require('../../src/platform/observability/errors');
const config = require('../../src/platform/config');
const { asError } = require('../../src/shared/types');

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

/**
 * The platform's clock is attached to every request.
 *
 * A function is killed at a fixed wall clock, and that clock starts at
 * invocation — not when a route handler begins. Everything before the handler
 * (cold start, Firebase init, parsing an 80KB base64 PDF) is already spent, so
 * a budget measured from the handler over-promises by exactly that much and
 * the process is killed while it still believes it has time. A killed process
 * returns no body, which is the one failure nobody can diagnose from a
 * browser. `getRemainingTimeInMillis()` is the only honest answer, and it is
 * free — it just has to be carried through.
 */
const handler = serverless(app, {
  binary: BINARY_TYPES,
  request(req, _event, context) { req.lambdaContext = context; }
});

/**
 * A production deployment that is not safe to run refuses to serve.
 *
 * `config.validate()` names, by variable, what a deployment cannot run
 * safely with — a default API-key salt, DEV_API_KEY, an in-memory store in
 * production. `src/server.js` acts on it and exits. This function never
 * called it, so on the platform that actually serves production the check
 * did nothing: the problems were listed under /health and the site carried
 * on. On a public repository a default salt means the key hashes are
 * computable from a constant anyone can read, which is not a thing to report
 * and continue past.
 *
 * A serverless function cannot exit, so it answers 503 on every route
 * instead, naming the variables and never their values. /health stays
 * reachable, because the first question anyone asks is what is wrong.
 */
const problems = config.validate().problems;
const blocked = problems.length > 0;
if (blocked) {
  /* One line at boot, so the cause is in the log drain as well as the reply. */
  // eslint-disable-next-line no-console
  errors.capture(new Error(`refusing to serve: ${problems.map(p => p.variable).join(', ')}`),
    { source: 'boot' });
}

function refuse(event) {
  return {
    statusCode: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      error: 'DEPLOYMENT_UNSAFE',
      message: 'This deployment is not configured safely enough to serve requests.',
      variables: problems.map(p => ({ variable: p.variable, problem: p.problem, remedy: p.remedy })),
      remedy: 'Set these in the site environment for this context and redeploy.',
      path: event && event.path,
    }),
  };
}

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

  /* Express reports its own failures; this catches the adapter's, which
     would otherwise reach the platform as a bare invocation error with no
     request id, no module and no release. */
  /* /health always answers, so "why is everything 503" has an answer. */
  if (blocked && !/^\/health\/?$/.test(event.path)) return refuse(event);

  try {
    return await handler(event, context);
  } catch (err) {
    await errors.capture(asError(err), { source: 'invocation', requestId: event.headers && event.headers['x-request-id'] });
    throw err;
  }
};
