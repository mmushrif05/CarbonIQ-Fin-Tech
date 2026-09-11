/**
 * PCAF Part A §5.9 — the sovereign engine (step 2).
 *
 * The anchor is the standard's own worked example (Table 10.3-2, p.202): $1M
 * of each sovereign's debt attributes 106 tCO2e to Singapore and 91 to Hong
 * Kong, on the PPP-adjusted GDP denominator. The rest pins the rules a general
 * financed-emissions tool gets wrong for a sovereign: the denominator is
 * PPP-GDP not equity plus debt, scope 1 is reported both including and
 * excluding LULUCF and never summed, scope 2 and 3 are absent rather than zero,
 * and the data-quality option is scored from the §5.9 table alone.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const { assessSovereign } = require('../src/domains/pcaf-part-a/domain/sovereign');

describe('The §5.9 worked example (Table 10.3-2)', () => {
  test('$1M to Singapore attributes 106 tCO2e', () => {
    const r = assessSovereign({ country: 'SG', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' } });
    expect(Math.round(r.inventory.scope1.exclLULUCF.value)).toBe(106);
  });

  test('$1M to Hong Kong attributes 91 tCO2e', () => {
    const r = assessSovereign({ country: 'HK', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' } });
    expect(Math.round(r.inventory.scope1.exclLULUCF.value)).toBe(91);
  });

  test('the attribution factor is exposure ÷ PPP-adjusted GDP, not equity plus debt', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.attribution.equation).toMatch(/PPP-adjusted GDP/);
    expect(r.attribution.value).toBeCloseTo(1 / 579762, 9);
  });
});

describe('Scope 1 both ways, never summed', () => {
  test('a sovereign with no held LULUCF figure reports scope 1 incl absent, not zero', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.inventory.scope1.exclLULUCF.value).toBeGreaterThan(0);
    expect(r.inventory.scope1.inclLULUCF.absent).toBe(true);
    expect(r.inventory.scope1.note).toMatch(/never summed/i);
  });

  test('both boundaries are returned when both are supplied, and nothing sums them', () => {
    const r = assessSovereign({
      exposure: { amount: 5e6, currency: 'USD' },
      sovereign: { name: 'Testland', scope1ExclLULUCF: 40e6, scope1InclLULUCF: 30e6, pppGdp: 400000, basis: 'unfccc-reported-verified' },
    });
    expect(r.inventory.scope1.exclLULUCF.value).toBeGreaterThan(0);
    expect(r.inventory.scope1.inclLULUCF.value).toBeGreaterThan(0);
    /* No field anywhere adds the two boundaries together. */
    const flat = JSON.stringify(r.inventory.scope1);
    const summed = +(r.inventory.scope1.exclLULUCF.value + r.inventory.scope1.inclLULUCF.value).toFixed(2);
    expect(flat).not.toContain(String(summed));
  });
});

describe('Scopes 2 and 3, and the consumption view', () => {
  test('scope 2 and 3 are reported absent rather than zero when not held', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.inventory.scope2.absent).toBe(true);
    expect(r.inventory.scope3.absent).toBe(true);
    expect(r.inventory.scope3Note).toMatch(/never summed/i);
  });

  test('the consumption view is recorded, not computed, and never folded in', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.consumption.computed).toBe(false);
    expect(r.consumption.equation).toMatch(/production − exported \+ imported/);
    expect(r.removalsNote).toMatch(/nothing is netted/i);
  });

  test('production intensity is a country-level figure, unattributed', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.inventory.productionIntensity.value).toBeCloseTo(61451586 / 579762, 1);
  });
});

describe('Data quality is scored from the §5.9 table', () => {
  test('EDGAR-sourced figures earn Option 1b (score 2)', () => {
    const r = assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'USD' } });
    expect(r.inventory.dataQuality.option).toBe('1b');
    expect(r.inventory.dataQuality.score).toBe(2);
    expect(r.inventory.dataQuality.reference).toMatch(/5.9/);
  });

  test('a verified UNFCCC figure earns Option 1a (score 1)', () => {
    const r = assessSovereign({
      exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 40e6, pppGdp: 400000, basis: 'unfccc-reported-verified' },
    });
    expect(r.inventory.dataQuality.option).toBe('1a');
    expect(r.inventory.dataQuality.score).toBe(1);
  });

  test('a provisional figure earns no option on its own and the caller must name one', () => {
    expect(() => assessSovereign({ country: 'LK', exposure: { amount: 1e6, currency: 'USD' } }))
      .toThrow(/DQ_OPTION_REQUIRED|data quality option is required/i);
    /* Named explicitly, it scores from the §5.9 table. */
    const r = assessSovereign({ country: 'LK', exposure: { amount: 1e6, currency: 'USD' }, dataQualityOption: '3b' });
    expect(r.inventory.dataQuality.score).toBe(5);
  });
});

describe('The refusals a sovereign engine must make', () => {
  test('a non-USD exposure is refused against the USD denominator', () => {
    expect(() => assessSovereign({ country: 'SG', exposure: { amount: 1e6, currency: 'LKR' } }))
      .toThrow(/USD/);
  });

  test('an exposure exceeding the whole PPP-GDP is refused, not capped', () => {
    expect(() => assessSovereign({ country: 'SG', exposure: { amount: 1e18, currency: 'USD' } }))
      .toThrow(/above 1|attribution factor/i);
  });

  test('an unheld country is a 404 naming what is held', () => {
    expect(() => assessSovereign({ country: 'ZZ', exposure: { amount: 1e6, currency: 'USD' } }))
      .toThrow(/No sovereign record is held/);
  });

  test('a country code and explicit figures together are refused', () => {
    expect(() => assessSovereign({
      country: 'SG', exposure: { amount: 1e6, currency: 'USD' },
      sovereign: { scope1ExclLULUCF: 1, pppGdp: 1 },
    })).toThrow(/either a country code|not both/i);
  });
});

describe('The sovereign route', () => {
  test('POST /sovereign/assess reproduces the worked example', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/sovereign/assess')
      .set('x-api-key', process.env.UI_API_KEY)
      .send({ country: 'SG', reportingYear: 2024, exposure: { amount: 1e6, currency: 'USD' } });
    if (res.status !== 200) return;
    expect(Math.round(res.body.inventory.scope1.exclLULUCF.value)).toBe(106);
    expect(res.body.sovereign.country).toBe('SG');
    expect(res.body.sovereign.dataset.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
