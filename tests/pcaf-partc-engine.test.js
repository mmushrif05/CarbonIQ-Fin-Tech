/**
 * PCAF Part C — Engine acceptance tests.
 *
 * These pin the engine to the Fisheries-A4-Calculator.xlsx reference
 * workbook. Where a figure deliberately differs from the workbook, the
 * reason is stated in the test.
 */

const { runPartC } = require('../services/pcaf-partc');
const { a4Total }  = require('../services/pcaf-partc/a4-transport');
const { a51Demolition, a52SiteEnergy, a53Waste } = require('../services/pcaf-partc/a5-construction');
const { attributionFactor } = require('../services/pcaf-partc/attribution');
const { useStageYears } = require('../services/pcaf-partc/policy-gate');
const { b1Refrigerant } = require('../services/pcaf-partc/b1-refrigerant');
const { b4Replacement, replacementCount } = require('../services/pcaf-partc/b4-replacement');
const { b7Water } = require('../services/pcaf-partc/b7-water');
const fx = require('./fixtures/fisheries');

describe('PCAF Part C — attribution', () => {
  test('exact ratio is carried unrounded', () => {
    const a = attributionFactor(fx.POLICY_CAR);
    expect(a.value).toBeCloseTo(0.003762, 6);
    expect(a.equation).toBe('premium / projectCost');
  });

  test('rounded basis is reproducible and records the fact', () => {
    const a = attributionFactor({ ...fx.POLICY_CAR, precision: 4 });
    expect(a.value).toBe(0.0038);
    expect(a.assumptions.some(x => x.code === 'ATTR_ROUNDED_BASIS')).toBe(true);
  });

  test('net-premium mode deducts reinsurance ceded', () => {
    const a = attributionFactor({ ...fx.POLICY_CAR, reinsuranceCeded: 4448.16 });
    expect(a.value).toBeCloseTo(20000 / 6499442, 10);
    expect(a.assumptions.some(x => x.code === 'ATTR_NET_PREMIUM')).toBe(true);
  });

  test('missing denominator yields zero with a material assumption', () => {
    const a = attributionFactor({ basis: 'project_specific', premium: 100 });
    expect(a.value).toBe(0);
    expect(a.assumptions[0].severity).toBe('material');
  });
});

describe('PCAF Part C — A4 transport', () => {
  const a4 = a4Total(fx.MATERIALS, fx.DISTANCES);

  test('total reproduces the workbook exactly', () => {
    expect(a4.value).toBeCloseTo(418.18692, 5);
  });

  test('BOQ mass reproduces the workbook', () => {
    const mass = a4.items.reduce((s, i) => s + i.children[0].value, 0);
    expect(mass).toBeCloseTo(60.3348, 4);
  });

  test('concrete and masonry are the Pareto vital few', () => {
    expect(a4.vitalFew.map(v => v.name)).toEqual([
      'Concrete (all grades)', 'Rubble masonry (stone)'
    ]);
  });

  test('contribution shares match the workbook', () => {
    const concrete = a4.items.find(i => i.label === 'Concrete (all grades)');
    const rubble   = a4.items.find(i => i.label === 'Rubble masonry (stone)');
    expect(concrete.contributionPct).toBeCloseTo(0.642200, 5);
    expect(rubble.contributionPct).toBeCloseTo(0.197998, 5);
  });

  test('every material carries a factor with a tier and a reference', () => {
    for (const item of a4.items) {
      const massNode = item.children[0];
      expect(massNode.factors.length).toBeGreaterThan(0);
      expect(massNode.factors[0].tier).toBeTruthy();
      expect(massNode.factors[0].reference).toBeTruthy();
    }
  });
});

describe('PCAF Part C — A5 construction', () => {
  test('A5.1 demolition reproduces the workbook', () => {
    const a51 = a51Demolition({ demolitionItems: fx.DEMOLITION_ITEMS, demolitionKm: 100 });
    expect(a51.value).toBeCloseTo(809.76, 2);
  });

  test('A5.1 is an explicit, disclosed zero when no demolition scope exists', () => {
    const a51 = a51Demolition({ demolitionKm: 100 });
    expect(a51.value).toBe(0);
    expect(a51.assumptions.some(a => a.code === 'A5_1_NO_DEMOLITION')).toBe(true);
  });

  test('A5.2 Method B reproduces the workbook when previous-project data is supplied', () => {
    const a52 = a52SiteEnergy({ gifa_m2: 1000, previousProject: fx.PREVIOUS_PROJECT });
    expect(a52.value).toBeCloseTo(14672, 2);
    expect(a52.inputs.method).toBe('B (client-derived)');
  });

  test('A5.2 Method B flags a large deviation from the RICS benchmark', () => {
    const a52 = a52SiteEnergy({ gifa_m2: 1000, previousProject: fx.PREVIOUS_PROJECT });
    const dev = a52.assumptions.find(a => a.code === 'A5_2_BENCHMARK_DEVIATION');
    expect(dev).toBeDefined();
    expect(dev.severity).toBe('material');
    expect(dev.context.deviationPct).toBeCloseTo(-63.32, 1);
  });

  test('A5.2 Method A applies the RICS default when no previous-project data is given', () => {
    const a52 = a52SiteEnergy({ gifa_m2: 1000 });
    expect(a52.value).toBe(40000);
    expect(a52.inputs.method).toBe('A (RICS default)');
    expect(a52.assumptions.some(a => a.code === 'A5_2_METHOD_A' && a.severity === 'material')).toBe(true);
  });

  test('A5.3 waste matches the workbook within live-linking tolerance', () => {
    // The workbook types A5.3 masses by hand (aluminium 0.11 vs 0.1056 etc).
    // The engine live-links them to the BOQ, so it differs by ~0.002 kgCO2e.
    const a53 = a53Waste({ materials: fx.MATERIALS, wasteDisposalKm: 40 });
    expect(a53.value).toBeCloseTo(28.6416, 1);
    expect(Math.abs(a53.value - 28.6416)).toBeLessThan(0.01);
  });

  test('PVC falls back to the RICS 5% default and says so', () => {
    const a53 = a53Waste({ materials: fx.MATERIALS, wasteDisposalKm: 40 });
    const pvc = a53.children.find(c => c.label === 'PVC pipe 110mm');
    expect(pvc.inputs.wasteRate).toBe(0.05);
    expect(pvc.assumptions.some(a => a.code === 'A5_3_WASTE_RATE_FALLBACK')).toBe(true);
  });
});

describe('PCAF Part C — policy gate', () => {
  test('CAR and EAR carry no use stage', () => {
    expect(useStageYears({ policyType: 'CAR' }).value).toBe(0);
    expect(useStageYears({ policyType: 'EAR' }).value).toBe(0);
  });

  test('IDI defaults to a 10-year window', () => {
    expect(useStageYears({ policyType: 'IDI' }).value).toBe(10);
  });

  test('client years apply within IDI but never override the CAR gate', () => {
    expect(useStageYears({ policyType: 'IDI', yearsOfCover: 15 }).value).toBe(15);
    const car = useStageYears({ policyType: 'CAR', yearsOfCover: 15 });
    expect(car.value).toBe(0);
    expect(car.assumptions.some(a => a.code === 'GATE_OVERRIDE_IGNORED')).toBe(true);
  });

  test('an unrecognised policy type fails closed', () => {
    const g = useStageYears({ policyType: 'SOMETHING_ELSE', yearsOfCover: 10 });
    expect(g.value).toBe(0);
    expect(g.assumptions[0].severity).toBe('material');
  });
});

describe('PCAF Part C — use-stage modules', () => {
  test('B1 reproduces the workbook', () => {
    const b1 = b1Refrigerant({
      equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A',
      gifa_m2: 1000, useStageYears: 10
    });
    expect(b1.value).toBe(28860);
    expect(b1.inputs.charge_kg).toBe(30);
    expect(b1.inputs.chargeBasis).toBe('benchmark_per_m2');
  });

  test('B1 prefers an actual charge over the per-m2 benchmark', () => {
    const b1 = b1Refrigerant({
      equipmentType: 'Stationary AC (split/unitary)', refrigerant: 'R-410A',
      chargeKg: 45, gifa_m2: 1000, useStageYears: 10
    });
    expect(b1.inputs.chargeBasis).toBe('actual');
    expect(b1.value).toBe(45 * 0.05 * 1924 * 10);
  });

  test('replacement counting excludes the original install', () => {
    expect(replacementCount(10, 7)).toBe(1);   // paint, life 7
    expect(replacementCount(30, 20)).toBe(1);  // tile, life 20 over 30 yr
    expect(replacementCount(10, 60)).toBe(0);  // structure
  });

  test('B4 is zero at the default 20-year HVAC life over a 10-year window', () => {
    const b4 = b4Replacement({ useStageYears: 10, chargeKg: 30, gwpValue: 1924 });
    expect(b4.value).toBe(0);
    expect(b4.assumptions.some(a => a.code === 'B4_NO_REPLACEMENT')).toBe(true);
  });

  test('B4 reproduces the workbook B4.2 under its demo 8-year HVAC life', () => {
    // The workbook total of 8,731 = B4.1 73 + B4.2 8,658. B4.1 is out of MVP
    // scope (HVAC only), and its 73 came from assumed items not in the BOQ.
    const b4 = b4Replacement({ useStageYears: 10, chargeKg: 30, gwpValue: 1924, hvacServiceLifeYears: 8 });
    expect(b4.value).toBe(8658);
  });

  test('B7 reproduces the workbook', () => {
    const b7 = b7Water({ gifa_m2: 1000, useStageYears: 10 });
    expect(b7.value).toBeCloseTo(5309.0909, 4);
    expect(b7.inputs.occupants).toBeCloseTo(90.909, 3);
  });

  test('B7 prefers metered volume over the occupancy benchmark', () => {
    const b7 = b7Water({ gifa_m2: 1000, annualVolume_m3: 1200, useStageYears: 10 });
    expect(b7.value).toBeCloseTo(1200 * 0.32 * 10, 6);
    expect(b7.inputs.volumeBasis).toBe('actual');
  });
});

describe('PCAF Part C — end-to-end roll-up', () => {
  test('workbook path reproduces the reference construction figure and IAE', () => {
    const r = runPartC(fx.workbookInput());
    expect(r.modules.a4.value).toBeCloseTo(418.18692, 5);
    expect(r.modules.a5.value).toBeCloseTo(15510.40, 1);
    expect(r.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(r.summary.insurerIAE_tCO2e).toBeCloseTo(0.0599, 4);
    expect(r.summary.perM2Factor_kgCO2e_m2).toBeCloseTo(15.93, 2);
  });

  test('workbook IAE matches the legacy 0.0605 under a 4dp attribution basis', () => {
    const input = fx.workbookInput();
    input.policy = { ...input.policy, precision: 4 };
    const r = runPartC(input);
    expect(r.summary.insurerIAE_tCO2e).toBeCloseTo(0.0605, 4);
  });

  test('default path applies the RICS site-energy default', () => {
    const r = runPartC(fx.defaultInput());
    expect(r.summary.construction_kgCO2e).toBeCloseTo(41256.59, 1);
    expect(r.summary.insurerIAE_tCO2e).toBeCloseTo(0.1552, 4);
    expect(r.summary.perM2Factor_kgCO2e_m2).toBeCloseTo(41.26, 2);
  });

  test('CAR policy zeroes every use-stage module', () => {
    const r = runPartC(fx.workbookInput());
    expect(r.policy.useStageYears).toBe(0);
    expect(r.modules.b1.value).toBe(0);
    expect(r.modules.b4.value).toBe(0);
    expect(r.modules.b7.value).toBe(0);
    expect(r.summary.useStage_kgCO2e).toBe(0);
  });

  test('IDI policy runs the use stage and reports it separately', () => {
    const r = runPartC(fx.idiInput());
    expect(r.policy.useStageYears).toBe(10);
    expect(r.modules.b1.value).toBe(28860);
    expect(r.modules.b7.value).toBeCloseTo(5309.0909, 3);
    expect(r.summary.useStage_kgCO2e).toBeCloseTo(28860 + 0 + 5309.0909, 3);
    // The construction figure is untouched by the use-stage line.
    expect(r.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
  });

  test('de-minimis is reported for information and excludes nothing', () => {
    const r = runPartC(fx.idiInput());
    expect(r.deMinimis.ratioPct).toBeCloseTo(181.18, 1);
    expect(r.deMinimis.excluded).toBe(false);
  });
});

describe('PCAF Part C — scope wall (spec §8)', () => {
  test('the Beyond-PCAF annex never enters the PCAF figure', () => {
    const r = runPartC(fx.idiInput());
    expect(r.beyondPcafAnnex.value).toBeGreaterThan(0);
    expect(r.summary.construction_kgCO2e).toBeCloseTo(15928.59, 1);
    expect(r.summary.useStage_kgCO2e).toBeCloseTo(34169.09, 1);
    // Neither total contains any part of the annex.
    expect(r.summary.construction_kgCO2e + r.summary.useStage_kgCO2e)
      .not.toBeCloseTo(r.beyondPcafAnnex.value, 1);
  });

  test('B2 and B5 reproduce the workbook annex values', () => {
    const r = runPartC(fx.idiInput());
    const [b2, b5, b8] = r.beyondPcafAnnex.children;
    expect(b2.value).toBeCloseTo(1666.67, 2);
    expect(b5.value).toBeCloseTo(5000, 2);
    expect(b8.value).toBe(0);
  });

  test('the roll-up module does not import the Beyond-PCAF module', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'services', 'pcaf-partc', 'rollup.js'), 'utf8');
    expect(src).not.toMatch(/require\(['"].*beyond-pcaf/);
  });

  test('a CAR policy zeroes the voluntary annex too', () => {
    const r = runPartC(fx.workbookInput());
    expect(r.beyondPcafAnnex.value).toBe(0);
  });
});
