/**
 * CarbonIQ FinTech — CORS Configuration
 *
 * Parses ALLOWED_ORIGINS from the environment and returns
 * a cors options object compatible with the `cors` npm package.
 */

const parseOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || '';
  if (!raw) return ['http://localhost:3000'];
  return raw.split(',').map(o => o.trim()).filter(Boolean);
};

const corsConfig = {
  origin: (origin, callback) => {
    const allowed = parseOrigins();
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

module.exports = corsConfig;
