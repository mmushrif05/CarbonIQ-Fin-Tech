const request = require('supertest');
const app = require('../server');

describe('GET /v1', () => {
  it('returns service info without auth', async () => {
    const res = await request(app).get('/v1');
    expect(res.statusCode).toBe(200);
    expect(res.body.api).toBe('CarbonIQ FinTech');
    expect(res.body.version).toBeDefined();
    expect(res.body.endpoints).toBeDefined();
    expect(typeof res.body.endpoints).toBe('object');
    expect(res.body.endpoints.extract).toBe('POST /v1/extract');
    expect(res.body.endpoints.assess).toBe('POST /v1/assess');
    expect(res.body.endpoints.webhooks).toBe('POST /v1/webhooks');
  });
});
