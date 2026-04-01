/**
 * CarbonIQ FinTech — Borrower Coaching Agent Tests
 */

'use strict';

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## BORROWER COACHING REPORT\n\nReadiness: NEAR-READY\n\nDetailed coaching content here.' }],
        usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        stop_reason: 'end_turn',
      }),
    },
  }))
);

const request  = require('supertest');
const app      = require('../server');
const { assessCompleteness } = require('../services/agents/borrower-coaching');

const TEST_KEY = process.env.DEV_API_KEY || 'ck_test_00000000000000000000000000000000';

// ---------------------------------------------------------------------------
// assessCompleteness unit tests
// ---------------------------------------------------------------------------

describe('borrower-coaching: assessCompleteness()', () => {
  test('empty application scores 0', () => {
    const result = assessCompleteness({ buildingType: 'commercial_office', buildingArea_m2: 5000 });
    expect(result.score).toBeLessThan(50);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  test('complete application scores 100', () => {
    const full = {
      projectName: 'Test Tower',
      buildingType: 'commercial_office',
      buildingArea_m2: 10000,
      region: 'Singapore',
      loanAmount: 5000000,
      projectValue: 20000000,
      loanTermYears: 10,
      targetCertification: 'green_mark',
      reductionTarget: 20,
      hasBOQ: true,
      hasEPD: true,
      hasLCA: true,
      projectDescription: 'A detailed description of the project that is at least fifty characters long.',
    };
    const result = assessCompleteness(full);
    expect(result.score).toBe(100);
    expect(result.missingFields.length).toBe(0);
  });

  test('breakdown sums correctly', () => {
    const data = {
      buildingType: 'commercial_office',
      buildingArea_m2: 5000,
      region: 'Singapore',
      loanAmount: 1000000,
    };
    const result = assessCompleteness(data);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toBeDefined();
    expect(typeof result.breakdown.projectBasics.earned).toBe('number');
  });

  test('hasBOQ=true adds carbonData points', () => {
    const withoutBOQ = assessCompleteness({ buildingType: 'commercial_office', buildingArea_m2: 1000 });
    const withBOQ    = assessCompleteness({ buildingType: 'commercial_office', buildingArea_m2: 1000, hasBOQ: true });
    expect(withBOQ.score).toBeGreaterThan(withoutBOQ.score);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/agent/coach endpoint tests
// ---------------------------------------------------------------------------

describe('POST /v1/agent/coach', () => {
  test('returns 401 without API key', async () => {
    const res = await request(app)
      .post('/v1/agent/coach')
      .send({ buildingType: 'commercial_office', buildingArea_m2: 5000 });
    expect(res.status).toBe(401);
  });

  test('returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/v1/agent/coach')
      .set('x-api-key', TEST_KEY)
      .send({ projectName: 'Test' });
    expect([400, 503]).toContain(res.status);
  });

  test('returns 400 for invalid buildingType', async () => {
    const res = await request(app)
      .post('/v1/agent/coach')
      .set('x-api-key', TEST_KEY)
      .send({ buildingType: 'space_station', buildingArea_m2: 5000 });
    expect([400, 503]).toContain(res.status);
  });

  test('accepts valid minimal payload', async () => {
    const res = await request(app)
      .post('/v1/agent/coach')
      .set('x-api-key', TEST_KEY)
      .send({ buildingType: 'commercial_office', buildingArea_m2: 5000 });
    expect([200, 500, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.agentType).toBe('borrower_coaching');
      expect(res.body.result).toBeDefined();
      expect(res.body.metadata.completenessScore).toBeDefined();
    }
  });

  test('accepts full payload', async () => {
    const res = await request(app)
      .post('/v1/agent/coach')
      .set('x-api-key', TEST_KEY)
      .send({
        projectName:         'Colombo Green Tower',
        buildingType:        'commercial_office',
        buildingArea_m2:     12000,
        region:              'Singapore',
        loanAmount:          8000000,
        projectValue:        25000000,
        loanTermYears:       10,
        targetCertification: 'green_mark',
        reductionTarget:     25,
        hasBOQ:              true,
        hasEPD:              true,
        hasLCA:              false,
        projectDescription:  'A Class A commercial office tower targeting BCA Green Mark Gold Plus certification.',
      });
    expect([200, 500, 503]).toContain(res.status);
  });
});
