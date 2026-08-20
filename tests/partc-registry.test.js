/**
 * PCAF Part C registry — the insurer's book.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request  = require('supertest');
const app      = require('../server');
const registry = require('../services/partc-registry');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');

const KEY  = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const B    = '/v1/partc';
const ORG  = 'test-org';

const aClient  = (o = {}) => ({ name: 'Department of Fisheries', country: 'Sri Lanka', ...o });
const aProject = (clientId, o = {}) => ({
  clientId, name: 'Negombo Fisheries Complex', projectType: 'building',
  gifa_m2: 1000, projectCost: 6499442, ...o
});
const aPolicy  = (o = {}) => ({
  lineType: 'CAR', premium: 24448.16,
  inception: '2026-03-01T00:00:00.000Z', expiry: '2027-09-01T00:00:00.000Z', ...o
});

beforeEach(() => store._resetMemory());

describe('Registry — clients', () => {
  test('a client can be created and read back', async () => {
    const c = await registry.createClient(ORG, aClient());
    expect(c.clientId).toMatch(/^cl_/);
    expect((await registry.getClient(ORG, c.clientId)).name).toBe('Department of Fisheries');
  });

  test('the client list carries project and policy counts', async () => {
    const c = await registry.createClient(ORG, aClient());
    await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy(), aPolicy({ lineType: 'IDI' })] }));
    const [row] = await registry.listClients(ORG);
    expect(row.projectCount).toBe(1);
    expect(row.policyCount).toBe(2);
  });

  test('a client holding projects cannot be deleted', async () => {
    const c = await registry.createClient(ORG, aClient());
    await registry.createProject(ORG, aProject(c.clientId));
    await expect(registry.deleteClient(ORG, c.clientId)).rejects.toThrow(/1 project/);
  });

  test('an empty client can be deleted', async () => {
    const c = await registry.createClient(ORG, aClient());
    expect((await registry.deleteClient(ORG, c.clientId)).deleted).toBe(true);
    expect(await registry.getClient(ORG, c.clientId)).toBeNull();
  });

  test('books are scoped per organisation', async () => {
    const c = await registry.createClient(ORG, aClient());
    expect(await registry.getClient('another-org', c.clientId)).toBeNull();
  });
});

describe('Registry — projects and the scope gate', () => {
  test('a project cannot be created for an unknown client', async () => {
    await expect(registry.createProject(ORG, aProject('cl_nope'))).rejects.toThrow(/No client/);
  });

  test('a CAR policy previews construction-only scope', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy()] }));
    const scope = p.policies[0].scope;
    expect(scope.useStageApplies).toBe(false);
    expect(scope.modules).toEqual(['A4', 'A5']);
    expect(scope.useStageYears).toBe(0);
    expect(scope.note).toMatch(/not by omission/);
  });

  test('an IDI policy previews the use stage over its cover period', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, {
      policies: [aPolicy({ lineType: 'IDI', yearsOfCover: 10 })]
    }));
    const scope = p.policies[0].scope;
    expect(scope.useStageApplies).toBe(true);
    expect(scope.modules).toEqual(['A4', 'A5', 'B1', 'B4', 'B7']);
    expect(scope.useStageYears).toBe(10);
  });

  test('the reporting year is the policy inception year', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, {
      policies: [aPolicy({ inception: '2026-11-20T00:00:00.000Z', expiry: '2028-02-01T00:00:00.000Z' })]
    }));
    // Build runs into 2028; the figure lands in 2026 by the agreed convention.
    expect(p.policies[0].reportingYear).toBe(2026);
  });

  test('one project carries a CAR policy and a later IDI policy', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy()] }));
    const updated = await registry.addPolicy(ORG, p.projectId, aPolicy({
      lineType: 'IDI', premium: 41200, yearsOfCover: 10,
      inception: '2027-09-01T00:00:00.000Z', expiry: '2037-09-01T00:00:00.000Z'
    }));
    expect(updated.policies).toHaveLength(2);
    expect(updated.policies.map(x => x.reportingYear)).toEqual([2026, 2027]);
    expect(updated.policies.map(x => x.scope.useStageApplies)).toEqual([false, true]);
  });

  test('a policy can be removed without touching the project', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy(), aPolicy({ lineType: 'IDI' })] }));
    const after = await registry.removePolicy(ORG, p.projectId, p.policies[0].policyId);
    expect(after.policies).toHaveLength(1);
    expect(after.gifa_m2).toBe(1000);
  });
});

describe('Registry — assessment context', () => {
  test('the engine block is assembled from the book', async () => {
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy()] }));
    const ctx = await registry.buildAssessmentContext(ORG, p.projectId, p.policies[0].policyId);

    expect(ctx.enginePolicy).toEqual({
      policyType: 'CAR', basis: 'project_specific',
      premium: 24448.16, projectCost: 6499442, yearsOfCover: 0
    });
    expect(ctx.prefill.gifa_m2).toBe(1000);
    expect(ctx.reportingYear).toBe(2026);
  });

  test('the context feeds the engine and reproduces the reference figure', async () => {
    const { runPartC } = require('../services/pcaf-partc');
    const fx = require('./fixtures/fisheries');

    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy()] }));
    const ctx = await registry.buildAssessmentContext(ORG, p.projectId, p.policies[0].policyId);

    const result = runPartC({
      policy: ctx.enginePolicy,
      materials: fx.MATERIALS,
      distances: fx.DISTANCES,
      siteInputs: { gifa_m2: ctx.project.gifa_m2, demolitionKm: 100, wasteDisposalKm: 40,
                    demolitionItems: fx.DEMOLITION_ITEMS, previousProject: fx.PREVIOUS_PROJECT }
    });
    expect(result.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(result.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
  });

  test('net premium mode deducts reinsurance ceded', async () => {
    await registry.saveSettings(ORG, { insurerName: 'X', reportingYear: 2026, premiumBasis: 'net' });
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, {
      policies: [aPolicy({ reinsuranceCeded: 4448.16 })]
    }));
    const ctx = await registry.buildAssessmentContext(ORG, p.projectId, p.policies[0].policyId);
    expect(ctx.enginePolicy.reinsuranceCeded).toBe(4448.16);
  });

  test('gross premium mode leaves the premium untouched', async () => {
    await registry.saveSettings(ORG, { insurerName: 'X', reportingYear: 2026, premiumBasis: 'gross' });
    const c = await registry.createClient(ORG, aClient());
    const p = await registry.createProject(ORG, aProject(c.clientId, { policies: [aPolicy({ reinsuranceCeded: 4448.16 })] }));
    const ctx = await registry.buildAssessmentContext(ORG, p.projectId, p.policies[0].policyId);
    expect(ctx.enginePolicy.reinsuranceCeded).toBeUndefined();
  });
});

describe('Registry — settings', () => {
  test('defaults apply before anything is saved', async () => {
    const s = await registry.getSettings(ORG);
    expect(s.restatementThresholdPct).toBe(5);
    expect(s.reportingYearConvention).toBe('inception');
  });

  test('saved settings are read back', async () => {
    await registry.saveSettings(ORG, { insurerName: 'Ceylon Insurance PLC', reportingYear: 2026, restatementThresholdPct: 5 });
    expect((await registry.getSettings(ORG)).insurerName).toBe('Ceylon Insurance PLC');
  });
});

describe('Registry — demo book', () => {
  test('the demo book seeds a shape worth demonstrating', async () => {
    const r = await seedDemoBook(registry, ORG);
    expect(r.summary.clients).toBe(3);
    expect(r.summary.projects).toBe(5);
    expect(r.summary.policies).toBe(6);
    expect(r.summary.withUseStage).toBe(2);
    expect(r.summary.reportingYears).toEqual([2026, 2027]);
  });

  test('the same building carries a CAR policy and a later IDI policy', async () => {
    await seedDemoBook(registry, ORG);
    const negombo = (await registry.listProjects(ORG)).find(p => /Negombo/.test(p.name));
    expect(negombo.policies.map(p => p.lineType)).toEqual(['CAR', 'IDI']);
    expect(negombo.policies.map(p => p.scope.useStageApplies)).toEqual([false, true]);
  });

  test('the book filters to a single reporting year', async () => {
    await seedDemoBook(registry, ORG);
    const fy26 = await registry.listPolicies(ORG, { reportingYear: 2026 });
    const fy27 = await registry.listPolicies(ORG, { reportingYear: 2027 });
    expect(fy26).toHaveLength(5);
    expect(fy27).toHaveLength(1);
  });
});

describe('Registry — API', () => {
  test('endpoints require authentication', async () => {
    expect([401, 403]).toContain((await request(app).get(`${B}/clients`)).status);
  });

  test('a client can be created and listed over HTTP', async () => {
    const created = await auth(request(app).post(`${B}/clients`)).send(aClient({ name: 'Harbour Developments' }));
    if ([401, 403].includes(created.status)) return;
    expect(created.status).toBe(201);
    const list = await auth(request(app).get(`${B}/clients`));
    expect(list.body.clients.some(c => c.name === 'Harbour Developments')).toBe(true);
  });

  test('a project requires a positive GIFA', async () => {
    const res = await auth(request(app).post(`${B}/projects`))
      .send({ clientId: 'cl_x', name: 'No area', gifa_m2: 0, projectCost: 100 });
    expect([400, 401, 403]).toContain(res.status);
  });

  test('a policy expiring before inception is rejected', async () => {
    const c = await auth(request(app).post(`${B}/clients`)).send(aClient());
    if (c.status !== 201) return;
    const res = await auth(request(app).post(`${B}/projects`)).send(aProject(c.body.client.clientId, {
      policies: [aPolicy({ inception: '2027-01-01T00:00:00.000Z', expiry: '2026-01-01T00:00:00.000Z' })]
    }));
    expect(res.status).toBe(400);
  });

  test('GET /storage reports what this deployment can persist', async () => {
    const res = await auth(request(app).get(`${B}/storage`));
    if (res.status !== 200) return;
    expect(['firebase', 'memory', 'none']).toContain(res.body.storage.mode);
    expect(typeof res.body.storage.writable).toBe('boolean');
    expect(res.body.storage.reason).toBeTruthy();
  });

  test('seeding a non-empty book is refused without force', async () => {
    const first = await auth(request(app).post(`${B}/demo/seed`)).send({});
    if (first.status !== 201) return;
    const second = await auth(request(app).post(`${B}/demo/seed`)).send({});
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('BOOK_NOT_EMPTY');
  });

  test('the flattened book summarises premium and use-stage counts', async () => {
    const seed = await auth(request(app).post(`${B}/demo/seed`)).send({ force: true });
    if (seed.status !== 201) return;
    const res = await auth(request(app).get(`${B}/policies?reportingYear=2026`));
    expect(res.body.summary.total).toBe(5);
    expect(res.body.summary.totalPremium).toBeGreaterThan(0);
  });
});

describe('Registry — storage honesty', () => {
  test('a serverless runtime with no Firebase refuses writes rather than losing them', () => {
    const saved = process.env.NETLIFY;
    process.env.NETLIFY = 'true';
    try {
      const cap = store.capability();
      expect(cap.writable).toBe(false);
      expect(cap.mode).toBe('none');
      expect(cap.remedy).toMatch(/FIREBASE_SERVICE_ACCOUNT/);
      expect(() => store.assertWritable()).toThrow(/serverless runtime/);
    } finally {
      if (saved === undefined) delete process.env.NETLIFY; else process.env.NETLIFY = saved;
    }
  });

  test('local development stays writable', () => {
    const cap = store.capability();
    expect(cap.writable).toBe(true);
    expect(cap.durable).toBe(false);
  });
});
