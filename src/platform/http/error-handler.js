/**
 * CarbonIQ FinTech — Centralized Error Handler
 *
 * Catches all unhandled errors and returns structured JSON responses.
 * Never leaks stack traces or internal details in production.
 *
 * A 500 is an incident: it is reported through
 * `platform/observability/errors` — logged with the failing module, the
 * request id and the organisation, and sent to the error sink where one is
 * configured — and the report is awaited before the response goes out, so a
 * serverless container is not frozen with the report still in flight. The
 * response carries the report's `eventId` beside `requestId`, so a screen
 * can quote the one handle that finds both the log line and the alert. An
 * explained 5xx — one that arrived with its own code and remedy — is
 * reported best-effort and answered without waiting.
 */

'use strict';

const config = require('../config');
const logger = require('../observability/logger');
const errors = require('../observability/errors');

const log = logger.for('platform/http/error-handler');

/**
 * Is this an Anthropic SDK failure?
 *
 * Matched on the SDK's own base class rather than on the message text: the
 * message is exactly what is unreliable here ("401 terminated" carries no
 * code), and `err.name` is a bare "Error" on every SDK error class.
 */
function isAnthropicError(err) {
  if (!err) return false;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    if (Anthropic.AnthropicError && err instanceof Anthropic.AnthropicError) return true;
    if (Anthropic.APIError && err instanceof Anthropic.APIError) return true;
  } catch (_) { /* SDK absent — fall through */ }
  // A wrapped error keeps the class name even when the instance check cannot
  // see it, e.g. across a duplicated copy of the SDK in the tree.
  return /^(APIError|AnthropicError|APIConnection|APIUserAbort|Authentication|RateLimit|NotFound|BadRequest|InternalServer|PermissionDenied|UnprocessableEntity|Conflict)/
    .test((err.constructor && err.constructor.name) || '');
}

/** The status and body an error answers with. */
function shape(err, req) {
  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return { status: 403, body: { error: 'CORS_ERROR', message: err.message } };
  }

  // Joi validation error (if not caught by validate middleware)
  if (err.isJoi) {
    return {
      status: 400,
      body: {
        error: 'VALIDATION_ERROR',
        message: err.details.map(d => d.message).join('; '),
        details: err.details.map(d => ({
          field: Array.isArray(d.path) ? d.path.join('.') : '',
          message: d.message
        }))
      }
    };
  }

  // Firebase errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
    return { status: 401, body: { error: 'AUTH_ERROR', message: 'Authentication failed.' } };
  }

  /*
   * Anthropic SDK failures.
   *
   * The SDK's own message for a rejected key is "401 terminated", which
   * names neither the cause nor the fix. Reaching the browser as
   * {"error":"ERROR","message":"401 terminated"} it reads as an agent that
   * did nothing at all. Every branch of diagnose() answers both questions,
   * and the response says what still works without the AI layer.
   */
  if (isAnthropicError(err)) {
    const { diagnose } = require('../ai/ai-status');
    const d = diagnose(err);
    const httpStatus = d.status === 'rate_limited' ? 429
      : d.status === 'timeout' ? 504
        : (d.status === 'key_rejected' || d.status === 'model_unavailable'
          || d.status === 'forbidden' || d.status === 'network_blocked') ? 503
          : (d.httpStatus && d.httpStatus >= 400 && d.httpStatus < 600) ? d.httpStatus : 502;

    return {
      status: httpStatus,
      body: {
        error: 'AI_UNAVAILABLE',
        reason: d.status,
        message: d.message,
        remedy: d.remedy,
        diagnose: 'GET /v1/agent/health',
        unaffected: require('./require-ai').UNAFFECTED,
        requestId: req.requestId
      }
    };
  }

  // Default: use err.code as error identifier when available
  const status = err.status || err.statusCode || 500;

  /* The remedy is the half a user can act on. A deadline error that says only
     "not enough time left" tells someone their upload failed; the same error
     carrying "paste the text instead" tells them what to do next. It was
     being set on the error and then dropped here, so it never reached a
     screen. Never attached to a 500, whose message is deliberately generic. */
  const body = {
    error: status === 500 ? 'INTERNAL_ERROR' : (err.code || 'ERROR'),
    message: status === 500
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
    requestId: req.requestId
  };
  if (status !== 500 && err.remedy) body.remedy = err.remedy;
  return { status, body };
}

/* Express recognises an error handler by its arity: this must take four. */
async function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const { status, body } = shape(err, req);

  if (status === 500) {
    /* Unexpected: the incident the exit criterion names. Awaited, so the
       report is out before the container can be frozen. */
    const report = await errors.capture(err, { req, status });
    body.eventId = report.eventId;
  } else if (status >= 500) {
    /* Explained — a store unreachable, the AI provider down, a deadline
       exceeded — with its own code and remedy. Reported best-effort; the
       request line is an error-level log regardless, and that is what the
       drain alerts on. */
    errors.capture(err, { req, status });
  } else {
    log.debug({ err, status, code: body.error, requestId: req.requestId }, `${status} ${body.error}`);
  }
  if (config.env === 'development' && status >= 500 && err.stack) body.stack = err.stack;

  return res.status(status).json(body);
}

module.exports = errorHandler;
