// @ts-check
/**
 * CarbonIQ FinTech — Rate Limiting Middleware
 *
 * Per-endpoint rate limiting using express-rate-limit.
 * API key-authenticated requests use the key's configured limit.
 * JWT-authenticated requests use the default limit.
 */

'use strict';

const rateLimit = /** @type {any} */ (require('express-rate-limit'));
const { RATE_LIMITS } = require('../../shared/constants');
const limitStore = require('./rate-limit-store');
const { PREVIEW_ORG } = require('../auth/preview');

/**
 * The bucket is the caller.
 *
 * For an integration key the caller is the organisation, and for a signed-in
 * person it is the account — because an account is a person. There is one
 * account that is not: every preview visitor is admitted on the single shared
 * `preview@carboniq.invalid` account (docs/AUTHENTICATION.md), deliberately,
 * so that a public form never writes into the table holding every real person.
 * Keyed on the account they therefore shared one allowance, and one visitor
 * reading the sample book spent it for everybody else — a visitor who had made
 * fifty requests was refused because somebody they have never met had made the
 * other fifty. The session is the thing a visitor actually holds, and it is
 * already the token's digest rather than the token, so it names the caller
 * without being a credential.
 *
 * @param {any} req
 * @returns {string}
 */
function keyFor(req) {
  if (req.user) {
    return req.user.organizationId === PREVIEW_ORG && req.session && req.session.id
      ? `preview-session:${req.session.id}`
      : `user:${req.user.uid}`;
  }
  if (req.apiKey) return `apikey:${req.apiKey.orgId}`;
  return req.ip;
}

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
    keyGenerator: keyFor,
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
  keyFor,
  describe: limitStore.describe,
};
