/**
 * CarbonIQ FinTech — Audit Trail Middleware
 *
 * Logs every API request with metadata required for bank compliance:
 *   - timestamp, method, path, client ID, status code, latency
 *
 * In production this would forward to a persistent audit store
 * (e.g., Firebase, S3, or a SIEM). For now it writes structured
 * JSON to stdout so it can be captured by any log aggregator.
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const audit = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  const start = Date.now();

  // Attach request ID so downstream handlers can reference it
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Capture response finish to log the complete picture
  res.on('finish', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs: Date.now() - start,
      clientId: req.client ? req.client.id : null,
      clientName: req.client ? req.client.name : null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    if (config.log.verbose) {
      entry.body = req.body;
    }

    // Write structured log (only in non-test environments)
    if (config.env !== 'test') {
      console.log(JSON.stringify(entry));
    }
  });

  next();
};

module.exports = audit;
