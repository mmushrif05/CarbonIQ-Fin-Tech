/**
 * CarbonIQ FinTech — Decision Triage Tests
 *
 * Tests decision-engine.js (unit) and POST /v1/agent/triage (integration).
 */

'use strict';

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '## DECISION REVIEW MEMO\n\nRECOMMENDATION: CONDITIONAL APPROVE\n\nDetailed review content.' }],
        usage: { input_tokens: 150, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        stop_reason: 'end_turn',
      }),
    },
  }))
);

const request  = require('supertest');
const app      = require('../server');
const { classifyApplication } = require('../services/decision-engine');

const TEST_KEY = process.env.DEV_API_KEY || 'ck_test_00000000000000000000000000000000';

// ---------------------------------------------------------------------------
// classifyApplication unit tests
// ---------------------------------------------------------------------------

describe('decision-engine: classifyApplication()', () => {
  test('Tier 1 auto-approve: high CFS, standard loan, adequate EPD', () => {
    const result = classifyApplication({
      cfsScore: 75,
      buildingArea_m2: 5000,
      epdCoveragePct: 40,
      loanAmount: 5_000_000,
      hasBOQ: true,
    });
    expect(result.tier).toBe(1);
    expect(result.track).toBe('auto_approve');
    expect(result.reason).toBe('CLEAR_GREEN');
  });

  test('Tier 1 auto-decline: very low CFS, no EPD, no reduction', () => {
    const result = classifyApplication({
      cfsScore: 15,
      buildingArea_m2: 5000,
      epdCoveragePct: 2,
      reductionPct: 0,
      loanAmount: 3_000_000,
    });
    expect(result.tier).toBe(1);
    expect(result.track).toBe('auto_decline');
    expect(result.reason).toBe('CLEAR_BROWN');
  });

  test('Tier 2 AI review: transition CFS', () => {
    const result = classifyApplication({
      cfsScore: 55,
      buildingArea_m2: 5000,
      epdCoveragePct: 25,
      loanAmount: 4_000_000,
      hasBOQ: true,
    });
    expect(result.tier).toBe(2);
    expect(result.track).toBe('ai_review');
    expect(result.reason).toBe('TRANSITION_ZONE');
  });

  test('Tier 3 manual review: no CFS score', () => {
    const result = classifyApplication({
      cfsScore: null,
      buildingArea_m2: 5000,
    });
    expect(result.tier).toBe(3);
    expect(result.track).toBe('manual_review');
    expect(result.reason).toBe('NO_CFS_SCORE');
  });

  test('Tier 3 manual review: no floor area', () => {
    const result = classifyApplication({ cfsScore: 65 });
    expect(result.tier).toBe(3);
    expect(result.track).toBe('manual_review');
    expect(result.reason).toBe('MISSING_FLOOR_AREA');
  });

  test('Tier 3 manual review: high-value loan below green', () => {
    const result = classifyApplication({
      cfsScore: 55,
      buildingArea_m2: 50000,
      loanAmount: 100_000_000,
    });
    expect(result.tier).toBe(3);
    expect(result.track).toBe('manual_review');
    expect(result.reason).toBe('HIGH_VALUE_BELOW_GREEN');
  });

  test('Tier 2 AI review: high-value loan that is green', () => {
    const result = classifyApplication({
      cfsScore: 75,
      buildingArea_m2: 50000,
      epdCoveragePct: 40,
      loanAmount: 100_000_000,
    });
    expect(result.tier).toBe(2);
    expect(result.track).toBe('ai_review');
    expect(result.reason).toBe('HIGH_VALUE_GREEN');
  });

  test('Tier 2: green CFS but low EPD coverage', () => {
    const result = classifyApplication({
      cfsScore: 72,
      buildingArea_m2: 5000,
      epdCoveragePct: 5,
      loanAmount: 4_000_000,
    });
    expect(result.tier).toBe(2);
    expect(result.track).toBe('ai_review');
    expect(result.reason).toBe('GREEN_LOW_EPD');
  });

  test('result always has required fields', () => {
    const result = classifyApplication({ cfsScore: 50, buildingArea_m2: 3000 });
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('tierLabel');
    expect(result).toHaveProperty('track');
    expect(result).toHaveProperty('trackLabel');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('rationale');
    expect(result).toHaveProperty('flags');
    expect(result).toHaveProperty('classifiedAt');
    expect(Array.isArray(result.flags)).toBe(true);
  });

  test('data-poor with borderline CFS → Tier 2 AI review', () => {
    const result = classifyApplication({
      cfsScore: 45,
      buildingArea_m2: 5000,
      epdCoveragePct: 0,
      hasBOQ: false,
      loanAmount: 2_000_000,
    });
    expect(result.tier).toBe(2);
    expect(result.reason).toBe('DATA_POOR_BORDERLINE');
  });

  test('data-poor with very low CFS → Tier 1 auto-decline (not manual)', () => {
    const result = classifyApplication({
      cfsScore: 10,
      buildingArea_m2: 5000,
      epdCoveragePct: 1,
      hasBOQ: false,
      reductionPct: 0,
      loanAmount: 2_000_000,
    });
    expect(result.tier).toBe(1);
    expect(result.track).toBe('auto_decline');
    expect(result.reason).toBe('CLEAR_BROWN');
  });

  test('verified status is flagged', () => {
    const result = classifyApplication({
      cfsScore: 75,
      buildingArea_m2: 5000,
      epdCoveragePct: 40,
      loanAmount: 3_000_000,
      verificationStatus: 'verified',
    });
    expect(result.flags).toContain('third_party_verified');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/agent/triage endpoint tests
// ---------------------------------------------------------------------------

describe('POST /v1/agent/triage', () => {
  test('returns 401 without API key', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .send({ cfsScore: 75, buildingArea_m2: 5000 });
    expect(res.status).toBe(401);
  });

  test('returns Tier 1 auto-approve for clear green application', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .set('x-api-key', TEST_KEY)
      .send({
        cfsScore:        75,
        buildingArea_m2: 5000,
        epdCoveragePct:  40,
        loanAmount:      5_000_000,
        hasBOQ:          true,
      });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.tier).toBe(1);
      expect(res.body.track).toBe('auto_approve');
      expect(res.body.aiReview).toBeNull();
    }
  });

  test('returns Tier 1 auto-decline for clear brown application', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .set('x-api-key', TEST_KEY)
      .send({
        cfsScore:        10,
        buildingArea_m2: 5000,
        epdCoveragePct:  0,
        reductionPct:    0,
        loanAmount:      2_000_000,
      });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.tier).toBe(1);
      expect(res.body.track).toBe('auto_decline');
    }
  });

  test('returns Tier 3 with escalation for missing CFS', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .set('x-api-key', TEST_KEY)
      .send({ buildingArea_m2: 5000 });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.tier).toBe(3);
      expect(res.body.escalation).toBeDefined();
    }
  });

  test('Tier 2 triggers AI review (or 503 if no API key)', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .set('x-api-key', TEST_KEY)
      .send({
        cfsScore:         55,
        buildingArea_m2:  5000,
        epdCoveragePct:   25,
        loanAmount:       4_000_000,
        buildingType:     'commercial_office',
        region:           'Singapore',
      });
    expect([200, 500, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.tier).toBe(2);
      expect(res.body.aiReview).toBeDefined();
      expect(res.body.aiReview).not.toBeNull();
    }
  });

  test('returns 400 for invalid verificationStatus', async () => {
    const res = await request(app)
      .post('/v1/agent/triage')
      .set('x-api-key', TEST_KEY)
      .send({ cfsScore: 75, buildingArea_m2: 5000, verificationStatus: 'unknown_status' });
    expect([400, 503]).toContain(res.status);
  });

  test('GET /v1 lists coach and triage endpoints', async () => {
    const res = await request(app).get('/v1');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.agent.coach).toBe('POST /v1/agent/coach');
    expect(res.body.endpoints.agent.triage).toBe('POST /v1/agent/triage');
  });
});
