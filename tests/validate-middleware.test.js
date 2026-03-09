const request = require('supertest');
const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');

const testSchema = Joi.object({
  name: Joi.string().required(),
  value: Joi.number().positive().required(),
});

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.post('/test', validate(testSchema), (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  return app;
};

describe('Validate Middleware', () => {
  const app = createTestApp();

  it('passes valid request bodies through', async () => {
    const res = await request(app)
      .post('/test')
      .send({ name: 'test', value: 42 });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.body.name).toBe('test');
  });

  it('returns 400 with details on invalid body', async () => {
    const res = await request(app)
      .post('/test')
      .send({ value: -1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeInstanceOf(Array);
    expect(res.body.details.length).toBeGreaterThanOrEqual(1);
  });

  it('strips unknown fields', async () => {
    const res = await request(app)
      .post('/test')
      .send({ name: 'test', value: 10, extra: 'should-be-removed' });
    expect(res.statusCode).toBe(200);
    expect(res.body.body.extra).toBeUndefined();
  });

  it('reports all validation errors at once', async () => {
    const res = await request(app)
      .post('/test')
      .send({});
    expect(res.statusCode).toBe(400);
    // Both name and value are missing
    expect(res.body.details.length).toBe(2);
  });
});
