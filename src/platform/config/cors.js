/**
 * CarbonIQ FinTech — CORS Configuration
 *
 * Strict origin whitelist for bank integrations.
 * No wildcard (*) allowed — every origin must be explicitly permitted.
 */

const config = require('./index');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (config.env === 'development') {
      // In development, allow localhost origins
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID'
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  credentials: true,
  maxAge: 600 // 10 minutes preflight cache
};

module.exports = corsOptions;
