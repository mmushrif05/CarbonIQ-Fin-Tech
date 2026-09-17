/**
 * The climate classification a loan carries, and the SLFRS S2 sums over it.
 *
 * The claim worth a test is the one a confident screen gets wrong: a book
 * nobody has classified must read as unclassified, never as safe. So the
 * shares are taken over the outstanding actually assessed, the unassessed
 * amount travels beside every figure, and a position with nothing assessed
 * answers null rather than nought per cent — `Number(null)` is 0, and 0 here
 * would read as "none of the book is vulnerable".
 *
 * Beside that: the classification is the bank's and never the engine's, it is
 * not an engine input, it survives an edit that does not mention it, and it
 * reaches the roll-up through the projection rather than by reading every
 * record whole.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const store = require('../src/platform/database/store');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const register = require('../src/domains/pcaf-part-a/application/register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const exposureClimate = require('../src/domains/pcaf-part-a/domain/climate/exposure');
const { installStarterBook } = require('../src/domains/pcaf-part-a/application/starter-book');
const sovereign = require('../src/domains/pcaf-part-a/application/sovereign-register');
const { issueKey } = require('./helpers/key');

const YEAR = 2041;
const asOf = `${YEAR}-12-31`;
let ORG = 'climate-exposure-test';
let KEY = null;

const loan = (name, climate) => ({
  assetClass: 'business-loans-unlisted-equity', reportingYear: YEAR,
  instrument: 'business-loan', borrowerListed: false,
  counterparty: { name, sector: 'Textiles', sectorKey: 'manufacturing_textiles' },
  outstanding: { amount: 1_000_000, asOf, currency: 'LKR' },
  denominator: { totalEquity: 6_000_000, totalDebt: 4_000_000, asOf, currency: 'LKR' },
  emissions: {
    scope1: { value: 1000, basis: 'reported-unverified', period: String(YEAR) },
    scope2: { value: 100, basis: 'reported-unverified', period: String(YEAR) },
    scope3AbsentReason: 'not measured',
  },
  ...(climate ? { climate } : {}),
});

async function clear() {
  for (const e of await store.list(repo.EXPOSURES, ORG)) await store.remove(repo.EXPOSURES, ORG, e.exposureId || e.id);
  try { await store.remove(repo.SETTINGS, ORG, 'default'); } catch (_) { /* nothing held */ }
  try { await store.remove(repo.BOOK, ORG, String(YEAR)); } catch (_) { /* nothing held */ }
  for (const e of await store.list(sovereign.COLLECTION || 'parta_sovereign_exposures', ORG).catch(() => [])) {
    await store.remove(sovereign.COLLECTION || 'parta_sovereign_exposures', ORG, e.exposureId || e.id).catch(() => null);
  }
}

beforeAll(async () => {
  const k = await issueKey({ orgId: ORG, keyName: 'climate exposure suite' });
  KEY = k.key; ORG = k.orgId;
});
beforeEach(clear);
afterAll(clear);

describe('the sums, in the domain', () => {
  test('a share is over the assessed outstanding, and what is unassessed is stated', () => {
    const p = exposureClimate.position([
      { outstanding: 1000, sector: 'Cement', sectorKey: 'manufacturing_cement', emissions: 500, climate: { transitionRisk: { verdict: 'vulnerable' } } },
      { outstanding: 3000, sector: 'Banking', sectorKey: 'finance', emissions: 100, climate: { transitionRisk: { verdict: 'not_vulnerable' } } },
      { outstanding: 6000, sector: 'Banking', sectorKey: 'finance', emissions: 50, climate: null },
    ]);
    expect(p.transitionRisk.amount).toBe(1000);
    expect(p.transitionRisk.assessedAmount).toBe(4000);
    expect(p.transitionRisk.unassessedAmount).toBe(6000);
    expect(p.transitionRisk.sharePct).toBe(25);
  });

  test('a book nobody classified answers null, not nought per cent', () => {
    const p = exposureClimate.position([
      { outstanding: 1000, sector: 'finance', emissions: 10, climate: null },
      { outstanding: 2000, sector: 'finance', emissions: 20, climate: { transitionRisk: { verdict: 'not_assessed' } } },
    ]);
    expect(p.transitionRisk.sharePct).toBeNull();
    expect(p.transitionRisk.unassessedAmount).toBe(3000);
    expect(p.classified).toBe(false);
  });

  test('every carbon-related key resolves in the sector vocabulary, and the basis is stated', () => {
    const sectors = require('../data/pcaf-parta/sectors.json').sectors;
    for (const key of exposureClimate.CARBON_RELATED_SECTORS) {
      expect({ key, held: Boolean(sectors[key]) }).toEqual({ key, held: true });
    }
    expect(exposureClimate.CARBON_RELATED_BASIS).toMatch(/TCFD/);
    expect(exposureClimate.CARBON_RELATED_BASIS).toMatch(/reporting entity's to set/);
  });

  test('an exposure with no sector is its own row rather than folded into another', () => {
    const p = exposureClimate.position([
      { outstanding: 100, sector: null, sectorKey: null, emissions: 1, climate: null },
      { outstanding: 200, sector: 'Banking', sectorKey: 'finance', emissions: 2, climate: null },
    ]);
    expect(p.industries.rows.map(r => r.sector)).toEqual(expect.arrayContaining([null, 'Banking']));
  });

  test('a verdict outside the vocabulary is cleared, and an empty block is null', () => {
    expect(exposureClimate.normaliseExposureClimate({ transitionRisk: { verdict: 'maybe' } })).toBeNull();
    expect(exposureClimate.normaliseExposureClimate({})).toBeNull();
    const held = exposureClimate.normaliseExposureClimate({ physicalRisk: { verdict: 'vulnerable', horizon: 'long' } });
    expect(held.physicalRisk).toEqual({ verdict: 'vulnerable', horizon: 'long', note: null });
  });
});

describe('over the register', () => {
  test('the classification is recorded, is not an engine input, and reaches the projection', async () => {
    const rec = await register.record(ORG, loan('Kelani Mills', {
      transitionRisk: { verdict: 'vulnerable', horizon: 'medium' },
      opportunity: { verdict: 'not_aligned' },
    }));
    expect(rec.climate.transitionRisk.verdict).toBe('vulnerable');
    /* Never handed to the engine: the engine schemas are closed and the
       arithmetic knows nothing about it. */
    expect(rec.input.climate).toBeUndefined();

    const rows = await register.climateRows(ORG, YEAR);
    expect(rows).toHaveLength(1);
    expect(rows[0].climate.transitionRisk.verdict).toBe('vulnerable');
    expect(rows[0].outstanding).toBe(1_000_000);
  });

  test('an edit that does not mention the classification leaves it standing', async () => {
    const rec = await register.record(ORG, loan('Ruhunu Textiles', {
      physicalRisk: { verdict: 'vulnerable', horizon: 'long' },
    }));
    const next = await register.update(ORG, rec.exposureId, loan('Ruhunu Textiles'));
    expect(next.climate.physicalRisk.verdict).toBe('vulnerable');
  });

  test('an edit that sends an empty classification clears it, which is a different act', async () => {
    const rec = await register.record(ORG, loan('Matara Weaving', {
      physicalRisk: { verdict: 'vulnerable', horizon: 'long' },
    }));
    const next = await register.update(ORG, rec.exposureId, { ...loan('Matara Weaving'), climate: {} });
    expect(next.climate).toBeNull();
  });

  test('the consolidated position carries the S2 lines and names what is still unclassified', async () => {
    await register.record(ORG, loan('Classified Ltd', { transitionRisk: { verdict: 'vulnerable', horizon: 'short' } }));
    await register.record(ORG, loan('Unclassified Ltd'));
    const pos = await consolidated.position(ORG, YEAR);

    expect(pos.climateExposure.transitionRisk.amount).toBe(1_000_000);
    expect(pos.climateExposure.transitionRisk.unassessedAmount).toBe(1_000_000);
    expect(pos.climateExposure.transitionRisk.sharePct).toBe(100);
    expect(pos.climateExposure.transitionRisk.basis).toMatch(/Classified per exposure by the reporting entity/);

    const item = pos.outstandingItems.find(x => /Classify the exposures/.test(x.what));
    expect(item).toBeTruthy();
    expect(item.clause).toBe('SLFRS S2 §29(b)–(d)');
  });
});

describe('over the route', () => {
  const h = () => ({ 'x-api-key': KEY, 'X-Actor': 'Ana Perera' });

  test('a verdict outside the vocabulary is a named 400', async () => {
    const res = await request(app).post('/v1/pcaf/part-a/exposures').set(h())
      .send(loan('Bad Verdict Ltd', { transitionRisk: { verdict: 'somewhat' } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/transitionRisk/);
  });

  test('a recorded classification comes back on the exposure and in the position', async () => {
    const post = await request(app).post('/v1/pcaf/part-a/exposures').set(h())
      .send(loan('Route Ltd', { opportunity: { verdict: 'aligned', taxonomyCode: 'M6.3' } }));
    expect(post.status).toBe(201);
    expect(post.body.exposure.climate.opportunity.taxonomyCode).toBe('M6.3');

    const pos = await request(app).get(`/v1/pcaf/part-a/financed-emissions/${YEAR}`).set(h());
    expect(pos.status).toBe(200);
    expect(pos.body.climateExposure.opportunities.amount).toBe(1_000_000);
  });
});

describe('the starter book shows a real position rather than one that classifies itself', () => {
  test('most exposures carry a classification and a few deliberately do not', async () => {
    const installed = await installStarterBook({ register, sovereign, store }, ORG, { by: 'Suite' });
    const year = installed.reportingYear;
    const rows = await register.climateRows(ORG, year);

    const classified = rows.filter(r => r.climate).length;
    expect(classified).toBeGreaterThan(8);
    /* Not every one: an unassessed share that is always zero is a figure a
       reader learns to skip, and a book that classifies itself is not a book. */
    expect(classified).toBeLessThan(rows.length);

    const pos = await consolidated.position(ORG, year);
    expect(pos.climateExposure.classified).toBe(true);
    expect(pos.climateExposure.transitionRisk.amount).toBeGreaterThan(0);
    expect(pos.climateExposure.transitionRisk.unassessedAmount).toBeGreaterThan(0);
    expect(pos.climateExposure.opportunities.amount).toBeGreaterThan(0);
    expect(pos.climateExposure.industries.carbonRelated.outstanding).toBeGreaterThan(0);
    expect(pos.climateExposure.industries.carbonRelated.sharePct).not.toBeNull();
  });
});
