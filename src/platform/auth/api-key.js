// @ts-check
/**
 * CarbonIQ FinTech — API Key Authentication Middleware
 *
 * Verifies API keys for bank system integrations (LOS, risk engines).
 * Keys are SHA-256 hashed before storage — never stored in plain text.
 *
 * Usage: app.use('/v1/external', apiKey, routeHandler)
 *
 * API Key format: ck_live_<32-char-random> (production) or ck_test_<32-char-random> (sandbox)
 */

const crypto = require('crypto');
const config = require('../config');
const { getDatabase } = require('../bridge/firebase');
const { enforceScope, actorOf, UI_KEY_SCOPES, DEV_KEY_SCOPES } = require('./scopes');
const { keyStoreFor } = require('./key-store');

/**
 * Every authenticated request ends here: the subject is on the request, the
 * actor is named, and the route's scope is enforced. One exit, so no route
 * can be authenticated without being authorised.
 */
function admit(req, res, next) {
  req.actor = actorOf(req);
  return enforceScope(req, res, next);
}

/** A key past its expiry is refused with the date, so the fix is obvious. */
function expired(keyData) {
  if (!keyData || !keyData.expiresAt) return null;
  const at = new Date(keyData.expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.getTime() <= Date.now() ? at.toISOString() : null;
}

function hashApiKey(key) {
  return crypto
    .createHmac('sha256', config.apiKey.salt)
    .update(key)
    .digest('hex');
}

async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'API_KEY_REQUIRED',
      message: 'Missing X-API-Key header. Provide your API key for authentication.'
    });
  }

  // Validate key format
  if (!/^ck_(live|test)_[a-zA-Z0-9]{32}$/.test(apiKey)) {
    return res.status(401).json({
      error: 'INVALID_API_KEY',
      message: 'API key format is invalid.'
    });
  }

  // UI key bypass: UI_API_KEY env var allows the frontend's hardcoded key to work
  // in all environments (dev + production). Set this in Netlify environment variables.
  const uiKey = config.runtime.uiApiKey;
  if (uiKey && apiKey === uiKey) {
    req.apiKey = {
      orgId: 'ui', orgName: 'CarbonIQ Frontend', keyName: 'dashboard', projectIds: [],
      permissions: ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'],
      scopes: [...UI_KEY_SCOPES], rateLimit: 500,
    };
    return admit(req, res, next);
  }

  // Dev bypass: when Firebase is not configured, allow the DEV_API_KEY env var.
  // Set DEV_API_KEY in .env (development only — never set in production).
  const devKey = config.runtime.devApiKey;
  const db = getDatabase();
  if (!db && devKey && apiKey === devKey) {
    // Same permission set as the dashboard key. An empty list here meant the
    // documented local-development bypass authenticated successfully and then
    // failed every authorization check with a 403, which reads as a broken
    // endpoint rather than as a key that grants nothing.
    req.apiKey = {
      orgId: 'dev', orgName: 'Development', keyName: 'dev', projectIds: [],
      permissions: ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'],
      scopes: [...DEV_KEY_SCOPES], rateLimit: 1000
    };
    return admit(req, res, next);
  }

  try {
    const hashedKey = hashApiKey(apiKey);
    const keys = keyStoreFor({ firebaseDb: db });
    if (!keys) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'No database is configured, so API keys cannot be verified.',
        remedy: 'Set DATABASE_URL (or Firebase). The dashboard key and DEV_API_KEY do not need one.'
      });
    }
    const keyData = await keys.get(hashedKey);

    if (!keyData || !keyData.active) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'API key is invalid or has been revoked.'
      });
    }

    const expiredAt = expired(keyData);
    if (expiredAt) {
      return res.status(401).json({
        error: 'KEY_EXPIRED',
        message: `This API key expired at ${expiredAt}.`,
        remedy: keyData.supersededBy
          ? 'A replacement key was issued when this one was rotated; use it.'
          : 'Ask your administrator to rotate the key: npm run key:rotate -- <key-id>.'
      });
    }

    // Attach key metadata to request — includes optional role for RBAC.
    // `scopes` is absent on a key issued before scopes existed; enforceScope
    // treats that as unscoped and says so on the response.
    req.apiKey = {
      keyId: hashedKey,
      keyName: keyData.keyName || null,
      orgId: keyData.orgId,
      orgName: keyData.orgName,
      projectIds: keyData.projectIds || [],
      permissions: keyData.permissions || [],
      scopes: Array.isArray(keyData.scopes) ? keyData.scopes : undefined,
      expiresAt: keyData.expiresAt || null,
      role: keyData.role || null,
      rateLimit: keyData.rateLimit || config.apiKey.defaultRateLimit
    };

    // Update last used timestamp (fire-and-forget)
    keys.touch(hashedKey).catch(err =>
      require('../observability/logger').for('platform/auth/api-key').warn({ err }, 'lastUsed update failed')
    );

    return admit(req, res, next);
  } catch (err) {
    return res.status(500).json({
      error: 'AUTH_ERROR',
      message: 'Failed to verify API key. Please try again.'
    });
  }
}

/**
 * Check if the API key has access to a specific project.
 */
function requireProjectAccess(req, res, next) {
  const projectId = req.params.projectId || req.params.id;

  if (!projectId) {
    return next();
  }

  if (req.apiKey && req.apiKey.projectIds.length > 0) {
    if (!req.apiKey.projectIds.includes(projectId)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'This API key does not have access to the requested project.'
      });
    }
  }

  next();
}

/**
 * Check if the API key has a specific permission.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.apiKey && !req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `This API key lacks the required permission: ${permission}`
      });
    }
    next();
  };
}

module.exports = apiKeyAuth;
module.exports.requireProjectAccess = requireProjectAccess;
module.exports.requirePermission = requirePermission;
module.exports.hashApiKey = hashApiKey;
module.exports.expired = expired;
