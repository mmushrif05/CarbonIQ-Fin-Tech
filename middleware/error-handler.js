/**
 * CarbonIQ FinTech — Centralized Error Handler
 *
 * Catches all unhandled errors and returns structured JSON responses.
 * Never leaks stack traces or internal details in production.
 */

const config = require('../config');

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
