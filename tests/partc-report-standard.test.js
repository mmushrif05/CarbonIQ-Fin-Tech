/**
 * The standard Part C disclosure document.
 *
 * Three things are pinned here, because each is the kind of failure that
 * would look fine on screen and be wrong under review:
 *
 *   the insured's GHG scope split reconciles exactly to the figures it is
 *   split from, and uses one map wherever it is taken;
 *
 *   the completed checklist answers from the report's own contents, so it
 *   cannot claim something the document does not carry;
 *
 *   nothing here changes an emission value.
 */

'use strict';

const { runPartC } = require('../services/pcaf-partc');
const { buildRegisters } = require('../services/partc-registers');
const {
  splitByGhgScope, splitStageTotals, stageEmissions,
  SCOPE_OF, CONSTRUCTION_STAGES, USE_STAGE_STAGES
} = require('../services/pcaf-partc/ghg-scopes');
const { completeChecklist, ITEMS } = require('../services/partc-checklist');
const standard = require('../services/partc-report-standard');
const { RECALCULATION_TRIGGERS } = require('../schemas/partc-registry');
const fx = require('./fixtures/fisheries');

const SETTINGS = {
  currency: 'LKR', insurerName: 'Demo Insurance PLC', reportingYear: 2026,
  baseYear: 2025, significanceThresholdPct: 5, restatementThresholdPct: 5,
  recalculationTriggers: RECALCULATION_TRIGGERS, recalculationPolicy: ''
};

const META = {
  projectName: 'Fisheries Complex', insurer: 'Demo Insurance PLC',
  insured: 'Department of Fisheries', policyRef: 'CAR-2026-011',
  premium: 24448.16, projectCost: 6499442, gifa_m2: 1000,
  runId: 'test1', reportingYear: 2026
};

const factsFor = input => {
  const result = runPartC(input);
  return standard.assessmentFacts({
    result, registers: buildRegisters(result), settings: SETTINGS, meta: META
  });
};

describe('The insured GHG scope split', () => {
  const result = runPartC(fx.idiInput());
  const split = splitByGhgScope(result);

  test('reconciles exactly to the construction figure it is split from', () => {
    expect(split.construction.total_kgCO2e)
      .toBeCloseTo(Math.round(result.summary.construction_kgCO2e * 100) / 100, 2);
    expect(split.construction.scope1and2.kgCO2e + split.construction.scope3.kgCO2e)
      .toBeCloseTo(split.construction.total_kgCO2e, 2);
  });

  test('reconciles exactly to the use-stage figure it is split from', () => {
    expect(split.useStage.total_kgCO2e)
      .toBeCloseTo(Math.round(result.summary.useStage_kgCO2e * 100) / 100, 2);
  });

  test('site energy is the insured scope 1 and 2; transport and waste are its scope 3', () => {
    expect(SCOPE_OF['A5.2']).toBe('scope1and2');
    for (const st of ['A4', 'A5.1', 'A5.3', 'B7']) expect(SCOPE_OF[st]).toBe('scope3');
    for (const st of ['B1', 'B4']) expect(SCOPE_OF[st]).toBe('scope1and2');
  });

  test('every stage the engine reports is placed in a scope — none is left out', () => {
    for (const st of [...CONSTRUCTION_STAGES, ...USE_STAGE_STAGES]) {
      expect(SCOPE_OF[st]).toBeDefined();
    }
  });

  test('a portfolio split from stage totals matches a per-run split of the same run', () => {
    const fromTotals = splitStageTotals(stageEmissions(result), true);
    expect(fromTotals.construction.scope1and2.kgCO2e).toBe(split.construction.scope1and2.kgCO2e);
    expect(fromTotals.useStage.scope3.kgCO2e).toBe(split.useStage.scope3.kgCO2e);
  });

  test('under construction-only cover the use-stage split is present but does not apply', () => {
    const car = splitByGhgScope(runPartC(fx.workbookInput()));
    expect(car.useStage.applies).toBe(false);
    expect(car.useStage.total_kgCO2e).toBe(0);
    expect(car.construction.total_kgCO2e).toBe(split.construction.total_kgCO2e);
  });

  test('the split never implies the figures are the re/insurer\'s own scope 1 or 2', () => {
    expect(split.insurerNote).toMatch(/re\/insurer's own scope 3/i);
    expect(split.insurerNote).toMatch(/moves nothing into the re\/insurer's scope 1 or 2/i);
  });
});

describe('The completed disclosure checklist', () => {
  const facts = factsFor(fx.idiInput());
  const model = standard.buildStandardModel(facts);
  const c = model.checklist;

  test('answers every item, and every requirement is met', () => {
    expect(c.items).toHaveLength(ITEMS.length);
    expect(c.summary.requirements.met).toBe(c.summary.requirements.total);
    expect(c.summary.answeredYes + c.summary.notApplicable + c.summary.answeredNo)
      .toBe(c.summary.total);
  });

  test('every item cites the clause it comes from and the section evidencing it', () => {
    const ids = new Set(model.sections.map(s => s.id).concat(model.annexes.map(a => a.id)));
    for (const i of c.items) {
      expect(i.clause).toBeTruthy();
      // An item may cite no section — but only when it is not claiming Yes.
      // A Yes pointing nowhere is the shape this test exists to catch.
      if (i.section === null) expect(i.answer).not.toBe('Yes');
      else expect(ids.has(i.section)).toBe(true);
    }
  });

  test('an answer of anything but Yes carries its reason', () => {
    for (const i of c.items) {
      if (i.answer === 'Yes') expect(i.justification).toBeNull();
      else expect(String(i.justification).length).toBeGreaterThan(10);
    }
  });

  test('it cannot claim what the report does not contain', () => {
    const stripped = completeChecklist({ ...facts, recalculationTriggers: [], gases: [] });
    expect(stripped.items.find(i => i.id === 'REC-1').answer).toBe('No');
    expect(stripped.items.find(i => i.id === 'GAS-1').answer).toBe('No');
    expect(stripped.summary.requirements.met).toBeLessThan(stripped.summary.requirements.total);
  });

  test('a construction-only policy answers the use-stage item "Not applicable", with the scope rule as the reason', () => {
    const car = completeChecklist(factsFor(fx.workbookInput()));
    const item = car.items.find(i => i.id === 'ABS-4');
    expect(item.answer).toBe('Not applicable');
    expect(item.justification).toMatch(/scope rule/i);
    expect(car.summary.requirements.met).toBe(car.summary.requirements.total);
  });

  test('it says what it is, and claims no PCAF endorsement', () => {
    expect(c.provenance).toMatch(/not a reproduction of any form published by PCAF/i);
    expect(c.provenance).toMatch(/not an endorsement, approval or certification/i);
  });
});

describe('The section model', () => {
  const model = standard.buildStandardModel(factsFor(fx.idiInput()));

  test('follows the checklist\'s order', () => {
    expect(model.sections.map(s => s.id)).toEqual([
      'coverage', 'gases', 'absolute', 'methodology', 'dataQuality',
      'recalculation', 'intensity', 'limitations', 'conformance'
    ]);
  });

  test('names the seven Kyoto gases, no more and no fewer', () => {
    expect(standard.KYOTO_GASES).toHaveLength(7);
    expect(standard.KYOTO_GASES.map(g => g.formula))
      .toEqual(['CO2', 'CH4', 'N2O', 'HFCs', 'PFCs', 'SF6', 'NF3']);
  });

  test('states that financed emissions are never combined with these', () => {
    expect(standard.FINANCED_EMISSIONS_STATEMENT).toMatch(/never added together/i);
    expect(standard.FINANCED_EMISSIONS_STATEMENT).toMatch(/reported separately/i);
  });

  test('the annexes end with the completed checklist', () => {
    expect(model.annexes[model.annexes.length - 1].id).toBe('annexChecklist');
    expect(model.annexes[0].id).toBe('annexFactors');
  });

  test('endorsement language anywhere in the document blocks the build', () => {
    const facts = factsFor(fx.idiInput());
    facts.conformanceStatement = 'This assessment is PCAF approved.';
    expect(() => standard.buildStandardModel(facts)).toThrow(/endorsement language/i);
  });
});

describe('The report changes no emission value', () => {
  test('the reference construction figure is untouched by any of this', () => {
    const r = runPartC(fx.workbookInput());
    expect(Math.round(r.summary.construction_kgCO2e * 100) / 100).toBe(15928.59);
    const facts = standard.assessmentFacts({
      result: r, registers: buildRegisters(r), settings: SETTINGS, meta: META
    });
    expect(facts.construction_kgCO2e).toBe(r.summary.construction_kgCO2e);
    expect(facts.insurerIAE_tCO2e).toBe(r.summary.insurerIAE_tCO2e);
  });

  test('the scope split is a re-cut of the same numbers, not a recomputation', () => {
    const r = runPartC(fx.idiInput());
    const em = stageEmissions(r);
    expect(em.A4 + em['A5.1'] + em['A5.2'] + em['A5.3'])
      .toBeCloseTo(r.summary.construction_kgCO2e, 6);
  });
});
