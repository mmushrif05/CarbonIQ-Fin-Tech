// @ts-check
/**
 * CarbonIQ FinTech — Rate Limiting Middleware
 *
 * Per-endpoint rate limiting using express-rate-limit.
 * API key-authenticated requests use the key's configured limit.
 * JWT-authenticated requests use the default limit.
 */

const rateLimit = /** @type {any} */ (require('express-rate-limit'));
const { RATE_LIMITS } = require('../../shared/constants');
const limitStore = require('./rate-limit-store');

/**
 * @param {any} limitConfig
 * @param {string} name the counter's prefix, so two tiers do not share a row
 */
function createLimiter(limitConfig = RATE_LIMITS.default, name = 'default') {
  return rateLimit({
    windowMs: limitConfig.windowMs,
    /* Shared across instances where the database is there to share it;
       otherwise the library's own per-process store, which limitStore
       .describe() reports honestly rather than leaving it to be assumed. */
    store: limitStore.storeFor(name),
    max: (req) => {
      // Use API key's configured rate limit if available
      if (req.apiKey && req.apiKey.rateLimit) {
        return req.apiKey.rateLimit;
      }
      return limitConfig.max;
    },
    keyGenerator: (req) => {
      // Rate limit by API key or user ID or IP
      if (req.user) return `user:${req.user.uid}`;
      if (req.apiKey) return `apikey:${req.apiKey.orgId}`;
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
  defaultLimiter:   createLimiter(RATE_LIMITS.default, 'default'),
  assessLimiter:    createLimiter(RATE_LIMITS.assess, 'assess'),
  extractLimiter:   createLimiter(RATE_LIMITS.extract, 'extract'),
  portfolioLimiter: createLimiter(RATE_LIMITS.portfolio, 'portfolio'),
  webhookLimiter:   createLimiter(RATE_LIMITS.webhook, 'webhook'),
  agentLimiter:     createLimiter(RATE_LIMITS.agent, 'agent'),
  createLimiter,
  describe: limitStore.describe,
};
