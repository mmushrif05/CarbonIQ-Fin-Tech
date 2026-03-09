const request = require('supertest');
const express = require('express');
const errorHandler = require('../middleware/error-handler');

const createTestApp = () => {
  const app = express();

  app.get('/throw-500', () => {
    throw new Error('Something broke');
  });

  app.get('/throw-400', (_req, _res, next) => {
    const err = new Error('Bad input');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    next(err);
  });

  app.get('/throw-joi', (_req, _res, next) => {
    const err = new Error('Validation failed');
    err.isJoi = true;
    err.details = [{ message: '"name" is required' }, { message: '"amount" must be a number' }];
    next(err);
  });

  app.get('/throw-cors', (_req, _res, next) => {
    next(new Error('CORS: origin not allowed'));
  });

  app.use(errorHandler);
  return app;
};

describe('Error Handler', () => {
  const app = createTestApp();

  it('handles 500 errors with generic message', async () => {
    const res = await request(app).get('/throw-500');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).not.toContain('Something broke');
  });

  it('handles known errors with custom status codes', async () => {
    const res = await request(app).get('/throw-400');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('BAD_REQUEST');
    expect(res.body.message).toBe('Bad input');
  });

  it('handles Joi validation errors', async () => {
    const res = await request(app).get('/throw-joi');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('"name" is required');
    expect(res.body.message).toContain('"amount" must be a number');
  });

  it('handles CORS errors', async () => {
    const res = await request(app).get('/throw-cors');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('CORS_ERROR');
  });
});
