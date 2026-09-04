/**
 * The Fund Desk — candidates, the scenario and year-end readiness.
 *
 * Same rule as the position: none of these three computes a figure. The gate
 * is `gcf/screening`, the ranking is `gcf/screening`, the structure is
 * `gcf/instruments`, the scenario is `capital-basket` and the disclosure is
 * `gcf/reporting`. This suite asserts the desk restates them and guards the
 * three things that would be easiest to merge by accident: two rankings that
 * must never become one, a gate that must never become a score, and a
 * scenario that must never look like a record.
 */

'use strict';

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app   = require('../server');
const store = require('../services/partc-store');

const desk = require('../services/desk');
const screening = require('../services/gcf/screening');
const { basket } = require('../services/capital-basket');
const baseline = require('../services/capital-baseline');

const SEED = require('../data/gcf/pipeline.seed.json');
const POOL = SEED.projects;
const ACC = SEED._meta.accreditation;

const KEY = process.env.UI_API_KEY;
const api = () => request(app);
const auth = (r) => r.set('x-api-key', KEY);

beforeEach(() => store._resetMemory());

// ── Stage 4 — the candidates ────────────────────────────────────────────────

describe('The candidates restate the gate and the ranking', () => {
  test('every verdict equals what gcf/screening decided', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    const gate = screening.screen(POOL, { accreditation: ACC });
    for (const row of c.rows) {
      const source = gate.rows.find(r => r.id === row.id);
      expect(row.gate.verdict).toBe(source.status);
    }
  });

  test('every rank equals the position gcf/screening gave it within its stream', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    const ranked = screening.rank(POOL, { accreditation: ACC });
    const bySource = new Map([...ranked.mitigation.projects, ...ranked.adaptation.projects]
      .map(r => [r.id, r]));
    for (const row of c.rows) {
      const src = bySource.get(row.id);
      if (!src) { expect(row.rank).toBeNull(); continue; }
      expect(row.rank).toBe(src.rank);
      expect(row.score).toBe(src.score);
    }
  });

  test('an excluded candidate keeps its row and its reason, and is not ranked', () => {
    /* A gate is not a score. Dropping the row leaves a reader unable to tell
       "considered and refused" from "never in the pool". */
    const categoryA = POOL.map((p, i) => (i === 0 ? { ...p, essCategory: 'A' } : p));
    const c = desk.candidates(categoryA, [], { accreditation: ACC });
    const row = c.rows.find(r => r.id === POOL[0].id);
    expect(row).toBeDefined();
    expect(row.gate.verdict).toBe('excluded');
    expect(row.gate.reasons.join(' ')).toMatch(/accreditation/i);
    expect(row.rank).toBeNull();
    expect(c.excluded).toBe(1);
  });

  test('there is no overall rank anywhere to sort the two streams on one key', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    /* Every rank is accompanied by the stream it is a rank within, and two
       different projects legitimately hold rank 1. */
    const ones = c.rows.filter(r => r.rank === 1);
    expect(ones.length).toBe(2);
    expect(new Set(ones.map(r => r.stream)).size).toBe(2);
    expect(JSON.stringify(c)).not.toMatch(/"overallRank"|"combinedRank"/);
  });

  test('adaptation carries a beneficiary metric and mitigation a carbon one', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    const ad = c.rows.find(r => r.stream === 'adaptation' && r.rank);
    const mi = c.rows.find(r => r.stream === 'mitigation' && r.rank);
    expect(ad.impact.metric).toMatch(/beneficiaries/);
    expect(ad.impact.metric).not.toMatch(/tCO2e/);
    expect(mi.impact.metric).toMatch(/tCO2e/);
    expect(c.streams.adaptation.note).toMatch(/beneficiaries reached per dollar/);
  });

  test('coverage is reported with what it leaves standing', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    const withGap = c.rows.filter(r => r.structure && r.structure.barriersLeftStanding.length);
    expect(withGap.length).toBeGreaterThan(0);
    /* The finding this produces on the shipped pipeline: the barrier no
       deliverable structure addresses is a mandate question, not a low score. */
    expect(c.mandateGap).not.toBeNull();
    expect(c.mandateGap.note).toMatch(/extended modality or a/);
  });

  test('the three criteria this cannot score are named, not filled in', () => {
    const c = desk.candidates(POOL, [], { accreditation: ACC });
    expect(c.unscoredCriteria).toHaveLength(3);
    expect(c.criteriaNote).toMatch(/an input to an appraisal/);
  });

  test('an adopted candidate carries its investment, and the rest carry null', () => {
    const c = desk.candidates(POOL, [
      { id: 'inv_a', status: 'pipeline', commitment: 1, origin: { system: 'gcf', recordId: POOL[0].id } },
    ], { accreditation: ACC });
    expect(c.adopted).toBe(1);
    expect(c.rows.find(r => r.id === POOL[0].id).adopted.investmentId).toBe('inv_a');
    expect(c.rows.find(r => r.id === POOL[1].id).adopted).toBeNull();
  });
});

describe('GET /v1/desk/candidates', () => {
  test('answers, and says which book each side came from', async () => {
    const c = (await auth(api().get('/v1/desk/candidates')).expect(200)).body.candidates;
    expect(c.pool).toBe(5);
    expect(c.source).toBe('seed');
    expect(c.sample).toBe(true);
    expect(c.bookSource).toBe('baseline');
    expect(c.accreditation.decision).toBe('B.36/10');
  });

  test('a weight travels back with the answer so a screenshot carries it', async () => {
    const c = (await auth(api().get('/v1/desk/candidates?impactPotential=0.6')).expect(200))
      .body.candidates;
    expect(c.weights.impactPotential).toBe(0.6);
  });

  test('a nonsense weight is refused by name rather than silently defaulted', async () => {
    const res = await auth(api().get('/v1/desk/candidates?impactPotential=-1')).expect(400);
    expect(res.body.error).toBe('BAD_WEIGHT');
  });
});

// ── Stage 5 — the scenario ──────────────────────────────────────────────────

describe('POST /v1/desk/scenario', () => {
  const waiting = () => baseline.baselineBook().investments.filter(i => i.status === 'pipeline');

  test('it equals capital-basket on the same book, figure for figure', async () => {
    const ids = waiting().slice(0, 3).map(i => i.id);
    const res = await auth(api().post('/v1/desk/scenario')).send({ select: ids }).expect(200);
    const s = res.body.scenario;
    const direct = basket(baseline.baselineBook(), ids, { attributionBasis: 'outstanding' });

    expect(s.funding.needed).toBe(direct.funding.needed);
    expect(s.funding.available).toBe(direct.funding.available);
    expect(s.funding.shortfall).toBe(direct.funding.shortfall);
    expect(s.impact.forward_tCO2e).toBe(direct.impact.forward_tCO2e);
    expect(s.impact.avoided_tCO2e).toBe(direct.impact.avoided_tCO2e);
    expect(s.finance.blendedReturnPct).toBe(direct.finance.blendedReturnPct);
  });

  test('affordability is asked of the selection, not of each project', async () => {
    /* Five individually affordable candidates need not be affordable together.
       A selection that does not fit reports a shortfall, never a negative
       remainder. */
    const all = waiting().map(i => i.id);
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: all }).expect(200))
      .body.scenario;
    expect(s.funding.remaining).toBeGreaterThanOrEqual(0);
    if (!s.funding.affordable) {
      expect(s.funding.shortfall).toBeGreaterThan(0);
      expect(s.funding.note).toMatch(/shortfall is the additional allocation/);
    }
  });

  test('the impact is three figures and there is no net anywhere', async () => {
    const ids = waiting().slice(0, 2).map(i => i.id);
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: ids }).expect(200))
      .body.scenario;
    expect(s.impact).toHaveProperty('forward_tCO2e');
    expect(s.impact).toHaveProperty('reduction_tCO2e');
    expect(s.impact).toHaveProperty('avoided_tCO2e');
    /* No KEY holds a netted figure. The prose legitimately contains the word
       "netted" — it is the sentence saying they never are — so the sweep is
       over the key names, which is where a net total would actually appear. */
    expect(Object.keys(s.impact).filter(k => /net/i.test(k))).toEqual([]);
    expect(s.impact.basis).toMatch(/not netted against one another/);
  });

  test('both sides run on the commitment basis whatever the desk displays', async () => {
    /* Attribution on outstanding scales a project by what has been drawn, and a
       facility written this morning has drawn nothing — so on that basis the
       scenario would answer "nothing changed" to a question it had not asked. */
    const ids = waiting().slice(0, 2).map(i => i.id);
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: ids }).expect(200))
      .body.scenario;
    expect(s.forecast.basis).toBe('commitment');
    expect(s.forecast.basisNote).toMatch(/attributable to/);
  });

  test('an id matching nothing is named rather than dropped', async () => {
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: ['nope'] }).expect(200))
      .body.scenario;
    expect(s.unknownIds).toEqual(['nope']);
    expect(s.unknownNote).toMatch(/matched no project/);
  });

  test('it is a read: nothing is stored, no id is issued, it is idempotent', async () => {
    const ids = waiting().slice(0, 2).map(i => i.id);
    const a = (await auth(api().post('/v1/desk/scenario')).send({ select: ids }).expect(200)).body.scenario;
    const b = (await auth(api().post('/v1/desk/scenario')).send({ select: ids }).expect(200)).body.scenario;
    expect(b.funding).toEqual(a.funding);
    expect(b.impact).toEqual(a.impact);
    expect(a.storedNote).toMatch(/Nothing here was written down/);
    expect(a.scenarioNote).toMatch(/Nothing selected has been committed/i);

    /* And the position is unchanged by having asked. */
    const p = (await auth(api().get('/v1/desk/position')).expect(200)).body.position;
    expect(p.lifecycle.pipeline).toBe(5);
  });

  test('an empty selection is an answer, not an error', async () => {
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: [] }).expect(200))
      .body.scenario;
    expect(s.count).toBe(0);
    expect(s.funding.needed).toBe(0);
  });
});

// ── Stage 6 — year-end readiness ────────────────────────────────────────────

describe('GET /v1/desk/readiness', () => {
  test('the disclosure is answered from the report, so it can fail', async () => {
    const r = (await auth(api().get('/v1/desk/readiness?year=2026')).expect(200)).body.readiness;
    expect(r.reportingYear).toBe(2026);
    expect(r.disclosure.complete).toBe(false);
    expect(r.disclosure.checklistMet).toBeLessThan(r.disclosure.checklistTotal);
    expect(r.disclosure.gaps).toBeGreaterThan(0);
    expect(r.disclosure.top.length).toBeGreaterThan(0);
  });

  test('entity facts are absent until recorded, and nothing is filled in', async () => {
    const r = (await auth(api().get('/v1/desk/readiness')).expect(200)).body.readiness;
    expect(r.entity.recorded).toBe(0);
    expect(r.entity.total).toBe(5);
    expect(r.entity.facts.every(f => f.held === false)).toBe(true);
    expect(r.entity.note).toMatch(/Reported as unavailable until recorded/);
  });

  test('recording an entity fact moves the count and nothing else', async () => {
    await auth(api().put('/v1/gcf/entity'))
      .send({ entityName: 'DFCC Bank PLC', climateGovernance: 'The board reviews climate matters.' })
      .expect(200);
    const r = (await auth(api().get('/v1/desk/readiness')).expect(200)).body.readiness;
    expect(r.entity.recorded).toBe(1);
    /* The inventory item stays unmet even with entity facts recorded: this
       report is one input to an SLFRS S2 disclosure, not the disclosure. */
    expect(r.disclosure.complete).toBe(false);
  });

  test('readiness measures what is held, and says so rather than implying nearness', async () => {
    const r = (await auth(api().get('/v1/desk/readiness')).expect(200)).body.readiness;
    expect(r.conceptNotes.projects).toHaveLength(5);
    expect(r.conceptNotes.readyCount).toBe(0);
    expect(r.conceptNotes.outstanding).toBeGreaterThan(0);
    expect(r.conceptNotes.note).toMatch(/obtained from the/);
    for (const p of r.conceptNotes.projects) {
      expect(p.held + p.partial + p.external).toBe(p.total);
      expect(p.complete).toBe(false);
    }
  });

  test('a nonsense year is refused by name', async () => {
    const res = await auth(api().get('/v1/desk/readiness?year=soon')).expect(400);
    expect(res.body.error).toBe('INVALID_YEAR');
  });
});

describe('One book, shared by all three views', () => {
  test('the position, the candidates and the scenario read the same book', async () => {
    const p = (await auth(api().get('/v1/desk/position')).expect(200)).body.position;
    const c = (await auth(api().get('/v1/desk/candidates')).expect(200)).body.candidates;
    const s = (await auth(api().post('/v1/desk/scenario')).send({ select: [] }).expect(200)).body.scenario;

    expect(p.source).toBe('baseline');
    expect(c.bookSource).toBe('baseline');
    expect(s.source).toBe('baseline');
    /* And the scenario's "available" is the position's uncommitted, because
       both come from the same capitalPosition over the same book. */
    expect(s.funding.available).toBe(p.money.uncommitted);
  });
});
