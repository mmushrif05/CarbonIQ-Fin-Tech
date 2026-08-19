/**
 * PCAF Part C — registers, reports, form and learning store.
 */

const { runPartC } = require('../services/pcaf-partc');
const { buildRegisters } = require('../services/partc-registers');
const { buildPartCReport, buildPartCDOCX } = require('../services/partc-reports');
const { buildForm, formAnswersToEngineInput } = require('../services/agents/partc/form');
const { buildLearningRecords, aggregateResearchPriority } = require('../services/learning-store');
const { containsForbiddenLanguage } = require('../services/pcaf-partc/data-quality');
const factors = require('../services/pcaf-partc/factors');
const fx = require('./fixtures/fisheries');

describe('Part C — factor store', () => {
  test('every factor row carries a tier and a reference', () => {
    const tables = factors.allTables();
    for (const [name, t] of Object.entries(tables)) {
      for (const key of Object.keys(t.rows || {})) {
        const f = factors.lookup(name, key);
        expect(f.tier).toBeTruthy();
        expect(f.reference).toBeTruthy();
      }
    }
  });

  test('a missing row falls back silently and flags the gap', () => {
    const f = factors.wasteRate('Something not in Table 18');
    expect(f.value).toBe(0.05);
    expect(f.fallback).toBe(true);
    expect(f.gap).toBeTruthy();
  });

  test('runtime overrides win and are marked Local tier', () => {
    factors.setOverrides({ 'densities.rubble_masonry': { value: 2450, reference: 'Quarry test certificate' } });
    const f = factors.density('rubble_masonry');
    expect(f.value).toBe(2450);
    expect(f.tier).toBe('Local');
    expect(f.overridden).toBe(true);
    factors.setOverrides({});
  });
});

describe('Part C — registers', () => {
  const result = runPartC(fx.defaultInput());
  const reg = buildRegisters(result);

  test('all three registers are produced with badge counts', () => {
    expect(reg.assumptions.annex).toBe('A');
    expect(reg.dataGaps.annex).toBe('B');
    expect(reg.auditTrail.annex).toBe('C');
    expect(reg.badges.assumptions).toBeGreaterThan(0);
    expect(reg.badges.auditTrail).toBeGreaterThan(0);
  });

  test('assumptions are ordered most material first', () => {
    const sev = reg.assumptions.entries.map(e => e.severity);
    const rank = { material: 0, notable: 1, info: 2 };
    for (let i = 1; i < sev.length; i++) {
      expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
    }
  });

  test('plausibility findings are recorded without interrupting', () => {
    const fromChecks = reg.assumptions.entries.filter(e => e.source === 'plausibility check');
    expect(fromChecks.length).toBeGreaterThan(0);
    expect(fromChecks.every(f => f.note && /without interrupting/.test(f.note))).toBe(true);
  });

  test('the gap ledger ranks research priority by emissions flowing through each factor', () => {
    expect(reg.dataGaps.researchPriority.length).toBeGreaterThan(0);
    expect(reg.dataGaps.researchPriority[0].rank).toBe(1);
    // On the default path the RICS site-energy constant dominates.
    expect(reg.dataGaps.researchPriority[0].factorKey).toContain('ricsSiteEnergy');
  });

  test('every audit trail entry carries an equation', () => {
    expect(reg.auditTrail.entries.every(e => typeof e.equation === 'string' && e.equation.length > 0)).toBe(true);
  });
});

describe('Part C — disclosure language guard', () => {
  test('the disclosure note claims conformance, never endorsement', () => {
    const r = runPartC(fx.defaultInput());
    expect(r.disclosureNote).toMatch(/in conformance with/i);
    expect(containsForbiddenLanguage(r.disclosureNote)).toEqual([]);
  });

  test('endorsement language is detected', () => {
    expect(containsForbiddenLanguage('This result is PCAF approved.').length).toBeGreaterThan(0);
    expect(containsForbiddenLanguage('It is not approved by PCAF.')).toEqual([]);
  });

  test('a report containing endorsement language is blocked', () => {
    const r = runPartC(fx.defaultInput());
    const reg = buildRegisters(r);
    expect(() => buildPartCReport({
      result: r, registers: reg, memo: 'This assessment is PCAF endorsed.', meta: {}
    })).toThrow(/endorsement language/i);
  });
});

describe('Part C — reports', () => {
  const r = runPartC(fx.idiInput());
  const reg = buildRegisters(r);

  test('report carries the main body plus annexes A, B and C', () => {
    const rep = buildPartCReport({ result: r, registers: reg, meta: { projectName: 'Fisheries' } });
    expect(rep.annexes.A).toBeTruthy();
    expect(rep.annexes.B).toBeTruthy();
    expect(rep.annexes.C).toBeTruthy();
    expect(rep.annexes.D).toBeNull();
  });

  test('annex D appears only when the whole-life annex is requested', () => {
    const rep = buildPartCReport({ result: r, registers: reg, meta: {}, includeWlcaAnnex: true });
    expect(rep.annexes.D.title).toMatch(/Beyond-PCAF/);
    expect(rep.annexes.D.note).toMatch(/NOT part of the PCAF figure/i);
  });

  test('construction and use-stage stay separate in the report object', () => {
    const rep = buildPartCReport({ result: r, registers: reg, meta: {} });
    expect(rep.result.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(rep.result.useStage_kgCO2e).toBeCloseTo(34169.09, 1);
    expect(rep.result.scopeWarning).toMatch(/never summed/i);
  });

  test('a Word document is produced', async () => {
    const rep = buildPartCReport({ result: r, registers: reg, meta: {}, includeWlcaAnnex: true });
    const buf = await buildPartCDOCX(rep);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(5000);
  });
});

describe('Part C — client form', () => {
  test('a CAR policy hides all three use-stage sections', () => {
    const form = buildForm({ policy: { policyType: 'CAR' }, materials: fx.MATERIALS });
    const hidden = form.sections.filter(s => !s.visible).map(s => s.id);
    expect(hidden).toEqual(expect.arrayContaining(['refrigerant', 'water', 'beyondPcaf']));
    expect(form.useStageApplies).toBe(false);
  });

  test('an IDI policy shows every section', () => {
    const form = buildForm({ policy: { policyType: 'IDI' }, materials: fx.MATERIALS });
    expect(form.sections.every(s => s.visible)).toBe(true);
  });

  test('material rows come from the BOQ, not a fixed list', () => {
    const form = buildForm({ policy: { policyType: 'CAR' }, materials: fx.MATERIALS.slice(0, 3) });
    expect(form.summary.materialRows).toBe(3);
  });

  test('emission factors are hidden constants carrying tier and reference', () => {
    const form = buildForm({ policy: { policyType: 'CAR' }, materials: [] });
    const construction = form.sections.find(s => s.id === 'construction');
    const diesel = construction.constants.find(c => c.key === 'dieselEF');
    expect(diesel.visibility).toBe('hidden');
    expect(diesel.value).toBe(2.68);
    expect(diesel.reference).toBeTruthy();
  });

  test('form answers convert into a computable engine input', () => {
    const input = formAnswersToEngineInput({
      policy: { policyType: 'IDI', basis: 'project_specific', premium: 24448.16, projectCost: 6499442 },
      materials: fx.MATERIALS,
      demolitionItems: fx.DEMOLITION_ITEMS,
      answers: {
        policyType: 'IDI', yearsOfCover: 10, gifa_m2: 1000,
        demolitionKm: 100, wasteDisposalKm: 40,
        distances: Object.fromEntries(Object.entries(fx.DISTANCES)
          .map(([k, v]) => [k, { road_km: v.road || 0, sea_km: v.sea || 0, rail_km: v.rail || 0 }])),
        previousProject: fx.PREVIOUS_PROJECT,
        equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A'
      }
    });
    const r = runPartC(input);
    expect(r.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(r.modules.b1.value).toBe(28860);
  });
});

describe('Part C — learning store', () => {
  test('a completed assessment yields all four record types', () => {
    const r = runPartC(fx.defaultInput());
    const rec = buildLearningRecords({
      runId: 'run1', result: r, materials: fx.MATERIALS,
      context: { region: 'Sri Lanka', projectType: 'fisheries' },
      overrides: { 'densities.rubble_masonry': { value: 2450, reference: 'Quarry certificate' } }
    });
    expect(rec.perM2Factor.perM2_kgCO2e).toBeCloseTo(41.26, 2);
    expect(rec.mappingMemory).toHaveLength(10);
    expect(rec.overrides).toHaveLength(1);
    expect(rec.overrides[0].candidateLocalFactor).toBe(true);
    expect(rec.gapContributions.length).toBeGreaterThan(0);
  });

  test('gap contributions aggregate into a ranked research list', () => {
    const r = runPartC(fx.defaultInput());
    const rec = buildLearningRecords({ runId: 'r', result: r, materials: fx.MATERIALS });
    const ranked = aggregateResearchPriority([rec, rec, rec]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].occurrences).toBe(3);
    expect(ranked[0].factorKey).toContain('ricsSiteEnergy');
  });
});

describe('Part C — separation from the lending PCAF service', () => {
  test('the Part C engine does not import the lending PCAF service', () => {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '..', 'services', 'pcaf-partc');
    for (const file of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/require\(['"]\.\.\/pcaf['"]\)/);
    }
  });

  test('the lending PCAF service still works unchanged', () => {
    const { generatePCAFOutput } = require('../services/pcaf');
    const out = generatePCAFOutput({
      emissionSummary: { totalBaseline_tCO2e: 1000, totalMaterials: 10, unmatchedItems: 0, conversionFailures: 0 },
      materials80Pct: { items: [{ inTop80Pct: true, factorSource: 'ICE' }], totalItems: 10 },
      loanAmount: 50, projectValue: 100
    });
    expect(out.financedEmissions.attributionFactor).toBe(0.5);
    expect(out.scope).toMatch(/A1-A3/);
  });
});
