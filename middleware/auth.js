/**
 * CarbonIQ FinTech — JWT Authentication Middleware
 *
 * Verifies Firebase JWT tokens for bank analyst users.
 * Reuses the same Firebase Auth system as the core platform.
 *
 * Usage: app.use('/v1/protected', auth, routeHandler)
 */

const { getFirebaseAdmin } = require('../bridge/firebase');

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
    });
  }

  const token = authHeader.slice(7);

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    // Attach user info to request
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role || 'bank_analyst',
      organizationId: decoded.organizationId || null
    };

    next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired. Please refresh your token.'
      });
    }

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid authentication token.'
    });
  }
}

module.exports = auth;
