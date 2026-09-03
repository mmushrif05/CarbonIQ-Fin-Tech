/**
 * The GCF project record — the spine the whole tab reads.
 *
 * One record per candidate, entered once, read by the pipeline screen, the
 * emissions model, the disclosure and the Concept Note export. What is pinned
 * here is the discipline that makes that safe:
 *
 *   Every figure carries its evidence tier. A bare number is refused, because
 *   that is the only way a benchmark default cannot quietly become a measured
 *   fact somewhere downstream.
 *
 *   A mitigation figure carries its baseline. Reduced and avoided are
 *   different claims and only the counterfactual decides which.
 *
 *   Adaptation co-benefits are flagged and never used to rank.
 *
 *   The shipped pipeline is illustrative and says so, and recorded data
 *   replaces it entirely rather than mixing with it.
 *
 *   Accreditation is a gate. DFCC is accredited to B/I-2, so a category A
 *   project is excluded rather than down-ranked.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const record = require('../services/gcf/record');
const store = require('../services/gcf/store');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = (r) => r.set('x-api-key', KEY);
const api = () => request(app);

beforeEach(() => partcStore._resetMemory());

describe('The shipped pipeline is coherent', () => {
  test('all five projects validate against the schema', () => {
    for (const p of SEED.projects) expect(() => record.validate(p)).not.toThrow();
  });

  test('every project’s financing reconciles to its total cost', () => {
    for (const p of SEED.projects) {
      const f = p.financing;
      expect(f.gcfAsk + f.dfcc + f.other).toBe(f.totalCost);
    }
  });

  test('exactly two are selected for a Concept Note, as the ToR asks', () => {
    /* "At least two high-potential concepts", "up to two Concept Notes".
       Five is the screening pool; two is the deliverable. */
    expect(SEED.projects.filter(p => p.selectedForCN)).toHaveLength(2);
    expect(SEED._meta.deliverable.conceptNotes).toBe(2);
  });

  test('every project explains why it was or was not selected', () => {
    for (const p of SEED.projects) {
      expect(p.selectionReason.length).toBeGreaterThan(40);
    }
  });

  test('both streams are represented, across five of the eight results areas', () => {
    const areas = new Set(SEED.projects.map(p => p.resultsArea));
    expect(areas.size).toBe(5);
    expect(SEED.projects.some(p => p.stream === 'mitigation')).toBe(true);
    expect(SEED.projects.some(p => p.stream === 'adaptation')).toBe(true);
  });

  test('no project exceeds what DFCC is accredited to carry', () => {
    const range = SEED._meta.accreditation.sizeRange_usd;
    for (const p of SEED.projects) {
      expect(record.withinAccreditation(p, { sizeRange: range }).within).toBe(true);
    }
  });

  test('the grant modality is recorded as unavailable, with the caveat to verify it', () => {
    /* Read off the ToR's modality checkboxes. Misreading an accreditation
       scope would be a serious error, so the record says to check it. */
    expect(SEED._meta.accreditation.grantModality).toBe(false);
    expect(SEED._meta.accreditation.grantNote).toMatch(/verify with DFCC or the NDA/);
  });

  test('the seed marks itself illustrative and names what must be replaced', () => {
    expect(SEED._meta.sample).toBe(true);
    expect(SEED._meta.sampleNote).toMatch(/not DFCC's book/);
    expect(SEED._meta.sampleNote).toMatch(/replaced with sourced values/);
  });
});

describe('Every figure carries its provenance', () => {
  test('a figure with no evidence tier is refused', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.beneficiaries.direct = { value: 48000 };          // no tier
    expect(() => record.validate(p)).toThrow(/tier/i);
  });

  test('an unrecognised tier is refused — the four are the whole set', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.beneficiaries.direct = { value: 1, tier: 'pcaf-2' };
    expect(() => record.validate(p)).toThrow();
  });

  test('the tiers are deliberately not PCAF’s 1-5 scale', () => {
    expect(record.TIERS).toEqual(['measured', 'modelled', 'benchmark', 'declared']);
    const irmf = require('../data/gcf/irmf.json');
    expect(irmf.tierNote).toMatch(/NOT PCAF's 1-5 data-quality scale/);
  });

  test('a null value is allowed, because an absent figure is a fact', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.area = { hectares: { value: null, tier: 'declared' } };
    expect(() => record.validate(p)).not.toThrow();
  });

  test('the weakest tier in a record can be named, so a reviewer knows what to ask', () => {
    const p1 = SEED.projects.find(p => p.id === 'gcf_p1_jaffna_solar');
    expect(record.weakestTier(p1)).toBe('benchmark');
    expect(record.tracedFigures(p1).length).toBeGreaterThan(5);
  });

  test('the grid emission factor is flagged as needing a sourced replacement', () => {
    const p1 = SEED.projects.find(p => p.id === 'gcf_p1_jaffna_solar');
    const ef = p1.mitigation.baseline.gridEF_tCO2e_per_mwh;
    expect(ef.tier).toBe('benchmark');
    expect(ef.note).toMatch(/MUST be replaced/);
  });
});

describe('A tCO2e figure without a baseline means nothing', () => {
  test('a mitigation block with no baseline is refused', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    delete p.mitigation.baseline;
    expect(() => record.validate(p)).toThrow(/baseline/i);
  });

  test('the baseline names its counterfactual and its type', () => {
    for (const p of SEED.projects) {
      const b = p.mitigation.baseline;
      expect(b.counterfactual.length).toBeGreaterThan(10);
      expect(record.BASELINE_TYPES).toContain(b.type);
    }
  });

  test('a removal is typed as a removal, never as a reduction', () => {
    /* NDC 3.0 keeps reduction and removal as separate commitments and so does
       this record — a project that removes carbon has not reduced emissions. */
    const mangrove = SEED.projects.find(p => p.id === 'gcf_p4_mangrove_coast');
    expect(mangrove.mitigation.baseline.type).toBe('removal');
    expect(mangrove.mitigation.baseline.note).toMatch(/A removal is not a reduction/);
  });
});

describe('Adaptation is never ranked on carbon', () => {
  test('both adaptation projects flag their mitigation figure as a co-benefit', () => {
    const adaptation = SEED.projects.filter(p => p.stream === 'adaptation');
    expect(adaptation).toHaveLength(2);
    for (const p of adaptation) {
      expect(p.mitigation.isCoBenefit).toBe(true);
      expect(p.coBenefitNote || p.mitigation.coBenefitNote).toBeTruthy();
    }
  });

  test('no mitigation project is flagged as a co-benefit', () => {
    for (const p of SEED.projects.filter(x => x.stream === 'mitigation')) {
      expect(p.mitigation.isCoBenefit).toBeFalsy();
    }
  });
});

describe('Three carbon boundaries, and the shape gives them nowhere to merge', () => {
  test('embodied carbon is a payback period inside the project, not a deduction', () => {
    const p3 = SEED.projects.find(p => p.id === 'gcf_p3_colombo_cooling');
    expect(p3.embodiedCarbon.a1a5_tCO2e.value).toBeGreaterThan(0);
    expect(p3.embodiedCarbon.paybackYears.value).toBeGreaterThan(0);
    expect(p3.embodiedCarbon.note).toMatch(/NEVER deducted/);
  });

  test('the record holds no financed-emissions field at all', () => {
    /* What the bank carries belongs to the capital book. Giving this record a
       place to hold it would be giving someone a place to add it to the
       project's own figures. */
    for (const p of SEED.projects) {
      const wire = JSON.stringify(p);
      expect(wire).not.toMatch(/financedEmission/i);
      expect(wire).not.toMatch(/attributed/i);
    }
  });
});

describe('Minimum concessionality — the appraisal can say no', () => {
  test('every project states viability with and without GCF support', () => {
    for (const p of SEED.projects) {
      const v = p.financing.viabilityWithoutGcf;
      expect(typeof v.viable).toBe('boolean');
      expect(v.reason.length).toBeGreaterThan(20);
    }
  });

  test('a project viable without support is a legal record, not a schema error', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.financing.viabilityWithoutGcf = { viable: true, reason: 'Commercially bankable on current terms.' };
    expect(() => record.validate(p)).not.toThrow();
  });

  test('the project that cannot be structured under DFCC’s modalities says so', () => {
    const mangrove = SEED.projects.find(p => p.id === 'gcf_p4_mangrove_coast');
    expect(mangrove.financing.modalityGap).toBe(true);
    expect(mangrove.selectionReason).toMatch(/co-accredited entity/);
  });
});

describe('Safeguards categorisation gates rather than scores', () => {
  test('a category A project is excluded from DFCC’s accreditation', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.essCategory = 'A';
    const check = record.withinAccreditation(p, { sizeRange: [0, 250e6] });
    expect(check.within).toBe(false);
    expect(check.reasons[0]).toMatch(/outside DFCC's accreditation/);
  });

  test('a project over the size ceiling is excluded too', () => {
    const p = JSON.parse(JSON.stringify(SEED.projects[0]));
    p.financing.totalCost = 400_000_000;
    expect(record.withinAccreditation(p, { sizeRange: [50e6, 250e6] }).within).toBe(false);
  });

  test('FPIC is recorded as a flag, and the project keeps its place in the pool', () => {
    const mangrove = SEED.projects.find(p => p.id === 'gcf_p4_mangrove_coast');
    expect(mangrove.essFlags).toContain('fpic_required');
    expect(record.withinAccreditation(mangrove, { sizeRange: [0, 250e6] }).within).toBe(true);
  });
});

describe('The register over HTTP', () => {
  test('an empty book returns the shipped pipeline, marked as a sample', async () => {
    const r = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(r.source).toBe('seed');
    expect(r.sample).toBe(true);
    expect(r.count).toBe(5);
    expect(r.sampleNote).toMatch(/not DFCC's book/);
  });

  test('one project comes back with its evidence and its accreditation check', async () => {
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).expect(200)).body;
    expect(r.evidence.weakestTier).toBe('benchmark');
    expect(r.evidence.figures.length).toBeGreaterThan(5);
    expect(r.accreditation.within).toBe(true);
  });

  test('an unknown id is a 404, not an empty record', async () => {
    const r = await auth(api().get('/v1/gcf/pipeline/nope')).expect(404);
    expect(r.body.error).toBe('PROJECT_NOT_FOUND');
  });

  test('a recorded project replaces the seed entirely — the two never mix', async () => {
    const p = store.seedProjects()[0];
    p.name = 'Recorded by the bank';
    await auth(api().post('/v1/gcf/pipeline')).send(p).expect(201);
    const r = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(r.source).toBe('recorded');
    expect(r.sample).toBe(false);
    expect(r.count).toBe(1);            // not 1 recorded + 4 seed
    expect(r.projects[0].name).toBe('Recorded by the bank');
  });

  test('a write stamps who entered it and when', async () => {
    const p = store.seedProjects()[0];
    const saved = (await auth(api().post('/v1/gcf/pipeline')).send(p).expect(201)).body.project;
    expect(saved.provenance.enteredAt).toBeTruthy();
    expect(saved.provenance.updatedAt).toBeTruthy();
    expect(saved.provenance.enteredBy).toBeTruthy();
  });

  test('an invalid record is refused with a reason, not stored', async () => {
    const r = await auth(api().post('/v1/gcf/pipeline')).send({ id: 'x', code: 'X', name: 'no tiers' }).expect(400);
    expect(r.body.error).toBe('INVALID_GCF_PROJECT');
    const list = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(list.source).toBe('seed');
  });

  test('a record with no id is refused before it reaches the store', async () => {
    const r = await auth(api().post('/v1/gcf/pipeline')).send({ name: 'nameless' }).expect(400);
    expect(r.body.error).toBe('MISSING_ID');
  });

  test('adopting the seed makes it the organisation’s own, origin recorded', async () => {
    const r = (await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201)).body;
    expect(r.adopted).toBe(5);
    const list = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(list.source).toBe('recorded');
    expect(list.projects[0].provenance.source).toMatch(/Adopted from the shipped illustrative pipeline/);
  });

  test('a deleted project is gone', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    await auth(api().delete('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).expect(204);
    const list = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(list.projects.map(p => p.id)).not.toContain('gcf_p1_jaffna_solar');
  });

  test('the reference endpoint serves the frameworks so no screen restates them', async () => {
    const r = (await auth(api().get('/v1/gcf/reference')).expect(200)).body;
    expect(r.resultsAreas.areas).toHaveLength(8);
    expect(r.irmf.coreIndicators.map(c => c.id)).toEqual(['MCI-1', 'ACI-1', 'ACI-2']);
    expect(r.ndc3.reduction.totalPct).toBe(20.09);
    expect(r.accreditation.grantModality).toBe(false);
  });

  test('every response says what the deployment can persist', async () => {
    const r = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(['firebase', 'blobs', 'memory', 'none']).toContain(r.storage.mode);
  });

  test('the register needs a key, like everything else that reads the book', async () => {
    await api().get('/v1/gcf/pipeline').expect(401);
    await api().post('/v1/gcf/pipeline').send({ id: 'x' }).expect(401);
  });
});
