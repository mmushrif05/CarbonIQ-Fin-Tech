/**
 * The Fund Desk over HTTP.
 *
 * The engine is tested against fixtures; this suite drives the round trip,
 * because the round trip is where the defects in this codebase have actually
 * lived — a value coerced on the way in, a link that could be re-pointed, a
 * provenance field a caller could assert for itself.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app   = require('../server');
const store = require('../services/partc-store');

const KEY = process.env.UI_API_KEY;
const api = () => request(app);
const auth = (r) => r.set('x-api-key', KEY);

const SEED = require('../data/gcf/pipeline.seed.json');
const P1 = SEED.projects[0];              // GCF-P1 Jaffna solar, DFCC share $18m

beforeEach(() => store._resetMemory());

async function portfolio() {
  const res = await auth(api().post('/v1/capital/portfolios'))
    .send({ id: 'pf_gcf', name: 'GCF co-financing', allocatedBudget: 100_000_000 })
    .expect(201);
  return res.body.portfolio || res.body;
}

describe('GET /v1/desk/position', () => {
  test('answers over both books and says which is showing on each side', async () => {
    const p = (await auth(api().get('/v1/desk/position')).expect(200)).body.position;
    expect(p.source).toBe('baseline');
    expect(p.sample).toBe(true);
    expect(p.pipeline.source).toBe('seed');
    expect(p.pipeline.sample).toBe(true);
    expect(p.sampleNote).toMatch(/Illustrative dataset/);
  });

  test('the six figures a committee opens with are all present', async () => {
    const p = (await auth(api().get('/v1/desk/position')).expect(200)).body.position;
    expect(p.money.allocated).toBe(750_000_000);
    expect(p.money.committed).toBe(521_000_000);
    expect(p.money.paid).toBe(322_000_000);
    expect(p.delivery.completed).toBe(3);
    expect(p.emissions.atFullCommitment.total).toBeGreaterThan(0);
    expect(p.emissions.carried.total).toBeGreaterThan(0);
    expect(p.pipeline.waiting).toBe(5);
  });

  test('the basis is a question, and it travels back with the answer', async () => {
    const out = (await auth(api().get('/v1/desk/position?attributionBasis=commitment')).expect(200))
      .body.position;
    expect(out.attributionBasis).toBe('commitment');
    expect(out.emissions.pending.total).toBe(0);
    expect(out.emissions.carried.total).toBe(out.emissions.atFullCommitment.total);
  });

  test('an unknown basis is refused by name rather than silently defaulted', async () => {
    const res = await auth(api().get('/v1/desk/position?attributionBasis=guess')).expect(400);
    expect(res.body.error).toBe('BAD_BASIS');
    expect(res.body.message).toMatch(/outstanding/);
  });

  test('it needs a key like every other endpoint', async () => {
    await api().get('/v1/desk/position').expect(401);
  });
});

describe('POST /v1/desk/adopt — the join', () => {
  test('a candidate becomes a pipeline investment carrying its link and its pledge', async () => {
    await portfolio();
    const res = await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' })
      .expect(201);

    const inv = res.body.investment;
    expect(inv.status).toBe('pipeline');
    expect(inv.delivery).toBe('not_started');
    /* DFCC's own share is the bank's commitment. The GCF ask is somebody
       else's money and is not on this book. */
    expect(inv.commitment).toBe(P1.financing.dfcc);
    expect(inv.projectCost).toBe(P1.financing.totalCost);
    expect(inv.origin.system).toBe('gcf');
    expect(inv.origin.recordId).toBe(P1.id);
    expect(inv.origin.code).toBe(P1.code);
    expect(inv.pledgedMitigation.annual_tCO2e).toBe(P1.mitigation.annual_tCO2e.value);
    expect(inv.pledgedMitigation.tier).toBe(P1.mitigation.annual_tCO2e.tier);
    expect(inv.pledgedMitigation.baselineType).toBe(P1.mitigation.baseline.type);
  });

  test('the gate answer is frozen with it, and carried rather than enforced', async () => {
    await portfolio();
    const res = await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' })
      .expect(201);
    expect(['eligible', 'flagged', 'excluded']).toContain(res.body.investment.origin.screening.verdict);
    expect(res.body.investment.origin.screening.note).toMatch(/not a live check/);
    expect(res.body.note).toMatch(/carried, not enforced/);
  });

  test('no emission line is copied across — that would merge two boundaries', async () => {
    await portfolio();
    const res = await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' })
      .expect(201);
    const e = res.body.investment.emissions;
    expect(e.incurred_tCO2e).toBe(0);
    expect(e.forward_tCO2e).toBe(0);
    expect(e.avoided_tCO2e).toBe(0);
    /* The project-level pledge is the only mitigation figure that came over,
       and it is on its own key. */
    expect(res.body.investment.pledgedMitigation.note).toMatch(/never netted/);
  });

  test('the same record cannot be adopted twice', async () => {
    await portfolio();
    await auth(api().post('/v1/desk/adopt')).send({ recordId: P1.id, portfolioId: 'pf_gcf' }).expect(201);
    const res = await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' })
      .expect(409);
    expect(res.body.error).toBe('ALREADY_ADOPTED');
    expect(res.body.remedy).toMatch(/rather than adopting the record a second time/);
  });

  test('an unknown record and an unknown portfolio are each named', async () => {
    await portfolio();
    expect((await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: 'nope', portfolioId: 'pf_gcf' }).expect(404)).body.error)
      .toBe('RECORD_NOT_FOUND');
    expect((await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_missing' }).expect(404)).body.error)
      .toBe('PORTFOLIO_NOT_FOUND');
  });

  test('a portfolio is required — an allocation belongs to a portfolio, not to the book', async () => {
    const res = await auth(api().post('/v1/desk/adopt')).send({ recordId: P1.id }).expect(400);
    expect(res.body.error).toBe('PORTFOLIO_REQUIRED');
  });

  test('an explicit commitment wins, because a term sheet decides it', async () => {
    await portfolio();
    const res = await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf', commitment: 25_000_000 })
      .expect(201);
    expect(res.body.investment.commitment).toBe(25_000_000);
  });

  test('an adopted project appears on the desk and leaves the waiting list', async () => {
    await portfolio();
    await auth(api().post('/v1/desk/adopt')).send({ recordId: P1.id, portfolioId: 'pf_gcf' }).expect(201);

    const p = (await auth(api().get('/v1/desk/position')).expect(200)).body.position;
    /* The org has recorded something of its own now, so the baseline is gone
       entirely rather than blended with it. */
    expect(p.source).toBe('recorded');
    expect(p.sample).toBe(false);
    expect(p.pipeline.waiting).toBe(4);
    expect(p.pipeline.adopted).toBe(1);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].origin.code).toBe(P1.code);
    expect(p.lifecycle.pipeline).toBe(1);
  });
});

describe('Provenance is written once and never again', () => {
  test('a caller cannot assert an origin through the ordinary investment endpoint', async () => {
    await portfolio();
    const res = await auth(api().post('/v1/capital/investments'))
      .send({
        portfolioId: 'pf_gcf', name: 'Hand-keyed', commitment: 1_000_000,
        origin: { system: 'gcf', recordId: P1.id },
        pledgedMitigation: { annual_tCO2e: 999_999 },
      })
      .expect(201);
    /* The validator strips what it does not know, so the write succeeds and
       the asserted provenance simply does not survive it. What must never
       happen is an investment claiming it came from a GCF record that nobody
       adopted. */
    expect(res.body.investment.origin).toBeNull();
    expect(res.body.investment.pledgedMitigation).toBeNull();
  });

  test('an update cannot re-point the link or edit the pledge', async () => {
    await portfolio();
    const created = (await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' }).expect(201)).body.investment;

    const patched = await auth(api().patch(`/v1/capital/investments/${created.id}`))
      .send({ origin: { system: 'gcf', recordId: 'something_else' }, notes: 'edited' })
      .expect(200);

    /* The edit lands — `notes` is editable — and the link is untouched by it.
       A provenance pointer that can be re-aimed afterwards is not provenance. */
    const inv = patched.body.investment;
    expect(inv.notes).toBe('edited');
    expect(inv.origin.recordId).toBe(P1.id);
    expect(inv.pledgedMitigation.annual_tCO2e).toBe(P1.mitigation.annual_tCO2e.value);
  });

  test('delivery, unlike origin, does move — a project gets built', async () => {
    await portfolio();
    const created = (await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' }).expect(201)).body.investment;

    const res = await auth(api().patch(`/v1/capital/investments/${created.id}`))
      .send({ delivery: 'under_construction' });
    expect(res.status).toBe(200);
    expect((res.body.investment || res.body).delivery).toBe('under_construction');
  });

  test('an unknown delivery state is refused by name', async () => {
    await portfolio();
    const created = (await auth(api().post('/v1/desk/adopt'))
      .send({ recordId: P1.id, portfolioId: 'pf_gcf' }).expect(201)).body.investment;
    const res = await auth(api().patch(`/v1/capital/investments/${created.id}`))
      .send({ delivery: 'operating' });
    expect(res.status).toBe(400);
  });
});
