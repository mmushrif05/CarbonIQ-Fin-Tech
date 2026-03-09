const request = require('supertest');
const express = require('express');
const audit = require('../middleware/audit');

describe('Audit Middleware', () => {
  it('attaches X-Request-Id to response', async () => {
    const app = express();
    app.use(audit);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toHaveLength(36); // UUID v4
  });

  it('preserves incoming X-Request-Id', async () => {
    const app = express();
    app.use(audit);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const customId = 'custom-request-id-123';
    const res = await request(app)
      .get('/test')
      .set('X-Request-Id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('makes requestId available on req object', async () => {
    const app = express();
    app.use(audit);
    app.get('/test', (req, res) => {
      res.json({ requestId: req.requestId });
    });

    const res = await request(app).get('/test');
    expect(res.body.requestId).toBeDefined();
  });
});
