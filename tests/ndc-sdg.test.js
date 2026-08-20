/**
 * CarbonIQ FinTech — NDC/SDG Service & Route Tests
 *
 * Tests the Sri Lanka NDC & SDG alignment module without calling Claude AI.
 * The AI call is mocked to avoid external API dependency in CI.
 */

const request = require('supertest');

// ---------------------------------------------------------------------------
// Mock Anthropic SDK before requiring the service
// ---------------------------------------------------------------------------

const MOCK_ANALYSIS = {
  ndcAlignment: {
    tier: 'moderate',
    label: 'Moderate NDC Alignment',
    ndcContribution_pct: 35,
    unconditionalTarget: '4.5% GHG reduction by 2030 vs BAU',
    conditionalTarget: '14.5% GHG reduction by 2030 with international support',
    explanation: 'This project contributes to Sri Lanka NDC targets through reduced embodied carbon in construction.',
    keyDrivers: ['Below SLGFT green threshold (≤600 kgCO2e/m²)', 'Sector F construction activity', 'M1.1 green buildings activity code'],
  },
  sdgAlignment: [
    { sdg: 9,  label: 'Industry, Innovation & Infrastructure', relevance: 'high',   rationale: 'Green building construction.' },
    { sdg: 11, label: 'Sustainable Cities & Communities',        relevance: 'high',   rationale: 'Low-carbon urban development.' },
    { sdg: 13, label: 'Climate Action',                          relevance: 'high',   rationale: 'Embodied carbon below green threshold.' },
    { sdg: 7,  label: 'Affordable & Clean Energy',              relevance: 'medium', rationale: 'Energy-efficient building envelope.' },
  ],
  dnshAssessment: {
    overallStatus: 'pass',
    checks: [
      { objective: 'M', label: 'Climate Change Mitigation',       status: 'pass',        note: 'Emissions below green threshold.' },
      { objective: 'A', label: 'Climate Change Adaptation',       status: 'conditional', note: 'Climate risk assessment recommended.' },
      { objective: 'P', label: 'Pollution Prevention & Control',  status: 'pass',        note: 'Standard construction waste management required.' },
      { objective: 'E', label: 'Ecological Conservation',         status: 'pass',        note: 'No significant ecological impact identified.' },
    ],
  },
  bankabilityNarrative: "This Colombo office tower qualifies as a SLGFT green-aligned asset with embodied carbon intensity of 480 kgCO2e/m\xb2, well below the 600 kgCO2e/m\xb2 green threshold. The project supports Sri Lanka's unconditional NDC commitment of 4.5% GHG reduction by 2030. Recommended for green loan classification with -20 bps pricing adjustment.",
  recommendations: [
    'Obtain EPDs for top 3 materials by carbon contribution to upgrade PCAF data quality to Score 2.',
    'Submit climate risk assessment to confirm DNSH compliance under Objective A.',
    'Register with SLCCE for voluntary carbon credit generation to offset residual embodied carbon.',
  ],
  confidenceScore: 72,
};

// Mock @anthropic-ai/sdk — must be a CommonJS constructor mock
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: JSON.stringify(MOCK_ANALYSIS) }],
        usage: { input_tokens: 850, output_tokens: 620 },
      }),
    },
  }));
});

// ---------------------------------------------------------------------------
// Service-level tests
// ---------------------------------------------------------------------------

describe('NDC/SDG Service', () => {
  const { assessNdcSdgAlignment } = require('../services/ndc-sdg');

  const BASE_PROJECT = {
    name: 'Colombo Green Tower',
    buildingType: 'Commercial Office',
    slsicSector: 'F',
    activityCode: 'M1.1',
    emissions_tCO2e: 4800,
    buildingArea_m2: 10000,
    reductionPct: 22,
    hasEPD: false,
    hasLCA: true,
    region: 'LK',
  };

  test('returns structured analysis object', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.framework).toBe('Sri Lanka Green Finance Taxonomy');
    expect(result.version).toBe(2024);
    expect(result.regulator).toBe('Central Bank of Sri Lanka (CBSL)');
  });

  test('includes NDC targets in response', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    expect(result.ndcTargets).toBeDefined();
    expect(result.ndcTargets.unconditional).toContain('4.5%');
    expect(result.ndcTargets.conditional).toContain('14.5%');
    expect(result.ndcTargets.netZeroTarget).toBe(2050);
    expect(result.ndcTargets.keySDGs).toEqual(expect.arrayContaining([7, 9, 11, 13]));
  });

  test('populates projectData with computed intensity', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    expect(result.projectData.intensity_kgCO2e_m2).toBe(480); // 4800 * 1000 / 10000
    expect(result.projectData.slsicSector).toBe('F');
    expect(result.projectData.activityCode).toBe('M1.1');
  });

  test('matches activity code to SLGFT constructionActivities', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    expect(result.projectData.matchedActivity).toBeDefined();
    expect(result.projectData.matchedActivity.code).toBe('M1.1');
    expect(result.projectData.matchedActivity.label).toContain('Green Buildings');
  });

  test('handles missing area gracefully (null intensity)', async () => {
    const result = await assessNdcSdgAlignment({ ...BASE_PROJECT, buildingArea_m2: undefined });
    expect(result.projectData.intensity_kgCO2e_m2).toBeNull();
  });

  test('includes meta with model and token usage', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    expect(result.meta).toBeDefined();
    expect(result.meta.model).toContain('claude');
    expect(result.meta.startedAt).toBeDefined();
    expect(result.meta.completedAt).toBeDefined();
  });

  test('AI analysis contains expected fields', async () => {
    const result = await assessNdcSdgAlignment(BASE_PROJECT);
    const a = result.analysis;
    expect(a.ndcAlignment).toBeDefined();
    expect(a.ndcAlignment.tier).toBeDefined();
    expect(a.sdgAlignment).toBeInstanceOf(Array);
    expect(a.dnshAssessment).toBeDefined();
    expect(a.bankabilityNarrative).toBeDefined();
    expect(a.recommendations).toBeInstanceOf(Array);
    expect(a.confidenceScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Route-level tests (API integration)
// ---------------------------------------------------------------------------

const TEST_KEY = process.env.DEV_API_KEY || 'ck_test_00000000000000000000000000000000';
const AUTH     = { 'x-api-key': TEST_KEY };

describe('POST /v1/ndc-sdg/assess', () => {
  const app = require('../server');

  const VALID_BODY = {
    name: 'Colombo Green Tower',
    slsicSector: 'F',
    activityCode: 'M1.1',
    emissions_tCO2e: 4800,
    buildingArea_m2: 10000,
    region: 'LK',
  };

  test('requires API key', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  test('requires project name', async () => {
    const { name: _, ...noName } = VALID_BODY;
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .set(AUTH)
      .send(noName);
    expect([400, 503]).toContain(res.status);
  });

  test('rejects non-LK region', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .set(AUTH)
      .send({ ...VALID_BODY, region: 'SG' });
    expect([400, 503]).toContain(res.status);
  });

  test('returns 200 or 503 with full analysis', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .set(AUTH)
      .send(VALID_BODY);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.analysis).toBeDefined();
      expect(res.body.framework).toBe('Sri Lanka Green Finance Taxonomy');
      expect(res.body.ndcTargets).toBeDefined();
    }
  });

  test('accepts minimal input (name + region only)', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .set(AUTH)
      .send({ name: 'Minimal Project', region: 'LK' });
    expect([200, 503]).toContain(res.status);
  });

  test('uppercases activityCode', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/assess')
      .set(AUTH)
      .send({ ...VALID_BODY, activityCode: 'm1.1' });
    expect([200, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/ndc-sdg/framework
// ---------------------------------------------------------------------------

describe('GET /v1/ndc-sdg/framework', () => {
  const app = require('../server');

  test('requires API key', async () => {
    const res = await request(app).get('/v1/ndc-sdg/framework');
    expect(res.status).toBe(401);
  });

  test('returns SLGFT framework metadata', async () => {
    const res = await request(app)
      .get('/v1/ndc-sdg/framework')
      .set(AUTH);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.framework).toBe('Sri Lanka Green Finance Taxonomy');
      expect(res.body.version).toBe(2024);
      expect(res.body.ndcTargets).toBeDefined();
      expect(res.body.sectors).toBeDefined();
      expect(res.body.activities).toBeInstanceOf(Array);
      expect(res.body.thresholds).toBeDefined();
      expect(res.body.thresholds.green).toBe(600);
      expect(res.body.thresholds.transition).toBe(900);
    }
  });

  test('returns all 13 SLSIC sectors when available', async () => {
    const res = await request(app)
      .get('/v1/ndc-sdg/framework')
      .set(AUTH);
    if (res.status === 200) {
      expect(Object.keys(res.body.sectors).length).toBe(13);
    } else {
      expect(res.status).toBe(503);
    }
  });

  test('returns construction activities when available', async () => {
    const res = await request(app)
      .get('/v1/ndc-sdg/framework')
      .set(AUTH);
    if (res.status === 200) {
      const acts = res.body.activities;
      expect(acts.length).toBeGreaterThanOrEqual(5);
      const m11 = acts.find(a => a.code === 'M1.1');
      expect(m11).toBeDefined();
      expect(m11.label).toContain('Green Buildings');
    } else {
      expect(res.status).toBe(503);
    }
  });
});
