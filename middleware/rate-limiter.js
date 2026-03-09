/**
 * CarbonIQ FinTech — Rate Limiter
 *
 * Two layers:
 * 1. Global rate limit — protects against DDoS (applied to all routes)
 * 2. Per-client rate limit — respects the client's plan tier
 *
 * Uses express-rate-limit with in-memory store (swap for Redis in production).
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Global rate limiter — generous limit to stop abuse without
 * blocking legitimate traffic.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
});

/**
 * Per-client rate limiter — uses the client ID set by auth middleware.
 * Falls back to IP if no client is present.
 */
const clientLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    return (req.client && req.client.rateLimit) || config.apiKey.defaultRateLimit;
  },
  keyGenerator: (req) => {
    return (req.client && req.client.id) || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Client rate limit exceeded. Upgrade your plan or wait before retrying.',
  },
});

module.exports = { globalLimiter, clientLimiter };
