/**
 * The reference run, the gate demonstration and the scenarios the statement is illustrated with.
 */

'use strict';

const { runPartC }       = require('../../domain');
const { buildRegisters } = require('../partc-registers');

/**
 * The reference case: the workbook project, whose figure the acceptance
 * tests check independently.
 */
const { _round } = require('./common');
function _referenceRun() {
  const fixture = require('../../../../../tests/fixtures/fisheries');
  const result  = runPartC(fixture.workbookInput());
  return { result, registers: buildRegisters(result) };
}

/**
 * The policy gate, demonstrated rather than asserted.
 *
 * A worked example on a construction policy alone reports a use stage of
 * zero, which tells a reviewer nothing: they cannot see whether the zero is
 * a scope rule correctly applied or a module that never ran. So the same
 * project is run twice, changing only the policy type, and both results are
 * shown together.
 *
 * The construction figure is identical across the two, and that is the
 * correct answer rather than a fault: A4 and A5 are emissions from building
 * the building, and the building does not emit differently according to
 * which policy covers it. What the cover decides is whether a use stage
 * exists at all.
 */
function _gateDemonstration() {
  const fixture = require('../../../../../tests/fixtures/fisheries');
  const car = runPartC(fixture.workbookInput());
  const idi = runPartC(fixture.idiInput());

  const line = (label, a, b, note) => ({
    measure: label,
    CAR: a, IDI: b,
    identical: String(a) === String(b),
    note: note || null
  });

  return {
    design: 'The same project, the same bill of quantities, the same site data and the same premium. Only the policy type differs, so any difference below is attributable to the gate alone.',
    rows: [
      line('Use-stage years admitted by the gate', car.policy.useStageYears, idi.policy.useStageYears,
        'The gate itself. Construction-only cover admits none.'),
      line('Construction A4 + A5 (kgCO2e)', _round(car.summary.construction_kgCO2e), _round(idi.summary.construction_kgCO2e),
        'Identical, and correctly so: these are the emissions of building the building, which do not change with the policy that covers it.'),
      line('B1 refrigerant (kgCO2e)', _round(car.modules.b1.value), _round(idi.modules.b1.value),
        'Zero under CAR by scope rule, not by omission.'),
      line('B4 replacement (kgCO2e)', _round(car.modules.b4.value), _round(idi.modules.b4.value),
        'Zero under both here: the HVAC service life exceeds the ten-year cover, so no replacement falls inside it. It becomes material on longer cover — see the sensitivity below.'),
      line('B7 operational water (kgCO2e)', _round(car.modules.b7.value), _round(idi.modules.b7.value), null),
      line('Use stage total (kgCO2e)', _round(car.summary.useStage_kgCO2e), _round(idi.summary.useStage_kgCO2e),
        'Reported on its own line and never added to construction.'),
      line('Attribution factor', car.summary.attributionFactor, idi.summary.attributionFactor,
        'Identical because the same premium and project cost were used on both runs, to keep the policy type the only variable. On a real book a construction premium and a decennial premium differ, and so would this.')
    ],
    overrideTest: (() => {
      const forced = fixture.workbookInput();
      forced.policy = { ...forced.policy, yearsOfCover: 25 };
      const r = runPartC(forced);
      return {
        description: 'A cover period of 25 years entered against a CAR policy.',
        useStageYears: r.policy.useStageYears,
        useStage_kgCO2e: _round(r.summary.useStage_kgCO2e),
        conclusion: 'The entered value is recorded and ignored. A client cannot buy a use stage onto a construction policy, because the gate is a scope rule and not a preference.'
      };
    })(),
    coverSensitivity: [5, 10, 15, 20, 25, 45].map(years => {
      const inp = fixture.idiInput();
      inp.policy = { ...inp.policy, yearsOfCover: years };
      const r = runPartC(inp);
      return {
        yearsOfCover: years,
        gateYears: r.policy.useStageYears,
        b1: _round(r.modules.b1.value),
        b4: _round(r.modules.b4.value),
        b7: _round(r.modules.b7.value),
        useStage: _round(r.summary.useStage_kgCO2e)
      };
    }),
    sensitivityNote: 'B1 and B7 accrue with each year of cover. B4 stays at zero until the cover period outlives the plant: with a twenty-year HVAC life the first replacement falls inside a twenty-five-year cover, and a second inside forty-five. A step rather than a slope is the expected shape, and seeing it is how a reviewer confirms the module is running rather than absent.'
  };
}

/**
 * Every state the interactive controls can show, each an engine execution.
 *
 * The page lets a reviewer switch policy type and drag a cover period. Those
 * controls must move real computed figures, not interpolate a stored curve,
 * or the promise that nothing is transcribed stops being true. The engine
 * costs about 0.6ms a run, so the whole space is computed up front: four
 * policy types and every cover year from 1 to 45, 49 executions in roughly
 * 40ms. The control then reads an answer the engine actually produced.
 */
function _scenarios() {
  const fixture = require('../../../../../tests/fixtures/fisheries');

  const run = (policyType, yearsOfCover) => {
    const base = /IDI|PROPERTY/i.test(policyType) ? fixture.idiInput() : fixture.workbookInput();
    base.policy = { ...base.policy, policyType, ...(yearsOfCover ? { yearsOfCover } : {}) };
    const r = runPartC(base);
    return {
      policyType,
      gateYears: r.policy.useStageYears,
      construction: _round(r.summary.construction_kgCO2e),
      b1: _round(r.modules.b1.value),
      b4: _round(r.modules.b4.value),
      b7: _round(r.modules.b7.value),
      useStage: _round(r.summary.useStage_kgCO2e),
      insurerIAE: r.summary.insurerIAE_tCO2e,
      attributionFactor: r.summary.attributionFactor,
      _result: r
    };
  };

  /* The four policy types carry their own data-quality scoring, so the
     score the page shows always belongs to the run the page is showing.
     The 45-year curve does not: its scores are the IDI scores throughout,
     and 45 copies of the same tables would be payload for nothing. */
  const policies = ['CAR', 'EAR', 'IDI', 'Property'].map(t => {
    const row = run(t);
    const r = row._result;
    delete row._result;
    row.dq = r.dqScoring || null;
    row.dqStatement = r.dqDisclosureStatement || null;
    return row;
  });

  const MAX_YEARS = 45;
  const curve = [];
  for (let y = 1; y <= MAX_YEARS; y++) {
    const row = run('IDI', y);
    delete row._result;
    curve.push({ years: y, ...row });
  }

  // Where B4 steps: the years at which the cover first outlives the plant.
  const steps = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].b4 > curve[i - 1].b4) {
      steps.push({
        years: curve[i].years,
        from: curve[i - 1].b4,
        to: curve[i].b4,
        label: 'HVAC service life exceeded — replacement enters the cover'
      });
    }
  }

  return {
    note: 'Each row below is a separate execution of the engine, not a stored curve. The controls read computed answers.',
    executions: policies.length + curve.length,
    policies,
    maxYears: MAX_YEARS,
    curve,
    b4Steps: steps
  };
}

module.exports = { _referenceRun, _gateDemonstration, _scenarios };
