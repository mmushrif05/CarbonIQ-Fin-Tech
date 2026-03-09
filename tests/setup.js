/**
 * Jest Test Setup
 *
 * Sets environment variables before any test module loads.
 */

process.env.NODE_ENV = 'test';
process.env.FINTECH_API_PORT = '3099';
process.env.API_KEY_SALT = 'a'.repeat(64);
process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://test.carboniq.online';
process.env.LOG_VERBOSE = 'false';
