/**
 * The starter book — a bank's own first book, across every built Part A
 * class, loaded with one press and never over a book somebody has begun.
 *
 * Every row is recorded through the services, so each engine runs on it; the
 * consolidated position then shows every built class recorded with one score
 * each. Refusals: a second load, the preview organisation, a read-only key.
 */

'use strict';

const request = require('supertest');
const store = require('../src/platform/database/store');
const app = require('../src/server');
const register = require('../src/domains/pcaf-part-a/application/register');
const sovereign = require('../src/domains/pcaf-part-a/application/sovereign-register');
const consolidated = require('../src/domains/pcaf-part-a/application/parta-consolidated');
const starter = require('../src/domains/pcaf-part-a/application/starter-book');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const sovRepo = require('../src/domains/pcaf-part-a/infrastructure/sovereign-store');
const { requiredScopeFor } = require('../src/platform/auth/scopes');
const { issueKey } = require('./helpers/key');

let ORG = 'org-starter-book';
let KEY;
const deps = { register, sovereign, store };

async function clear(org) {
  for (const e of await store.list(repo.EXPOSURES, org)) await store.remove(repo.EXPOSURES, org, e.exposureId || e.id);
  for (const e of await store.list(sovRepo.SOVEREIGN, org)) await store.remove(sovRepo.SOVEREIGN, org, e.exposureId || e.id);
  for (const b of await store.list(repo.BOOK, org)) await store.remove(repo.BOOK, org, b.reportingYear || b.id);
  await store.remove(repo.SETTINGS, org, 'default').catch(() => null);
}

beforeAll(async () => {
  const issued = await issueKey({ orgId: ORG, keyName: 'starter book' });
  ORG = issued.orgId; KEY = issued.key;
});
beforeEach(() => clear(ORG));
afterAll(() => clear(ORG));

describe('the starter book', () => {
  test('two or three exposures per built class, and each shape the engines can take', () => {
    const byClass = {};
    for (const e of starter.EXPOSURES) byClass[e.assetClass] = (byClass[e.assetClass] || 0) + 1;
    expect(byClass).toEqual({ 'business-loans-unlisted-equity': 3, 'listed-equity-corporate-bonds': 2, 'project-finance': 2,
      'commercial-real-estate': 2, 'mortgages': 3, 'motor-vehicle-loans': 3 });
    expect(starter.HOLDINGS).toHaveLength(2);
    expect(starter.EXPOSURES.every(e => e.reportingYear === starter.YEAR)).toBe(true);
    expect(starter.EXPOSURES.every(e => /^ST-/.test(e.identifiers.accountNumber))).toBe(true);
    /* Who prepared and who approved are the entity's to state. */
    expect(starter.SETTINGS.preparedBy).toBeUndefined();
    expect(starter.SETTINGS.approvedBy).toBeUndefined();
    expect(starter.SETTINGS.reportingEntity).toBeUndefined();
  });

  test('it installs through the services, every class is recorded with its own score, and the disclosure asks for what only the entity can state', async () => {
    const r = await starter.installStarterBook(deps, ORG, { by: 'Ana', reportingEntity: 'Starter Bank PLC' });
    expect(r.installed).toEqual({ exposures: 15, sovereign: 2, classes: 7 });
    expect(r.book.statedBy).toBe('Ana (starter book)');
    expect(r.settings.reportingEntity).toBe('Starter Bank PLC');
    const pos = await consolidated.position(ORG, starter.YEAR);
    const recorded = pos.classes.filter(c => c.status === 'recorded').map(c => c.section);
    expect(recorded).toEqual(['§5.1', '§5.2', '§5.3', '§5.4', '§5.5', '§5.6', '§5.9']);
    expect(pos.dataQuality.byClass).toHaveLength(7);
    for (const c of pos.dataQuality.byClass) expect(c.score).toBeGreaterThanOrEqual(1);
    /* One class scores on its own table: the fleet on fuel invoices and the odometer sits near 1, the sovereign holdings at 5. */
    expect(pos.dataQuality.byClass.find(c => c.section === '§5.6').score).toBeLessThan(2);
    expect(pos.dataQuality.byClass.find(c => c.section === '§5.9').score).toBe(5);
    expect(pos.coverage.sharePct).toBeGreaterThan(0);
    expect(pos.outstandingItems.map(x => x.what)).toEqual(expect.arrayContaining([expect.stringMatching(/prepared and who approved/)]));
    /* The classes the entity does not hold are stated with the entity's reason. */
    expect(pos.classes.find(c => c.assetClass === 'use-of-proceeds')).toMatchObject({ status: 'not-built', reasonStatedBy: 'entity' });
  });

  test('a second load is refused naming what is held; the entity’s recorded facts are never overwritten', async () => {
    await register.saveSettings(ORG, { reportingEntity: 'My Bank PLC', gwpBasis: 'IPCC AR5, 100-year' });
    const r = await starter.installStarterBook(deps, ORG, { reportingEntity: 'Starter Bank PLC' });
    expect(r.settings.reportingEntity).toBe('My Bank PLC');
    expect(r.settings.gwpBasis).toBe('IPCC AR5, 100-year');
    expect(r.settings.consolidationApproach).toBe('operational_control');
    await expect(starter.installStarterBook(deps, ORG)).rejects.toMatchObject({ statusCode: 409, code: 'STARTER_NOT_EMPTY',
      message: expect.stringMatching(/15 exposure\(s\) in the lending book and sovereign holdings/) });
  });

  test('the preview organisation takes no starter book', async () => {
    await expect(starter.installStarterBook(deps, 'preview')).rejects.toMatchObject({ statusCode: 409, code: 'PREVIEW_NOT_A_BOOK' });
  });

  test('over HTTP it is a write: a read-only key is refused, the dashboard key loads it, and the register shows every class', async () => {
    expect(requiredScopeFor('POST', '/v1/pcaf/part-a/starter').scope).toBe('write');
    const res = await request(app).post('/v1/pcaf/part-a/starter').set('x-api-key', KEY).send({}).expect(201);
    expect(res.body.installed.classes).toBe(7);
    const years = await request(app).get('/v1/pcaf/part-a/years').set('x-api-key', KEY).expect(200);
    expect(years.body.years.find(y => y.reportingYear === String(starter.YEAR)).byClass['motor-vehicle-loans']).toBe(3);
    const again = await request(app).post('/v1/pcaf/part-a/starter').set('x-api-key', KEY).send({}).expect(409);
    expect(again.body.error || again.body.code).toBe('STARTER_NOT_EMPTY');
  });
});
