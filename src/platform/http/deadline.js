// @ts-check
/**
 * The request's deadline, attached by the HTTP layer.
 *
 * The Netlify adapter puts the invocation context on the request; this
 * middleware reads what the platform says is left and builds the one
 * `Deadline` every call in the request shares (`platform/ai/deadline.js`).
 * The AI layer never sees a request object — the figure crosses the seam,
 * not the transport — which is the layering the readiness register asked
 * for (gap E6).
 */

'use strict';

const { fromRemaining } = require('../ai/deadline');

function deadline(req, _res, next) {
  req.deadline = fromRemaining(remainingOf(req));
  next();
}

/** What the platform says is left on this invocation, where it says. */
function remainingOf(req) {
  const ctx = req && req.lambdaContext;
  return ctx && typeof ctx.getRemainingTimeInMillis === 'function' ? Number(ctx.getRemainingTimeInMillis()) : undefined;
}

/** The request's deadline: the one the middleware attached, else one read off the invocation now. */
function forRequest(req) {
  return (req && req.deadline) || fromRemaining(remainingOf(req));
}

module.exports = deadline;
module.exports.forRequest = forRequest;
