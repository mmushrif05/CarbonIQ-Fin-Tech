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
const app = require('../../server');

const handler = serverless(app);

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
