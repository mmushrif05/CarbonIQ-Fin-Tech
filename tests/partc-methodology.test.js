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

describe('The policy gate is demonstrated, not asserted', () => {
  const gate = () => buildMethodology().policyGate;

  test('construction is identical under CAR and IDI, and says why', () => {
    const row = gate().rows.find(r => /Construction/.test(r.measure));
    expect(row.identical).toBe(true);
    // The point: identical here is the correct answer, and the document
    // must say so rather than leave a reader to suspect a fault.
    expect(row.note).toMatch(/do not change with the policy/);
  });

  test('the use stage is what the cover type actually decides', () => {
    const row = gate().rows.find(r => /Use stage total/.test(r.measure));
    expect(row.CAR).toBe(0);
    expect(row.IDI).toBeGreaterThan(0);
    expect(row.identical).toBe(false);
  });

  test('B1 and B7 are zero under CAR by rule', () => {
    const g = gate();
    for (const m of ['B1 refrigerant', 'B7 operational water']) {
      const row = g.rows.find(r => r.measure.startsWith(m));
      expect(row.CAR).toBe(0);
      expect(row.IDI).toBeGreaterThan(0);
    }
  });

  test('B4 zero on a ten-year cover is explained, not left bare', () => {
    const row = gate().rows.find(r => /B4/.test(r.measure));
    expect(row.CAR).toBe(0);
    expect(row.IDI).toBe(0);
    expect(row.note).toMatch(/service life exceeds the ten-year cover/);
  });

  test('a cover period entered against a CAR policy is refused by the gate', () => {
    const o = gate().overrideTest;
    expect(o.useStageYears).toBe(0);
    expect(o.useStage_kgCO2e).toBe(0);
    expect(o.conclusion).toMatch(/scope rule and not a preference/);
  });

  test('the use stage accrues with the cover period', () => {
    const rows = gate().coverSensitivity;
    for (const r of rows) expect(r.gateYears).toBe(r.yearsOfCover);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].b1).toBeGreaterThan(rows[i - 1].b1);
      expect(rows[i].b7).toBeGreaterThan(rows[i - 1].b7);
      expect(rows[i].useStage).toBeGreaterThan(rows[i - 1].useStage);
    }
  });

  test('B4 steps in only once the cover outlives the plant', () => {
    const rows = gate().coverSensitivity;
    const at = y => rows.find(r => r.yearsOfCover === y);
    // A 20-year HVAC life: no replacement inside 20 years, one inside 25.
    expect(at(20).b4).toBe(0);
    expect(at(25).b4).toBeGreaterThan(0);
    expect(at(45).b4).toBeCloseTo(at(25).b4 * 2, 0);
  });

  test('the attribution factor being identical is explained by the design', () => {
    const row = gate().rows.find(r => /Attribution/.test(r.measure));
    expect(row.identical).toBe(true);
    expect(row.note).toMatch(/same premium and project cost/);
  });
});

describe('The factor evidence is complete', () => {
  const fs = require('fs');
  const path = require('path');

  test('every factor table in the store appears in the evidence', () => {
    const dir = path.join(__dirname, '..', 'data', 'factors');
    const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
    const shown = new Set(buildMethodology().factorStore.rows.map(r => r.table));
    // A table whose rows inherit tier and reference from the table header
    // was previously skipped entirely, taking the IPCC GWPs and the RICS
    // waste rates out of the evidence without anything failing.
    for (const t of onDisk) expect(shown.has(t)).toBe(true);
    expect(shown.size).toBe(onDisk.length);
  });

  test('rows inherit the tier and source declared on their table', () => {
    const rows = buildMethodology().factorStore.rows;
    const gwp = rows.find(r => r.key.includes('R-410A'));
    expect(gwp).toBeDefined();
    expect(gwp.value).toBe(1924);
    expect(gwp.tier).toBe('Global');
    expect(gwp.reference).toMatch(/IPCC AR5/);

    const waste = rows.find(r => r.table === 'waste-rates-rics-t18' && r.reference);
    expect(waste.reference).toMatch(/RICS/);
  });

  test('every row carries a tier and a value', () => {
    for (const r of buildMethodology().factorStore.rows) {
      expect(r.tier).toBeTruthy();
      expect(r.value).toBeDefined();
      expect(r.table).toBeTruthy();
    }
  });

  test('open research items are read from the store, not listed by hand', () => {
    const { openItems } = buildMethodology();
    expect(openItems.total).toBeGreaterThan(4);
    const text = JSON.stringify(openItems.entries);
    // Each of these is an honesty flag written into the factor data itself.
    expect(text).toMatch(/Sri Lanka grid placeholder/);
    expect(text).toMatch(/LITERATURE ASSUMPTION/);
    expect(text).toMatch(/DISABLED/);
    for (const e of openItems.entries) {
      expect(e.why).toBeTruthy();
      expect(e.resolution).toBeTruthy();
    }
  });
});

describe('The interactive controls read engine executions', () => {
  const sc = () => buildMethodology().scenarios;

  test('every policy type the selector offers is a real execution', () => {
    const s = sc();
    expect(s.policies.map(p => p.policyType)).toEqual(['CAR', 'EAR', 'IDI', 'Property']);
    for (const p of s.policies) expect(typeof p.construction).toBe('number');
  });

  test('construction-only cover admits no use stage; cover into occupation does', () => {
    const by = Object.fromEntries(sc().policies.map(p => [p.policyType, p]));
    expect(by.CAR.gateYears).toBe(0);
    expect(by.EAR.gateYears).toBe(0);
    expect(by.IDI.gateYears).toBeGreaterThan(0);
    expect(by.Property.gateYears).toBeGreaterThan(0);
    expect(by.CAR.useStage).toBe(0);
    expect(by.IDI.useStage).toBeGreaterThan(0);
  });

  test('the slider curve is one execution per year, not an interpolation', () => {
    const s = sc();
    expect(s.curve).toHaveLength(s.maxYears);
    s.curve.forEach((c, i) => {
      expect(c.years).toBe(i + 1);
      expect(c.gateYears).toBe(c.years);
    });
    expect(s.executions).toBe(s.policies.length + s.curve.length);
  });

  test('B1 and B7 accrue every year across the whole curve', () => {
    const c = sc().curve;
    for (let i = 1; i < c.length; i++) {
      expect(c[i].b1).toBeGreaterThan(c[i - 1].b1);
      expect(c[i].b7).toBeGreaterThan(c[i - 1].b7);
    }
  });

  test('B4 steps are located at the years the engine actually stepped', () => {
    const s = sc();
    expect(s.b4Steps.length).toBeGreaterThanOrEqual(1);
    for (const step of s.b4Steps) {
      const at = s.curve.find(c => c.years === step.years);
      const before = s.curve.find(c => c.years === step.years - 1);
      // A marker must sit on a real discontinuity, never a decorative one.
      expect(at.b4).toBeGreaterThan(before.b4);
      expect(at.b4).toBe(step.to);
      expect(before.b4).toBe(step.from);
    }
  });

  test('construction never moves with the cover period', () => {
    const c = sc().curve;
    const first = c[0].construction;
    for (const p of c) expect(p.construction).toBe(first);
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
