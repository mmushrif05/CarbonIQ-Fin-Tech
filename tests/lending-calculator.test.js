// @ts-check
/**
 * The lending calculators — the arithmetic three screens used to do for
 * themselves, done on the server and proved here.
 *
 * `POST /v1/lending/attribution` is the PCAF calculator's answer,
 * `POST /v1/lending/estimate` the new-project wizard's review figures, and
 * `GET /v1/projects/:id/monitoring` now prices every entry and carries the
 * year-on-year comparison. `GET /v1/portfolio/sample` serves the sample
 * book that used to be a file the site published, and the portfolio carries
 * every derived share under `derived`.
 */

'use strict';

const calculator = require('../src/domains/lending/domain/calculator');
const { withDerivedFigures } = require('../src/domains/lending/domain/portfolio');
const { api, auth } = require('./helpers/api');
const { issueKey } = require('./helpers/key');

let KEY;
beforeAll(async () => { KEY = (await issueKey({ orgId: 'calc-org', projectIds: ['SG-2024-001'] })).key; });
const withKey = req => req.set('X-API-Key', KEY);

describe('attribute() — outstanding over equity plus debt, applied to the project', () => {
  test('the default calculator inputs reproduce the screen\'s figures', () => {
    const r = calculator.attribute({ outstanding: 50e6, equity: 80e6, debt: 120e6, emissions_tCO2e: 10000,
      projectPhase: 'Operational', projectType: 'Commercial', dqScore: 2 });
    expect(r.attribution).toBe(0.25);
    expect(r.financedEmissions_tCO2e).toBe(2500);
    expect(r.economicIntensity_tCO2e_per_M).toBe(50);
    expect(r.scopes.s1.value_tCO2e + r.scopes.s2.value_tCO2e + r.scopes.s3.value_tCO2e).toBeCloseTo(2500, 0);
    expect(r.scopes.basis).toBe('indicative');
    expect(r.scopes.note).toMatch(/not a measured inventory/);
    expect(r.dataQuality).toEqual({ score: 2, label: expect.any(String) });
    expect(Math.max(r.scopes.s1.barPct, r.scopes.s2.barPct, r.scopes.s3.barPct)).toBe(100);
  });

  test('a facility larger than the project is capped at one and says so', () => {
    const r = calculator.attribute({ outstanding: 500e6, equity: 80e6, debt: 120e6, emissions_tCO2e: 1000 });
    expect(r.attribution).toBe(1);
    expect(r.capped).toBe(true);
  });

  test('construction is dominated by scope 3; an unknown type falls to the commercial profile', () => {
    const c = calculator.attribute({ outstanding: 1, equity: 1, debt: 1, emissions_tCO2e: 1000, projectPhase: 'Construction' });
    expect(c.scopes.s3.value_tCO2e).toBeGreaterThan(c.scopes.s1.value_tCO2e + c.scopes.s2.value_tCO2e);
    const u = calculator.attribute({ outstanding: 1, equity: 1, debt: 1, emissions_tCO2e: 1000, projectType: 'Spaceport' });
    expect(u.scopes.profile).toBe('Operational / Commercial');
  });

  test.each([
    [{ outstanding: 0, equity: 1, debt: 1, emissions_tCO2e: 1 }, /Outstanding amount/],
    [{ outstanding: 1, equity: -1, debt: 1, emissions_tCO2e: 1 }, /cannot be negative/],
    [{ outstanding: 1, equity: 1, debt: 1, emissions_tCO2e: 0 }, /emissions must be greater/],
    [{ outstanding: 1, equity: 0, debt: 0, emissions_tCO2e: 1 }, /Equity \+ Debt/],
  ])('a refusal names the input: %j', (input, message) => {
    expect(() => calculator.attribute(input)).toThrow(message);
    try { calculator.attribute(input); } catch (e) { expect(/** @type {any} */ (e).statusCode).toBe(400); }
  });
});

describe('estimate() — the bill priced on the factor table', () => {
  const factors = { concrete: { factor: 0.13, source: 'ICE' }, steel: { factor: 1.55, source: 'ICE' } };

  test('lines, totals, intensity and attribution, with an unpriced line left out and counted', () => {
    const r = calculator.estimate({
      materials: [
        { name: 'Concrete', category: 'Concrete', qty: 850000, unit: 'kg' },
        { name: 'Rebar', category: 'steel', qty: 120, unit: 'tonnes' },
        { name: 'Mystery', category: 'unobtainium', qty: 5, unit: 'kg' },
      ],
      floorArea_m2: 10000,
      loan: { outstanding: 50e6, equity: 80e6, debt: 120e6 },
    }, factors);
    expect(r.lines[0].kgCO2e).toBe(110500);
    expect(r.lines[1].kgCO2e).toBe(186000);
    expect(r.lines[2].kgCO2e).toBeNull();
    expect(r.lines[2].factor).toBeNull();
    expect(r.totals.totalKgCO2e).toBe(296500);
    expect(r.totals.unpricedCount).toBe(1);
    expect(r.totals.intensity_kgCO2e_m2).toBe(29.7);
    const attribution = /** @type {any} */ (r.attribution);
    expect(attribution.factor).toBe(0.25);
    expect(attribution.financedEmissions_tCO2e).toBe(74);
  });

  test('no area is no intensity, and no loan is no attribution — null, never nought', () => {
    const r = calculator.estimate({ materials: [{ category: 'steel', qty: 1000 }] }, factors);
    expect(r.totals.intensity_kgCO2e_m2).toBeNull();
    expect(r.attribution).toBeNull();
  });
});

describe('monitoringSeries() — every year priced and the latest compared with the one before', () => {
  const rows = [
    { year: 2024, outstanding: 62e6, equity: 80e6, debt: 120e6, emissions: 10500, dq: 4 },
    { year: 2026, outstanding: 50e6, equity: 80e6, debt: 120e6, emissions: 10000, dq: 2 },
    { year: 2025, outstanding: 56e6, equity: 80e6, debt: 120e6, emissions: 10180, dq: 3 },
  ];

  test('sorted by year, the last marked current, bars scaled to the largest attribution', () => {
    const { entries } = calculator.monitoringSeries(rows);
    expect(entries.map(e => e.year)).toEqual([2024, 2025, 2026]);
    expect(entries[0].timelineBarPct).toBe(100);
    expect(entries[2].current).toBe(true);
    expect(entries[2].attribution).toBe(0.25);
    expect(entries[2].financed).toBe(2500);
  });

  test('the comparison carries the movement, the trend and the fluctuation analysis', () => {
    const comparison = /** @type {any} */ (calculator.monitoringSeries(rows).comparison);
    expect(comparison.currentYear).toBe(2026);
    expect(comparison.previousYear).toBe(2025);
    expect(comparison.financed.changePct).toBeCloseTo(-12.3, 1);
    expect(comparison.dataQuality.trend).toBe('improving');
    const f = comparison.fluctuation;
    expect(f.attributionEffect_tCO2e + f.emissionsEffect_tCO2e).toBe(f.net_tCO2e);
    expect(f.attributionEffect_tCO2e).toBeLessThan(0);
  });

  test('one year is a series with no comparison', () => {
    const { comparison, entries } = calculator.monitoringSeries([rows[0]]);
    expect(comparison).toBeNull();
    expect(entries).toHaveLength(1);
  });
});

describe('withDerivedFigures() — the shares a screen used to compute', () => {
  test('shares, concentration, intensity and per-contributor intensity, absent where there is nothing to divide by', () => {
    const p = withDerivedFigures({
      totalProjects: 4, totalFinancedEmissions_tCO2e: 1000, totalOutstanding: 50e6,
      taxonomyDistribution: { green: 1, transition: 1, brown: 2 },
      topContributors: [
        { projectId: 'a', financedEmissions_tCO2e: 600, loanOutstanding: 10e6 },
        { projectId: 'b', financedEmissions_tCO2e: 100 },
      ],
      meta: { requestedProjects: 5, resolvedProjects: 4 },
    });
    expect(p.derived.greenLoanPct).toBe(25);
    expect(p.derived.taxonomySharePct).toEqual({ green: 25, transition: 25, brown: 50, classified: 4 });
    expect(p.derived.concentration).toEqual({ topN: 2, topEmissions_tCO2e: 700, pct: 70 });
    expect(p.derived.economicIntensity_tCO2e_per_M).toBe(20);
    expect(p.derived.coveragePct).toBe(80);
    expect(p.derived.contributors).toEqual([
      { projectId: 'a', intensity_tCO2e_per_M: 60 }, { projectId: 'b', intensity_tCO2e_per_M: null },
    ]);
    const empty = withDerivedFigures({ totalProjects: 0, totalFinancedEmissions_tCO2e: 0, taxonomyDistribution: {}, topContributors: [] });
    expect(empty.derived.greenLoanPct).toBeNull();
    expect(empty.derived.economicIntensity_tCO2e_per_M).toBeNull();
    expect(empty.derived.concentration.pct).toBeNull();
  });
});

describe('The routes', () => {
  test('POST /v1/lending/attribution answers a read-only caller and stores nothing', async () => {
    const body = { outstanding: 50e6, equity: 80e6, debt: 120e6, emissions_tCO2e: 10000, dqScore: 2 };
    const a = await withKey(api().post('/v1/lending/attribution')).send(body);
    expect(a.status).toBe(200);
    expect(a.body.financedEmissions_tCO2e).toBe(2500);
    const b = await withKey(api().post('/v1/lending/attribution')).send(body);
    expect(b.body).toEqual(a.body);
    const bad = await withKey(api().post('/v1/lending/attribution')).send({ ...body, outstanding: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/Outstanding amount/);
  });

  test('POST /v1/lending/estimate prices the bill on the engine\'s own factor table', async () => {
    const res = await withKey(api().post('/v1/lending/estimate')).send({
      materials: [{ name: 'Concrete C30/37', category: 'concrete', qty: 850000, unit: 'kg' }],
      floorArea_m2: 12000, loan: { outstanding: 50e6, equity: 80e6, debt: 120e6 },
    });
    expect(res.status).toBe(200);
    expect(res.body.lines[0].factor).toBe(0.13);
    expect(res.body.totals.totalKgCO2e).toBe(110500);
    expect(res.body.attribution.factor).toBe(0.25);
  });

  test('GET /v1/portfolio/sample is the sample book with its derived shares, named as a sample', async () => {
    const res = await auth(api().get('/v1/portfolio/sample'));
    expect(res.status).toBe(200);
    expect(res.body.sample).toBe(true);
    expect(res.body._meta.label).toBe('SAMPLE DATA');
    expect(res.body.derived.greenLoanPct).toEqual(expect.any(Number));
    expect(res.body.derived.concentration.pct).toEqual(expect.any(Number));
    expect(res.body.topContributors[0].intensity_kgCO2e_m2).toEqual(expect.any(Number));
    expect(res.headers['cache-control']).toBeDefined();
  });

  test('GET /v1/projects/:id/monitoring answers the illustrative series where nothing is recorded, and the recorded one after a write', async () => {
    const before = await withKey(api().get('/v1/projects/SG-2024-001/monitoring'));
    expect(before.status).toBe(200);
    expect(before.body.source).toBe('sample');
    expect(before.body.sampleNote).toMatch(/Sample data/);
    expect(before.body.entries).toHaveLength(3);
    expect(before.body.comparison.fluctuation.net_tCO2e).toEqual(expect.any(Number));
    expect(before.body.entries[2].financed).toBe(2500);

    const write = await withKey(api().post('/v1/projects/SG-2024-001/monitoring'))
      .send({ year: 2026, outstanding: 40e6, equity: 80e6, debt: 120e6, emissions: 9000, dq: 2 });
    expect(write.status).toBe(200);
    expect(write.body.attribution).toBe(0.2);
    expect(write.body.financed).toBe(1800);

    const after = await withKey(api().get('/v1/projects/SG-2024-001/monitoring'));
    expect(after.body.source).toBe('recorded');
    expect(after.body.total).toBe(1);
    expect(after.body.comparison).toBeNull();
    expect(after.body.entries[0].timelineBarPct).toBe(100);
  });
});
