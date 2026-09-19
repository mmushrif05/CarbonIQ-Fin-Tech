// @ts-check
/**
 * The intensity screen — the five frameworks and one figure against them,
 * served rather than held in the browser.
 */

'use strict';

const screen = require('../src/domains/taxonomy/domain/intensity-screen');
const { api, auth } = require('./helpers/api');

describe('screenIntensity()', () => {
  test('380 kgCO2e/m2 is aligned on all five, 620 on none but transition where a band allows', () => {
    const low = screen.screenIntensity(380);
    expect(low.summary).toEqual({ aligned: 5, total: 5, label: '5 of 5 frameworks aligned' });
    expect(low.frameworks.map(f => f.id)).toEqual(['asean', 'sg', 'hk', 'eu', 'sl']);
    const mid = screen.screenIntensity(620);
    expect(mid.summary.aligned).toBe(0);
    const row = (r, id) => /** @type {any} */ (r.frameworks.find(f => f.id === id));
    expect(row(mid, 'asean').tier).toBe('transition');
    expect(row(mid, 'sl').tier).toBe('transition');
    const high = screen.screenIntensity(2000);
    expect(high.frameworks.every(f => f.tier === 'risk')).toBe(true);
    expect(high.frameworks.every(f => f.barPct === 100)).toBe(true);
  });

  test('each band says what it is: ASEAN published, Sri Lanka governed, the other three indicative', () => {
    const r = screen.screenIntensity(400);
    const basis = Object.fromEntries(r.frameworks.map(f => [f.id, f.basis]));
    expect(basis).toEqual({ asean: 'published', sg: 'indicative', hk: 'indicative', eu: 'indicative', sl: 'governed' });
    expect(/** @type {any} */ (r.frameworks.find(f => f.id === 'sl')).provisional).toBe(true);
  });

  test('the Sri Lanka bands the registry resolved replace the shipped ones', () => {
    const r = screen.screenIntensity(300, { sriLanka: { green: 250, transition: 400, basis: 'country', provisional: false } });
    const sl = /** @type {any} */ (r.frameworks.find(f => f.id === 'sl'));
    expect(sl.tier).toBe('transition');
    expect(sl.threshold_kgCO2e_m2).toBe(250);
    expect(sl.provisional).toBe(false);
    expect(sl.baselineBasis).toBe('country');
    /* The ASEAN row is untouched by a Sri Lanka baseline. */
    expect(/** @type {any} */ (r.frameworks.find(f => f.id === 'asean')).threshold_kgCO2e_m2).toBe(500);
  });

  test('a figure that is not an intensity is refused', () => {
    expect(() => screen.screenIntensity(-1)).toThrow(/kgCO2e per square metre/);
    expect(() => screen.screenIntensity(/** @type {any} */ ('abc'))).toThrow();
  });
});

describe('The routes', () => {
  test('GET /v1/taxonomy/frameworks is cached reference data naming five frameworks', async () => {
    const res = await auth(api().get('/v1/taxonomy/frameworks'));
    expect(res.status).toBe(200);
    expect(res.body.frameworks).toHaveLength(5);
    expect(res.body.scaleMax_kgCO2e_m2).toBe(1000);
    expect(res.headers.etag).toBeDefined();
  });

  test('POST /v1/taxonomy/screen answers a read and refuses a non-figure', async () => {
    const ok = await auth(api().post('/v1/taxonomy/screen')).send({ intensity_kgCO2e_m2: 460 });
    expect(ok.status).toBe(200);
    expect(ok.body.summary.total).toBe(5);
    expect(ok.body.frameworks.find(f => f.id === 'sl').tier).toBe('aligned');
    const bad = await auth(api().post('/v1/taxonomy/screen')).send({ intensity_kgCO2e_m2: 'lots' });
    expect(bad.status).toBe(400);
  });
});
