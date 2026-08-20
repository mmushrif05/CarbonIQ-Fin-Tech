/**
 * CarbonIQ FinTech — SLGFT Green Loan Certificate Tests
 */

const { generateCertificate, verifyCertificate } = require('../services/certificate');

const BASE_OPTS = {
  projectName:    'Colombo Green Tower',
  projectId:      'LK-2026-001',
  bankName:       'DFCC Bank PLC',
  slsicSector:    'F',
  activityCode:   'M1.1',
  emissions_tCO2e: 4800,
  buildingArea_m2: 10000,
  ndcTier:        'moderate',
  ndcContrib_pct: 35,
  sdgs:           [7, 9, 11, 13],
  dnshStatus:     'pass',
  loanAmount_M:   500,
  currency:       'LKR',
};

describe('Certificate Service — generateCertificate()', () => {
  test('generates certificate with required fields', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert).toBeDefined();
    expect(cert.certId).toMatch(/^SLGFT-/);
    expect(cert.certVersion).toBe('1.0');
    expect(cert.issuedAt).toBeDefined();
    expect(cert.expiresAt).toBeDefined();
    expect(cert.hash).toHaveLength(64); // SHA-256 hex
    expect(cert.isValid).toBe(true);
  });

  test('classifies as green when intensity <= 600 kgCO2e/m²', () => {
    // 4800 tCO2e * 1000 / 10000 m² = 480 kgCO2e/m² → green
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.classification.tier).toBe('green');
    expect(cert.classification.tierLabel).toBe('Green — SLGFT Aligned');
  });

  test('classifies as transition when intensity 601-900 kgCO2e/m²', () => {
    // 8000 tCO2e * 1000 / 10000 m² = 800 kgCO2e/m² → transition
    const cert = generateCertificate({ ...BASE_OPTS, emissions_tCO2e: 8000 });
    expect(cert.classification.tier).toBe('transition');
    expect(cert.loanDetails.loanClassification).toContain('Sustainability-Linked');
    expect(cert.loanDetails.pricingAdjustment_bps).toBe(-8);
  });

  test('classifies as directly_eligible for direct eligibility activity codes', () => {
    // M4.1 Solar PV = direct eligibility (no intensity threshold)
    const cert = generateCertificate({ ...BASE_OPTS, activityCode: 'M4.1', emissions_tCO2e: 12000 });
    expect(cert.classification.tier).toBe('directly_eligible');
    expect(cert.loanDetails.pricingAdjustment_bps).toBe(-20);
  });

  test('classifies as conditional when intensity > 900 kgCO2e/m²', () => {
    // 12000 tCO2e * 1000 / 10000 m² = 1200 kgCO2e/m² → conditional (no direct activity)
    const cert = generateCertificate({ ...BASE_OPTS, activityCode: undefined, emissions_tCO2e: 12000 });
    expect(cert.classification.tier).toBe('conditional');
    expect(cert.loanDetails.pricingAdjustment_bps).toBe(0);
  });

  test('accepts classificationTier override', () => {
    const cert = generateCertificate({ ...BASE_OPTS, classificationTier: 'transition' });
    expect(cert.classification.tier).toBe('transition');
  });

  test('computes intensity correctly', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.project.intensity_kgCO2e_m2).toBe(480); // 4800 * 1000 / 10000
  });

  test('null intensity when area not provided', () => {
    const cert = generateCertificate({ ...BASE_OPTS, buildingArea_m2: undefined });
    expect(cert.project.intensity_kgCO2e_m2).toBeNull();
  });

  test('includes taxonomy details', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.taxonomy.framework).toBe('Sri Lanka Green Finance Taxonomy');
    expect(cert.taxonomy.version).toBe(2024);
    expect(cert.taxonomy.regulator).toBe('Central Bank of Sri Lanka (CBSL)');
  });

  test('includes NDC targets', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.ndcAlignment.unconditionalTarget).toContain('4.5%');
    expect(cert.ndcAlignment.conditionalTarget).toContain('14.5%');
    expect(cert.ndcAlignment.netZeroTarget).toBe(2050);
    expect(cert.ndcAlignment.tier).toBe('moderate');
    expect(cert.ndcAlignment.contribution_pct).toBe(35);
  });

  test('sorts SDGs correctly', () => {
    const cert = generateCertificate({ ...BASE_OPTS, sdgs: [13, 7, 11, 9] });
    expect(cert.sdgAlignment.sdgs).toEqual([7, 9, 11, 13]);
  });

  test('green loan pricing adjustment is -20 bps', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.loanDetails.pricingAdjustment_bps).toBe(-20);
    expect(cert.loanDetails.pricingLabel).toBe('-20 bps');
  });

  test('includes DNSH objectives for all 4 objectives', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.dnsh.objectives).toHaveLength(4);
    const codes = cert.dnsh.objectives.map(o => o.code);
    expect(codes).toContain('M');
    expect(codes).toContain('A');
    expect(codes).toContain('P');
    expect(codes).toContain('E');
  });

  test('throws if projectName missing', () => {
    expect(() => generateCertificate({ bankName: 'DFCC' })).toThrow('projectName is required');
  });

  test('throws if bankName missing', () => {
    expect(() => generateCertificate({ projectName: 'Test' })).toThrow('bankName is required');
  });

  test('includes audit trail with SHA-256 hash', () => {
    const cert = generateCertificate(BASE_OPTS);
    expect(cert.auditTrail.algorithm).toBe('SHA-256');
    expect(cert.auditTrail.hash).toBe(cert.hash);
    expect(cert.auditTrail.generatedBy).toContain('SLGFT Certificate Service');
  });

  test('expiry defaults to ~2 years from now', () => {
    const cert = generateCertificate(BASE_OPTS);
    const expiry  = new Date(cert.expiresAt);
    const issued  = new Date(cert.issuedAt);
    const diffMs  = expiry - issued;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(720);
    expect(diffDays).toBeLessThan(740);
  });
});

describe('Certificate Service — verifyCertificate()', () => {
  test('verifies a freshly generated certificate', () => {
    const cert   = generateCertificate(BASE_OPTS);
    const result = verifyCertificate(cert);
    expect(result.valid).toBe(true);
    expect(result.message).toContain('verified successfully');
  });

  test('detects tampered certificate', () => {
    const cert = generateCertificate(BASE_OPTS);
    cert.classification.tier = 'green'; // mutate after generation
    cert.project.name = 'TAMPERED';
    const result = verifyCertificate(cert);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('tampered');
  });

  test('returns computed and stored hash', () => {
    const cert   = generateCertificate(BASE_OPTS);
    const result = verifyCertificate(cert);
    expect(result.computedHash).toHaveLength(64);
    expect(result.storedHash).toBe(cert.hash);
  });
});
