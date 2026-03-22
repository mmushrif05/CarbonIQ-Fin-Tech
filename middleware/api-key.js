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
  const uiKey = process.env.UI_API_KEY;
  if (uiKey && apiKey === uiKey) {
    req.apiKey = { orgId: 'ui', orgName: 'CarbonIQ Frontend', projectIds: [], permissions: ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'], rateLimit: 500 };
    return next();
  }

  // Dev bypass: when Firebase is not configured, allow the DEV_API_KEY env var.
  // Set DEV_API_KEY in .env (development only — never set in production).
  const devKey = process.env.DEV_API_KEY;
  const db = getDatabase();
  if (!db && devKey && apiKey === devKey) {
    req.apiKey = { orgId: 'dev', orgName: 'Development', projectIds: [], permissions: [], rateLimit: 1000 };
    return next();
  }

  try {
    const hashedKey = hashApiKey(apiKey);
    if (!db) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Database not configured. API key verification is unavailable.'
      });
    }
    const snapshot = await db.ref(`fintech/apiKeys/${hashedKey}`).once('value');
    const keyData = snapshot.val();

    if (!keyData || !keyData.active) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
        message: 'API key is invalid or has been revoked.'
      });
    }

    // Attach key metadata to request
    req.apiKey = {
      orgId: keyData.orgId,
      orgName: keyData.orgName,
      projectIds: keyData.projectIds || [],
      permissions: keyData.permissions || [],
      rateLimit: keyData.rateLimit || config.apiKey.defaultRateLimit
    };

    // Update last used timestamp (fire-and-forget)
    db.ref(`fintech/apiKeys/${hashedKey}/lastUsed`).set(Date.now()).catch(err =>
      console.error('[API-KEY] lastUsed update failed:', err.message)
    );

    next();
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
