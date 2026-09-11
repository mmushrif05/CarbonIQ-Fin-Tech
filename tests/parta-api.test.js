/**
 * PCAF Part A over HTTP.
 *
 * The engine's refusals have to survive the route: a caller should receive the
 * clause and the remedy, not a generic 400. These also pin that the reference
 * endpoint serves the options from the asset class's own table, so a form
 * cannot offer an option the engine would reject.
 */

'use strict';


const request = require('supertest');
const app = require('../src/server');

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

describe('PCAF Part A §5.2 over HTTP', () => {
  const EXPOSURE = {
    reportingYear: 2020,
    instrument: 'business-loan',
    borrowerListed: false,
    counterparty: { name: 'Ceylon Textiles (Pvt) Ltd', sector: 'Textiles' },
    outstanding: { amount: 100000, averageOutstanding: 100000, asOf: '2020-12-31', currency: 'LKR' },
    denominator: { totalEquity: 600000, totalDebt: 400000, asOf: '2020-12-31', currency: 'LKR' },
    emissions: {
      scope1: { value: 1000, basis: 'reported-unverified', period: '2020' },
      scope2: { value: 100, basis: 'reported-unverified', period: '2020' },
      scope3: { value: 5000, basis: 'reported-unverified', period: '2020' },
    },
  };

  test('the reference endpoint serves §5.2 with its own table and the thresholds that are ours', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/reference').set('x-api-key', KEY).expect(200);
    const bl = res.body.assetClasses.find(a => a.id === 'business-loans-unlisted-equity');
    expect(bl.dataQualityTable).toBe('Table 5.2-1');
    expect(bl.denominator).toMatch(/EVIC where the borrower is listed/);
    expect(bl.instruments.loans).toContain('revolving-credit');
    expect(bl.thresholds.fluctuationPct).toBe(25);
  });

  test('one exposure comes back with its figures and what the data says about itself', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/business-loans/assess')
      .set('x-api-key', KEY).send(EXPOSURE).expect(200);
    expect(res.body.attribution.value).toBe(0.1);
    expect(res.body.inventory.scope1.value).toBe(100);
    expect(res.body.inventory.dataQuality.scope1And2.label).toBe('Data quality score: 2 (Option 1b)');
    expect(res.body.validation.verdict).toBe('clean');
  });

  test('an engine refusal survives the route with its clause and its remedy', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/business-loans/assess')
      .set('x-api-key', KEY)
      .send({ ...EXPOSURE, borrowerType: 'government' })
      .expect(400);
    expect(res.body.message).toMatch(/sovereign debt/i);
    expect(res.body.message).toMatch(/state-owned-enterprise/);
  });

  test('a misspelled field is a named 400 rather than a key quietly ignored', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/business-loans/assess')
      .set('x-api-key', KEY)
      .send({ ...EXPOSURE, outstanding: { ...EXPOSURE.outstanding, averageOutstandng: 5 } })
      .expect(400);
    expect(JSON.stringify(res.body)).toMatch(/averageOutstandng/);
  });

  test('a book rolls up and ranks what to fix first, and stores nothing', async () => {
    const body = { exposures: [EXPOSURE, { ...EXPOSURE, counterparty: { name: 'Second borrower', sector: 'Food' } }], totalLoansAndInvestments: 1000000 };
    const a = await request(app).post('/v1/pcaf/part-a/business-loans/portfolio').set('x-api-key', KEY).send(body).expect(200);
    const b = await request(app).post('/v1/pcaf/part-a/business-loans/portfolio').set('x-api-key', KEY).send(body).expect(200);

    expect(a.body.total.lines.scope1.value).toBe(200);
    expect(a.body.coverage.share).toBe(0.2);
    expect(a.body.improvementPlan.reportedScore.basis).toBe('outstanding amount');
    expect(a.body).not.toHaveProperty('id');
    delete a.body.elapsedMs; delete b.body.elapsedMs;
    expect(a.body).toEqual(b.body);
  });
});
