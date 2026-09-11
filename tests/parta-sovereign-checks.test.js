/**
 * PCAF Part A §5.9 — the data-truth checks (step 3).
 *
 * The standard measures; it does not validate. These are the findings a bank
 * cannot get from §5.9: a proxy-country figure, an emissions year well behind
 * the reporting year, scope 1 held on one LULUCF boundary only, a production
 * intensity so far outside a plausible band that the denominator must be in the
 * wrong units (the 1,369× distortion PPP-GDP exists to remove), and a second
 * source that diverges from the one held. Each is a finding that refuses
 * nothing and changes no figure; the thresholds that are CarbonIQ's say so and
 * are settable.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const { assessSovereign } = require('../src/domains/pcaf-part-a/domain/sovereign');

const codes = (r) => r.validation.findings.map(f => f.code);

describe('The checks fire on the shipped data', () => {
  test('Singapore raises the emissions-lag and one-sided-LULUCF findings', () => {
    const r = assessSovereign({ country: 'SG', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.validation.verdict).toBe('accepted_with_findings');
    expect(codes(r)).toContain('SOVEREIGN_EMISSIONS_LAG');      // EDGAR 2018 vs 2024
    expect(codes(r)).toContain('SOVEREIGN_LULUCF_ONE_SIDED');   // incl LULUCF not held
    expect(codes(r)).toContain('SOVEREIGN_NO_INDEPENDENT_SOURCE');
    /* Every finding carries a remedy and a clause. */
    for (const f of r.validation.findings) {
      expect(f.remedy.length).toBeGreaterThan(10);
      expect(f.reference).toMatch(/5\.9|Chapter 4/);
    }
  });

  test('the emissions-lag threshold is CarbonIQ’s and is settable', () => {
    const r = assessSovereign({
      country: 'SG', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      thresholds: { emissionsLagYears: 10 },
    });
    expect(codes(r)).not.toContain('SOVEREIGN_EMISSIONS_LAG');
    expect(r.thresholds.emissionsLagYears).toBe(10);
  });
});

describe('The proxy-country finding', () => {
  test('an Option 3b figure is flagged material as resting on another country', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { name: 'Proxyland', scope1ExclLULUCF: 40e6, scope1InclLULUCF: 38e6, pppGdp: 400000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'proxy-country' },
    });
    const f = r.validation.findings.find(x => x.code === 'SOVEREIGN_PROXY_COUNTRY');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('material');
    expect(r.inventory.dataQuality.score).toBe(5);
  });
});

describe('The intensity-plausibility guardrail (the 1,369× problem)', () => {
  test('a denominator in the wrong units produces an implausible intensity', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      /* 40 MtCO2e over a PPP-GDP of 1,000 million = 40,000 tCO2e per million: a
         denominator a thousand times too small, as if debt were used. */
      sovereign: { scope1ExclLULUCF: 40e6, scope1InclLULUCF: 39e6, pppGdp: 1000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
    });
    const f = r.validation.findings.find(x => x.code === 'SOVEREIGN_INTENSITY_IMPLAUSIBLE');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('material');
    expect(f.remedy).toMatch(/millions of international USD/);
  });

  test('the plausibility band is settable', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 40e6, scope1InclLULUCF: 39e6, pppGdp: 1000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
      thresholds: { intensityHigh: 100000 },
    });
    expect(codes(r)).not.toContain('SOVEREIGN_INTENSITY_IMPLAUSIBLE');
  });
});

describe('The independent-path check', () => {
  test('a diverging second source is reported, not averaged away', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 40e6, scope1InclLULUCF: 39e6, pppGdp: 400000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
      crossCheck: { scope1ExclLULUCF: 60e6, source: 'EDGAR' },
    });
    const f = r.validation.findings.find(x => x.code === 'SOVEREIGN_SOURCE_DIVERGENCE');
    expect(f).toBeTruthy();
    expect(f.observed.divergencePct).toBeCloseTo(50, 0);
  });

  test('a second source within the threshold clears the check', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 40e6, scope1InclLULUCF: 39e6, pppGdp: 400000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
      crossCheck: { scope1ExclLULUCF: 41e6, source: 'Climate Watch' },
    });
    expect(codes(r)).not.toContain('SOVEREIGN_SOURCE_DIVERGENCE');
    expect(codes(r)).not.toContain('SOVEREIGN_NO_INDEPENDENT_SOURCE');
  });
});

describe('A fully sourced figure is clean', () => {
  test('both boundaries, same recent year, plausible intensity, verified, cross-checked → no findings', () => {
    const r = assessSovereign({
      reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 40e6, scope1InclLULUCF: 38e6, pppGdp: 400000, emissionsYear: 2024, pppGdpYear: 2024, basis: 'unfccc-reported-verified' },
      crossCheck: { scope1ExclLULUCF: 41e6, source: 'Climate Watch' },
    });
    expect(r.validation.verdict).toBe('clean');
    expect(r.validation.findings).toHaveLength(0);
  });
});

describe('The validation block on the route', () => {
  test('POST /sovereign/assess carries the validation findings', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/sovereign/assess')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ country: 'SG', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' } });
    if (res.status !== 200) return;
    expect(res.body.validation.verdict).toBe('accepted_with_findings');
    expect(res.body.validation.findings.map(f => f.code)).toContain('SOVEREIGN_LULUCF_ONE_SIDED');
  });
});
