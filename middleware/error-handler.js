/**
 * CarbonIQ FinTech — Centralized Error Handler
 *
 * Catches all unhandled errors and returns a consistent JSON response.
 * In development mode, includes the stack trace for debugging.
 */

const config = require('../config');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  // CORS errors from the cors middleware
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      error: 'CORS_ERROR',
      message: err.message,
    });
  }

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.details
        ? err.details.map(d => d.message).join('; ')
        : err.message,
    });
  }

  // Known operational errors with a statusCode
  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error('[ERROR]', err.message, err.stack);
  }

  const response = {
    error: err.code || 'INTERNAL_ERROR',
    message: isServerError
      ? 'An unexpected error occurred. Please try again or contact support.'
      : err.message,
  };

  if (config.env === 'development' && isServerError) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
