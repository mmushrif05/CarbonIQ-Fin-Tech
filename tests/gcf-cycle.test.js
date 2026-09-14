/**
 * The GCF project cycle, and the pipeline read as a portfolio.
 *
 * What is pinned here is what the Fund actually asks of an accredited entity
 * between an idea and a disbursement (docs/GCF-PIPELINE-RESEARCH.md):
 *
 *   The ten stages are GCF's and in GCF's order; a project always sits on
 *   exactly one, and a move is dated into its history rather than overwriting
 *   the last one.
 *
 *   Readiness is answered from the record and passes no judgement: held means
 *   the fact is recorded, not that the Secretariat will accept it. A gap does
 *   not stop a move; it travels with the project.
 *
 *   Projected dates are marked projected and name the GCF-2 service standard
 *   they rest on. A recorded date never is.
 *
 *   The portfolio computes nothing of its own: mitigation, embodied and
 *   financed emissions stay on separate keys, direct and indirect
 *   beneficiaries are never summed, and the accreditation ceiling applies per
 *   project rather than to the pipeline.
 *
 *   The shipped sample is read-only. Editing one project of it would replace
 *   the whole illustrative set with one record, so the refusal says to adopt
 *   the pipeline first.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const partcStore = require('../src/platform/database/store');
const cycle = require('../src/domains/gcf/domain/cycle');
const readiness = require('../src/domains/gcf/domain/readiness');
const criteria = require('../src/domains/gcf/domain/criteria');
const portfolio = require('../src/domains/gcf/domain/portfolio');
const emissions = require('../src/domains/gcf/domain/emissions');
const record = require('../src/domains/gcf/domain/record');
const store = require('../src/domains/gcf/infrastructure/store');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = (r) => r.set('x-api-key', KEY);
const api = () => request(app);
const NOW = '2026-09-14T00:00:00.000Z';
const seed = id => store.seedProjects().find(p => p.id === id);

beforeEach(() => partcStore._resetMemory());

describe('The cycle is GCF’s, in GCF’s order', () => {
  test('ten stages, numbered one to ten', () => {
    expect(cycle.CYCLE.map(c => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('every record stage maps onto one cycle stage, and the record’s vocabulary is the cycle’s', () => {
    for (const s of cycle.STAGES) {
      const info = cycle.stageInfo(s);
      expect(info).not.toBeNull();
      expect(info.cycle.n).toBeGreaterThanOrEqual(1);
    }
    expect(record.STAGES).toEqual(cycle.STAGES);
  });

  test('the stages run forward and the last has no successor', () => {
    expect(cycle.nextStage('concept')).toBe('pre_feasibility');
    expect(cycle.nextStage('cn_drafted')).toBe('cn_submitted');
    expect(cycle.nextStage('closed')).toBeNull();
    expect(cycle.stageInfo('not_a_stage')).toBeNull();
  });

  test('every stage but the last names the next step, who takes it and the document it produces', () => {
    for (const s of cycle.STAGES.filter(s => s !== 'closed')) {
      const step = cycle.NEXT_STEP[s];
      expect(step && step.what && step.who).toBeTruthy();
    }
  });

  test('the service standards each cite their source', () => {
    for (const t of Object.values(cycle.TIMING)) {
      expect(t.value).toBeGreaterThan(0);
      expect(t.source.length).toBeGreaterThan(20);
    }
  });
});

describe('Time on the cycle', () => {
  test('days in stage is read from the history where there is one, and from provenance where there is not', () => {
    const p = { stage: 'cn_drafted', stageHistory: [{ stage: 'concept', at: '2026-01-01' }, { stage: 'cn_drafted', at: '2026-09-01' }] };
    expect(cycle.daysInStage(p, NOW)).toBe(13);
    const q = { stage: 'concept', provenance: { enteredAt: '2026-09-04T00:00:00.000Z' } };
    expect(cycle.daysInStage(q, NOW)).toBe(10);
    expect(cycle.daysInStage({ stage: 'concept' }, NOW)).toBeNull();
  });

  test('a projected date is marked projected and names the standard it rests on; a recorded one is not', () => {
    const p = { stage: 'cn_submitted', timeline: { cnSubmitted: '2026-08-01' } };
    const t = cycle.timeline(p, NOW);
    expect(t.recorded.map(m => m.key)).toEqual(['cnSubmitted']);
    expect(t.recorded[0]).toMatchObject({ date: '2026-08-01', target: false });
    expect(t.projected.length).toBeGreaterThan(0);
    for (const m of t.projected) {
      expect(m.projected).toBe(true);
      expect(m.basis).toMatch(/six weeks|nine months|eleven months/i);
    }
    expect(t.projected[0]).toMatchObject({ key: 'cnFeedbackDue', date: '2026-09-12' });
  });

  test('a target set by the bank that has passed without the event is overdue', () => {
    const t = cycle.timeline({ stage: 'cn_drafted', timeline: { cnSubmissionTarget: '2026-06-30' } }, NOW);
    expect(t.recorded[0]).toMatchObject({ key: 'cnSubmissionTarget', target: true, overdue: true });
    const met = cycle.timeline({ stage: 'cn_submitted', timeline: { cnSubmissionTarget: '2026-06-30', cnSubmitted: '2026-06-28' } }, NOW);
    expect(met.recorded.find(m => m.key === 'cnSubmissionTarget').overdue).toBe(false);
  });

  test('nothing is projected for a project with no recorded date to project from', () => {
    expect(cycle.timeline({ stage: 'concept' }, NOW).projected).toEqual([]);
  });
});

describe('Readiness is answered from the record and judges nothing', () => {
  test('every requirement names its clause and the fact that closes it', () => {
    for (const r of readiness.REQUIREMENTS) {
      expect(r.clause.length).toBeGreaterThan(3);
      expect(r.remedy.length).toBeGreaterThan(10);
      expect([2, 3, 4, 5, 6, 7, 8, 9, 10]).toContain(r.cycle);
    }
  });

  test('a seed project at concept-note stage holds its origination facts and is missing what the note needs', () => {
    const r = readiness.assess(seed('gcf_p1_jaffna_solar'), { now: NOW });
    expect(r.cycle.n).toBe(3);
    expect(r.items.every(i => ['held', 'partial', 'missing'].includes(i.status))).toBe(true);
    expect(r.items.filter(i => i.cycle === 2).every(i => i.status === 'held')).toBe(true);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.pctReady).toBeGreaterThan(50);
    expect(r.pctReady).toBeLessThan(100);
    expect(r.next).toMatchObject({ stage: 'cn_submitted' });
    expect(r.nextStep.what).toBeTruthy();
  });

  test('the same project with its documents and no-objection recorded is ready', () => {
    const p = seed('gcf_p1_jaffna_solar');
    const before = readiness.assess(p, { now: NOW });
    const after = readiness.assess({
      ...p,
      nda: { status: 'issued', issuedAt: '2026-08-01', reference: 'NDA/2026/14' },
      executingEntity: { name: 'Jaffna Solar Co-op', role: 'developer', trackRecord: 'Two 5 MW plants commissioned' },
      documents: [{ kind: 'feasibility_study', title: 'Pre-feasibility', date: '2026-07-01' }, { kind: 'theory_of_change', title: 'ToC', date: '2026-07-01' }],
      safeguards: { ...(p.safeguards || {}), stakeholderConsultation: { status: 'complete' }, genderAssessment: { status: 'complete' } },
      timeline: { conceptOriginated: '2026-02-01' },
    }, { now: NOW });
    expect(after.blockers.length).toBeLessThan(before.blockers.length);
    expect(after.pctReady).toBeGreaterThan(before.pctReady);
  });

  test('a declined no-objection is missing, not partial — the NDA said no', () => {
    const p = { ...seed('gcf_p1_jaffna_solar'), nda: { status: 'declined' } };
    const r = readiness.assess(p, { now: NOW });
    expect(r.items.find(i => i.id.includes('nda')).status).toBe('missing');
  });

  test('a gap never refuses: assess answers for a record with almost nothing on it', () => {
    const r = readiness.assess({ id: 'x', stage: 'concept' }, { now: NOW });
    expect(r.pctReady).toBe(0);
    expect(r.blockers.length).toBe(r.items.length);
    expect(r.sap.eligible).toBe(false);
  });

  test('SAP is bounded by the ask and the safeguards category, and says which condition failed', () => {
    const small = { financing: { gcfAsk: 20e6, totalCost: 40e6 }, essCategory: 'C' };
    expect(readiness.sapEligibility(small).eligible).toBe(true);
    const big = readiness.sapEligibility({ financing: { gcfAsk: 30e6, totalCost: 40e6 }, essCategory: 'C' });
    expect(big.eligible).toBe(false);
    expect(big.reasons.join(' ')).toMatch(/25/);
    const risky = readiness.sapEligibility({ financing: { gcfAsk: 10e6, totalCost: 20e6 }, essCategory: 'B' });
    expect(risky.eligible).toBe(false);
    expect(risky.reasons.join(' ')).toMatch(/C|I-3/);
  });

  test('PPF is capped at a tenth of the ask and USD 1.5m, and is for the stages before a funding proposal', () => {
    const r = readiness.ppfEligibility({ stage: 'cn_submitted', financing: { gcfAsk: 30e6, totalCost: 60e6 } });
    expect(r.eligible).toBe(true);
    expect(r.maxSupport_usd).toBe(1.5e6);
    const late = readiness.ppfEligibility({ stage: 'approved', financing: { gcfAsk: 30e6, totalCost: 60e6 } });
    expect(late.eligible).toBe(false);
  });
});

describe('The six investment criteria are evidence held, never a score', () => {
  test('six criteria in the Fund’s order, each with sub-checks', () => {
    expect(criteria.CRITERIA.map(c => c.id)).toEqual([
      'impactPotential', 'paradigmShift', 'sustainableDevelopment', 'needsOfRecipient', 'countryOwnership', 'efficiencyEffectiveness',
    ]);
    for (const c of criteria.CRITERIA) expect(c.sub.length).toBeGreaterThan(1);
  });

  test('the criteria the engine scores are the screening module’s scored set, and the rest are named unscored', () => {
    const r = criteria.assess(seed('gcf_p1_jaffna_solar'));
    const scored = r.criteria.filter(c => c.scoredByEngine).map(c => c.id).sort();
    expect(scored).toEqual(['countryOwnership', 'efficiencyEffectiveness', 'impactPotential']);
    expect(r.criteria.filter(c => !c.scoredByEngine).map(c => c.id).sort()).toEqual(['needsOfRecipient', 'paradigmShift', 'sustainableDevelopment']);
  });

  test('nothing in the answer is a number out of anything', () => {
    const r = criteria.assess(seed('gcf_p4_mangrove_coast'));
    for (const c of r.criteria) {
      expect(['evidenced', 'partial', 'absent']).toContain(c.status);
      expect(c).not.toHaveProperty('score');
      for (const s of c.sub) expect(['evidenced', 'partial', 'absent']).toContain(s.status);
    }
    expect(r.evidenced + r.partial + r.absent).toBe(6);
  });

  test('a mitigation figure alone does not evidence impact for an adaptation project', () => {
    const p = { ...seed('gcf_p4_mangrove_coast'), beneficiaries: undefined, assets: undefined, area: undefined };
    const impact = criteria.assess(p).criteria.find(c => c.id === 'impactPotential');
    expect(impact.status).not.toBe('evidenced');
  });
});

describe('The portfolio computes nothing and merges nothing', () => {
  const acc = SEED._meta.accreditation;
  const view = () => portfolio.portfolio(store.seedProjects(), { accreditation: acc, now: NOW });

  test('the money is the seed’s, summed, and mobilisation is null rather than infinite when there is no ask', () => {
    const v = view();
    expect(v.money.totalCost).toBe(196500000);
    expect(v.money.gcfAsk).toBe(72000000);
    expect(v.money.mobilisation).toBe(+(196500000 / 72000000).toFixed(2));
    const none = portfolio.portfolio([{ ...seed('gcf_p1_jaffna_solar'), financing: { ...seed('gcf_p1_jaffna_solar').financing, gcfAsk: 0 } }], { accreditation: acc, now: NOW });
    expect(none.money.mobilisation).toBeNull();
    expect(none.rows[0].mobilisation).toBeNull();
  });

  test('the results are the emissions model’s own figures, on their separate boundaries', () => {
    const v = view();
    const e = emissions.portfolioEmissions(store.seedProjects(), { label: 'pipeline' });
    expect(v.results.mitigation).toEqual(e.headline);
    expect(v.results.embodiedCarbon).toEqual(e.embodiedCarbon);
    expect(v.results.financedEmissions).toEqual(e.financedEmissions);
    expect(v.results.adaptationCoBenefit).toEqual(e.adaptationCoBenefit);
    expect(JSON.stringify(v.results)).not.toMatch(/net(ted)?Benefit|combined/i);
  });

  test('direct and indirect beneficiaries are two figures, never one', () => {
    const b = view().results.beneficiaries;
    expect(b.direct).toBeGreaterThan(0);
    expect(b.indirect).toBeGreaterThan(b.direct);
    expect(b).not.toHaveProperty('total');
    expect(b.note).toMatch(/never summed/);
  });

  test('the envelope is per project: the largest project against the ceiling, none over it', () => {
    const v = view();
    expect(v.envelope.ceiling_usd).toBe(250e6);
    expect(v.envelope.decision).toBe('B.36/10');
    expect(v.envelope.largestProject.shareOfCeiling).toBeLessThan(1);
    expect(v.envelope.overCeiling).toEqual([]);
    expect(v.envelope.note).toMatch(/per project/);
  });

  test('every project is on exactly one stage and one cycle step', () => {
    const v = view();
    expect(v.byStage.reduce((n, s) => n + s.count, 0)).toBe(5);
    expect(v.byCycle.reduce((n, c) => n + c.count, 0)).toBe(5);
    expect(v.byCycle.filter(c => c.count > 0).map(c => [c.n, c.count])).toEqual([[2, 3], [3, 2]]);
  });

  test('the two rankings stay apart: no row carries an overall rank', () => {
    const v = view();
    for (const r of v.rows) {
      expect(r).not.toHaveProperty('overallRank');
      expect(r).not.toHaveProperty('rank');
    }
    expect(v.byStream.map(s => s.stream)).toEqual(['mitigation', 'adaptation']);
  });

  test('the gate counts are the screening engine’s and the actions list what to do next, furthest along first', () => {
    const v = view();
    expect(v.gate.eligible + v.gate.flagged + v.gate.excluded).toBe(5);
    expect(v.actions).toHaveLength(5);
    for (const a of v.actions) expect(a.what && a.who).toBeTruthy();
    const cycles = v.actions.map(a => v.rows.find(r => r.id === a.id).cycle);
    expect([...cycles].sort((a, b) => b - a)).toEqual(cycles);
  });

  test('an empty book is a portfolio of nothing, not a crash', () => {
    const v = portfolio.portfolio([], { accreditation: acc, now: NOW });
    expect(v.count).toBe(0);
    expect(v.money.mobilisation).toBeNull();
    expect(v.envelope.largestProject).toBeNull();
    expect(v.readiness.averagePct).toBeNull();
  });

  test('a results area code is rendered by its name, and an unknown code is returned as itself', () => {
    expect(portfolio.areaLabel('EP')).toMatch(/energy/i);
    expect(portfolio.areaLabel('ZZ')).toBe('ZZ');
  });
});

describe('The cycle over HTTP', () => {
  test('the portfolio serves the shipped pipeline marked as a sample, and the recorded book once there is one', async () => {
    const s = (await auth(api().get('/v1/gcf/portfolio')).expect(200)).body;
    expect(s.sample).toBe(true);
    expect(s.source).toBe('seed');
    expect(s.portfolio.count).toBe(5);
    expect(s.portfolio.envelope.decision).toBe('B.36/10');
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const r = (await auth(api().get('/v1/gcf/portfolio')).expect(200)).body;
    expect(r.sample).toBe(false);
    expect(r.sampleNote).toBeNull();
    expect(r.portfolio.count).toBe(5);
  });

  test('a project’s readiness carries the checklist, the six criteria and the timeline', async () => {
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar/readiness')).expect(200)).body;
    expect(r.readiness.stageLabel).toBeTruthy();
    expect(r.readiness.items.length).toBeGreaterThan(5);
    expect(r.criteria.criteria).toHaveLength(6);
    expect(r.readiness.timeline).toHaveProperty('recorded');
    expect(r.readiness.timeline).toHaveProperty('projected');
    await auth(api().get('/v1/gcf/pipeline/nope/readiness')).expect(404);
  });

  test('the shipped sample cannot be edited or moved — the refusal says to adopt it first', async () => {
    const e = await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ name: 'Renamed' }).expect(409);
    expect(e.body.error).toBe('SAMPLE_NOT_EDITABLE');
    expect(e.body.remedy).toMatch(/adopt/i);
    const m = await auth(api().post('/v1/gcf/pipeline/gcf_p1_jaffna_solar/stage')).send({ stage: 'cn_submitted' }).expect(409);
    expect(m.body.error).toBe('SAMPLE_NOT_EDITABLE');
    const list = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(list.source).toBe('seed');
    expect(list.count).toBe(5);
  });

  test('a patch merges into the recorded project and is held to the whole schema', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const r = (await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar'))
      .send({ nda: { status: 'requested', requestedAt: '2026-08-01' }, executingEntity: { name: 'Jaffna Solar Co-op', role: 'developer' } })
      .expect(200)).body.project;
    expect(r.nda.status).toBe('requested');
    expect(r.executingEntity.name).toBe('Jaffna Solar Co-op');
    expect(r.name).toBe(seed('gcf_p1_jaffna_solar').name);
    expect(r.financing.totalCost).toBe(seed('gcf_p1_jaffna_solar').financing.totalCost);
    /* The merged record is refused by the domain's own schema, naming the field. */
    const bad = await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ nda: { status: 'maybe' } }).expect(400);
    expect(bad.body.error).toBe('INVALID_GCF_PROJECT');
    expect(bad.body.message).toMatch(/nda\.status/);
    const empty = await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({}).expect(400);
    expect(empty.body.error).toBe('VALIDATION_ERROR');
  });

  test('a patch cannot rewrite the id, the provenance or the history', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const r = (await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar'))
      .send({ id: 'other', provenance: { source: 'forged' }, stageHistory: [{ stage: 'approved', at: '2020-01-01' }], name: 'Renamed' })
      .expect(200)).body.project;
    expect(r.id).toBe('gcf_p1_jaffna_solar');
    expect(r.provenance.source).toMatch(/Adopted/);
    expect(r.stageHistory || []).toEqual([]);
    expect(r.name).toBe('Renamed');
  });

  test('a stage move is dated into the history, carries its milestone dates, and answers with the new readiness', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const r = (await auth(api().post('/v1/gcf/pipeline/gcf_p1_jaffna_solar/stage'))
      .send({ stage: 'cn_submitted', at: '2026-09-01', note: 'Submitted through the NDA', timeline: { cnSubmitted: '2026-09-01' } })
      .expect(200)).body;
    expect(r.project.stage).toBe('cn_submitted');
    expect(r.project.stageHistory).toHaveLength(1);
    expect(r.project.stageHistory[0]).toMatchObject({ stage: 'cn_submitted', at: '2026-09-01', note: 'Submitted through the NDA' });
    expect(r.project.stageHistory[0].by).toBeTruthy();
    expect(r.project.timeline.cnSubmitted).toBe('2026-09-01');
    expect(r.readiness.stage).toBe('cn_submitted');
    expect(r.readiness.timeline.projected.find(m => m.key === 'cnFeedbackDue')).toBeTruthy();

    const again = (await auth(api().post('/v1/gcf/pipeline/gcf_p1_jaffna_solar/stage')).send({ stage: 'fp' }).expect(200)).body.project;
    expect(again.stageHistory.map(h => h.stage)).toEqual(['cn_submitted', 'fp']);
    expect(again.timeline.cnSubmitted).toBe('2026-09-01');
  });

  test('a move to a stage the cycle does not have is refused at the door', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const r = await auth(api().post('/v1/gcf/pipeline/gcf_p1_jaffna_solar/stage')).send({ stage: 'shipped' }).expect(400);
    expect(r.body.error).toBe('VALIDATION_ERROR');
  });

  test('the entity’s own accreditation, once recorded, is what every gate reads', async () => {
    const before = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).expect(200)).body;
    expect(before.accreditation.within).toBe(true);
    await auth(api().put('/v1/gcf/entity')).send({
      accreditation: { ...SEED._meta.accreditation, sizeCategory: 'micro', sizeRange_usd: [0, 10e6] },
    }).expect(200);
    const after = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).expect(200)).body;
    expect(after.accreditation.within).toBe(false);
    const view = (await auth(api().get('/v1/gcf/portfolio')).expect(200)).body.portfolio;
    expect(view.envelope.ceiling_usd).toBe(10e6);
    expect(view.envelope.overCeiling.length).toBeGreaterThan(0);
  });
});
