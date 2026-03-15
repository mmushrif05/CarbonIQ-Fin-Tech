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
const app = require('../server');

const handler = serverless(app);

exports.handler = async (event, context) => {
  // Strip the function path prefix so Express sees clean routes
  // Netlify sends: /.netlify/functions/fintech-api/v1/projects/123
  // Express needs: /v1/projects/123
  if (event.path.includes('/.netlify/functions/fintech-api')) {
    event.path = event.path.replace('/.netlify/functions/fintech-api', '') || '/';
  }

  return handler(event, context);
};
