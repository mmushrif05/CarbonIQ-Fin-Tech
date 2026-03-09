const request = require('supertest');
const app = require('../server');

describe('Health Check', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('carboniq-fintech');
    expect(res.body.version).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
