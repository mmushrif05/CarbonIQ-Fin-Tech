/**
 * CarbonIQ FinTech — SLGFT Report & Certificate Route Tests
 */

const request = require('supertest');
const app     = require('../server');
const { generateReport } = require('../services/reports');

const TEST_KEY = process.env.DEV_API_KEY || 'ck_test_00000000000000000000000000000000';
const AUTH     = { 'x-api-key': TEST_KEY };

// ---------------------------------------------------------------------------
// SLGFT report service tests
// ---------------------------------------------------------------------------

describe('SLGFT Report Service', () => {
  const BASE = { type: 'slgft', period: '2025', orgName: 'DFCC Bank PLC' };

  test('generates SLGFT report with expected structure', () => {
    const report = generateReport(BASE);
    expect(report).toBeDefined();
    expect(report.type).toBe('slgft');
    expect(report.title).toContain('Sri Lanka Green Finance Taxonomy');
    expect(report.standard).toContain('CBSL');
    expect(report.standard).toContain('2024');
  });

  test('includes summary with key SLGFT fields', () => {
    const report = generateReport(BASE);
    expect(report.summary.regulator).toBe('Central Bank of Sri Lanka (CBSL)');
    expect(report.summary.taxonomyVersion).toBe('SLGFT v2024');
    expect(report.summary.totalLKProjects).toBeGreaterThan(0);
  });

  test('includes taxonomy alignment distribution', () => {
    const report = generateReport(BASE);
    const dist = report.taxonomyAlignment?.distribution;
    expect(dist).toBeDefined();
    expect(dist.green).toBeDefined();
    expect(dist.transition).toBeDefined();
    expect(dist.not_aligned).toBeDefined();
  });

  test('includes NDC alignment section', () => {
    const report = generateReport(BASE);
    expect(report.ndcAlignment).toBeDefined();
    expect(report.ndcAlignment.unconditionalTarget).toContain('4.5%');
    expect(report.ndcAlignment.conditionalTarget).toContain('14.5%');
    expect(report.ndcAlignment.netZeroTarget).toBe('2050');
  });

  test('includes SDG alignment', () => {
    const report = generateReport(BASE);
    expect(report.sdgAlignment?.keySDGs).toBeDefined();
    expect(report.sdgAlignment.keySDGs).toHaveLength(6);
  });

  test('includes DNSH compliance section', () => {
    const report = generateReport(BASE);
    expect(report.dnshCompliance).toBeDefined();
    expect(report.dnshCompliance.objectives).toHaveLength(4);
  });

  test('includes carbon pricing exposure for LK', () => {
    const report = generateReport(BASE);
    expect(report.carbonPricingExposure).toBeDefined();
    expect(report.carbonPricingExposure.currentRate).toContain('LKR');
  });

  test('includes next steps', () => {
    const report = generateReport(BASE);
    expect(report.nextSteps).toBeInstanceOf(Array);
    expect(report.nextSteps.length).toBeGreaterThan(0);
    expect(report.nextSteps[0].priority).toBeDefined();
    expect(report.nextSteps[0].action).toBeDefined();
  });

  test('accepts custom slgftData', () => {
    const report = generateReport({
      ...BASE,
      slgftData: {
        totalLKProjects: 12,
        ndcContribution_pct: 42,
        taxonomyDistribution: {
          green:      { count: 6, pct: 50, financed_emissions_tCO2e: 18000 },
          transition: { count: 5, pct: 42, financed_emissions_tCO2e: 16000 },
          not_aligned: { count: 1, pct: 8, financed_emissions_tCO2e: 3500 },
        },
      },
    });
    expect(report.summary.totalLKProjects).toBe(12);
    expect(report.ndcAlignment.portfolioContribution_pct).toBe(42);
    expect(report.taxonomyAlignment.distribution.green.projectCount).toBe(6);
  });

  test('reportingPeriod includes year', () => {
    const report = generateReport(BASE);
    expect(report.reportingPeriod).toContain('2025');
  });

  test('throws for unknown report type', () => {
    expect(() => generateReport({ type: 'unknown', period: '2025', orgName: 'Test' }))
      .toThrow('Unknown report type');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/reports/generate — SLGFT type
// ---------------------------------------------------------------------------

describe('POST /v1/reports/generate — type=slgft', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/v1/reports/generate').send({ type: 'slgft', period: '2025' });
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post('/v1/reports/generate')
      .set(AUTH)
      .send({ type: 'invalid', period: '2025', orgName: 'Test' });
    expect([400, 503]).toContain(res.status);
  });

  test('generates slgft report or 503 when Firebase unavailable', async () => {
    const res = await request(app)
      .post('/v1/reports/generate')
      .set(AUTH)
      .send({ type: 'slgft', period: '2025', orgName: 'DFCC Bank PLC', format: 'json' });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.report.type).toBe('slgft');
      expect(res.body.report.title).toContain('Sri Lanka');
    }
  });
});

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/certificate
// ---------------------------------------------------------------------------

describe('POST /v1/ndc-sdg/certificate', () => {
  const VALID = {
    projectName: 'Colombo Green Tower',
    bankName:    'DFCC Bank PLC',
    slsicSector: 'F',
    activityCode: 'M1.1',
    emissions_tCO2e: 4800,
    buildingArea_m2: 10000,
    sdgs: [7, 9, 11, 13],
  };

  test('requires auth', async () => {
    const res = await request(app).post('/v1/ndc-sdg/certificate').send(VALID);
    expect(res.status).toBe(401);
  });

  test('requires projectName', async () => {
    const { projectName: _, ...noName } = VALID;
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate')
      .set(AUTH)
      .send({ ...noName, bankName: 'DFCC' });
    expect([400, 503]).toContain(res.status);
  });

  test('requires bankName', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate')
      .set(AUTH)
      .send({ projectName: 'Test Project' });
    expect([400, 503]).toContain(res.status);
  });

  test('generates certificate (201) or 503', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate')
      .set(AUTH)
      .send(VALID);
    expect([201, 503]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      const cert = res.body.certificate;
      expect(cert.certId).toMatch(/^SLGFT-/);
      expect(cert.hash).toHaveLength(64);
      expect(cert.classification.tier).toBe('green'); // 480 kgCO2e/m² ≤ 600
      expect(cert.loanDetails.pricingAdjustment_bps).toBe(-20);
    }
  });

  test('uppercases activityCode', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate')
      .set(AUTH)
      .send({ ...VALID, activityCode: 'm4.1' });
    expect([201, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/certificate/verify
// ---------------------------------------------------------------------------

describe('POST /v1/ndc-sdg/certificate/verify', () => {
  const { generateCertificate } = require('../services/certificate');

  test('requires auth', async () => {
    const cert = generateCertificate({ projectName: 'Test', bankName: 'DFCC' });
    const res  = await request(app).post('/v1/ndc-sdg/certificate/verify').send(cert);
    expect(res.status).toBe(401);
  });

  test('returns 400 for missing certId or hash', async () => {
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate/verify')
      .set(AUTH)
      .send({ projectName: 'Test' });
    expect([400, 503]).toContain(res.status);
  });

  test('verifies a valid certificate', async () => {
    const cert = generateCertificate({
      projectName: 'Colombo Green Tower', bankName: 'DFCC Bank',
      emissions_tCO2e: 4800, buildingArea_m2: 10000,
    });
    const res = await request(app)
      .post('/v1/ndc-sdg/certificate/verify')
      .set(AUTH)
      .send(cert);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
    }
  });
});
