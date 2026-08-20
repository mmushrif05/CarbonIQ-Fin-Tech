/**
 * PCAF Part C — the methodology statement.
 *
 * The property under test is that the document is generated from the engine
 * rather than written beside it: if the engine stops executing an equation,
 * the methodology must stop claiming it.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app     = require('../server');
const { buildMethodology } = require('../services/partc-methodology');
const { buildMethodologyPDF, buildMethodologyDOCX } = require('../services/partc-methodology-doc');
const { runPartC }       = require('../services/pcaf-partc');
const { buildRegisters } = require('../services/partc-registers');
const fx = require('./fixtures/fisheries');

const auth = req => req.set('x-api-key', process.env.UI_API_KEY);

describe('Methodology is generated, not narrated', () => {
  test('every documented equation was actually executed by the engine', () => {
    const m = buildMethodology();
    const executed = new Set(
      buildRegisters(runPartC(fx.workbookInput())).auditTrail.entries
        .map(e => e.equation).filter(Boolean)
    );
    const documented = m.calculationChain.flatMap(c => c.equations);

    expect(documented.length).toBeGreaterThan(0);
    for (const eq of documented) expect(executed.has(eq)).toBe(true);
  });

  test('the step count reported equals the trace it came from', () => {
    const m = buildMethodology();
    const steps = m.calculationChain.reduce((n, c) => n + c.stepCount, 0);
    expect(steps).toBe(m.provenance.auditSteps);
  });

  test('the worked example reproduces the reference figure', () => {
    const m = buildMethodology();
    expect(m.workedExample.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(m.workedExample.insurerIAE_tCO2e).toBeCloseTo(0.0599, 3);
  });

  test('documenting a different assessment documents that assessment', () => {
    const result = runPartC(fx.idiInput());
    const m = buildMethodology({ reference: { result, registers: buildRegisters(result) } });
    // An IDI policy carries a use stage, so the gate reports differently.
    expect(m.workedExample.useStage_kgCO2e).toBeGreaterThan(0);
  });
});

describe('What the methodology must state', () => {
  test('the three scope tiers, with the beyond-PCAF tier excluded', () => {
    const m = buildMethodology();
    const tiers = m.scope.tiers.map(t => t.tier);
    expect(tiers).toEqual(['Mandatory', 'Optional', 'Beyond PCAF']);
    expect(m.scope.tiers[2].treatment).toMatch(/[Ee]xcluded/);
  });

  test('the policy gate is described as a rule, not an omission', () => {
    const m = buildMethodology();
    expect(m.scope.policyGate.consequence).toMatch(/by scope rule, not by omission/);
    expect(m.scope.structuralEnforcement).toMatch(/does not import/);
  });

  test('every factor carries a tier, and the source is named where known', () => {
    const m = buildMethodology();
    expect(m.factorStore.rowCount).toBeGreaterThan(0);
    for (const r of m.factorStore.rows) expect(r.tier).toBeTruthy();
    const withSource = m.factorStore.rows.filter(r => r.reference).length;
    expect(withSource).toBeGreaterThan(m.factorStore.rowCount / 2);
  });

  test('reliance on global defaults is stated rather than hidden', () => {
    const m = buildMethodology();
    if ((m.factorStore.byTier.Global || 0) > (m.factorStore.byTier.Local || 0)) {
      expect(m.factorStore.localisationNote).toMatch(/Global defaults/);
    }
  });

  test('data quality explains why aggregation is emissions-weighted', () => {
    const m = buildMethodology();
    expect(m.dataQuality.aggregation).toMatch(/Σ\(emissions × score\)/);
    expect(m.dataQuality.whyWeighted).toMatch(/simple average/i);
    expect(m.dataQuality.options.length).toBeGreaterThanOrEqual(6);
  });

  test('every conformance rule names its implementation and proving test', () => {
    const m = buildMethodology();
    expect(m.conformance.rules.length).toBeGreaterThan(0);
    for (const r of m.conformance.rules) {
      expect(r.implementation).toBeTruthy();
      expect(r.provingTest).toBeTruthy();
    }
  });

  test('limits are declared, including that this is a self-declaration', () => {
    const m = buildMethodology();
    expect(m.limits.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(m.limits)).toMatch(/does not approve, endorse or certify/);
  });

  test('an LLM is stated never to compute a disclosed figure', () => {
    const m = buildMethodology();
    expect(m.divisionOfLabour.rule).toMatch(/never computes a figure/);
    expect(m.divisionOfLabour.engine).toMatch(/no language model/i);
  });

  test('it claims conformance and never endorsement', () => {
    const m = buildMethodology();
    const prose = JSON.stringify(m);
    expect(prose).not.toMatch(/PCAF[- ](approved|endorsed|certified)/i);
    expect(m.conformance.disclaimer).toMatch(/does not approve/);
  });
});

describe('Both document formats', () => {
  test('PDF renders', async () => {
    const chunks = [];
    const doc = buildMethodologyPDF(buildMethodology());
    await new Promise((res, rej) => {
      doc.on('data', c => chunks.push(c)); doc.on('end', res); doc.on('error', rej);
    });
    const buf = Buffer.concat(chunks);
    expect(buf.length).toBeGreaterThan(10000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('Word renders', async () => {
    const buf = await buildMethodologyDOCX(buildMethodology());
    expect(buf.length).toBeGreaterThan(10000);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('Over HTTP', () => {
  test('GET /methodology returns JSON without needing an assessment first', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/methodology'));
    expect(res.status).toBe(200);
    expect(res.body.methodology.calculationChain.length).toBeGreaterThan(0);
    expect(res.body.methodology.factorStore.rowCount).toBeGreaterThan(0);
  });

  test('format=pdf and format=docx download', async () => {
    for (const [f, pattern] of [['pdf', /pdf/], ['docx', /wordprocessing/]]) {
      const res = await auth(request(app).get(`/v1/pcaf/part-c/methodology?format=${f}`))
        .buffer().parse((r, cb) => {
          const c = []; r.on('data', x => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(pattern);
      expect(res.headers['content-disposition']).toMatch(new RegExp(`methodology\\.${f}`));
    }
  });

  test('an unsupported format is refused with a remedy', async () => {
    const res = await auth(request(app).get('/v1/pcaf/part-c/methodology?format=xlsx'));
    expect(res.status).toBe(400);
    expect(res.body.remedy).toMatch(/format=/);
  });
});
