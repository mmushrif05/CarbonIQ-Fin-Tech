/**
 * PCAF Part C — data quality.
 *
 * The rule being tested is small and easy to get wrong in a way that looks
 * plausible: PCAF assigns ONE score per project, decided by WHICH OPTION was
 * used to estimate the emissions (Table 5.3-2, p.58). It is not an average
 * across inputs, modules or lifecycle stages, and there is no data-quality
 * table at all for the optional use stage.
 *
 * An earlier implementation averaged per-input scores and weighted them by
 * emissions. Both were inventions. These tests exist so neither can come
 * back.
 */

'use strict';

const { runPartC } = require('../services/pcaf-partc');
const {
  assessDataQuality, inferOption, OPTION_SCORES, OPTION_LABELS, TABLE_5_3_2
} = require('../services/pcaf-partc/data-quality');
const {
  scoreRun, scopeOptions, inputBasis, disclosureStatement, STRONG, WEAK
} = require('../services/pcaf-partc/dq-scoring');
const fx = require('../tests/fixtures/fisheries');

const idiWithCharge = kg => fx.idiInput({ useStage: { ...fx.USE_STAGE, chargeKg: kg } });

describe('Table 5.3-2 — the score is a lookup on the option', () => {
  test('the six options map to the scores the standard gives them', () => {
    expect(OPTION_SCORES).toEqual({ '1a': 1, '1b': 2, '2a': 2, '2b': 3, '3a': 4, '3b': 5 });
    expect(TABLE_5_3_2.map(r => r.option)).toEqual(['1a', '1b', '2a', '2b', '3a', '3b']);
  });

  test('each option is described by the DATA it uses, not by the factor quality', () => {
    // The distinction that decides the option is what the estimate is built
    // from: reported emissions, energy consumption, declared quantities, or
    // project cost.
    expect(OPTION_LABELS['1a']).toMatch(/reported emissions/i);
    expect(OPTION_LABELS['2a']).toMatch(/energy consumption/i);
    expect(OPTION_LABELS['2b']).toMatch(/declared construction quantities/i);
    expect(OPTION_LABELS['3a']).toMatch(/total project cost/i);
    expect(OPTION_LABELS['3b']).toMatch(/customer's own emission intensity/i);
  });

  test('the option is inferred from the data the run actually had', () => {
    expect(inferOption({ reportedEmissions: 'verified' })).toBe('1a');
    expect(inferOption({ reportedEmissions: 'unverified' })).toBe('1b');
    expect(inferOption({ energyConsumption: true })).toBe('2a');
    expect(inferOption({ hasBoq: true })).toBe('2b');
    expect(inferOption({ projectCost: 1000 })).toBe('3a');
    expect(inferOption({ projectCost: 1000, customerIntensity: true })).toBe('3b');
  });

  test('an explicit override is honoured, because an insurer may hold data this system did not receive', () => {
    expect(inferOption({ hasBoq: true, override: '1a' })).toBe('1a');
    expect(assessDataQuality({ hasBoq: true, option: '3a', tree: [] }).score).toBe(4);
  });

  test('an EPD improves the factor, it does not reach Option 1', () => {
    // Option 1 is emissions reported by the insured. An EPD is a better
    // emission factor to multiply a quantity by, which is still Option 2b.
    const dq = assessDataQuality({ hasBoq: true, hasEPD: true, tree: [] });
    expect(dq.option).toBe('2b');
    expect(dq.score).toBe(3);
    expect(dq.epdNote).toMatch(/does not make this Option 1/i);
  });

  test('no project-specific calculation possible falls to score 4, per p.59', () => {
    expect(assessDataQuality({ hasBoq: false, tree: [] }).score).toBe(4);
  });

  test('an annual-basis policy is capped at 4, because PCAF removed 5 from the commercial-lines table', () => {
    const annual = assessDataQuality({
      hasBoq: false, projectCost: 1000, customerIntensity: true, annualBasis: true, tree: []
    });
    expect(annual.option).toBe('3b');
    expect(annual.score).toBe(4);
    expect(annual.annualBasisNote).toMatch(/capped at 4/i);
  });
});

describe('The Fisheries run', () => {
  const result = runPartC(fx.idiInput());
  const sc = scoreRun(result);

  test('is Option 2b with score 3 — a whole number, not an average', () => {
    expect(result.dataQuality.option).toBe('2b');
    expect(result.dataQuality.score).toBe(3);
    expect(sc.construction.score).toBe(3);
    expect(Number.isInteger(sc.construction.score)).toBe(true);
    expect(sc.construction.score).not.toBe(3.3);
  });

  test('says so in words that cannot be read as a fraction', () => {
    expect(sc.construction.scoreText).toBe('Data quality score: 3 (Option 2b)');
    expect(sc.construction.scoreText).not.toMatch(/\/\s*5/);
    expect(sc.scale).toMatch(/1 is the highest data quality/i);
    expect(sc.direction).toMatch(/lower score is better/i);
  });

  test('the score comes from the option, not from the inputs beneath it', () => {
    expect(sc.construction.basis).toMatch(/not an average/i);
  });
});

describe('Scope 3 is scored separately from scopes 1 and 2', () => {
  test('site energy from client consumption is Option 2a; declared quantities are 2b', () => {
    const sc = scoreRun(runPartC(fx.idiInput()));
    expect(sc.byGhgScope.scope1and2.option).toBe('2a');
    expect(sc.byGhgScope.scope1and2.score).toBe(2);
    expect(sc.byGhgScope.scope3.option).toBe('2b');
    expect(sc.byGhgScope.scope3.score).toBe(3);
  });

  test('without client energy data, site energy falls back to a declared quantity', () => {
    // The RICS per-m2 allowance is applied to floor area built, which
    // footnote 54 places under declared quantities — Option 2b.
    const sc = scoreRun(runPartC(fx.defaultInput()));
    expect(sc.byGhgScope.scope1and2.option).toBe('2b');
    expect(sc.byGhgScope.scope1and2.score).toBe(3);
  });

  test('a project-wide option governs both scopes', () => {
    const sc = scopeOptions({ dataQuality: { option: '1a' }, tree: [] });
    expect(sc.scope1and2.option).toBe('1a');
    expect(sc.scope3.option).toBe('1a');
  });
});

describe('The use stage is never scored', () => {
  const idi = scoreRun(runPartC(fx.idiInput()));
  const car = scoreRun(runPartC(fx.workbookInput()));

  test('carries no number at all, only a reason and a described basis', () => {
    expect(idi.useStage.scored).toBe(false);
    expect(idi.useStage.applies).toBe(true);
    expect(idi.useStage.reason).toMatch(/no data quality table/i);
    expect(idi.useStage.statements.length).toBeGreaterThan(0);
    expect(idi.useStage.score).toBeUndefined();
    expect(idi.useStage.weighted).toBeUndefined();
  });

  test('no numeric use-stage score exists anywhere in the scoring output', () => {
    const json = JSON.stringify(idi);
    // Every number in the output belongs to construction, an emission
    // figure, or the option table. None is a use-stage data-quality score.
    expect(idi.useStage.scored).toBe(false);
    expect(json).not.toMatch(/"useStageScore"/);
    expect(json).not.toMatch(/"useStageWeighted"/);
    for (const key of Object.keys(idi.useStage)) {
      expect(typeof idi.useStage[key]).not.toBe('number');
    }
  });

  test('under construction-only cover it says the scope rule closed it', () => {
    expect(car.useStage.applies).toBe(false);
    expect(car.useStage.reason).toMatch(/scope rule/i);
    expect(car.useStage.statements).toHaveLength(0);
  });

  test('the construction score is unaffected by the policy type', () => {
    expect(car.construction.score).toBe(idi.construction.score);
  });
});

describe('The internal transparency aid', () => {
  const sc = scoreRun(runPartC(fx.idiInput()));

  test('is labelled as not being a PCAF score', () => {
    expect(sc.internalAid.title).toMatch(/not a PCAF data quality score/i);
    expect(sc.internalAid.note).toMatch(/averaged into, or exported as the PCAF score/i);
  });

  test('speaks in words, never in numbers that could pass for a score', () => {
    expect(sc.internalAid.strengths).toEqual(['Strong', 'Moderate', 'Weak']);
    for (const row of sc.internalAid.rows) {
      if (row.applies === false) { expect(row.strength).toBeNull(); continue; }
      expect(['Strong', 'Moderate', 'Weak']).toContain(row.strength);
      expect(typeof row.strength).toBe('string');
      expect(row.score).toBeUndefined();
    }
  });

  test('responds to whether an actual or a benchmark was used', () => {
    const withActuals = inputBasis(runPartC(fx.workbookInput()));
    const without     = inputBasis(runPartC(fx.defaultInput()));
    const energy = rows => rows.find(r => r.stage === 'A5.2').strength;
    expect(energy(withActuals)).toBe(STRONG);
    expect(energy(without)).toBe(WEAK);
  });

  test('a supplied refrigerant charge strengthens its own row', () => {
    const assumed = inputBasis(runPartC(fx.idiInput()));
    const actual  = inputBasis(runPartC(idiWithCharge(12)));
    const charge = rows => rows.find(r => r.input === 'Refrigerant charge').strength;
    expect(charge(assumed)).toBe(WEAK);
    expect(charge(actual)).toBe(STRONG);
  });

  test('changing an input never moves the PCAF score, because the option did not change', () => {
    const before = scoreRun(runPartC(fx.idiInput())).construction.score;
    const after  = scoreRun(runPartC(idiWithCharge(12))).construction.score;
    expect(after).toBe(before);
  });
});

describe('The generated disclosure statement', () => {
  const result = runPartC(fx.idiInput());
  const text = disclosureStatement(result, scoreRun(result));

  test('claims conformance, never endorsement', () => {
    expect(text).toMatch(/in conformance with/i);
    expect(text).not.toMatch(/PCAF (approved|endorsed|certified)/i);
  });

  test('names the option, the score and the direction of the scale', () => {
    expect(text).toMatch(/Option 2b \(Table 5\.3-2\)/);
    expect(text).toMatch(/data quality score 3 on a scale where 1 is the highest quality and 5 the lowest/);
    expect(text).not.toMatch(/\/\s*5/);
  });

  test('says the use stage is reported separately and explains why it is not scored', () => {
    expect(text).toMatch(/Optional lifetime \(use stage\) emissions/);
    expect(text).toMatch(/no data quality table for use-stage emissions/i);
    expect(text).toMatch(/described qualitatively rather than scored/i);
  });

  test('a construction-only policy says the use stage is out of scope by rule', () => {
    const car = runPartC(fx.workbookInput());
    const t = disclosureStatement(car, scoreRun(car));
    expect(t).toMatch(/not applicable to this policy type \(scope rule\)/i);
  });

  test('names the limitations the run carries and drops the ones it does not', () => {
    const car = runPartC(fx.workbookInput());
    expect(text).toMatch(/DEFRA water factors used as a proxy/i);
    expect(disclosureStatement(car, scoreRun(car))).not.toMatch(/DEFRA water factors/i);
  });

  test('a supplied actual removes its limitation from the statement', () => {
    const actual = runPartC(idiWithCharge(12));
    expect(text).toMatch(/refrigerant charge from a per-m2 literature assumption/i);
    expect(disclosureStatement(actual, scoreRun(actual)))
      .not.toMatch(/refrigerant charge from a per-m2 literature assumption/i);
  });
});

describe('None of this changed an emission value', () => {
  test('the reference construction figure is exactly what it was', () => {
    const r = runPartC(fx.workbookInput());
    expect(Math.round(r.summary.construction_kgCO2e * 100) / 100).toBe(15928.59);
  });

  test('scoring reads a finished result and computes no figure of its own', () => {
    const r = runPartC(fx.idiInput());
    const before = JSON.stringify(r.summary);
    scoreRun(r);
    expect(JSON.stringify(r.summary)).toBe(before);
  });
});
