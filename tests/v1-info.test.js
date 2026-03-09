const request = require('supertest');
const app = require('../server');

describe('GET /v1', () => {
  it('returns service info without auth', async () => {
    const res = await request(app).get('/v1');
    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('carboniq-fintech');
    expect(res.body.features).toBeDefined();
    expect(res.body.endpoints).toBeInstanceOf(Array);
  });
});
