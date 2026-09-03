/**
 * Screening, ranking, the answer, and the instruments — Lot 2.
 *
 * Four rules, each of which is a way to produce a confident recommendation
 * that is wrong:
 *
 *   A gate is not a score. A category A project is excluded because DFCC
 *   cannot carry it, not ranked lower.
 *
 *   Two lists, never one. Adaptation is never ranked on carbon, because any
 *   single sort key across both streams defunds one of them.
 *
 *   A ranking that cannot say what it did not weigh is a ranking nobody can
 *   defend. Three of GCF's six criteria are unscorable here and are named.
 *
 *   An appraisal that can only say yes is a sales tool. The engine can return
 *   "does not need GCF support".
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const screening = require('../services/gcf/screening');
const instruments = require('../services/gcf/instruments');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const P = SEED.projects;
const ACC = SEED._meta.accreditation;
const clone = p => JSON.parse(JSON.stringify(p));
const byCode = c => P.find(p => p.code === c);

beforeEach(() => partcStore._resetMemory());

describe('The accreditation gate excludes, it does not down-rank', () => {
  test('a category A project is excluded, with the reason', () => {
    const p = clone(P[0]);
    p.essCategory = 'A';
    const row = screening.screenOne(p, { accreditation: ACC });
    expect(row.eligible).toBe(false);
    expect(row.status).toBe('excluded');
    expect(row.exclusions[0].rule).toBe('ess_category');
    expect(row.exclusions[0].detail).toMatch(/Excluded, not down-ranked/);
  });

  test('an excluded project never reaches either ranked list', () => {
    const pool = [clone(P[0]), clone(P[2])];
    pool[0].essCategory = 'A';
    const r = screening.rank(pool, { accreditation: ACC });
    const codes = [...r.mitigation.projects, ...r.adaptation.projects].map(x => x.code);
    expect(codes).not.toContain(pool[0].code);
    expect(codes).toContain('GCF-P3');
  });

  test('a project over the accredited ceiling is excluded', () => {
    const p = clone(P[0]);
    p.financing.totalCost = 300000000;
    const row = screening.screenOne(p, { accreditation: ACC });
    expect(row.eligible).toBe(false);
    expect(row.exclusions[0].rule).toBe('size_ceiling');
  });

  test('a project below the band is NOT flagged — size categories are ceilings', () => {
    /* GCF size categories nest: micro up to 10m, small up to 50m, medium up to
       250m. An entity accredited to medium may carry all three. A floor check
       would have flagged four of these five candidates for a non-issue, and a
       flag that fires on nothing is a flag readers learn to skip. */
    const small = P.filter(p => p.financing.totalCost < ACC.sizeRange_usd[0]);
    expect(small.length).toBeGreaterThan(2);
    for (const p of small) {
      const row = screening.screenOne(p, { accreditation: ACC });
      expect(row.flags.map(f => f.rule)).not.toContain('size_floor');
    }
  });

  test('the whole shipped pool is eligible; only the modality gap is flagged', () => {
    const g = screening.screen(P, { accreditation: ACC });
    expect(g.excluded).toEqual([]);
    expect(g.flagged).toEqual(['GCF-P4']);
    const p4 = g.rows.find(r => r.code === 'GCF-P4');
    expect(p4.flags.map(f => f.rule)).toEqual(
      expect.arrayContaining(['modality_gap', 'ess_flag:fpic_required']));
  });

  test('a grant-dependent design is flagged to verify, not struck out', () => {
    const p4 = screening.screenOne(byCode('GCF-P4'), { accreditation: ACC });
    expect(p4.eligible).toBe(true);
    const gap = p4.flags.find(f => f.rule === 'modality_gap');
    expect(gap.detail).toMatch(/verified with DFCC or the NDA/);
    expect(gap.detail).toMatch(/misreading an accreditation scope/);
  });

  test('an FPIC requirement is a safeguards obligation, not an eligibility bar', () => {
    const p4 = screening.screenOne(byCode('GCF-P4'), { accreditation: ACC });
    const f = p4.flags.find(x => x.rule === 'ess_flag:fpic_required');
    expect(f.detail).toMatch(/does not affect eligibility/i);
  });
});

describe('Two ranked lists, and adaptation never touches carbon', () => {
  const r = screening.rank(P, { accreditation: ACC });

  test('the streams are ranked apart and there is no merged list', () => {
    expect(r.mitigation.projects).toHaveLength(3);
    expect(r.adaptation.projects).toHaveLength(2);
    expect(r.mitigation.projects.every(x => x.stream === 'mitigation')).toBe(true);
    expect(r.adaptation.projects.every(x => x.stream === 'adaptation')).toBe(true);
  });

  test("the adaptation impact metric is people, not tonnes", () => {
    const m = screening.metricsFor(byCode('GCF-P4'), 'adaptation');
    expect(m.impactMetric).toMatch(/beneficiaries/);
    expect(m.impactMetric).not.toMatch(/tCO2e/);
    expect(m.impactBasis).toMatch(/never ranked on carbon/);
  });

  test('the same project ranked as mitigation would use a different metric entirely', () => {
    const asAdapt = screening.metricsFor(byCode('GCF-P4'), 'adaptation').impact;
    const asMit = screening.metricsFor(byCode('GCF-P4'), 'mitigation').impact;
    expect(asAdapt).not.toBe(asMit);
    expect(asAdapt).toBeGreaterThan(asMit);
  });

  test('ranks are dense and ordered by score within each stream', () => {
    for (const list of [r.mitigation.projects, r.adaptation.projects]) {
      expect(list.map(x => x.rank)).toEqual(list.map((_, i) => i + 1));
      for (let i = 1; i < list.length; i += 1) {
        expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score);
      }
    }
  });
});

describe('The ranking says what it could not weigh', () => {
  const r = screening.rank(P, { accreditation: ACC });

  test('three of the six GCF criteria are named unscored, each with a reason', () => {
    expect(r.criteria.notScored).toHaveLength(3);
    const ids = r.criteria.notScored.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(
      ['paradigmShift', 'needsOfRecipient', 'sustainableDevelopment']));
    for (const c of r.criteria.notScored) expect(c.reason.length).toBeGreaterThan(40);
  });

  test('it never claims to be a GCF assessment', () => {
    expect(r.criteria.note).toMatch(/not mistaken for\s+a GCF assessment/);
    expect(r.criteria.note).toMatch(/input to a decision, not the decision/);
  });

  test('the weights travel with the result, so a screenshot carries them', () => {
    expect(r.mitigation.weights).toEqual(screening.DEFAULT_WEIGHTS);
  });

  test('a reader-set weighting changes the order, and is echoed back', () => {
    const evidenceLed = screening.rank(P, {
      accreditation: ACC,
      weights: { impactPotential: 0, efficiency: 0, countryOwnership: 0, readiness: 0, evidence: 1 },
    });
    expect(evidenceLed.mitigation.weights.evidence).toBe(1);
    expect(evidenceLed.mitigation.projects.map(x => x.code))
      .not.toEqual(r.mitigation.projects.map(x => x.code));
  });

  test('a negative or all-zero weighting is refused, not silently normalised', () => {
    expect(() => screening.rank(P, { accreditation: ACC, weights: { evidence: -1 } }))
      .toThrow(/zero or more/);
    expect(() => screening.rank(P, {
      accreditation: ACC,
      weights: { impactPotential: 0, efficiency: 0, countryOwnership: 0, readiness: 0, evidence: 0 },
    })).toThrow(/greater than zero/);
  });

  test('a missing component is dropped and the weight renormalised, never scored zero', () => {
    /* Scoring absence as zero ranks a project down for a field nobody filled
       in, which is a fact about data entry rather than about the project. */
    const pool = P.filter(p => p.stream === 'mitigation').map(clone);
    delete pool[0].financing.gcfAsk;
    pool[0].financing.gcfAsk = 0;
    const ranked = screening.rankStream(pool, 'mitigation');
    const row = ranked.projects.find(x => x.code === pool[0].code);
    expect(row.missing).toContain('impact');
    expect(row.score).not.toBeNull();
    expect(row.components.impact).toBeUndefined();
  });
});

describe('The answer: which two, and why', () => {
  const rec = screening.recommend(P, { accreditation: ACC });

  test('it selects two and names the basis for each', () => {
    expect(rec.selected).toHaveLength(2);
    for (const s of rec.selected) {
      expect(s.computedBasis.length).toBeGreaterThan(0);
      expect(s.recordedReason.length).toBeGreaterThan(40);
    }
  });

  test('the runners-up carry what would move them', () => {
    expect(rec.runnersUp).toHaveLength(3);
    for (const r of rec.runnersUp) {
      expect(r.whatWouldMoveIt.length).toBeGreaterThan(0);
      expect(r.gap).toBeGreaterThanOrEqual(0);
    }
  });

  test('where the recorded selection and the ranking disagree, it says so', () => {
    /* They do disagree on this pipeline, and that is the most useful thing the
       model has to say. Absorbing it silently would leave a ranking quietly
       contradicting the record it was built from. */
    expect(rec.divergence.agree).toBe(false);
    expect(rec.divergence.recordedSelection).toEqual(['GCF-P1', 'GCF-P3']);
    expect(rec.divergence.note).toMatch(/argued rather than absorbed/);
  });

  test('stream balance is surfaced, not enforced', () => {
    expect(rec.streamBalance.bothStreams).toBe(true);
    const mitigationOnly = P.filter(p => p.stream === 'mitigation');
    const one = screening.recommend(mitigationOnly, { accreditation: ACC });
    expect(one.streamBalance.bothStreams).toBe(false);
    expect(one.streamBalance.note).toMatch(/choice to defend/);
  });

  test('the limits are on the face of the answer', () => {
    expect(rec.limits).toMatch(/does not score a proposal on GCF's behalf/);
    expect(rec.limits).toMatch(/ESIA|FPIC/);
    expect(rec.limits).toMatch(/no-objection/);
  });
});

describe('Minimum concessionality — the appraisal can say no', () => {
  test('a project viable without GCF is told not to take concessional money', () => {
    const p = clone(byCode('GCF-P1'));
    p.financing.viabilityWithoutGcf = {
      viable: true,
      reason: 'Tariff supports commercial pricing at the tenor available.',
    };
    const c = instruments.concessionality(p);
    expect(c.needsSupport).toBe(false);
    expect(c.recommendation).toBe('no_gcf_support');
    expect(c.finding).toMatch(/displace commercial capital rather than mobilise/);
  });

  test('an unassessed project cannot be put forward', () => {
    const p = clone(byCode('GCF-P1'));
    delete p.financing.viabilityWithoutGcf;
    const c = instruments.concessionality(p);
    expect(c.assessed).toBe(false);
    expect(c.reason).toMatch(/with and without/);
  });

  test('the pipeline view lists who does not need support and who was not asked', () => {
    const pool = P.map(clone);
    pool[0].financing.viabilityWithoutGcf = { viable: true, reason: 'Commercially bankable.' };
    delete pool[1].financing.viabilityWithoutGcf;
    const r = instruments.structurePipeline(pool, { accreditation: ACC });
    expect(r.minimumConcessionality.notNeedingSupport).toEqual(['GCF-P1']);
    expect(r.minimumConcessionality.unassessed).toEqual(['GCF-P2']);
  });
});

describe('An instrument answers a barrier, or it answers nothing', () => {
  const r = instruments.structurePipeline(P, { accreditation: ACC });

  test('seven structures are evaluated, as the ToR asks for five to seven', () => {
    expect(instruments.INSTRUMENTS).toHaveLength(7);
    expect(r.catalogue.instruments).toBe(7);
  });

  test('coverage is reported with what it leaves standing', () => {
    const p4 = r.projects.find(p => p.code === 'GCF-P4');
    expect(p4.recommended.coverage).toBeLessThan(1);
    expect(p4.barriersLeftStanding.map(b => b.id)).toContain('no_revenue_stream');
    expect(p4.barriersLeftStandingNote).toMatch(/what will stop the deal/);
  });

  test('a project with no recorded barriers is unassessable, not perfectly matched', () => {
    const bare = clone(byCode('GCF-P1'));
    bare.barriers = [];
    const s = instruments.structureFor(bare, { accreditation: ACC });
    expect(s.all[0].coverage).toBeNull();
    expect(s.all[0].coverageBasis).toMatch(/matched to nothing/);
    expect(s.recommended).toBeNull();
  });

  test('a structure needing the grant modality is not deliverable by DFCC', () => {
    const rbf = instruments.INSTRUMENTS.find(i => i.id === 'results_based_finance');
    expect(rbf.requiresGrantModality).toBe(true);
    const fit = instruments.fitOne(byCode('GCF-P4'), rbf, { accreditation: ACC });
    expect(fit.deliverableByDfcc).toBe(false);
    expect(fit.deliverabilityNote).toMatch(/Verify with DFCC or the NDA/);
  });

  test('an undeliverable structure sorts last but keeps its reason', () => {
    const p4 = r.projects.find(p => p.code === 'GCF-P4');
    expect(p4.all[p4.all.length - 1].deliverableByDfcc).toBe(false);
    expect(p4.structuralGap.instruments.map(i => i.instrumentId)).toContain('results_based_finance');
    expect(p4.structuralGap.note).toMatch(/finding about the accreditation, not about the project/);
  });

  test('the pipeline names the barrier nothing DFCC can deliver addresses', () => {
    /* The finding that matters: both adaptation projects rest on an outcome
       nobody pays for, and the one structure that reaches them needs the grant
       modality DFCC does not hold. That is a mandate question. */
    expect(r.mandateGap.barriers.map(b => b.id)).toEqual(['no_revenue_stream']);
    expect(r.mandateGap.barriers[0].projects).toEqual(['GCF-P2', 'GCF-P4']);
    expect(r.mandateGap.note).toMatch(/mandate question/);
  });

  test('with the grant modality held, that gap closes', () => {
    const widened = instruments.structurePipeline(P, {
      accreditation: { ...ACC, grantModality: true },
    });
    expect(widened.mandateGap).toBeNull();
  });

  test('the recorded instrument is checked against the analysis, not assumed', () => {
    const p1 = r.projects.find(p => p.code === 'GCF-P1');
    expect(p1.recordedInstrumentCheck.recognised).toBe(true);
    expect(p1.recordedInstrumentCheck.note).toMatch(/argued rather than assumed|analysis reaches/);
    const p4 = r.projects.find(p => p.code === 'GCF-P4');
    expect(p4.recordedInstrumentCheck.recognised).toBe(false);
    expect(p4.recordedInstrumentCheck.note).toMatch(/not wrong — it is unassessed/);
  });
});

describe('Over HTTP', () => {
  test('the gate reports three sets and the accreditation it applied', async () => {
    const res = await auth(api().get('/v1/gcf/screening')).expect(200);
    expect(res.body.screening.excluded).toEqual([]);
    expect(res.body.screening.flagged).toEqual(['GCF-P4']);
    expect(res.body.screening.accreditation.decision).toBe('B.36/10');
  });

  test('the ranking comes back as two lists with the default weighting', async () => {
    const res = await auth(api().get('/v1/gcf/ranking')).expect(200);
    expect(res.body.ranking.mitigation.projects).toHaveLength(3);
    expect(res.body.ranking.adaptation.projects).toHaveLength(2);
    expect(res.body.ranking.mitigation.weights).toEqual(screening.DEFAULT_WEIGHTS);
  });

  test('only a changed weight is sent; the rest answer from the engine default', async () => {
    const res = await auth(api().get('/v1/gcf/ranking?evidence=0.5')).expect(200);
    const w = res.body.ranking.mitigation.weights;
    expect(w.evidence).toBe(0.5);
    expect(w.impactPotential).toBe(screening.DEFAULT_WEIGHTS.impactPotential);
  });

  test('a bad weight is refused by the shared validator', async () => {
    const res = await auth(api().get('/v1/gcf/ranking?evidence=lots')).expect(400);
    expect(res.body.error).toBe('INVALID_WEIGHTS');
    await auth(api().get('/v1/gcf/recommendation?evidence=-2')).expect(400);
  });

  test('the recommendation answers with two and its divergence', async () => {
    const res = await auth(api().get('/v1/gcf/recommendation')).expect(200);
    expect(res.body.recommendation.selected).toHaveLength(2);
    expect(res.body.recommendation.divergence.agree).toBe(false);
  });

  test('take is bounded — the ToR asks for up to two', async () => {
    await auth(api().get('/v1/gcf/recommendation?take=0')).expect(400);
    await auth(api().get('/v1/gcf/recommendation?take=99')).expect(400);
    const res = await auth(api().get('/v1/gcf/recommendation?take=1')).expect(200);
    expect(res.body.recommendation.selected).toHaveLength(1);
  });

  test('the instruments endpoint carries the mandate gap', async () => {
    const res = await auth(api().get('/v1/gcf/instruments')).expect(200);
    expect(res.body.instruments.mandateGap.barriers[0].id).toBe('no_revenue_stream');
  });

  test('one project structured, with its barriers resolved to labels', async () => {
    const res = await auth(api().get('/v1/gcf/instruments/gcf_p4_mangrove_coast')).expect(200);
    expect(res.body.structuring.barriers.map(b => b.id)).toContain('no_revenue_stream');
    expect(res.body.structuring.barriers[0].label).toBeTruthy();
  });

  test('an unknown project is a 404, not an empty structuring', async () => {
    await auth(api().get('/v1/gcf/instruments/nope')).expect(404);
  });

  test('the reference endpoint now serves the instrument catalogue and criteria', async () => {
    const res = await auth(api().get('/v1/gcf/reference')).expect(200);
    expect(res.body.instruments.instruments).toHaveLength(7);
    expect(res.body.criteria).toHaveLength(6);
    expect(res.body.defaultWeights).toEqual(screening.DEFAULT_WEIGHTS);
  });

  test('every Lot 2 endpoint needs a key', async () => {
    for (const p of ['/screening', '/ranking', '/recommendation', '/instruments']) {
      await api().get(`/v1/gcf${p}`).expect(401);
    }
  });
});
