/**
 * CarbonIQ FinTech — PCAF Part C: the methodology statement
 *
 * What this is for
 * ----------------
 * A disclosure that shows only its results asks to be taken on trust. This
 * module produces the other half: the scope rule applied, every equation
 * executed, every emission factor consulted with its tier and named source,
 * how data quality is scored and aggregated, which rules the engine claims
 * to meet and which test proves each one — and what is deliberately not
 * claimed.
 *
 * Why it is generated rather than written
 * --------------------------------------
 * Every equation, input and factor below is extracted from an actual run of
 * the engine, not transcribed into prose alongside it. A hand-written
 * methodology drifts from the code the moment either changes, and the drift
 * is invisible precisely when it matters — under review. Here the document
 * cannot describe an equation the engine does not execute, because the
 * description is read out of the execution.
 *
 * The reference run is the workbook case, so the worked example reproduces a
 * figure that is independently checked by the acceptance tests.
 */

'use strict';

const { runPartC }       = require('./pcaf-partc');
const { buildRegisters } = require('./partc-registers');
const factorStore        = require('./pcaf-partc/factors');
const { conformanceMatrix, STANDARD } = require('./pcaf-partc/conformance');
const { OPTION_SCORES, OPTION_LABELS } = require('./pcaf-partc/data-quality');

// The order a reader follows a project through, rather than alphabetical.
const MODULE_ORDER = [
  'gate', 'A4', 'A5.1', 'A5.2', 'A5.3', 'A5',
  'B1', 'B4', 'B7', 'attribution', 'rollup'
];

const MODULE_NARRATIVE = {
  gate:  'Cover type decides whether a use stage exists at all. Construction-only cover carries none, so B1, B4 and B7 are zero by scope rule rather than by omission — a distinction a reviewer cannot make from a zero on its own.',
  A4:    'Transport of materials to site. Each BOQ line is converted to mass, then carried over its own road, sea, rail and air legs. Materials are ranked so the vital few driving most of A4 are visible.',
  'A5.1': 'Demolition and site clearance: the mass removed, over the haul distance to disposal.',
  'A5.2': 'Site energy during construction. Method B uses the contractor\'s own fuel and electricity from a comparable previous project, scaled by floor area. Method A falls back to the RICS default where no such record exists — and says which was used.',
  'A5.3': 'Construction waste: the fraction of each material that becomes waste, carried to disposal.',
  A5:    'The construction total. A5.2 site energy typically dominates it, which is why a change in a bill of quantities moves the disclosed figure far less than a correction to a fuel log.',
  B1:    'Refrigerant leakage over the cover period. Optional under Part C and reported on its own line.',
  B4:    'Replacement of building services over the cover period. Optional, reported separately.',
  B7:    'Operational water over the cover period. Optional, reported separately.',
  attribution: 'The insurer\'s share. Premium over project cost, applied per policy against that policy\'s own project — never pooled across a book before attribution.',
  rollup: 'Construction (A4+A5) is the PCAF figure. Use stage (B1+B4+B7) is a separate line and is never added to it. The voluntary whole-life annex is excluded from both.'
};

function _round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((Number(n) || 0) * f) / f;
}

/** Order modules as a reader meets them, unknown ones last but stable. */
function _moduleRank(m) {
  const i = MODULE_ORDER.indexOf(m);
  return i === -1 ? MODULE_ORDER.length : i;
}

/**
 * The reference case: the workbook project, whose figure the acceptance
 * tests check independently.
 */
function _referenceRun() {
  const fixture = require('../tests/fixtures/fisheries');
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
  const fixture = require('../tests/fixtures/fisheries');
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
 * Build the methodology statement.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.reference]  {result, registers} to document instead of
 *                                   the built-in workbook case — used to
 *                                   document a specific assessment.
 */
function buildMethodology(opts = {}) {
  const { result, registers } = opts.reference || _referenceRun();
  const conformance = conformanceMatrix();

  // ── The calculation chain, read out of what actually executed ──────────
  const byModule = new Map();
  for (const step of registers.auditTrail.entries) {
    const m = step.module || 'other';
    if (!byModule.has(m)) {
      byModule.set(m, { module: m, equations: new Set(), steps: [], total: 0 });
    }
    const entry = byModule.get(m);
    if (step.equation) entry.equations.add(step.equation);
    entry.steps.push({
      step: step.step,
      label: step.label,
      equation: step.equation,
      inputs: step.inputs,
      value: _round(step.value),
      unit: step.unit,
      factors: (step.factors || []).map(f => ({
        key: f.key, value: f.value, unit: f.unit,
        tier: f.tier, reference: f.reference, fallback: !!f.fallback
      }))
    });
  }

  const chain = [...byModule.values()]
    .map(e => {
      // The module's headline figure is its last step — the one that sums
      // the ones before it.
      const last = e.steps[e.steps.length - 1];
      return {
        module: e.module,
        narrative: MODULE_NARRATIVE[e.module] || null,
        equations: [...e.equations],
        stepCount: e.steps.length,
        value: last ? last.value : null,
        unit: last ? last.unit : null,
        steps: e.steps
      };
    })
    .sort((a, b) => _moduleRank(a.module) - _moduleRank(b.module));

  // ── The factor store: the research, with its sources ──────────────────
  const rows = factorStore.allRows ? factorStore.allRows() : _harvestFactorRows();
  const tierCounts = rows.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + 1;
    return acc;
  }, {});

  // Which factors this run actually leaned on, and how hard.
  const used = new Map();
  for (const step of registers.auditTrail.entries) {
    for (const f of (step.factors || [])) {
      if (!used.has(f.key)) used.set(f.key, { ...f, occurrences: 0 });
      used.get(f.key).occurrences += 1;
    }
  }

  const s = result.summary;

  return {
    type: 'pcaf-part-c-methodology',
    title: 'Methodology and Evidence',
    standard: STANDARD,
    generatedAt: new Date().toISOString(),

    provenance: {
      claim: 'Every equation, input and factor in this document was extracted from an execution of the calculation engine, not transcribed alongside it.',
      why: 'A methodology written by hand drifts from the code as soon as either changes, and the drift is invisible exactly when it matters. Reading the description out of the execution makes that failure impossible: this document cannot describe an equation the engine does not run.',
      auditSteps: registers.auditTrail.total
    },

    // 1 ───────────────────────────────────────────────────────────────
    scope: {
      tiers: [
        { tier: 'Mandatory', modules: 'A4 + A5', treatment: 'Reported as the PCAF figure.' },
        { tier: 'Optional',  modules: 'B1 + B4 + B7', treatment: 'Computed where the policy carries a use stage, reported on a separate line, never summed with construction.' },
        { tier: 'Beyond PCAF', modules: 'B2 + B5 + B8', treatment: 'Voluntary whole-life annex. Excluded from the PCAF figure entirely.' }
      ],
      exclusion: 'A1–A3 embodied product emissions are outside PCAF Part C for insurance-associated emissions. They are handled by a separate service for lending and have no import path into this engine.',
      policyGate: {
        rule: 'Construction-only cover (CAR/EAR) carries use_stage_years = 0. Cover extending into occupation (IDI/Property) runs the use stage over the cover period.',
        consequence: 'B1, B4 and B7 are therefore zero by scope rule, not by omission — and the disclosure says which.',
        override: 'A client-entered cover period applies within the gate and can never override it. An unrecognised policy type fails closed.'
      },
      structuralEnforcement: 'The roll-up module does not import the beyond-PCAF module, so tier 3 cannot reach the reported figure through the module graph at all. A test asserts that import absence, so the guarantee cannot be undone silently.'
    },

    // 2 and 3 ─────────────────────────────────────────────────────────
    calculationChain: chain,

    policyGate: _gateDemonstration(),

    workedExample: {
      note: 'The reference project below is the case the acceptance tests check independently, so the worked figures can be verified against a source outside this system.',
      project: result.policy ? {
        policyType: result.policy.policyType,
        useStageYears: result.policy.useStageYears
      } : null,
      construction_kgCO2e: _round(s.construction_kgCO2e),
      useStage_kgCO2e:     _round(s.useStage_kgCO2e),
      attributionFactor:   s.attributionFactor,
      insurerIAE_tCO2e:    s.insurerIAE_tCO2e,
      perM2Factor_kgCO2e_m2: _round(s.perM2Factor_kgCO2e_m2),
      scopeWarning: 'Construction and use stage are reported as separate lines and are never summed.'
    },

    // 4 ───────────────────────────────────────────────────────────────
    factorStore: {
      note: 'Every factor carries a data-quality tier and a named source. Local means a Sri Lankan figure, Regional a South Asian or comparable one, Global an international default.',
      tables: rows.length ? [...new Set(rows.map(r => r.table))].length : 0,
      rowCount: rows.length,
      byTier: tierCounts,
      localisationNote: (tierCounts.Global || 0) > (tierCounts.Local || 0)
        ? `${tierCounts.Global || 0} of ${rows.length} factors are Global defaults. That is stated rather than hidden: replacing them with Sri Lankan measurements is the improvement path, and the data-gap ledger ranks which to replace first by the emissions flowing through each.`
        : null,
      rows,
      usedInWorkedExample: [...used.values()].sort((a, b) => b.occurrences - a.occurrences)
    },

    // 5 ───────────────────────────────────────────────────────────────
    dataQuality: {
      options: Object.entries(OPTION_SCORES).map(([option, score]) => ({
        option, score, label: OPTION_LABELS[option] || null
      })),
      scale: '1 is best, 5 is worst.',
      assessmentScore: result.dataQuality ? result.dataQuality.score : null,
      assessmentOption: result.dataQuality ? result.dataQuality.option : null,
      aggregation: 'Across a book, scores are weighted by emissions: Σ(emissions × score) ÷ Σ(emissions).',
      whyWeighted: 'A simple average lets a small, weakly evidenced policy move the reported position as much as the largest one. Weighting by emissions keeps each policy\'s influence proportional to its share of the figure, and tells the insurer that improving the largest assessment is what actually moves the book.',
      tierRule: 'Where a factor falls back to a weaker tier the score reflects it, and the substitution is recorded in the data-gap ledger rather than absorbed silently.'
    },

    // 6 ───────────────────────────────────────────────────────────────
    conformance: {
      summary: conformance.summary,
      rules: conformance.rules.map(r => ({
        id: r.id, clause: r.clause, rule: r.rule,
        implementation: r.implementation, provingTest: r.test, status: r.status
      })),
      statement: conformance.statement,
      disclaimer: conformance.disclaimer,
      antiRot: 'A test fails the build if any rule above cites a file or a test that does not exist, so the claim cannot rot as the code moves.'
    },

    // 7 ───────────────────────────────────────────────────────────────
    limits: [
      { area: 'Emission factors', limit: `${tierCounts.Global || 0} of ${rows.length} factors are international defaults rather than Sri Lankan measurements.`, effect: 'Absolute figures carry the uncertainty of those defaults. Comparisons within the book remain sound because the same factor is applied consistently.' },
      { area: 'A5.2 site energy', limit: 'Where no comparable previous project is supplied, the RICS default intensity stands in for measured site energy.', effect: 'A5.2 usually dominates the construction figure, so this is the single assumption most worth replacing with a contractor fuel log.' },
      { area: 'Scope', limit: 'A1–A3 embodied emissions are not computed here, and the voluntary whole-life annex is excluded from the reported figure.', effect: 'The construction figure is not a whole-life carbon assessment and should not be read as one.' },
      { area: 'Comparability across years', limit: 'A policy is reported in its inception year, so each reporting year covers a different set of policies.', effect: 'A movement between annual totals is not on its own a change in performance. Intensity per m² insured and the emissions-weighted data-quality score are the comparable measures.' },
      { area: 'Standing', limit: 'This is a self-declaration of conformance with a published method.', effect: 'PCAF does not approve, endorse or certify software or service providers, and nothing here should be read as claiming that it does.' }
    ],

    divisionOfLabour: {
      engine: 'Every arithmetic operation. The engine is pure and deterministic: no network call, no clock, and no language model in any calculation path.',
      model: 'Classification, extraction, mapping a bill of quantities to factor keys, and narrative.',
      rule: 'A language model never computes a figure that reaches a regulatory disclosure.'
    }
  };
}

/** Fallback harvest when the factor store exposes no row enumerator. */
function _harvestFactorRows() {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'data', 'factors');
  const rows = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (_) { return rows; }

  for (const file of files) {
    const table = file.replace(/\.json$/, '');
    let json;
    try { json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch (_) { continue; }

    const walk = (node, trail) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, trail.concat(String(i))));
      if (!node || typeof node !== 'object') return;
      if ('value' in node && 'tier' in node) {
        rows.push({
          table,
          key: node.key || trail.join('.'),
          value: node.value,
          unit: node.unit || null,
          tier: node.tier,
          reference: node.reference || node.source || null,
          note: node.note || null
        });
      }
      for (const [k, v] of Object.entries(node)) walk(v, trail.concat(k));
    };
    walk(json, []);
  }
  return rows;
}

module.exports = { buildMethodology, MODULE_ORDER };
