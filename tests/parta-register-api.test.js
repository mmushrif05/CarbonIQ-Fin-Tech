/**
 * The Part A exposure register over HTTP.
 *
 * Two things here are not in the service suite and cannot be. A write needs a
 * scope the stateless engine routes do not: `POST /v1/pcaf/part-a/` was
 * `read` because the engine stores nothing, and the register writes, so a
 * read-only key must be refused on it. And the register is the first Part A
 * surface that needs a durable store, so a deployment that can persist
 * nothing has to refuse rather than answer 201 and drop the row.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const { issueKey } = require('./helpers/key');
const { requiredScopeFor } = require('../src/platform/auth/scopes');
const store = require('../src/platform/database/store');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');

let KEY;
let ORG;

const EXPOSURE = {
  reportingYear: 2024,
  instrument: 'business-loan',
  borrowerListed: false,
  counterparty: { name: 'Ceylon Textiles (Pvt) Ltd', sector: 'Textiles' },
  outstanding: { amount: 100000, asOf: '2024-12-31', currency: 'LKR' },
  denominator: { totalEquity: 600000, totalDebt: 400000, asOf: '2024-12-31', currency: 'LKR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: '2024' },
    scope2: { value: 100, basis: 'reported-unverified', period: '2024' },
    scope3: { value: 5000, basis: 'reported-unverified', period: '2024' },
  },
};

beforeAll(async () => {
  const issued = await issueKey({ keyName: 'parta register' });
  KEY = issued.key;
  ORG = issued.orgId;
});

async function clear() {
  for (const e of await store.list(repo.EXPOSURES, ORG)) {
    await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
  }
  for (const b of await store.list(repo.BOOK, ORG)) {
    await store.remove(repo.BOOK, ORG, b.reportingYear || b.id);
  }
}
beforeEach(clear);
afterAll(clear);

describe('the register writes, so it does not carry the engine\'s read scope', () => {
  test('recording, changing, recomputing and removing all need write', () => {
    expect(requiredScopeFor('POST', '/v1/pcaf/part-a/exposures').scope).toBe('write');
    expect(requiredScopeFor('POST', '/v1/pcaf/part-a/exposures/:exposureId/recompute').scope).toBe('write');
    expect(requiredScopeFor('PUT', '/v1/pcaf/part-a/exposures/:exposureId').scope).toBe('write');
    expect(requiredScopeFor('DELETE', '/v1/pcaf/part-a/exposures/:exposureId').scope).toBe('write');
    expect(requiredScopeFor('PUT', '/v1/pcaf/part-a/book').scope).toBe('write');
  });

  test('the stateless engine routes keep read, and the reason says why', () => {
    const engine = requiredScopeFor('POST', '/v1/pcaf/part-a/business-loans/assess');
    expect(engine.scope).toBe('read');
    expect(engine.why).toMatch(/stateless/);
    expect(requiredScopeFor('GET', '/v1/pcaf/part-a/position/:year').scope).toBe('read');
  });
});

describe('recording and reading a book', () => {
  test('an exposure is recorded and comes back with both halves', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send(EXPOSURE).expect(201);
    expect(res.body.exposure.exposureId).toMatch(/^pae_/);
    expect(res.body.exposure.input.outstanding.amount).toBe(100000);
    expect(res.body.exposure.result.inventory.scope1.value).toBe(100);
  });

  test('it is still there on the next request, which is the whole point', async () => {
    const { body } = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send(EXPOSURE).expect(201);
    const again = await request(app).get(`/v1/pcaf/part-a/exposures/${body.exposure.exposureId}`)
      .set('x-api-key', KEY).expect(200);
    expect(again.body.exposure.exposureId).toBe(body.exposure.exposureId);
  });

  test('a list without a reporting year is refused with the query that works', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).expect(400);
    expect(res.body.error).toBe('REPORTING_YEAR_REQUIRED');
    expect(res.body.remedy).toMatch(/reportingYear=/);
  });

  test('a year lists what it holds', async () => {
    await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).send(EXPOSURE).expect(201);
    const res = await request(app).get('/v1/pcaf/part-a/exposures?reportingYear=2024')
      .set('x-api-key', KEY).expect(200);
    expect(res.body.exposures).toHaveLength(1);
    expect(res.body.reportingYear).toBe('2024');
  });

  test('an engine refusal survives the route with its clause', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send({ ...EXPOSURE, borrowerType: 'government' }).expect(400);
    expect(res.body.message).toMatch(/sovereign debt/i);
  });

  test('a misspelled field is a named 400, not a key quietly ignored', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY)
      .send({ ...EXPOSURE, outstanding: { ...EXPOSURE.outstanding, averageOutstandng: 5 } })
      .expect(400);
    expect(JSON.stringify(res.body)).toMatch(/averageOutstandng/);
  });
});

describe('the book total and the position', () => {
  test('an unstated book total is a 404 saying what would fix it', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/book/2024').set('x-api-key', KEY).expect(404);
    expect(res.body.error).toBe('BOOK_NOT_STATED');
    expect(res.body.remedy).toMatch(/PUT \/v1\/pcaf\/part-a\/book/);
  });

  test('stating it makes coverage a real percentage', async () => {
    await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).send(EXPOSURE).expect(201);
    await request(app).put('/v1/pcaf/part-a/book').set('x-api-key', KEY)
      .send({ reportingYear: 2024, totalLoansAndInvestments: 1000000, currency: 'LKR', statedBy: 'CFO' })
      .expect(200);

    const res = await request(app).get('/v1/pcaf/part-a/position/2024').set('x-api-key', KEY).expect(200);
    expect(res.body.coverage.share).toBe(0.1);
    expect(res.body.coverage.basis).toBe('declared');
    expect(res.body.exposures).toBe(1);
    expect(res.body.total.lines.scope1.value).toBe(100);
  });

  test('a year holding nothing is a 409 rather than a position of zero', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/position/2030').set('x-api-key', KEY).expect(409);
    expect(res.body.message).toMatch(/not a position of zero/);
  });

  test('the years list says which have a stated book total', async () => {
    await request(app).post('/v1/pcaf/part-a/exposures').set('x-api-key', KEY).send(EXPOSURE).expect(201);
    const res = await request(app).get('/v1/pcaf/part-a/years').set('x-api-key', KEY).expect(200);
    expect(res.body.years).toEqual([{ reportingYear: '2024', bookTotalStated: false }]);
  });
});

describe('changing what is held', () => {
  test('a change reruns the engine over the new input', async () => {
    const { body } = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send(EXPOSURE).expect(201);
    const changed = await request(app).put(`/v1/pcaf/part-a/exposures/${body.exposure.exposureId}`)
      .set('x-api-key', KEY)
      .send({ ...EXPOSURE, outstanding: { ...EXPOSURE.outstanding, amount: 200000 } })
      .expect(200);
    expect(changed.body.exposure.result.attribution.value).toBe(0.2);
  });

  test('recomputing reports what moved, and on an unchanged engine nothing does', async () => {
    const { body } = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send(EXPOSURE).expect(201);
    const res = await request(app).post(`/v1/pcaf/part-a/exposures/${body.exposure.exposureId}/recompute`)
      .set('x-api-key', KEY).expect(200);
    expect(res.body.movement.moved).toBe(false);
    expect(res.body.movement.basis).toBe('financed scope 1 and 2');
  });

  test('a removed exposure is a 404 afterwards', async () => {
    const { body } = await request(app).post('/v1/pcaf/part-a/exposures')
      .set('x-api-key', KEY).send(EXPOSURE).expect(201);
    await request(app).delete(`/v1/pcaf/part-a/exposures/${body.exposure.exposureId}`)
      .set('x-api-key', KEY).expect(200);
    await request(app).get(`/v1/pcaf/part-a/exposures/${body.exposure.exposureId}`)
      .set('x-api-key', KEY).expect(404);
  });
});

describe('what this deployment can hold', () => {
  test('the storage route says which store was asked for and which was chosen', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/storage').set('x-api-key', KEY).expect(200);
    expect(res.body.storage).toHaveProperty('mode');
    expect(res.body.storage).toHaveProperty('writable');
  });
});
