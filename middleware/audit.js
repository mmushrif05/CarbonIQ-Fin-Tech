/**
 * CarbonIQ FinTech — Audit Logging Middleware
 *
 * Logs every API request for compliance trail.
 * Financial APIs require complete audit trails per MAS/HKMA guidelines.
 *
 * Logged fields: timestamp, method, path, user/key, status, duration
 */

const { v4: uuidv4 } = require('uuid');

function audit(req, res, next) {
  // Assign unique request ID
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    // Add auth context (without sensitive data)
    if (req.user) {
      logEntry.authType = 'jwt';
      logEntry.userId = req.user.uid;
      logEntry.role = req.user.role;
    } else if (req.apiKey) {
      logEntry.authType = 'api_key';
      logEntry.orgId = req.apiKey.orgId;
    }

    // Log to stdout (captured by Netlify / Docker logs)
    if (res.statusCode >= 400) {
      console.error('[AUDIT]', JSON.stringify(logEntry));
    } else {
      console.log('[AUDIT]', JSON.stringify(logEntry));
    }
  });

  next();
}

module.exports = audit;
