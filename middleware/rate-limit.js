/**
 * CarbonIQ FinTech — Rate Limiting Middleware
 *
 * Per-endpoint rate limiting using express-rate-limit.
 * API key-authenticated requests use the key's configured limit.
 * JWT-authenticated requests use the default limit.
 */

const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../config/constants');

function createLimiter(limitConfig = RATE_LIMITS.default) {
  return rateLimit({
    windowMs: limitConfig.windowMs,
    max: (req) => {
      // Use API key's configured rate limit if available
      if (req.apiKey && req.apiKey.rateLimit) {
        return req.apiKey.rateLimit;
      }
      return limitConfig.max;
    },
    keyGenerator: (req) => {
      // Rate limit by API key or user ID or IP
      if (req.apiKey) return `apikey:${req.apiKey.orgId}`;
      if (req.user) return `user:${req.user.uid}`;
      return req.ip;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(limitConfig.windowMs / 1000)
    }
  });
}

module.exports = {
  defaultLimiter:   createLimiter(RATE_LIMITS.default),
  assessLimiter:    createLimiter(RATE_LIMITS.assess),
  extractLimiter:   createLimiter(RATE_LIMITS.extract),
  portfolioLimiter: createLimiter(RATE_LIMITS.portfolio),
  webhookLimiter:   createLimiter(RATE_LIMITS.webhook),
  agentLimiter:     createLimiter(RATE_LIMITS.agent),
};
