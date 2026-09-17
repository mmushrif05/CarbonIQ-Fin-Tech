'use strict';
/**
 * The engine's answer before Record, and the borrower that does not know its
 * emissions.
 *
 * Most borrowers on a Sri Lankan book cannot state their scope 1 and 2. The
 * record form therefore asks how the emissions are known — reported by the
 * borrower, or not known and estimated from its industry on the held sector
 * factor — and shows the engine's answer beneath itself as the fields change,
 * through a preview route that takes the same body Record takes and writes
 * nothing. For a business loan the answer carries what would raise the score,
 * read off Table 5.2-1 and never invented.
 */

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const { exampleExposure } = require('../src/domains/pcaf-part-a/application/starter-book');
const { waysToRaise, NEEDS } = require('../src/domains/pcaf-part-a/domain/business-loans/raise');
const { requiredScopeFor } = require('../src/platform/auth/scopes');
const { issueKey } = require('./helpers/key');

let ORG = 'org-parta-preview';
let KEY;
const YEAR = 2031;

async function clear(org) {
  for (const e of await store.list(repo.EXPOSURES, org)) await store.remove(repo.EXPOSURES, org, e.exposureId || e.id);
}

beforeAll(async () => {
  const issued = await issueKey({ orgId: ORG, keyName: 'preview' });
  ORG = issued.orgId; KEY = issued.key;
});
beforeEach(() => clear(ORG));
afterAll(() => clear(ORG));

describe('what would raise the score is read off Table 5.2-1', () => {
  test('from a sector estimate every better option is a step, nearest first, each with what it needs', () => {
    const r = waysToRaise('3a');
    expect(r.from).toEqual({ option: '3a', score: 4 });
    expect(r.steps.map(s => `${s.option}:${s.score}`)).toEqual(['2b:3', '2a:2', '1b:2', '1a:1']);
    for (const s of r.steps) expect(s.needs).toBe(NEEDS[s.option]);
    expect(waysToRaise('3b').steps.map(s => s.option)).toEqual(['3a', '2b', '2a', '1b', '1a']);
  });
  test('from a reported figure only verification is left; from a verified one nothing', () => {
    expect(waysToRaise('1b').steps.map(s => s.option)).toEqual(['1a']);
    expect(waysToRaise('1a').steps).toEqual([]);
    expect(waysToRaise(null)).toEqual({ from: null, steps: [] });
  });
  test('the alternative option is never offered as a way up', () => {
    for (const o of ['3b', '3a', '2b']) expect(waysToRaise(o).steps.some(s => s.option === 'alt')).toBe(false);
  });
});

describe('the two example borrowers', () => {
  test('the reported one earns Option 1b at score 2; the one that does not know earns Option 3a at score 4 on the held factor', async () => {
    const reported = await register.preview(ORG, exampleExposure(YEAR));
    expect(reported.result.inventory.dataQuality.scope1And2).toMatchObject({ option: '1b', score: 2 });
    expect(reported.raise.steps.map(s => s.option)).toEqual(['1a']);

    const sector = await register.preview(ORG, exampleExposure(YEAR, 'sector'));
    const dq = sector.result.inventory.dataQuality.scope1And2;
    expect(dq).toMatchObject({ option: '3a', score: 4 });
    expect(sector.result.factorRelease).toMatchObject({ rows: ['agriculture_rice'] });
    expect(sector.result.factorRelease.tables[0].table).toBe('sector-factors');
    expect(sector.result.factorRelease.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(sector.result.inventory.scope1And2.value).toBeGreaterThan(0);
    expect(sector.result.attribution).toBeTruthy();
    expect(sector.raise.from).toEqual({ option: '3a', score: 4 });
    expect(sector.stored).toBe(false);
  });

  test('with the revenue cleared the same borrower falls to Option 3b at score 5 on the outstanding alone', async () => {
    const x = exampleExposure(YEAR, 'sector');
    delete x.plausibility;
    x.emissions = { scope1: { basis: 'assets-sector' }, scope2: { basis: 'assets-sector' }, scope3AbsentReason: x.emissions.scope3AbsentReason };
    delete x.denominator;
    const p = await register.preview(ORG, x);
    expect(p.result.inventory.dataQuality.scope1And2).toMatchObject({ option: '3b', score: 5 });
    expect(p.result.attribution).toBeFalsy();
  });
});

describe('the preview route', () => {
  test('is a read: the engine answers, nothing is written, and the same body twice gives the same answer', async () => {
    const body = exampleExposure(YEAR, 'sector');
    const a = await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(body).expect(200);
    const b = await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(body).expect(200);
    expect(a.body.preview.result.inventory.scope1And2.value).toBe(b.body.preview.result.inventory.scope1And2.value);
    expect(a.body.preview.result.inventory.dataQuality.scope1And2.option).toBe('3a');
    expect(a.body.preview.raise.steps.length).toBe(4);
    expect(a.body.preview.exposureId).toBeUndefined();
    expect(await store.list(repo.EXPOSURES, ORG)).toHaveLength(0);
    expect(requiredScopeFor('POST', '/v1/pcaf/part-a/exposures/preview').scope).toBe('read');
    expect(requiredScopeFor('POST', '/v1/pcaf/part-a/exposures').scope).toBe('write');
  });

  test('a refusal reaches the form before Record, with its clause', async () => {
    const body = exampleExposure(YEAR);
    body.denominator.asOf = `${YEAR}-03-31`;
    const res = await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(body).expect(400);
    expect(res.body.error).toBe('VALUATION_DATE_MISMATCH');
    expect(res.body.message).toMatch(/§5\.2/);
  });

  test('every register class previews through its own engine', async () => {
    const office = { assetClass: 'commercial-real-estate', reportingYear: YEAR, counterparty: { name: 'Preview Tower' },
      buildingType: 'office', exposure: { outstanding: 5000000, currency: 'LKR', asOf: `${YEAR}-12-31` }, value: { atOrigination: 20000000 },
      floorArea: { value: 1000, unit: 'm2' } };
    const res = await request(app).post('/v1/pcaf/part-a/exposures/preview').set('x-api-key', KEY).send(office).expect(200);
    expect(res.body.preview.assetClass).toBe('commercial-real-estate');
    expect(res.body.preview.raise).toBeNull();
    expect(res.body.preview.result.inventory.dataQuality.scope1And2.score).toBeGreaterThan(0);
  });

  test('the example route serves both borrowers', async () => {
    const a = await request(app).get(`/v1/pcaf/part-a/starter/example?reportingYear=${YEAR}`).set('x-api-key', KEY).expect(200);
    expect(a.body.example.counterparty.name).toBe('Lanka Textiles (Pvt) Ltd');
    const b = await request(app).get(`/v1/pcaf/part-a/starter/example?reportingYear=${YEAR}&variant=sector`).set('x-api-key', KEY).expect(200);
    expect(b.body.example.counterparty.name).toBe('Ruhunu Rice Millers (Pvt) Ltd');
    expect(b.body.example.emissions.scope1.basis).toBe('revenue-sector');
    expect(b.body.example.identifiers.accountNumber).toMatch(/^WT-RICE-/);
  });
});
