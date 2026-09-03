/**
 * The GCF pipeline, end to end.
 *
 * Every other GCF suite tests one module. This one walks the whole stack in
 * the order a bank actually uses it — record a project, screen it, rank it,
 * structure it, roll up its emissions, contribute it to the NDC, disclose it,
 * package it for a Concept Note, and transfer the period — and asserts that
 * the pieces agree with each other.
 *
 * Unit tests cannot catch a disagreement between modules. Every defect in this
 * codebase that reached a screen did so with its own unit test passing.
 *
 * What is pinned here is composition: one figure entered once appears
 * unchanged everywhere it is read, the three carbon boundaries stay apart the
 * whole way through, and the two NDC ledgers never meet.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const get = async (path, status = 200) =>
  (await auth(api().get(path)).expect(status)).body;

beforeEach(() => partcStore._resetMemory());

describe('One project, entered once, read everywhere', () => {
  /* A deliberately distinctive figure. If it is re-keyed or recomputed
     anywhere it will not be 12,345 on the other side. */
  const PROJECT = Object.freeze({
    id: 'gcf_journey_hydro',
    code: 'GCF-J1',
    name: 'Kelani Valley Run-of-River Hydro',
    location: { province: 'Sabaragamuwa', districts: ['Kegalle'], country: 'LK' },
    sector: 'Renewable generation',
    resultsArea: 'EP',
    stream: 'mitigation',
    stage: 'pre_feasibility',
    selectionReason: 'A single-project journey fixture with a distinctive annual figure, entered '
      + 'once so the same number can be followed through every module that reads it.',
    essCategory: 'B',
    taxonomy: { framework: 'SLGFT', band: 'green', objective: 'M' },
    ndcSectorTargets: ['power'],
    barriers: ['tenor', 'offtake_risk'],
    technical: { lifetimeYears: 25 },
    financing: {
      currency: 'USD',
      totalCost: 60000000,
      gcfAsk: 20000000,
      dfcc: 25000000,
      other: 15000000,
      otherLabel: 'Sponsor equity',
      instrument: 'concessional_credit_line',
      viabilityWithoutGcf: {
        viable: false,
        reason: 'Tenor available locally is half the concession period.',
      },
    },
    mitigation: {
      annual_tCO2e: { value: 12345, tier: 'modelled', method: 'generation x grid factor' },
      lifetime_tCO2e: { value: 308625, tier: 'modelled', method: 'annual x 25 years' },
      baseline: {
        description: 'Grid electricity displaced',
        counterfactual: 'Without the project the same demand is met from the national grid',
        type: 'avoided',
      },
    },
    beneficiaries: {
      direct: { value: 9100, tier: 'declared', definition: 'Households connected' },
      indirect: { value: 41000, tier: 'modelled', definition: 'Wider served population' },
    },
  });

  beforeEach(async () => {
    await auth(api().post('/v1/gcf/pipeline').send(PROJECT)).expect(201);
  });

  test('the recorded book replaces the shipped seed entirely', async () => {
    const { pipeline } = await get('/v1/gcf/pipeline');
    expect(pipeline.source).toBe('recorded');
    expect(pipeline.sample).toBe(false);
    expect(pipeline.count).toBe(1);
    expect(pipeline.projects.map(p => p.code)).toEqual(['GCF-J1']);
  });

  test('the annual figure survives unchanged into every module that reads it', async () => {
    const { emissions } = await get('/v1/gcf/emissions');
    expect(emissions.headline.annual_tCO2e).toBe(12345);

    const one = await get('/v1/gcf/emissions/gcf_journey_hydro');
    expect(one.emissions.mitigation.annual_tCO2e).toBe(12345);

    const { ndc } = await get('/v1/gcf/ndc');
    expect(ndc.reduction.pipelineCumulative_tCO2e).toBe(12345 * 10);

    const { report } = await get('/v1/gcf/report');
    expect(report.metricsAndTargets.avoidedAndReduced.annual_tCO2e).toBe(12345);
    expect(report.gri.supplementary.annual_tCO2e).toBe(12345);

    const { package: pkg } = await get('/v1/gcf/cn/gcf_journey_hydro');
    expect(JSON.stringify(pkg.sections)).toContain('12,345');
  });

  test('a 25-year asset contributes only its ten years inside the NDC window', async () => {
    const { ndc } = await get('/v1/gcf/ndc');
    const row = ndc.rows.find(r => r.code === 'GCF-J1');
    expect(row.reduction.yearsInPeriod).toBe(10);
    expect(row.reduction.cumulative_tCO2e).toBe(123450);
    /* Not the whole lifetime — that would double the claim. */
    expect(row.reduction.cumulative_tCO2e).not.toBe(308625);
  });

  test('the gate, the ranking and the recommendation agree on one project', async () => {
    const { screening } = await get('/v1/gcf/screening');
    expect(screening.eligible).toEqual(['GCF-J1']);
    expect(screening.excluded).toEqual([]);

    const { ranking } = await get('/v1/gcf/ranking');
    expect(ranking.mitigation.projects.map(p => p.code)).toEqual(['GCF-J1']);
    expect(ranking.adaptation.projects).toEqual([]);

    const { recommendation } = await get('/v1/gcf/recommendation');
    expect(recommendation.selected.map(s => s.code)).toEqual(['GCF-J1']);
    expect(recommendation.streamBalance.bothStreams).toBe(false);
    expect(recommendation.streamBalance.note).toMatch(/choice to defend/);
  });

  test('the structure answers the barriers the project actually recorded', async () => {
    const { structuring } = await get('/v1/gcf/instruments/gcf_journey_hydro');
    expect(structuring.barriers.map(b => b.id).sort()).toEqual(['offtake_risk', 'tenor']);
    expect(structuring.recommended.coverage).toBe(1);
    expect(structuring.barriersLeftStanding).toEqual([]);
    expect(structuring.concessionality.needsSupport).toBe(true);
  });

  test('the Concept Note package assembles from every engine at once', async () => {
    const { package: pkg } = await get('/v1/gcf/cn/gcf_journey_hydro');
    const flat = JSON.stringify(pkg.sections);
    expect(flat).toContain('GCF-J1'.replace('GCF-J1', 'Kelani Valley'));  // the record
    expect(flat).toContain('Subordinated');                               // the instruments engine
    expect(flat).toContain('power');                                      // the NDC module
    expect(flat).toContain('12,345');                                     // the emissions engine
    expect(pkg.readiness.held).toBeGreaterThan(30);
    expect(pkg.readiness.complete).toBe(false);
  });

  test('the three carbon boundaries never meet, all the way through', async () => {
    const { emissions } = await get('/v1/gcf/emissions');
    const { report } = await get('/v1/gcf/report');

    expect(emissions.financedEmissions.available).toBe(false);
    expect(emissions.embodiedCarbon.a1a5_tCO2e).toBe(0);
    expect(emissions.embodiedCarbon.notHeld).toEqual(['GCF-J1']);

    /* The inventory lines stay absent no matter what the pipeline holds. */
    for (const k of ['scope1', 'scope2', 'scope3']) {
      expect(report.metricsAndTargets.inventory[k]._status).toBe('not_measured');
    }
    expect(JSON.stringify(report.metricsAndTargets.inventory)).not.toContain('12345');
  });

  test('recording the entity facts closes exactly the gaps that depend on them', async () => {
    const before = (await get('/v1/gcf/report')).report;
    await auth(api().put('/v1/gcf/entity').send({
      entityName: 'DFCC Bank PLC',
      climateGovernance: 'The Board Integrated Risk Management Committee reviews climate matters.',
      managementRole: 'The Chief Risk Officer holds the mandate.',
      strategyNarrative: 'Green origination through the GCF accreditation.',
      riskManagementProcess: 'Taxonomy screening at origination.',
      climateTargets: ['Taxonomy alignment across new lending'],
    })).expect(200);
    const after = (await get('/v1/gcf/report')).report;

    expect(after.gaps.length).toBeLessThan(before.gaps.length);
    /* The inventory gaps are NOT closed by entity narrative, and never can be. */
    const stillAbsent = after.gaps.map(g => g.path);
    expect(stillAbsent).toEqual(expect.arrayContaining([
      'metricsAndTargets.inventory.scope1',
      'metricsAndTargets.inventory.scope3',
    ]));
    expect(after.complete).toBe(false);
  });

  test('the period exports, re-imports and reproduces the same roll-up', async () => {
    const before = (await get('/v1/gcf/emissions')).emissions.headline;
    const pkg = await get('/v1/gcf/export?year=2026');
    expect(pkg.checksum).toMatch(/^[0-9a-f]{64}$/);

    await auth(api().delete('/v1/gcf/pipeline/gcf_journey_hydro')).expect(204);
    const emptied = await get('/v1/gcf/pipeline');
    expect(emptied.pipeline.source).toBe('seed');   // the book is empty; the seed shows again

    const res = await auth(api().post('/v1/gcf/import').send(pkg)).expect(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.checksum).toBe(pkg.checksum);

    const after = (await get('/v1/gcf/emissions')).emissions.headline;
    expect(after).toEqual(before);
  });

  test('the conformance matrix is servable alongside the work it describes', async () => {
    const m = await get('/v1/gcf/conformance');
    expect(m.summary.implemented).toBeGreaterThan(20);
    expect(m.disclaimer).toMatch(/Nothing here is endorsed by the Green Climate Fund/);
  });
});

describe('The shipped pipeline walks the same path', () => {
  test('every endpoint answers on the seed, and the totals reconcile', async () => {
    const { pipeline } = await get('/v1/gcf/pipeline');
    expect(pipeline.sample).toBe(true);

    const { emissions } = await get('/v1/gcf/emissions');
    const perProject = SEED.projects
      .filter(p => p.stream === 'mitigation')
      .reduce((a, p) => a + p.mitigation.annual_tCO2e.value, 0);
    expect(emissions.headline.annual_tCO2e).toBe(perProject);

    const { recommendation } = await get('/v1/gcf/recommendation');
    expect(recommendation.selected).toHaveLength(2);

    const { instruments } = await get('/v1/gcf/instruments');
    expect(instruments.mandateGap.barriers[0].id).toBe('no_revenue_stream');

    const { report } = await get('/v1/gcf/report');
    expect(report.basis.sample).toBe(true);

    for (const p of SEED.projects) {
      const { package: pkg } = await get(`/v1/gcf/cn/${p.id}`);
      expect(pkg.meta.sample).toBe(true);
      expect(pkg.readiness.external).toBeGreaterThan(10);
    }
  });

  test('a sample pipeline is marked as such on every surface that carries a figure', async () => {
    /* A document citing a standard must not let a reader assume the figures
       are theirs. */
    for (const path of ['/v1/gcf/pipeline', '/v1/gcf/emissions', '/v1/gcf/ndc',
      '/v1/gcf/screening', '/v1/gcf/ranking', '/v1/gcf/recommendation',
      '/v1/gcf/instruments']) {
      const body = await get(path);
      const sample = body.sample ?? body.pipeline?.sample;
      expect(sample).toBe(true);
    }
    expect((await get('/v1/gcf/report')).report.basis.sample).toBe(true);
  });
});

describe('/health answers the question a browser actually asks', () => {
  test('it names the requested backend, not only the active one', async () => {
    /* "STORAGE_BACKEND never reached this runtime" and "Blobs is unreachable"
       look identical from a browser without this, and the first is far more
       common. It cost this project a round trip once already. */
    const res = await api().get('/health').expect(200);
    expect(res.body.storage.requested).toBe('memory');
    expect(res.body.storage.mode).toBe('memory');
    expect(typeof res.body.storage.chosen).toBe('boolean');
    expect(res.body.storage.reason.length).toBeGreaterThan(20);
  });

  test('no credential can reach the wire through the storage block', async () => {
    const res = await api().get('/health').expect(200);
    const flat = JSON.stringify(res.body.storage);
    expect(flat).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(flat).not.toMatch(/ck_(test|live)_[A-Za-z0-9]{8}/);
    expect(flat).not.toMatch(/sk-ant-/);
    /* `requested` is one of four literals and nothing else is interpolated. */
    expect(['auto', 'blobs', 'firebase', 'memory']).toContain(res.body.storage.requested);
  });
});
