/**
 * The sections a concept note and a funding proposal are written from, held
 * as structured facts on the record (src/domains/gcf/domain/sections.js).
 *
 * What is pinned: each block validates against a closed vocabulary and is
 * refused outside it; a record recorded before the blocks existed is
 * unaffected; one function answers held / partial / missing for the
 * readiness checklist and the Concept Note package alike; a document of the
 * same kind still counts, so nothing that was held becomes missing; the
 * adaptation rationale is asked of an adaptation project and not of a
 * mitigation one; the package resolves its inputs from the blocks; and the
 * blocks travel over HTTP through the same patch the rest of the record
 * uses. Runs on both stores.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const platformStore = require('../src/platform/database/store');
const record = require('../src/domains/gcf/domain/record');
const sections = require('../src/domains/gcf/domain/sections');
const readiness = require('../src/domains/gcf/domain/readiness');
const { buildPackage } = require('../src/domains/gcf/application/cn-package');
const { EXAMPLE_PROJECT } = require('../src/domains/gcf/domain/reference');
const SEED = require('../data/gcf/pipeline.seed.json');
const STARTER = require('../data/gcf/dfcc-starter-projects.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const seed = id => JSON.parse(JSON.stringify(SEED.projects.find(p => p.id === id)));
const example = () => JSON.parse(JSON.stringify(EXAMPLE_PROJECT.project));
const item = (r, id) => r.items.find(i => i.id === id);

beforeEach(() => platformStore._resetMemory());

describe('The eight sections are blocks on the record, each in a closed vocabulary', () => {
  test('the record names the eight sections and the vocabularies the reference serves', () => {
    expect(record.SECTION_KEYS).toEqual(['risks', 'implementation', 'sustainability', 'stakeholders', 'climateRationale', 'financialTerms', 'monitoring', 'reporting']);
    expect(record.RISK_LEVELS).toEqual(['low', 'medium', 'high']);
    expect(record.CLIMATE_HAZARDS).toContain('drought');
    expect(record.APR_STATUSES).toEqual(['due', 'submitted', 'accepted']);
  });

  test('a record recorded before the sections existed still validates, with none of them', () => {
    const p = seed('gcf_p1_jaffna_solar');
    const v = record.validate(p);
    for (const k of record.SECTION_KEYS) expect(v[k]).toBeUndefined();
  });

  test('a risk outside the vocabulary is refused by name, and a well-formed one is kept', () => {
    const p = seed('gcf_p1_jaffna_solar');
    p.risks = [{ category: 'meteor', description: 'x', likelihood: 'low', impact: 'high' }];
    expect(() => record.validate(p)).toThrow(/risks\[0\]\.category/);
    p.risks = [{ category: 'technical', description: 'Grid connection delayed', likelihood: 'medium', impact: 'high', mitigation: 'Connection agreement before financial close' }];
    expect(record.validate(p).risks).toHaveLength(1);
  });

  test('a stakeholder group, a hazard, a repayment profile, a frequency and a report status are each held to their list', () => {
    const p = seed('gcf_p1_jaffna_solar');
    expect(() => record.validate({ ...p, stakeholders: [{ name: 'x', group: 'aliens' }] })).toThrow(/stakeholders\[0\]\.group/);
    expect(() => record.validate({ ...p, climateRationale: { hazards: ['volcano'] } })).toThrow(/climateRationale\.hazards\[0\]/);
    expect(() => record.validate({ ...p, financialTerms: { repaymentProfile: 'whenever' } })).toThrow(/financialTerms\.repaymentProfile/);
    expect(() => record.validate({ ...p, monitoring: { indicators: [{ indicator: 'x', frequency: 'sometimes' }] } })).toThrow(/monitoring\.indicators\[0\]\.frequency/);
    expect(() => record.validate({ ...p, reporting: { aprs: [{ year: 2028, status: 'lost' }] } })).toThrow(/reporting\.aprs\[0\]\.status/);
  });
});

describe('One function answers held, partial or missing, and reads the record alone', () => {
  test('nothing recorded is missing, with what is missing named', () => {
    for (const k of sections.SECTION_KEYS) {
      const s = sections.status({}, k);
      expect(s.status).toBe('missing');
      expect(s.summary).toBeNull();
      expect(s.missing).toMatch(/No /);
    }
  });

  test('a half-recorded section is partial, with the sentence that would raise it', () => {
    expect(sections.status({ risks: [{ category: 'technical', description: 'x', likelihood: 'low', impact: 'high' }] }, 'risks')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/without a mitigation/) });
    expect(sections.status({ implementation: { arrangements: 'DFCC on-lends' } }, 'implementation')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/timetable has no milestone/) });
    expect(sections.status({ sustainability: { strategy: 'pays for itself' } }, 'sustainability')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/exit strategy/) });
    expect(sections.status({ stakeholders: [{ name: 'PA', group: 'private_sector' }] }, 'stakeholders')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/without its outcome/) });
    expect(sections.status({ climateRationale: { hazards: ['drought'] } }, 'climateRationale')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/vulnerability/) });
    expect(sections.status({ financialTerms: { tenorYears: 12 } }, 'financialTerms')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/rate/) });
    expect(sections.status({ monitoring: { indicators: [{ indicator: 'x', frequency: 'annual' }] } }, 'monitoring')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/arrangements/) });
    expect(sections.status({ reporting: { aprs: [{ year: 2028, status: 'due' }] } }, 'reporting')).toMatchObject({ status: 'partial', missing: expect.stringMatching(/none has been filed/) });
  });

  test('the served example holds six of the eight, each with a summary in words', () => {
    const p = example();
    for (const k of ['risks', 'implementation', 'sustainability', 'stakeholders', 'financialTerms', 'monitoring']) {
      const s = sections.status(p, k);
      expect(s.status).toBe('held');
      expect(s.summary).toMatch(/[a-z]/);
      expect(s.missing).toBeNull();
    }
    expect(sections.status(p, 'climateRationale').status).toBe('missing');
    expect(sections.status(p, 'reporting').status).toBe('missing');
    expect(sections.status(p, 'risks').summary).toMatch(/3 risks recorded — 1 with high impact; each with its mitigation/);
  });

  test('a filed annual report is held; the better of two answers never loses a held', () => {
    expect(sections.status({ reporting: { aprs: [{ year: 2028, status: 'submitted', submittedAt: '2029-03-01' }] } }, 'reporting').status).toBe('held');
    expect(sections.best('missing', 'held')).toBe('held');
    expect(sections.best('partial', 'missing')).toBe('partial');
    expect(sections.best('held', 'partial')).toBe('held');
  });

  test('an unknown section is refused rather than answered', () => {
    expect(() => sections.status({}, 'budget')).toThrow(/Unknown section/);
  });
});

describe('Readiness reads the sections, and a document of the same kind still counts', () => {
  test('the new requirements name their clause, owner and remedy like every other', () => {
    for (const id of ['implementation_arrangements', 'sustainability_exit', 'adaptation_rationale', 'financial_terms', 'apr_reporting']) {
      const r = readiness.REQUIREMENTS.find(x => x.id === id);
      expect(r).toBeTruthy();
      expect(r.clause.length).toBeGreaterThan(10);
      expect(r.remedy.length).toBeGreaterThan(20);
      expect(r.owner).toMatch(/^(dfcc|sponsor)$/);
    }
  });

  test('a seed project at funding-proposal stage is missing the structured sections it never had', () => {
    const p = seed('gcf_p1_jaffna_solar'); p.stage = 'fp';
    const r = readiness.assess(p);
    expect(item(r, 'implementation_arrangements').status).toBe('missing');
    expect(item(r, 'sustainability_exit').status).toBe('missing');
    expect(item(r, 'risk_register').status).toBe('missing');
  });

  test('the same project with the sections recorded holds them, and a risk register document alone still holds the register', () => {
    const p = seed('gcf_p1_jaffna_solar'); p.stage = 'fp';
    Object.assign(p, { risks: example().risks, implementation: example().implementation, sustainability: example().sustainability, monitoring: example().monitoring });
    const r = readiness.assess(p);
    expect(item(r, 'implementation_arrangements').status).toBe('held');
    expect(item(r, 'sustainability_exit').status).toBe('held');
    expect(item(r, 'risk_register').status).toBe('held');
    expect(item(r, 'me_plan').status).toBe('held');
    const q = seed('gcf_p1_jaffna_solar'); q.stage = 'fp';
    q.documents = [{ kind: 'risk_register', title: 'Risk register v1' }, { kind: 'me_plan', title: 'M&E plan' }];
    const s = readiness.assess(q);
    expect(item(s, 'risk_register').status).toBe('held');
    expect(item(s, 'me_plan').status).toBe('held');
  });

  test('the climate rationale is asked of an adaptation project and not of a mitigation one', () => {
    /* At concept-note stage, where the rationale is asked. */
    const adaptation = { ...STARTER.projects.find(p => p.stream === 'adaptation'), stage: 'cn_drafted' };
    const mitigation = { ...STARTER.projects.find(p => p.stream === 'mitigation'), stage: 'cn_drafted' };
    expect(item(readiness.assess(adaptation), 'adaptation_rationale').status).toBe('held');
    expect(item(readiness.assess(mitigation), 'adaptation_rationale')).toBeUndefined();
    const bare = seed('gcf_p4_mangrove_coast'); bare.stage = 'cn_drafted';
    expect(item(readiness.assess(bare), 'adaptation_rationale').status).toBe('missing');
  });

  test('financial terms are asked at review, and annual reporting at implementation', () => {
    const p = example(); p.stage = 'fp_submitted';
    expect(item(readiness.assess(p), 'financial_terms').status).toBe('held');
    p.stage = 'implementation';
    expect(item(readiness.assess(p), 'apr_reporting').status).toBe('missing');
    p.reporting = { aprs: [{ year: 2028, status: 'accepted', submittedAt: '2029-02-15', reference: 'APR-2028' }] };
    expect(item(readiness.assess(p), 'apr_reporting').status).toBe('held');
  });
});

describe('The Concept Note package resolves its inputs from the sections', () => {
  const labels = pkg => pkg.sections.flatMap(s => s.fields).map(f => [f.label, f.status, f.value]);
  const line = (pkg, re) => labels(pkg).find(([l]) => re.test(l));

  test('a seed project with none of them leaves the inputs external, as before', () => {
    const pkg = buildPackage(seed('gcf_p4_mangrove_coast'));
    expect(line(pkg, /implementation timetable/)[1]).toBe('external');
    expect(line(pkg, /Climate rationale/)[1]).toBe('external');
    expect(line(pkg, /Indicative financial terms/)[1]).toBe('external');
    expect(line(pkg, /Sustainability and exit/)[1]).toBe('external');
    expect(line(pkg, /Full risk register/)[1]).toBe('external');
    expect(line(pkg, /Summary of stakeholder consultations/)[1]).toBe('external');
    expect(pkg.partialInputs).toHaveLength(1);
  });

  test('the served example holds six inputs from its blocks, each with what is recorded', () => {
    const pkg = buildPackage(example());
    for (const re of [/implementation timetable/, /Indicative financial terms/, /Sustainability and exit/, /Monitoring and evaluation arrangements/, /Full risk register/, /Summary of stakeholder consultations/]) {
      const [, status, value] = line(pkg, re);
      expect(status).toBe('held');
      expect(String(value)).toMatch(/[a-z]/);
    }
    expect(line(pkg, /Climate rationale/)).toBeUndefined();
    expect(line(pkg, /implementation timetable/)[2]).toMatch(/4 timetable milestones/);
  });

  test('a half-recorded block is partial in the package, and a document still holds where the block is empty', () => {
    const p = seed('gcf_p1_jaffna_solar');
    p.risks = [{ category: 'technical', description: 'x', likelihood: 'low', impact: 'high' }];
    expect(line(buildPackage(p), /Full risk register/)[1]).toBe('partial');
    const q = seed('gcf_p1_jaffna_solar');
    q.documents = [{ kind: 'risk_register', title: 'Risk register v1', reference: 'RR-1' }];
    expect(line(buildPackage(q), /Full risk register/)[1]).toBe('held');
  });
});

describe('Over HTTP, the sections travel through the same patch as the rest of the record', () => {
  test('a risk is recorded, read back, and a second patch keeps the arrangements while replacing the timetable', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const risk = { category: 'financial', description: 'Tariff falls below the model', likelihood: 'medium', impact: 'high', mitigation: 'Floor price in the PPA' };
    const r = (await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ risks: [risk] }).expect(200)).body.project;
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0].mitigation).toBe('Floor price in the PPA');
    await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ implementation: { arrangements: 'Co-op implements; DFCC supervises' } }).expect(200);
    const s = (await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ implementation: { timetable: [{ milestone: 'EPC signed', end: '2027-03-31' }] } }).expect(200)).body.project;
    expect(s.implementation.arrangements).toBe('Co-op implements; DFCC supervises');
    expect(s.implementation.timetable).toHaveLength(1);
    /* The register is asked at funding-proposal stage; moved there, the checklist holds it. */
    await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ stage: 'fp' }).expect(200);
    const rd = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar/readiness')).expect(200)).body.readiness;
    expect(rd.items.find(i => i.id === 'risk_register').status).toBe('held');
    expect(rd.items.find(i => i.id === 'implementation_arrangements').status).toBe('held');
  });

  test('a block outside the vocabulary is refused by name, and the record is unchanged', async () => {
    await auth(api().post('/v1/gcf/pipeline/adopt')).expect(201);
    const bad = await auth(api().patch('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).send({ financialTerms: { repaymentProfile: 'whenever' } }).expect(400);
    expect(bad.body.error).toBe('INVALID_GCF_PROJECT');
    expect(bad.body.message).toMatch(/financialTerms\.repaymentProfile/);
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_p1_jaffna_solar')).expect(200)).body.project;
    expect(r.financialTerms).toBeUndefined();
  });

  test('the reference serves every vocabulary the forms draw from', async () => {
    const v = (await auth(api().get('/v1/gcf/reference')).expect(200)).body.vocabulary;
    for (const k of ['sectionKeys', 'riskCategories', 'riskLevels', 'stakeholderGroups', 'consultationModes', 'climateHazards', 'repaymentProfiles', 'monitoringFrequencies', 'aprStatuses']) {
      expect(Array.isArray(v[k]) && v[k].length > 0).toBe(true);
    }
    expect(v.requirements.map(r => r.id)).toEqual(expect.arrayContaining(['implementation_arrangements', 'financial_terms', 'apr_reporting']));
  });

  test('the served example carries its sections and still records through the intake', async () => {
    const ex = (await auth(api().get('/v1/gcf/pipeline/example')).expect(200)).body.project;
    expect(ex.risks.length).toBe(3);
    expect(ex.financialTerms.tenorYears).toBe(12);
    const r = (await auth(api().post('/v1/gcf/pipeline')).send(ex).expect(201)).body.project;
    expect(r.monitoring.indicators).toHaveLength(3);
    const pkg = (await auth(api().get(`/v1/gcf/cn/${r.id}`)).expect(200)).body.package;
    expect(pkg.sections.flatMap(s => s.fields).filter(f => /Full risk register|Indicative financial terms|Sustainability and exit/.test(f.label)).every(f => f.status === 'held')).toBe(true);
  });
});
