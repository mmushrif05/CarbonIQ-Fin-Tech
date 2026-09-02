/**
 * PCAF Part A over HTTP.
 *
 * The engine's refusals have to survive the route: a caller should receive the
 * clause and the remedy, not a generic 400. These also pin that the reference
 * endpoint serves the options from the asset class's own table, so a form
 * cannot offer an option the engine would reject.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');

const KEY = process.env.UI_API_KEY;

const SOLAR = {
  projectName: 'Solar Project', counterparty: 'Helios Power Ltd', sector: 'Power',
  reportingYear: 2026, archetype: 'renewable-generation',
  outstandingAmount: 12000000, totalProjectEquityPlusDebt: 40000000, currency: 'USD',
  dataQualityOption: '2a', projectScope1_tCO2e: 120, projectScope2_tCO2e: 340,
  avoided: {
    annualAvoided_tCO2e: 48000,
    counterfactual: 'Sri Lanka grid average displaced',
    counterfactualSource: 'CEB published grid emission factor 2025',
  },
};

describe('GET /v1/pcaf/part-a/reference', () => {
  test('serves the asset class with its own data-quality options', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', KEY).expect(200);

    const pf = res.body.assetClasses.find(a => a.id === 'project-finance');
    expect(pf.denominator).toBe('total project equity plus debt');
    expect(pf.dataQualityTable).toBe('Table 5.3-1');
    expect(pf.dataQualityOptions.map(o => o.option)).toEqual(['1a', '1b', '2a', '2b', '3a', '3b', '3c']);
  });

  test('names the three archetypes', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', KEY).expect(200);
    expect(res.body.archetypes.map(a => a.id).sort())
      .toEqual(['efficiency-retrofit', 'general', 'renewable-generation']);
  });

  test('says avoided emissions have left Part A', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', KEY).expect(200);
    expect(res.body.notes.avoidedEmissions).toMatch(/no longer covered by Part A/i);
  });
});

describe('POST /v1/pcaf/part-a/assess', () => {
  test('assesses the solar exposure and keeps the two figures apart', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess')
      .set('x-api-key', KEY).send(SOLAR).expect(200);

    expect(res.body.attribution.value).toBe(0.3);
    expect(res.body.inventory.scope1And2.value).toBe(138);
    expect(res.body.inventory.dataQuality.label).toBe('Data quality score: 2 (Option 2a)');
    expect(res.body.impact.metrics[0].figure.value).toBe(14400);
    expect(res.body.impact.metrics[0].figure.unit).toBe('tCO2e per year');
  });

  test('an attribution factor above 1 is refused with the arithmetic and a remedy', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess').set('x-api-key', KEY)
      .send({ ...SOLAR, outstandingAmount: 500000, totalProjectEquityPlusDebt: 250000 })
      .expect(400);

    expect(res.body.error).toBe('ATTRIBUTION_ABOVE_ONE');
    expect(res.body.message).toContain('2.0000');
    expect(res.body.remedy).toMatch(/justification/i);
  });

  test('and is accepted when justified', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess').set('x-api-key', KEY)
      .send({
        ...SOLAR, outstandingAmount: 500000, totalProjectEquityPlusDebt: 250000,
        attributionOverrideJustification: 'Stale valuation pending refinance.',
      })
      .expect(200);

    expect(res.body.attribution.value).toBe(2);
    expect(res.body.attribution.assumptions[0]).toMatch(/Stale valuation/);
  });

  test('a prohibited estimation basis is refused, citing why', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess').set('x-api-key', KEY)
      .send({ ...SOLAR, avoided: { ...SOLAR.avoided, estimationBasis: 'input-output' } })
      .expect(422);

    expect(res.body.error).toBe('PROHIBITED_ESTIMATION_BASIS');
    expect(res.body.message).toMatch(/shall not/i);
  });

  test('an unknown data-quality option names the valid ones', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess').set('x-api-key', KEY)
      .send({ ...SOLAR, dataQualityOption: '9z' }).expect(400);

    expect(res.body.error).toBe('UNKNOWN_DQ_OPTION');
    expect(res.body.message).toContain('1a');
  });

  test('the response is fast enough to recompute as a user types', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/assess')
      .set('x-api-key', KEY).send(SOLAR).expect(200);

    expect(res.body.elapsedMs).toBeLessThan(200);
  });

  test('it requires a key like every other endpoint', async () => {
    await request(app).post('/v1/pcaf/part-a/assess').send(SOLAR).expect(401);
  });
});
