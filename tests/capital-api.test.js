/**
 * The capital book over HTTP.
 *
 * The engine is tested against fixtures; this suite tests the round trip,
 * because the round trip is where the first real defect lived. A pipeline
 * project with no agreed return was stored through a numeric coercion where
 * `Number(null)` is 0, so "not yet priced" became "prices at zero percent" and
 * the project was ranked on it rather than held out as unscoreable. The engine
 * was right and the API was wrong, and only driving the API showed it.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app   = require('../server');
const store = require('../services/partc-store');

const KEY = process.env.UI_API_KEY;
const api = () => request(app);
const auth = (r) => r.set('x-api-key', KEY);

beforeEach(() => store._resetMemory());

async function seed() {
  await auth(api().post('/v1/capital/demo')).expect(201);
}

describe('An empty book falls back to the baseline in the repository', () => {
  /* Correct and blank is still blank — and where storage is not writable the
     seed endpoint is refused, so there would be no way to put figures on the
     screen at all. The baseline is versioned in the repository, computed
     through the same engine, stored nowhere, and marked. */
  test('the figures are the baseline, and they are marked as such', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.sample).toBe(true);
    expect(d.empty).toBe(false);
    expect(d.capital.allocated).toBe(750_000_000);
    expect(d.capital.paid).toBe(322_000_000);
    expect(d.source).toBe('baseline');
    expect(d.sampleNote).toMatch(/Illustrative dataset/);
    expect(d.sampleNote).not.toMatch(/never mixed/);
  });

  test('it still carries the sentence about an unrecorded book', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.emptyNote).toMatch(/unentered book, not a nil position/);
  });

  test('showing it stores nothing — the book is still empty afterwards', async () => {
    await auth(api().get('/v1/capital/dashboard')).expect(200);
    const { portfolios } = (await auth(api().get('/v1/capital/portfolios')).expect(200)).body;
    expect(portfolios).toHaveLength(0);
  });

  test('one real portfolio replaces it entirely, rather than sitting beside it', async () => {
    await auth(api().post('/v1/capital/portfolios'))
      .send({ name: 'Mine', allocatedBudget: 42 }).expect(201);
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.sample).toBe(false);
    expect(d.source).toBe('recorded');
    expect(d.capital.allocated).toBe(42);
    expect(d.portfolios.map(p => p.name)).toEqual(['Mine']);
    // Not 42 plus the baseline's 750M — one book or the other, never both.
    expect(d.investments).toBeUndefined();
  });

  test('the weighting still works on the example', async () => {
    const carbon = (await auth(api().get('/v1/capital/dashboard?carbonWeight=1')).expect(200)).body.dashboard;
    const money  = (await auth(api().get('/v1/capital/dashboard?carbonWeight=0')).expect(200)).body.dashboard;
    expect(carbon.pipeline.ranked[0].id).toBe('inv_jaffna_minigrid');
    expect(money.pipeline.ranked[0].id).toBe('inv_kowloon_refit');
  });
});

describe('The seeded book', () => {
  beforeEach(seed);

  test('reports the capital position it was seeded with', async () => {
    const { capital } = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(capital.allocated).toBe(750_000_000);
    expect(capital.committed).toBe(521_000_000);
    expect(capital.paid).toBe(322_000_000);
    expect(capital.balance).toBe(428_000_000);
    expect(capital.undrawnCommitment).toBe(199_000_000);
  });

  test('keeps the four emission lines apart across the wire', async () => {
    // Attributed on the outstanding amount by default, per PCAF Part A.
    const { emissions } = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(emissions.attributionBasis).toBe('outstanding');
    expect(emissions.incurred).toBe(6_749.24);
    expect(emissions.forward).toBe(2_324.41);
    expect(emissions.reduction).toBe(862.59);
    expect(emissions.avoided).toBe(31_305.88);
  });

  test('the commitment basis returns the figures the book was reporting before', async () => {
    // Proof the attribution change moved emissions between lines rather than
    // making them disappear.
    const { emissions } = (await auth(api()
      .get('/v1/capital/dashboard?attributionBasis=commitment')).expect(200)).body.dashboard;
    expect(emissions.incurred).toBe(12_050);
    expect(emissions.forward).toBe(4_230);
    expect(emissions.reduction).toBe(1_030);
    expect(emissions.avoided).toBe(36_000);
  });

  test('what the drawdown has not reached is on the pending line, not lost', async () => {
    const { emissions } = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(Math.round((emissions.incurred + emissions.pending.incurred) * 100) / 100).toBe(12_050);
    expect(Math.round((emissions.forward + emissions.pending.forward) * 100) / 100).toBe(4_230);
  });

  test('an unrecognised attribution basis is refused, not silently defaulted', async () => {
    const res = await auth(api().get('/v1/capital/dashboard?attributionBasis=vibes')).expect(400);
    expect(res.body.error).toBe('BAD_BASIS');
  });

  test('an unpriced project survives storage as unpriced, not as zero percent', async () => {
    const list = (await auth(api().get('/v1/capital/investments?status=pipeline')).expect(200)).body.investments;
    const trinco = list.find(i => i.id === 'inv_trincomalee_biomass');
    expect(trinco.expectedReturnPct).toBeNull();

    const { pipeline } = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(pipeline.ranked.map(r => r.id)).not.toContain('inv_trincomalee_biomass');
    const held = pipeline.unrankable.find(r => r.id === 'inv_trincomalee_biomass');
    expect(held).toBeDefined();
    expect(held.missing).toContain('expected return');
  });

  test('seeding twice refreshes the book rather than doubling it', async () => {
    await seed();
    const { capital } = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(capital.allocated).toBe(750_000_000);
    expect(capital.committed).toBe(521_000_000);
  });

  test('the weighting is honoured and echoed back', async () => {
    const carbon = (await auth(api().get('/v1/capital/dashboard?carbonWeight=1')).expect(200)).body.dashboard;
    const money  = (await auth(api().get('/v1/capital/dashboard?carbonWeight=0')).expect(200)).body.dashboard;

    expect(carbon.pipeline.carbonWeight).toBe(1);
    expect(money.pipeline.carbonWeight).toBe(0);
    expect(carbon.pipeline.ranked[0].id).toBe('inv_jaffna_minigrid');
    expect(money.pipeline.ranked[0].id).toBe('inv_kowloon_refit');
    expect(carbon.pipeline.weightingNote).toMatch(/100% carbon impact and 0% expected return/);
  });

  test('a weighting that is not a number is refused, not silently defaulted', async () => {
    const res = await auth(api().get('/v1/capital/dashboard?carbonWeight=soon')).expect(400);
    expect(res.body.error).toBe('BAD_WEIGHT');
    expect(res.body.message).toMatch(/between 0 and 1/);
  });

  test('the dashboard can be narrowed to one portfolio', async () => {
    const res = await auth(api().get('/v1/capital/dashboard?portfolioId=pf_renewables_sa')).expect(200);
    const d = res.body.dashboard;
    expect(d.portfolios).toHaveLength(1);
    expect(d.capital.allocated).toBe(250_000_000);
    expect(d.capital.paid).toBe(82_000_000);
  });
});

describe('Recording a book', () => {
  test('a portfolio, an investment and a payment move the derived figures', async () => {
    const pf = (await auth(api().post('/v1/capital/portfolios'))
      .send({ name: 'Test Fund', currency: 'USD', allocatedBudget: 1_000_000 }).expect(201)).body.portfolio;

    const inv = (await auth(api().post('/v1/capital/investments'))
      .send({ portfolioId: pf.id, name: 'Test Asset', status: 'deployed', commitment: 400_000 })
      .expect(201)).body.investment;

    let d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.capital.committed).toBe(400_000);
    expect(d.capital.paid).toBe(0);
    expect(d.capital.balance).toBe(1_000_000);      // committed is not paid

    await auth(api().post('/v1/capital/payments'))
      .send({ investmentId: inv.id, kind: 'disbursement', amount: 250_000 }).expect(201);

    d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.capital.paid).toBe(250_000);
    expect(d.capital.balance).toBe(750_000);
    expect(d.capital.undrawnCommitment).toBe(150_000);
  });

  test('balance follows a correction, because it is derived rather than stored', async () => {
    const pf = (await auth(api().post('/v1/capital/portfolios'))
      .send({ name: 'F', allocatedBudget: 100 }).expect(201)).body.portfolio;
    const inv = (await auth(api().post('/v1/capital/investments'))
      .send({ portfolioId: pf.id, name: 'A', status: 'deployed', commitment: 100 }).expect(201)).body.investment;
    const pay = (await auth(api().post('/v1/capital/payments'))
      .send({ investmentId: inv.id, amount: 60 }).expect(201)).body.payment;

    expect((await auth(api().get('/v1/capital/dashboard'))).body.dashboard.capital.balance).toBe(40);

    await auth(api().delete(`/v1/capital/payments/${pay.id}`)).expect(204);
    expect((await auth(api().get('/v1/capital/dashboard'))).body.dashboard.capital.balance).toBe(100);
  });

  test('a payment against nothing is refused with the reason', async () => {
    const res = await auth(api().post('/v1/capital/payments'))
      .send({ investmentId: 'inv_does_not_exist', amount: 10 }).expect(404);
    expect(res.body.message).toMatch(/A payment has to be against something/);
  });

  test('an unknown status is refused rather than stored', async () => {
    const pf = (await auth(api().post('/v1/capital/portfolios'))
      .send({ name: 'F', allocatedBudget: 1 }).expect(201)).body.portfolio;
    const inv = (await auth(api().post('/v1/capital/investments'))
      .send({ portfolioId: pf.id, name: 'A' }).expect(201)).body.investment;
    await auth(api().patch(`/v1/capital/investments/${inv.id}`)).send({ status: 'maybe' }).expect(400);
  });

  test('an investment stored with an explicit null return keeps it null', async () => {
    const pf = (await auth(api().post('/v1/capital/portfolios'))
      .send({ name: 'F', allocatedBudget: 1 }).expect(201)).body.portfolio;
    const inv = (await auth(api().post('/v1/capital/investments'))
      .send({ portfolioId: pf.id, name: 'Unpriced', expectedReturnPct: null, tenorYears: null })
      .expect(201)).body.investment;
    expect(inv.expectedReturnPct).toBeNull();
    expect(inv.tenorYears).toBeNull();
  });
});

describe('Storage honesty', () => {
  test('the endpoint reports what this deployment can persist', async () => {
    const res = await auth(api().get('/v1/capital/storage')).expect(200);
    expect(res.body.storage).toHaveProperty('mode');
    expect(res.body.storage).toHaveProperty('durable');
    expect(res.body.storage).toHaveProperty('reason');
  });

  test('the dashboard carries it too, so a screen can warn without a second call', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(d.storage).toHaveProperty('mode');
  });
});

describe('Authentication', () => {
  test('the book is not readable without a key', async () => {
    await api().get('/v1/capital/dashboard').expect(401);
    await api().get('/v1/capital/portfolios').expect(401);
  });
});

/* ── The basket over HTTP ──────────────────────────────────────────────────
   A basket is a question about a book, not a change to one, so it travels on
   the query string: idempotent, shareable as a link, and written down nowhere.
   These tests hold that line — and hold the endpoint to the same book the
   dashboard is showing, because funding figures set against a different book
   than the position they are compared with would be worse than no figures. */

describe('GET /v1/capital/basket', () => {
  test('an empty selection is answered, not refused', async () => {
    const b = (await auth(api().get('/v1/capital/basket')).expect(200)).body.basket;
    expect(b.count).toBe(0);
    expect(b.funding.needed).toBe(0);
    expect(b.scenarioNote).toMatch(/scenario/i);
  });

  test('it runs on the baseline while nothing has been recorded, and says so', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const id = d.pipeline.ranked[0].id;
    const b = (await auth(api().get(`/v1/capital/basket?select=${id}`)).expect(200)).body.basket;
    expect(b.source).toBe('baseline');
    expect(b.sample).toBe(true);
    /* The same book as the dashboard, so the funding figures reconcile. */
    expect(b.funding.available).toBe(d.capital.uncommitted);
  });

  test('the selected projects come back with what they would cost and add', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const [a, c] = d.pipeline.ranked;
    const b = (await auth(api().get(`/v1/capital/basket?select=${a.id},${c.id}`)).expect(200)).body.basket;
    expect(b.count).toBe(2);
    expect(b.funding.needed).toBe(a.commitment + c.commitment);
    expect(b.impact.avoided_tCO2e).toBeCloseTo(a.avoided_tCO2e + c.avoided_tCO2e, 1);
  });

  test('the two curves differ by exactly what the panel says was added', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const ids = d.pipeline.ranked.slice(0, 3).map(r => r.id).join(',');
    const b = (await auth(api().get(`/v1/capital/basket?select=${ids}`)).expect(200)).body.basket;
    const before = b.forecast.asItStands.totals;
    const after  = b.forecast.withBasket.totals;
    expect(after.forward_tCO2e - before.forward_tCO2e).toBeCloseTo(b.impact.forward_tCO2e, 1);
    expect(after.avoided_tCO2e - before.avoided_tCO2e).toBeCloseTo(b.impact.avoided_tCO2e, 1);
  });

  test('an unrecognised attribution basis is refused rather than defaulted', async () => {
    const r = await auth(api().get('/v1/capital/basket?attributionBasis=vibes')).expect(400);
    expect(r.body.error).toBe('BAD_BASIS');
  });

  test('a selection beyond any real pipeline is refused rather than run', async () => {
    const many = Array.from({ length: 26 }, (_, i) => `inv_${i}`).join(',');
    const r = await auth(api().get(`/v1/capital/basket?select=${many}`)).expect(400);
    expect(r.body.error).toBe('TOO_MANY_SELECTED');
  });

  test('an id that names nothing is reported rather than silently dropped', async () => {
    const b = (await auth(api().get('/v1/capital/basket?select=inv_nope')).expect(200)).body.basket;
    expect(b.unknownIds).toEqual(['inv_nope']);
    expect(b.count).toBe(0);
  });

  test('asking twice changes nothing — a basket is never written down', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const id = d.pipeline.ranked[0].id;
    await auth(api().get(`/v1/capital/basket?select=${id}`)).expect(200);
    await auth(api().get(`/v1/capital/basket?select=${id}`)).expect(200);
    const after = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    expect(after.capital).toEqual(d.capital);
    expect(after.pipeline.count).toBe(d.pipeline.count);
  });

  test('a basket the book cannot afford is answered with a shortfall, not a 4xx', async () => {
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const ids = [...d.pipeline.ranked, ...d.pipeline.unrankable].map(r => r.id).join(',');
    const b = (await auth(api().get(`/v1/capital/basket?select=${ids}`)).expect(200)).body.basket;
    expect(b.funding.affordable).toBe(false);
    expect(b.funding.shortfall).toBeGreaterThan(0);
  });

  test('it needs a key, like everything else that reads the book', async () => {
    await api().get('/v1/capital/basket').expect(401);
  });

  test('once a real book is recorded the basket reads that one', async () => {
    await seed();
    const d = (await auth(api().get('/v1/capital/dashboard')).expect(200)).body.dashboard;
    const b = (await auth(api().get('/v1/capital/basket')).expect(200)).body.basket;
    expect(b.source).toBe('recorded');
    expect(b.sample).toBe(false);
    expect(b.funding.available).toBe(d.capital.uncommitted);
  });
});
