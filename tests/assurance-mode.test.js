// @ts-check
/**
 * Assurance mode — what this deployment may claim about its own figures.
 *
 * Two modes, and the choice is the tool provider's. `self_declared` says on
 * the face of every document that the figures rest on the entity's own
 * baseline and values and that nobody has confirmed them. `verified` says the
 * governed values are released and the entity has recorded who assured them —
 * and it is a *request*, not an assertion: where either condition is unmet the
 * position resolves back to self-declared and prints the reason.
 *
 * The failure this exists to prevent is a document that says nothing about its
 * own standing, which a reader takes for the stronger claim.
 */

'use strict';

const { resolve, faceStatement, MODES, DEFAULT_MODE } = require('../src/shared/assurance-mode');
const mode = require('../src/platform/reporting/assurance-mode');
const { api, auth } = require('./helpers/api');
const { issueKey } = require('./helpers/key');
const { testOnPostgres } = require('./helpers/store-mode');
const fx = require('../data/partc/fisheries-reference');

const EVIDENCE_MET = { baselinesReleased: true, assuranceDeclared: true, provisionalBaselines: [] };

describe('the rule', () => {
  test('there are two modes and the default is the honest one', () => {
    expect(MODES).toEqual(['self_declared', 'verified']);
    expect(DEFAULT_MODE).toBe('self_declared');
  });

  test('a document built with no position at all is self-declared, not silent', () => {
    const r = resolve({});
    expect(r.mode).toBe('self_declared');
    expect(r.statement).toMatch(/rest on the reporting entity/i);
    expect(r.statement).toMatch(/Neither the tool provider nor Datum Solutions has confirmed/i);
  });

  test('verified is granted only when both conditions are met', () => {
    const r = resolve({ requested: 'verified', evidence: EVIDENCE_MET });
    expect(r.mode).toBe('verified');
    expect(r.downgraded).toBe(false);
    expect(r.unmet).toEqual([]);
  });

  test('a provisional governed value downgrades verified, and names which one', () => {
    const r = resolve({ requested: 'verified', evidence: {
      baselinesReleased: false, provisionalBaselines: ['taxonomy.intensityBands'], assuranceDeclared: true } });
    expect(r.mode).toBe('self_declared');
    expect(r.downgraded).toBe(true);
    expect(r.unmet.map(u => u.id)).toEqual(['baselines_released']);
    expect(faceStatement(r)).toContain('taxonomy.intensityBands');
  });

  test('an undeclared assurance position downgrades verified', () => {
    const r = resolve({ requested: 'verified', evidence: {
      baselinesReleased: true, provisionalBaselines: [], assuranceDeclared: false } });
    expect(r.mode).toBe('self_declared');
    expect(r.unmet.map(u => u.id)).toEqual(['assurance_declared']);
  });

  test('a downgraded document says it was configured otherwise, and why', () => {
    const r = resolve({ requested: 'verified', evidence: { baselinesReleased: false, assuranceDeclared: false } });
    const face = faceStatement(r);
    expect(face).toContain('configured as verified');
    expect(face).toContain('reported self-declared because');
    /* Both reasons, not the first one only — a reader who fixes one and finds
       a second waiting has been told half the answer. */
    expect(face).toMatch(/provisional set this tool ships with/);
    expect(face).toMatch(/has not recorded who assured these figures/);
  });

  test('an unrecognised mode falls back rather than being honoured', () => {
    expect(resolve({ requested: 'assured-by-us' }).mode).toBe('self_declared');
  });
});

describe('the evidence', () => {
  test('a metric still on the shipped seed is provisional', () => {
    const e = mode.evidenceFrom({
      baselines: { 'taxonomy.intensityBands': { scope: 'seed', provisional: true } },
      declaration: {},
    });
    expect(e.baselinesReleased).toBe(false);
    expect(e.provisionalBaselines).toEqual(['taxonomy.intensityBands']);
  });

  test('"not declared" is not assurance, and neither is "not assured"', () => {
    for (const status of ['not_declared', 'not_assured']) {
      expect(mode.evidenceFrom({ baselines: {}, declaration: { scopes: { s1: { status } } } })
        .assuranceDeclared).toBe(false);
    }
    expect(mode.evidenceFrom({ baselines: {}, declaration: { scopes: { s1: { status: 'assured' } } } })
      .assuranceDeclared).toBe(true);
  });

  test('no baselines at all is not "every baseline released"', () => {
    expect(mode.evidenceFrom({ baselines: {}, declaration: {} }).baselinesReleased).toBe(false);
  });
});

describe('the documents print it on the face', () => {
  const { assessmentFacts } = require('../src/domains/pcaf-part-c/reporting/partc-report-standard');
  const { runPartC } = require('../src/domains/pcaf-part-c/domain');
  const { buildRegisters } = require('../src/domains/pcaf-part-c/application/partc-registers');
  const { buildStandardModel } = require('../src/domains/pcaf-part-c/reporting/partc-report-standard');

  const INPUT = {
    policy: fx.POLICY_CAR,
    materials: fx.MATERIALS,
    distances: fx.DISTANCES,
    siteInputs: { gifa_m2: 1000 },
    useStage: {},
  };

  test('a report given no position still carries the self-declared sentence', () => {
    const result = runPartC(INPUT);
    const model = buildStandardModel(assessmentFacts({ result, registers: buildRegisters(result) }));
    expect(model.cover.assuranceMode).toBe('self_declared');
    expect(model.cover.assuranceStatement).toMatch(/Neither the tool provider nor Datum Solutions/);
  });

  test('a verified position reaches the cover', () => {
    const result = runPartC(INPUT);
    const position = { ...resolve({ requested: 'verified', evidence: EVIDENCE_MET }) };
    const model = buildStandardModel(assessmentFacts({
      result, registers: buildRegisters(result), assurance: position }));
    expect(model.cover.assuranceMode).toBe('verified');
    expect(model.cover.assuranceLabel).toBe('Verified');
  });
});

describe('the route', () => {
  test('the position is readable, with the modes and what verified requires', async () => {
    const res = await auth(api().get('/v1/assurance/mode'));
    expect(res.status).toBe(200);
    expect(MODES).toContain(res.body.mode);
    expect(res.body.statement).toEqual(expect.any(String));
    expect(res.body.modes.map(m => m.id)).toEqual(['self_declared', 'verified']);
    expect(res.body.requires.map(r => r.id))
      .toEqual(['baselines_released', 'assurance_declared']);
  });

  test('a shipped deployment reads self-declared — nothing is released and nothing is assured', async () => {
    const res = await auth(api().get('/v1/assurance/mode'));
    expect(res.body.mode).toBe('self_declared');
  });

  /*
   * The scope is the whole point. A reporting entity that could set its own
   * mode to `verified` would be self-declaring by another name, so the write
   * needs `admin` — which the dashboard key deliberately does not hold.
   */
  test('a client-scoped key cannot set the mode', async () => {
    const res = await auth(api().put('/v1/assurance/mode')).send({ mode: 'verified' });
    expect(res.status).toBe(403);
    expect(res.body.code || res.body.error).toBe('SCOPE_REQUIRED');
    expect(JSON.stringify(res.body)).toContain('admin');
  });

  test('a mode outside the vocabulary is refused', async () => {
    const res = await auth(api().put('/v1/assurance/mode')).send({ mode: 'endorsed' });
    expect([400, 403]).toContain(res.status);
  });

  testOnPostgres('an administrator sets it, and the read comes back downgraded with the reasons', async () => {
    const { key, orgId } = await issueKey({
      orgId: `assurance-${Date.now()}`, keyName: 'assurance admin',
      scopes: ['read', 'write', 'lock', 'assess', 'admin'],
    });
    const put = await api().put('/v1/assurance/mode').set('x-api-key', key).send({ mode: 'verified' });
    expect(put.status).toBe(200);
    expect(put.body.mode.mode).toBe('verified');

    expect((await mode.requestedFor(orgId)).requested).toBe('verified');

    const get = await api().get('/v1/assurance/mode').set('x-api-key', key);
    /* Asked for verified, and told plainly that it is not granted and why —
       rather than the request being honoured on a deployment that has released
       no baseline and recorded no assurer. */
    expect(get.body.requested).toBe('verified');
    expect(get.body.mode).toBe('self_declared');
    expect(get.body.downgraded).toBe(true);
    expect(get.body.unmet.length).toBeGreaterThan(0);
    expect(get.body.statement).toContain('configured as verified');
  });

  /*
   * The per-assessment report and the annual disclosure resolve the position
   * from one function, so the two documents cannot state different postures
   * for one book. This drives the report path end to end.
   */
  test('the per-assessment report carries the position through the route', async () => {
    const { reportFor } = require('../src/domains/pcaf-part-c/interface/routes/pcaf-partc');
    const { report } = await reportFor('ui', {
      projectName: 'Assurance mode journey',
      policy: fx.POLICY_CAR,
      materials: fx.MATERIALS,
      distances: fx.DISTANCES,
      siteInputs: { gifa_m2: 1000 },
      format: 'json',
    });
    /* The JSON an API caller receives is unchanged — the statement belongs on
       the document's face, not in the payload — so the proof is the model the
       renderers are built from. */
    const { buildStandardModel, assessmentFacts } =
      require('../src/domains/pcaf-part-c/reporting/partc-report-standard');
    const src = report._source;
    const model = buildStandardModel(assessmentFacts({
      result: src.result, registers: src.registers, settings: src.settings,
      meta: src.meta, memo: src.memo, assurance: src.assurance }));
    expect(src.assurance).toBeTruthy();
    expect(src.assurance.mode).toBe('self_declared');
    expect(model.cover.assuranceStatement).toBe(src.assurance.statement);
  });
});
