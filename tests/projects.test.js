/**
 * CarbonIQ FinTech — Projects & Monitoring Endpoint Tests
 */

const request = require('supertest');
const app     = require('../server');

const TEST_KEY = process.env.DEV_API_KEY || 'ck_test_00000000000000000000000000000000';
const AUTH     = { 'x-api-key': TEST_KEY };

// ── Schema unit tests ────────────────────────────────────────────────────────
const { createProjectSchema, monitoringEntrySchema } = require('../schemas/projects');

describe('createProjectSchema', () => {
  test('accepts valid minimal project', () => {
    const { error, value } = createProjectSchema.validate({ name: 'Test Tower' });
    expect(error).toBeUndefined();
    expect(value.type).toBe('Commercial');
    expect(value.region).toBe('SG');
  });

  test('accepts full project payload', () => {
    const { error, value } = createProjectSchema.validate({
      name: 'Marina Bay Tower',
      projectId: 'SG-2026-001',
      type: 'Commercial',
      region: 'SG',
      phase: 'Construction',
      floorArea_m2: 25000,
      materials: [{ name: 'Concrete', category: 'Concrete', qty: 850000, unit: 'kg' }],
      loan: { outstanding: 50000000, equity: 80000000, debt: 120000000, currency: 'USD' },
      totalEmbodiedCarbon_kgCO2e: 110500,
    });
    expect(error).toBeUndefined();
    expect(value.name).toBe('Marina Bay Tower');
    expect(value.loan.outstanding).toBe(50000000);
  });

  test('rejects missing name', () => {
    const { error } = createProjectSchema.validate({ type: 'Commercial' });
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/name/);
  });

  test('rejects invalid building type', () => {
    const { error } = createProjectSchema.validate({ name: 'X', type: 'InvalidType' });
    expect(error).toBeDefined();
  });

  test('accepts valid name without error', () => {
    const { error } = createProjectSchema.validate({ name: 'Valid Project Name' });
    expect(error).toBeUndefined();
  });
});

describe('monitoringEntrySchema', () => {
  const VALID = { year: 2026, outstanding: 50, equity: 80, debt: 120, emissions: 10000 };

  test('accepts valid entry', () => {
    const { error, value } = monitoringEntrySchema.validate(VALID);
    expect(error).toBeUndefined();
    expect(value.dq).toBe(2); // default
  });

  test('rejects missing year', () => {
    const { error } = monitoringEntrySchema.validate({ outstanding: 50, equity: 80, debt: 120, emissions: 10000 });
    expect(error).toBeDefined();
  });

  test('rejects year out of range', () => {
    const { error } = monitoringEntrySchema.validate({ ...VALID, year: 1999 });
    expect(error).toBeDefined();
  });

  test('rejects invalid dq score', () => {
    const { error } = monitoringEntrySchema.validate({ ...VALID, dq: 6 });
    expect(error).toBeDefined();
  });
});

// ── API endpoint tests ───────────────────────────────────────────────────────
describe('POST /v1/projects', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/v1/projects').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  test('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/v1/projects')
      .set(AUTH)
      .send({ type: 'Commercial' });
    expect([400, 503]).toContain(res.status);
  });

  test('creates project or returns 503 when Firebase unavailable', async () => {
    const res = await request(app)
      .post('/v1/projects')
      .set(AUTH)
      .send({ name: 'Marina Bay Tower', type: 'Commercial', region: 'SG' });
    // 201 when Firebase available, 503 when not configured
    expect([201, 503]).toContain(res.status);
  });
});

describe('GET /v1/projects', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/v1/projects');
    expect(res.status).toBe(401);
  });

  test('returns projects array or 503 when Firebase unavailable', async () => {
    const res = await request(app).get('/v1/projects').set(AUTH);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.projects)).toBe(true);
    }
  });
});

describe('POST /v1/projects/:projectId/monitoring', () => {
  test('requires auth', async () => {
    const res = await request(app)
      .post('/v1/projects/SG-2024-001/monitoring')
      .send({ year: 2026, outstanding: 50, equity: 80, debt: 120, emissions: 10000 });
    expect(res.status).toBe(401);
  });

  test('returns 400 on invalid payload', async () => {
    const res = await request(app)
      .post('/v1/projects/SG-2024-001/monitoring')
      .set(AUTH)
      .send({ year: 1990, outstanding: 50, equity: 80, debt: 120, emissions: 10000 });
    expect([400, 503]).toContain(res.status);
  });

  test('saves entry or 503 when Firebase unavailable', async () => {
    const res = await request(app)
      .post('/v1/projects/SG-2024-001/monitoring')
      .set(AUTH)
      .send({ year: 2026, outstanding: 50, equity: 80, debt: 120, emissions: 10000, dq: 2 });
    expect([200, 201, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.attribution).toBeDefined();
      expect(res.body.financed).toBeDefined();
    }
  });
});

describe('GET /v1/projects/:projectId/monitoring', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/v1/projects/SG-2024-001/monitoring');
    expect(res.status).toBe(401);
  });

  test('returns entries array or 503 when Firebase unavailable', async () => {
    const res = await request(app)
      .get('/v1/projects/SG-2024-001/monitoring')
      .set(AUTH);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.entries)).toBe(true);
    }
  });
});
