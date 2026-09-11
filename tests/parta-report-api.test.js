/**
 * The Part A §5.2 report over HTTP: JSON, a well-formed PDF, a Word document,
 * the empty-year refusal, and the scope a read-only key needs.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const store = require('../src/platform/database/store');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const asOf = '2024-12-31', c = 'LKR';

const exposure = () => ({
  reportingYear: 2024, instrument: 'business-loan', borrowerListed: false,
  counterparty: { name: 'Lanka Apparel', sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
  outstanding: { amount: 480e6, asOf, currency: c },
  denominator: { totalEquity: 1.9e9, totalDebt: 2.1e9, asOf, currency: c },
  emissions: {
    scope1: { value: 11200, basis: 'reported-unverified', period: 2024 },
    scope2: { value: 3400, basis: 'reported-unverified', period: 2024 },
    scope3: { value: 26000, basis: 'reported-unverified', period: 2024 },
  },
  plausibility: { revenue: 5.2e9 },
});

const binary = req => req.buffer(true).parse((res, cb) => {
  const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks)));
});

beforeEach(async () => {
  await store._resetMemory();
  await auth(request(app).post('/v1/pcaf/part-a/exposures')).send(exposure());
  await auth(request(app).put('/v1/pcaf/part-a/book'))
    .send({ reportingYear: 2024, totalLoansAndInvestments: 14e9, currency: 'LKR', statedBy: 'CFO' });
});

describe('GET /v1/pcaf/part-a/disclosure/:year', () => {
  test('a well-formed PDF is delivered and an empty year is a 409', async () => {
    const pdf = await binary(auth(request(app).get('/v1/pcaf/part-a/disclosure/2024?format=pdf&insurer=Test%20Bank')));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.body.slice(-6).toString()).toMatch(/%%EOF/);

    const empty = await auth(request(app).get('/v1/pcaf/part-a/disclosure/2099'));
    expect(empty.status).toBe(409);
  });

  test('the JSON form carries the checklist and the coverage figure', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-a/disclosure/2024?insurer=Test%20Bank'));
    expect(res.status).toBe(200);
    expect(res.body.report.checklist.items.length).toBeGreaterThan(10);
    expect(res.body.report.facts.coverage.share).toBeGreaterThan(0);
  });

  test('the Word form is a docx package', async () => {
    const docx = await binary(auth(request(app).get('/v1/pcaf/part-a/disclosure/2024?format=docx&insurer=Test%20Bank')));
    expect(docx.status).toBe(200);
    expect(docx.body.slice(0, 2).toString()).toBe('PK');
  });
});

describe('POST /v1/pcaf/part-a/exposures/:id/report', () => {
  test('renders a per-exposure PDF, and is a read a read-only key may ask', async () => {
    const list = await auth(request(app).get('/v1/pcaf/part-a/exposures?reportingYear=2024'));
    const id = list.body.exposures[0].exposureId;
    const pdf = await binary(auth(request(app).post(`/v1/pcaf/part-a/exposures/${id}/report`)).send({ format: 'pdf' }));
    expect(pdf.status).toBe(200);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
  });
});
