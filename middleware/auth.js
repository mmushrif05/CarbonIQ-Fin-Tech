/**
 * CarbonIQ FinTech — API Key Authentication Middleware
 *
 * Validates the X-API-Key header against hashed keys stored in Firebase.
 * Each API key is associated with a bank client record containing:
 *   - name, permissions, rateLimit, active status
 *
 * The key is hashed with HMAC-SHA256 before lookup so raw keys are
 * never stored at rest.
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Hash an API key using HMAC-SHA256 with the configured salt.
 */
const hashApiKey = (key) => {
  return crypto
    .createHmac('sha256', config.apiKey.salt)
    .update(key)
    .digest('hex');
};

/**
 * In-memory key cache to avoid hitting Firebase on every request.
 * TTL-based: entries expire after 5 minutes.
 */
const KEY_CACHE_TTL = 5 * 60 * 1000;
const keyCache = new Map();

const getCachedKey = (hashedKey) => {
  const entry = keyCache.get(hashedKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > KEY_CACHE_TTL) {
    keyCache.delete(hashedKey);
    return null;
  }
  return entry.data;
};

const setCachedKey = (hashedKey, data) => {
  keyCache.set(hashedKey, { data, timestamp: Date.now() });
};

/**
 * Clear the key cache (useful for tests).
 */
const clearKeyCache = () => keyCache.clear();

/**
 * Look up an API key in Firebase Realtime Database.
 * Returns the client record or null if not found / inactive.
 */
const lookupApiKey = async (hashedKey, db) => {
  // Check cache first
  const cached = getCachedKey(hashedKey);
  if (cached !== null) return cached;

  try {
    const snapshot = await db.ref(`fintech/apiKeys/${hashedKey}`).once('value');
    const record = snapshot.val();

    if (!record || record.active === false) {
      setCachedKey(hashedKey, null);
      return null;
    }

    setCachedKey(hashedKey, record);
    return record;
  } catch (err) {
    // If Firebase is unavailable, don't cache the failure
    throw err;
  }
};

/**
 * Express middleware — authenticates requests via X-API-Key header.
 *
 * On success, attaches `req.client` with the bank client metadata.
 * On failure, returns 401 or 403.
 */
const authenticate = (db) => {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing X-API-Key header. Obtain a key from your CarbonIQ account manager.',
      });
    }

    if (typeof apiKey !== 'string' || apiKey.length < 16) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid API key format.',
      });
    }

    try {
      const hashedKey = hashApiKey(apiKey);
      const client = await lookupApiKey(hashedKey, db);

      if (!client) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'API key is invalid or has been revoked.',
        });
      }

      // Attach client info for downstream handlers
      req.client = {
        id: hashedKey.substring(0, 12),
        name: client.name,
        permissions: client.permissions || [],
        rateLimit: client.rateLimit || config.apiKey.defaultRateLimit,
        tier: client.tier || 'standard',
      };

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { authenticate, hashApiKey, clearKeyCache };
