/**
 * CarbonIQ FinTech — API Integration Tests
 *
 * Tests the Express app endpoints (health, v1 info).
 * Firebase-dependent tests are skipped in CI without credentials.
 */

const request = require('supertest');
const app = require('../server');

describe('API Endpoints', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('carboniq-fintech');
    expect(res.body.version).toBeDefined();
  });

  test('GET /v1 returns API info', async () => {
    const res = await request(app).get('/v1');
    expect(res.status).toBe(200);
    expect(res.body.api).toBe('CarbonIQ FinTech');
    expect(res.body.endpoints).toBeDefined();
    expect(res.body.endpoints.extract).toBe('POST /v1/extract');
    expect(res.body.endpoints.assess).toBe('POST /v1/assess');
    expect(res.body.endpoints.score).toBe('GET /v1/projects/:projectId/score');
    expect(res.body.endpoints.taxonomy).toBe('GET /v1/projects/:projectId/taxonomy');
    expect(res.body.endpoints.pcaf).toBe('GET /v1/projects/:projectId/pcaf');
    expect(res.body.endpoints.covenant).toBe('POST /v1/projects/:projectId/covenant');
    expect(res.body.endpoints.portfolio).toBe('GET /v1/portfolio');
    expect(res.body.endpoints.webhooks).toBe('POST /v1/webhooks');
  });

  test('GET /nonexistent returns 404', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('health check includes timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
  });

  test('response includes X-Request-ID header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('custom X-Request-ID is preserved', async () => {
    const customId = 'test-req-12345';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });
});
