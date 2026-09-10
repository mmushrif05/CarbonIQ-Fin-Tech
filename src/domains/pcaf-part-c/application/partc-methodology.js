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

const factorStore        = require('../domain/factors');
const { conformanceMatrix, STANDARD } = require('../domain/conformance');
const { OPTION_SCORES, OPTION_LABELS } = require('../domain/data-quality');
const { _referenceRun, _gateDemonstration, _scenarios } = require('./methodology/demonstrations');
const { _harvestFactorRows, _openItems, allFactorRows } = require('./methodology/factors');
const { MODULE_ORDER, MODULE_NARRATIVE } = require('./methodology/common');
const { _round, _moduleRank } = require('./methodology/common');

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
        consequence: 'B1, B4 and B7 are therefore zero by scope rule (PCAF Part C v2 \u00a75.3), not by omission.',
        override: 'A client-entered cover period applies within the gate and can never override it. An unrecognised policy type fails closed.'
      },
      structuralEnforcement: 'The roll-up module does not import the beyond-PCAF module, so tier 3 cannot reach the reported figure through the module graph at all. A test asserts that import absence, so the guarantee cannot be undone silently.'
    },

    // 2 and 3 ─────────────────────────────────────────────────────────
    calculationChain: chain,

    policyGate: _gateDemonstration(),

    scenarios: _scenarios(),

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
    // PCAF requires a score beside any disclosed figure, so the scoring the
    // engine produced for the reference run travels with the method that
    // produced it.
    dqScoring: result.dqScoring || null,
    dqStatement: result.dqDisclosureStatement || null,

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
    // Open items, harvested from the factor store's own honesty flags plus
    // the scope decisions taken. Each says what it is, why it is a limit,
    // and how it is meant to be resolved — a roadmap rather than a warning.
    openItems: _openItems(rows),

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

module.exports = { buildMethodology, allFactorRows, MODULE_ORDER };
