/**
 * PCAF Part C — data-quality scoring.
 *
 * The scoring reads a finished run and never re-computes a figure, so these
 * tests pin two things: that the scores follow the evidence the run actually
 * used, and that the roll-up is weighted by emissions rather than averaged
 * flat. A figure disclosed without its score is not conformant, so the last
 * group asserts the score travels with the figure through the API.
 */

'use strict';

const { runPartC } = require('../services/pcaf-partc');
const {
  RUBRIC, scoreRun, scoreInputs, disclosureStatement,
  CONSTRUCTION_MODULES, USE_STAGE_MODULES
} = require('../services/pcaf-partc/dq-scoring');
const fixture = require('../tests/fixtures/fisheries');

const scoreOf = (rows, code) => rows.find(r => r.input === code).score;

/* The fixture's idiInput() spreads `extra` over the whole input, so passing
   a partial useStage replaces it rather than merging. The charge is supplied
   alongside the equipment and refrigerant so the run is the same one with one
   assumption turned into an actual. */
const idiWithCharge = kg => fixture.idiInput({
  useStage: { ...fixture.USE_STAGE, chargeKg: kg }
});

describe('PCAF Part C — data-quality rubric', () => {
  test('runs 1 (best) to 5 (worst) with a meaning and evidence for each', () => {
    expect(RUBRIC.map(r => r.score)).toEqual([1, 2, 3, 4, 5]);
    for (const r of RUBRIC) {
      expect(typeof r.meaning).toBe('string');
      expect(r.meaning.length).toBeGreaterThan(0);
      expect(r.evidence.length).toBeGreaterThan(0);
    }
  });

  test('every scored input carries its basis, source and tier', () => {
    const rows = scoreInputs(runPartC(fixture.idiInput()));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.score).toBeGreaterThanOrEqual(1);
      expect(r.score).toBeLessThanOrEqual(5);
      expect(r.basis).toBeTruthy();
      expect(r.source).toBeTruthy();
      expect(r.tier).toBeTruthy();
    }
  });
});

describe('PCAF Part C — scores respond to the evidence supplied', () => {
  test('A5.2 scores 2 on client actuals and 4 on the RICS benchmark', () => {
    const withActuals = scoreInputs(runPartC(fixture.workbookInput()));
    const without     = scoreInputs(runPartC(fixture.defaultInput()));
    expect(scoreOf(withActuals, 'a5_2_site_energy')).toBe(2);
    expect(scoreOf(without,     'a5_2_site_energy')).toBe(4);
  });

  test('a supplied refrigerant charge moves B1 from a literature assumption to a reported actual', () => {
    const assumed = scoreInputs(runPartC(fixture.idiInput()));
    const actual  = scoreInputs(runPartC(idiWithCharge(12)));
    expect(scoreOf(assumed, 'b1_charge')).toBe(5);
    expect(scoreOf(actual,  'b1_charge')).toBe(2);
  });

  test('supplying the charge measurably improves the use-stage score', () => {
    const before = scoreRun(runPartC(fixture.idiInput()));
    const after  = scoreRun(runPartC(idiWithCharge(12)));
    expect(after.useStage.weighted).toBeLessThan(before.useStage.weighted);
    expect(after.byModule.B1).toBeLessThan(before.byModule.B1);
  });

  test('the improvement hint names the change worth making, ranked by tonnes', () => {
    const sc = scoreRun(runPartC(fixture.defaultInput()));
    expect(sc.construction.improvement).not.toBeNull();
    expect(sc.construction.improvement.input).toBe('a5_2_site_energy');
    expect(sc.construction.improvement.to).toBeLessThan(sc.construction.improvement.from);
  });
});

describe('PCAF Part C — emission-weighted roll-up', () => {
  const sc = scoreRun(runPartC(fixture.idiInput()));

  test('module score is the mean of its input scores', () => {
    const rows = sc.inputs;
    for (const code of [...CONSTRUCTION_MODULES, ...USE_STAGE_MODULES]) {
      const mine = rows.filter(r => r.module === code);
      const mean = mine.reduce((n, r) => n + r.score, 0) / mine.length;
      expect(sc.byModule[code]).toBeCloseTo(Math.round(mean * 10) / 10, 5);
    }
  });

  test('A5 carries about 97% of construction, so it sets the construction score', () => {
    const a5 = sc.construction.rows.find(r => r.module === 'A5');
    const a4 = sc.construction.rows.find(r => r.module === 'A4');
    expect(a5.weightPct).toBeGreaterThan(95);
    expect(a4.weightPct).toBeLessThan(5);
    expect(sc.construction.weighted).toBeCloseTo(a5.score, 1);
  });

  test('the weighted score is Σ(emissions × score) ÷ Σ(emissions), not a flat average', () => {
    const { rows, totalEmissions, weighted } = sc.construction;
    const expected = rows.reduce((n, r) => n + r.emissions * r.score, 0) / totalEmissions;
    expect(weighted).toBeCloseTo(Math.round(expected * 10) / 10, 5);

    const flat = rows.reduce((n, r) => n + r.score, 0) / rows.length;
    expect(weighted).not.toBeCloseTo(flat, 2);
  });

  /* The brief's acceptance figures (construction 3.0) come from rounding each
     module score to a whole number before weighting, as PCAF scores a whole
     instrument. Both readings are pinned so the difference stays visible and
     cannot be mistaken for a calculation error. */
  test('rounding module scores first reproduces the brief\'s 3.0; the exact mean gives 3.3', () => {
    const { rows, totalEmissions } = sc.construction;
    const rounded = rows.reduce((n, r) => n + r.emissions * r.scoreRounded, 0) / totalEmissions;
    expect(Math.round(rounded * 10) / 10).toBe(3);
    expect(sc.construction.weighted).toBe(3.3);
    expect(sc.rounding).toMatch(/exact mean/i);
  });

  test('a module that emitted nothing carries no weight', () => {
    const b4 = sc.useStage.rows.find(r => r.module === 'B4');
    expect(b4.emissions).toBe(0);
    expect(b4.weightPct).toBe(0);
    expect(b4.contribution).toBe(0);
  });

  test('the two scores are reported separately and never blended', () => {
    expect(sc.construction.weighted).not.toBe(sc.useStage.weighted);
    expect(sc.construction.rows.map(r => r.module)).toEqual(['A4', 'A5']);
    expect(sc.useStage.rows.map(r => r.module)).toEqual(['B1', 'B4', 'B7']);
  });

  test('beyond-PCAF modules appear in neither score', () => {
    const scored = [...sc.construction.rows, ...sc.useStage.rows].map(r => r.module);
    for (const code of ['B2', 'B5', 'B8']) expect(scored).not.toContain(code);
    expect(sc.excluded).toMatch(/B2, B5, B8/);
  });
});

describe('PCAF Part C — the scope rule reaches the score', () => {
  const car = scoreRun(runPartC(fixture.workbookInput()));
  const idi = scoreRun(runPartC(fixture.idiInput()));

  test('CAR returns "not applicable (scope rule)" rather than a use-stage score', () => {
    expect(car.useStage.applies).toBe(false);
    expect(car.useStage.weighted).toBeNull();
    expect(car.useStage.notApplicableNote).toMatch(/scope rule/i);
  });

  test('a gated use-stage input says it was not evaluated, not that it measured zero', () => {
    const charge = car.inputs.find(i => i.input === 'b1_charge');
    expect(charge.applies).toBe(false);
    expect(charge.basis).toMatch(/not evaluated/i);
    expect(charge.basis).not.toMatch(/0 kg/);
  });

  test('the construction score is unaffected by the policy type', () => {
    expect(car.construction.weighted).toBe(idi.construction.weighted);
  });
});

describe('PCAF Part C — the generated disclosure statement', () => {
  test('claims conformance, never endorsement', () => {
    const result = runPartC(fixture.idiInput());
    const text = disclosureStatement(result, scoreRun(result));
    expect(text).toMatch(/in conformance with PCAF/i);
    expect(text).not.toMatch(/PCAF (approved|endorsed|certified)/i);
  });

  test('names the standard, the section, both figures, the option and both scores', () => {
    const result = runPartC(fixture.idiInput());
    const sc = scoreRun(result);
    const text = disclosureStatement(result, sc);
    expect(text).toMatch(/Section 5\.3/);
    expect(text).toMatch(/Construction emissions \(A4\+A5\) = [\d.]+ tCO2e/);
    expect(text).toMatch(/Option 2b/);
    expect(text).toContain(`weighted data quality score ${sc.construction.weighted} of 5`);
    expect(text).toContain(`weighted data quality score ${sc.useStage.weighted} of 5`);
  });

  test('a construction-only policy says the use stage is out of scope by rule', () => {
    const result = runPartC(fixture.workbookInput());
    const text = disclosureStatement(result, scoreRun(result));
    expect(text).toMatch(/not applicable to this policy type \(scope rule\)/i);
    expect(text).not.toMatch(/Use-stage emissions \(B1\+B4\+B7\) = /);
  });

  test('names the limitations the run actually carries, and drops the ones it does not', () => {
    const idi = runPartC(fixture.idiInput());
    const car = runPartC(fixture.workbookInput());
    const idiText = disclosureStatement(idi, scoreRun(idi));
    const carText = disclosureStatement(car, scoreRun(car));

    expect(idiText).toMatch(/DEFRA water factors used as a proxy/i);
    expect(carText).not.toMatch(/DEFRA water factors/i);
    expect(carText).toMatch(/Global-tier default factors/i);
  });

  test('a supplied actual removes its limitation from the statement', () => {
    const assumed = runPartC(fixture.idiInput());
    const actual  = runPartC(idiWithCharge(12));
    expect(disclosureStatement(assumed, scoreRun(assumed)))
      .toMatch(/refrigerant charge from a per-m² literature assumption/i);
    expect(disclosureStatement(actual, scoreRun(actual)))
      .not.toMatch(/refrigerant charge from a per-m² literature assumption/i);
  });
});

describe('PCAF Part C — the score travels with the figure', () => {
  test('a run attaches its scoring and its statement', () => {
    const result = runPartC(fixture.idiInput());
    expect(result.dqScoring).toBeTruthy();
    expect(result.dqScoring.construction.weighted).toBeGreaterThan(0);
    expect(result.dqDisclosureStatement).toMatch(/in conformance with PCAF/i);
  });

  test('scoring does not disturb the engine figures', () => {
    const result = runPartC(fixture.workbookInput());
    expect(Math.round(result.summary.construction_kgCO2e * 100) / 100).toBe(15928.59);
  });
});
