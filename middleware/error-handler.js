/**
 * CarbonIQ FinTech — Centralized Error Handler
 *
 * Catches all unhandled errors and returns structured JSON responses.
 * Never leaks stack traces or internal details in production.
 */

const config = require('../config');

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

function errorHandler(err, req, res, _next) {
  // Log full error internally
  console.error('[ERROR]', {
    requestId: req.requestId,
    message: err.message,
    stack: config.env === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method
  });

  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      error: 'CORS_ERROR',
      message: err.message
    });
  }

  // Joi validation error (if not caught by validate middleware)
  if (err.isJoi) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.details.map(d => d.message).join('; '),
      details: err.details.map(d => ({
        field: Array.isArray(d.path) ? d.path.join('.') : '',
        message: d.message
      }))
    });
  }

  // Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    return res.status(401).json({
      error: 'AUTH_ERROR',
      message: 'Authentication failed.'
    });
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
    const { diagnose } = require('../services/agents/ai-status');
    const d = diagnose(err);
    const httpStatus = d.status === 'rate_limited' ? 429
      : d.status === 'timeout' ? 504
        : (d.status === 'key_rejected' || d.status === 'model_unavailable'
          || d.status === 'forbidden' || d.status === 'network_blocked') ? 503
          : (d.httpStatus && d.httpStatus >= 400 && d.httpStatus < 600) ? d.httpStatus : 502;

    return res.status(httpStatus).json({
      error: 'AI_UNAVAILABLE',
      reason: d.status,
      message: d.message,
      remedy: d.remedy,
      diagnose: 'GET /v1/agent/health',
      unaffected: require('./require-ai').UNAFFECTED,
      requestId: req.requestId
    });
  }

  // Default: use err.code as error identifier when available
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'INTERNAL_ERROR' : (err.code || 'ERROR'),
    message: status === 500
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
    requestId: req.requestId
  });
}

module.exports = errorHandler;
