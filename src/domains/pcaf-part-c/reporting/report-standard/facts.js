/**
 * The facts a report is built from: one assessment, or one reporting year.
 */

'use strict';

const { containsForbiddenLanguage } = require('../../domain/data-quality');
const { splitByGhgScope, INSURER_NOTE } = require('../../domain/ghg-scopes');
const { TABLE_5_3_2, TABLE_CITATION } = require('../../domain/data-quality');
const { N, T, F4, SCALE_QUALIFIER, PREPARED_BY, KYOTO_GASES, UNITS_STATEMENT, FINANCED_EMISSIONS_STATEMENT } = require('./common');
const { numberOr } = require('../../../../shared/numbers');

// ---------------------------------------------------------------------------
// Facts — what the sections and the checklist both read
// ---------------------------------------------------------------------------

/**
 * Scan the document's own prose for endorsement language.
 *
 * Computed with the facts rather than at render time, so the checklist can
 * answer the question from the facts alone — a checklist that depends on a
 * value only the renderer sets would answer "No" whenever it was completed
 * on its own, which is exactly when a reviewer would run it.
 */
function _scanLanguage(facts) {
  const prose = [
    facts.conformanceStatement, facts.coverageStatement, facts.attributionNote,
    facts.policyGateStatement, facts.dqStatement, facts.memo
  ].filter(Boolean).join('\n');
  return containsForbiddenLanguage(prose);
}

/** Factors the run actually used, from its own audit trail. */
function _factorRegister(registers) {
  const used = new Map();
  for (const step of ((registers.auditTrail && registers.auditTrail.entries) || [])) {
    for (const f of (step.factors || [])) {
      if (!used.has(f.key)) {
        used.set(f.key, {
          key: f.key, value: f.value, unit: f.unit || '',
          tier: f.tier || 'n/a', source: f.reference || 'not stated', occurrences: 0
        });
      }
      used.get(f.key).occurrences += 1;
    }
  }
  return [...used.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

/** Equations the run actually executed, from the same trail. */
function _equations(registers) {
  const seen = new Set();
  const out = [];
  for (const step of ((registers.auditTrail && registers.auditTrail.entries) || [])) {
    if (!step.equation || seen.has(step.equation)) continue;
    seen.add(step.equation);
    out.push({
      module: step.module || '—',
      label: step.label || '',
      equation: step.equation,
      value: step.value,
      factors: (step.factors || []).map(f => `${f.key} = ${f.value}${f.unit ? ' ' + f.unit : ''} [${f.tier || 'n/a'}] ${f.reference || ''}`.trim())
    });
  }
  return out;
}

/**
 * Facts for a per-assessment report — one policy, one project.
 *
 * The inventory this report describes is that one policy, and the coverage
 * statement says so plainly: a hundred per cent of a one-policy inventory is
 * not a claim about the insurer's book, and reading it as one would be the
 * easiest mistake this document could invite.
 */
function assessmentFacts({ result, registers, settings = {}, meta = {}, memo = null }) {
  const s = result.summary;
  const ghg = splitByGhgScope(result);
  const dq = result.dqScoring || null;
  const useStageApplies = Number(result.policy.useStageYears) > 0;
  const lineType = result.policy.policyType || 'Not stated';
  const premium = numberOr(meta.premium);
  const projectCost = numberOr(meta.projectCost);
  const area = numberOr(meta.gifa_m2);
  const currency = settings.currency || meta.currency || 'LKR';

  const exclusions = [
    { what: 'A1-A3 embodied product emissions', why: 'Outside the scope PCAF Part C sets for insurance-associated emissions. Reported for lending under Part A by a separate service, never merged with this figure.' },
    { what: 'Beyond-PCAF modules B2, B5 and B8', why: 'Voluntary whole-life reporting under RICS and EN 15978. Excluded from every PCAF total; available only as a clearly labelled voluntary annex.' },
    { what: 'A5.4 worker transport', why: 'Excluded per the scope agreed for this release; disclosed here rather than omitted silently.' },
    { what: 'B4.1 component replacement', why: 'Deferred. B4 covers refrigerant re-release from HVAC replacement (B4.2) only. Over a typical cover period durable components are replaced zero times, so the omission is small — but it is an omission and is stated.' }
  ];
  if (!useStageApplies) {
    exclusions.unshift({
      what: 'Use stage B1, B4 and B7',
      why: `Non-applicable. ${lineType} is construction-only cover, so the policy gate sets the use stage to zero years: these modules are zero by scope rule, not by omission.`
    });
  }

  const scopeAt = scope => (dq && dq.byGhgScope && dq.byGhgScope[scope]) || null;
  const scoreOf  = scope => (scopeAt(scope) || {}).score ?? null;
  const optionOf = scope => (scopeAt(scope) || {}).option ?? null;

  const facts = {
    kind: 'assessment',
    title: 'Insurance-Associated Emissions Assessment',
    subtitle: `${meta.projectName || 'Project'} — ${lineType} policy`,
    standard: result.standard,
    scopeCitation: 'PCAF Part C v2 §5.3, "Emission scopes covered" (p.51).',
    insurer: meta.insurer || settings.insurerName || null,
    insured: meta.insured || null,
    projectName: meta.projectName || 'Unnamed project',
    reportingYear: meta.reportingYear || settings.reportingYear || new Date().getUTCFullYear(),
    publishedAt: (meta.generatedAt || result.generatedAt || new Date().toISOString()).split('T')[0],
    reportId: meta.reportId || `PARTC-${String(meta.runId || 'RUN').toUpperCase()}`,
    preparedBy: PREPARED_BY,
    currency,
    generatedAt: result.generatedAt || new Date().toISOString(),

    // 2
    inventoryNote: 'This report describes one policy. Portfolio coverage across the book is stated in the annual disclosure for the reporting year.',
    byLineOfBusiness: [{
      lineOfBusiness: lineType, policies: 1, premium,
      construction_tCO2e: Number(T(s.construction_kgCO2e)),
      useStage_tCO2e: Number(T(s.useStage_kgCO2e)),
      insurerIAE_tCO2e: s.insurerIAE_tCO2e,
      dataQuality: dq ? dq.construction.score : (result.dataQuality || {}).score
    }],
    coveragePct: 100,
    coverageStatement: `The inventory in this report is a single policy — ${lineType}${meta.policyRef ? ` ${meta.policyRef}` : ''} on ${meta.projectName || 'the project'} — and it is assessed in full. That is not a statement about the share of the insurer's book that has been measured; the annual disclosure reports that.`,
    policiesInYear: 1,
    assessedPolicies: 1,
    exclusions,
    scopeStatement: result.scopeModel,

    // 3
    gases: KYOTO_GASES,
    gwp: _gwpBasis(registers),
    unitsStatement: UNITS_STATEMENT,

    // 4
    construction_kgCO2e: s.construction_kgCO2e,
    useStage_kgCO2e: s.useStage_kgCO2e,
    insurerIAE_tCO2e: s.insurerIAE_tCO2e,
    useStageShare_tCO2e: s.useStageInsurerShare_tCO2e,
    attributionFactor: s.attributionFactor,
    perM2Factor: s.perM2Factor_kgCO2e_m2,
    ghg,
    scope1and2_tCO2e: Number(T(ghg.construction.scope1and2.kgCO2e)),
    scope3_tCO2e: Number(T(ghg.construction.scope3.kgCO2e)),
    insurerScopeNote: INSURER_NOTE,
    useStageApplies,
    useStageReportedSeparately: true,
    financedEmissionsStatement: FINANCED_EMISSIONS_STATEMENT,
    policyRows: [{
      policy: meta.policyRef || meta.projectName || 'This policy',
      lineOfBusiness: lineType,
      premium,
      attributionFactor: s.attributionFactor,
      projectEmissions_kgCO2e: s.construction_kgCO2e,
      attributed_tCO2e: s.insurerIAE_tCO2e,
      dataQuality: dq ? dq.construction.score : (result.dataQuality || {}).score
    }],
    drivers: result.sensitivity.moduleContributions,

    // 5
    attributionEquation: 'insurance-associated emissions = attribution factor x project emissions,  where attribution factor = premium / project cost',
    attributionNote: `Project-specific cover, so the denominator is the insured project's own cost. ${premium > 0 && projectCost > 0 ? `${N(premium)} / ${N(projectCost)} ${currency} = ${F4(s.attributionFactor)}.` : `Attribution factor ${F4(s.attributionFactor)}.`} Attribution is applied to this project alone; premiums and emissions are never pooled before attribution.`,
    /*
     * The module equations stay. They are a different artefact from the audit
     * trail: ten formulas, several of them RICS's and PCAF's own as published,
     * against 58 traced steps carrying every input and every factor. Part C
     * ch.6 METHODOLOGY makes giving them a "shall" (checklist MET-2), so
     * removing them would drop this report below the standard it cites.
     */
    equations: _equations(registers),
    policyGateStatement: result.policy.useStageYears > 0
      ? `${lineType} cover extends into occupation, so the use stage runs over the ${result.policy.useStageYears}-year cover period and is reported as a separate line.`
      : `${lineType} is construction-only cover. The policy gate sets use_stage_years = 0, so B1, B4 and B7 are zero by scope rule and not by omission. A client-entered cover period applies within the gate and can never override it.`,

    // 6
    dq,
    /* One score for the project, from the option used (Table 5.3-2). */
    dqOption: dq ? dq.construction.option : (result.dataQuality || {}).option,
    dqOptionLabel: dq ? dq.construction.optionLabel : (result.dataQuality || {}).optionLabel,
    dqScore: dq ? dq.construction.score : (result.dataQuality || {}).score,
    dqScale: SCALE_QUALIFIER,
    dqTable: dq ? dq.table : [],
    dqTableCitation: dq ? dq.standard : null,
    dqPremiumWeighted: dq ? dq.singlePolicyWeighted : null,
    dqPremiumWeightedBasis: 'This report covers one policy, so the premium-weighted score of Box 6-3 reduces to that policy\'s own score. Across a book the disclosed score is sum(premium x score) / sum(premium), and the annual disclosure reports it on that basis.',
    dqScope1and2: scoreOf('scope1and2'),
    dqScope1and2Option: optionOf('scope1and2'),
    dqScope3: scoreOf('scope3'),
    dqScope3Option: optionOf('scope3'),
    /* No use-stage score exists: PCAF publishes no table for it. */
    dqUseStage: dq ? dq.useStage : null,
    dqInternalAid: dq ? dq.internalAid : null,
    dqInputBasis: [],
    everyFigureScored: !!dq && typeof dq.construction.score === 'number',
    dqStatement: result.dqDisclosureStatement || null,

    // 7
    baseYear: settings.baseYear || null,
    significanceThresholdPct: typeof settings.significanceThresholdPct === 'number' ? settings.significanceThresholdPct : null,
    restatementThresholdPct: typeof settings.restatementThresholdPct === 'number' ? settings.restatementThresholdPct : null,
    recalculationTriggers: settings.recalculationTriggers || [],
    recalculationPolicy: settings.recalculationPolicy || '',
    restatements: [],

    // 8
    premiumTotal: premium,
    projectCostTotal: projectCost,
    insuredArea_m2: area,
    intensityPerMillionPremium: premium > 0 ? Number((Number(T(s.construction_kgCO2e)) / (premium / 1e6)).toFixed(4)) : null,
    intensityIaePerMillionPremium: premium > 0 ? Number((s.insurerIAE_tCO2e / (premium / 1e6)).toFixed(4)) : null,
    intensityPerMillionCost: projectCost > 0 ? Number((Number(T(s.construction_kgCO2e)) / (projectCost / 1e6)).toFixed(4)) : null,
    intensityPerM2: s.perM2Factor_kgCO2e_m2,

    // 9
    limitations: ((registers.assumptions && registers.assumptions.limitations) || [])
      .map(l => ({ severity: l.severity, message: l.message })),
    dataGaps: (registers.dataGaps && registers.dataGaps.entries) || [],

    // 10
    conformanceStatement: result.dqDisclosureStatement || result.disclosureNote,
    conformanceRules: [],

    // 11
    factorRegister: _factorRegister(registers),
    /*
     * The trace is counted, never printed. Annex C is every equation the
     * engine executed with its inputs and factors — the method itself, and the
     * same asset src/domains/pcaf-part-c/application/partc-methodology.js holds and nothing on the
     * website serves. The count is what the disclosure checklist tests
     * (traceability is a requirement and it is met), and the report is
     * downloaded from a screen anyone can open, so the steps stay out of it.
     */
    auditTrail: [],
    auditTrailEntries: (registers.auditTrail && registers.auditTrail.total) || 0,
    beyondPcafAnnex: null,
    memo
    /*
     * The whole register bundle is deliberately not carried on the facts. It
     * was, and nothing read it — but it held the audit trail, so any caller
     * that serialised this model published every step with its inputs. What
     * the sections need is already extracted above: the factor register, the
     * equations, the limitations, the data gaps and the trace's count.
     */
  };

  facts.endorsementLanguageFound = _scanLanguage(facts).length > 0;
  return facts;
}

/** The GWP basis, read from the factors the run consulted rather than asserted. */
function _gwpBasis(registers) {
  const gwps = [];
  for (const step of ((registers.auditTrail && registers.auditTrail.entries) || [])) {
    for (const f of (step.factors || [])) {
      if (/gwp/i.test(f.key)) gwps.push({ key: f.key, value: f.value, source: f.reference || 'not stated' });
    }
  }
  return {
    horizonYears: 100,
    assessmentReport: 'IPCC Fifth Assessment Report (AR5)',
    note: 'All gases are converted to carbon dioxide equivalent on a 100-year time horizon using IPCC AR5 global warming potentials.',
    caveat: 'Where a source quotes an earlier assessment report the difference is material and is stated rather than reconciled silently: R-410A carries a 100-year GWP of 1,924 under AR5 and 2,088 under AR4. This inventory uses AR5 throughout.',
    used: gwps
  };
}

/**
 * Facts for the annual disclosure — a position across a book.
 *
 * The structured disclosure object already carries the roll-up; this reads
 * it rather than recomputing anything, so the document and the API answer
 * cannot disagree.
 */
function annualFacts({ disclosure, roll, settings = {}, factorRows = [], equations = [] }) {
  const p = disclosure.position;
  const dqd = (roll.dataQuality && roll.dataQuality.disclosed) || {};
  const useStageApplies = Number(p.useStage.total_kgCO2e) > 0;

  const exclusions = [
    { what: 'A1-A3 embodied product emissions', why: 'Outside the scope PCAF Part C sets for insurance-associated emissions. Reported for lending under Part A by a separate service, never merged with this figure.' },
    { what: 'Beyond-PCAF modules B2, B5 and B8', why: 'Voluntary whole-life reporting. Excluded from every total in this disclosure.' },
    { what: 'Policies without a locked assessment', why: `${disclosure.coverage.policiesInYear - disclosure.coverage.assessedPolicies} of ${disclosure.coverage.policiesInYear} policies in force are not yet assessed and contribute nothing to the figures above. Coverage is stated in section 2 rather than in an annex, because a total drawn from part of a book means something different from one drawn from all of it.` },
    { what: 'A5.4 worker transport and B4.1 component replacement', why: 'Excluded and deferred respectively for this release; both are stated rather than omitted silently.' }
  ];

  const facts = {
    kind: 'annual',
    title: 'Insurance-Associated Emissions Annual Disclosure',
    subtitle: `PCAF Part C — reporting year ${disclosure.meta.reportingYear}`,
    standard: disclosure.standard,
    scopeCitation: 'PCAF Part C v2 §5.3, "Emission scopes covered" (p.51).',
    insurer: disclosure.meta.insurer,
    insured: null,
    projectName: null,
    reportingYear: disclosure.meta.reportingYear,
    publishedAt: (disclosure.meta.generatedAt || new Date().toISOString()).split('T')[0],
    reportId: disclosure.meta.reportId,
    preparedBy: PREPARED_BY,
    currency: disclosure.meta.currency,
    generatedAt: disclosure.meta.generatedAt,

    // 2
    inventoryNote: null,
    byLineOfBusiness: roll.byLineOfBusiness || [],
    coveragePct: disclosure.coverage.coveragePct,
    coverageStatement: disclosure.coverage.statement,
    policiesInYear: disclosure.coverage.policiesInYear,
    assessedPolicies: disclosure.coverage.assessedPolicies,
    unassessed: disclosure.coverage.unassessed || [],
    exclusions,
    scopeStatement: {
      mandatory: disclosure.scope.mandatory,
      optional: disclosure.scope.optional,
      beyondPcaf: disclosure.scope.excluded
    },

    // 3
    gases: KYOTO_GASES,
    gwp: {
      horizonYears: 100,
      assessmentReport: 'IPCC Fifth Assessment Report (AR5)',
      note: 'All gases are converted to carbon dioxide equivalent on a 100-year time horizon using IPCC AR5 global warming potentials.',
      caveat: 'Where a source quotes an earlier assessment report the difference is stated rather than reconciled silently: R-410A carries a 100-year GWP of 1,924 under AR5 and 2,088 under AR4. This inventory uses AR5 throughout.',
      used: []
    },
    unitsStatement: UNITS_STATEMENT,

    // 4
    construction_kgCO2e: p.construction.total_kgCO2e,
    useStage_kgCO2e: p.useStage.total_kgCO2e,
    insurerIAE_tCO2e: p.construction.insurerIAE_tCO2e,
    useStageShare_tCO2e: p.useStage.insurerShare_tCO2e,
    attributionFactor: null,
    ghg: roll.ghgScopes || null,
    scope1and2_tCO2e: roll.ghgScopes ? Number(T(roll.ghgScopes.construction.scope1and2.kgCO2e)) : null,
    scope3_tCO2e: roll.ghgScopes ? Number(T(roll.ghgScopes.construction.scope3.kgCO2e)) : null,
    insurerScopeNote: INSURER_NOTE,
    useStageApplies,
    useStageReportedSeparately: true,
    financedEmissionsStatement: FINANCED_EMISSIONS_STATEMENT,
    policyRows: disclosure.policies.map(r => ({
      policy: `${r.projectName}${r.policyRef ? ' — ' + r.policyRef : ''}`,
      lineOfBusiness: r.lineType,
      premium: r.premium,
      attributionFactor: r.attributionFactor,
      projectEmissions_kgCO2e: r.construction_kgCO2e,
      attributed_tCO2e: r.insurerIAE_tCO2e,
      dataQuality: r.dqConstruction
    })),
    drivers: [],

    // 5
    attributionEquation: 'insurance-associated emissions = attribution factor x project emissions,  where attribution factor = premium / project cost',
    attributionNote: disclosure.method.attribution + ' ' + disclosure.method.aggregation,
    equations,
    equationsNote: 'Extracted from an execution of the same engine, at the same version, that produced every figure summed in this disclosure. An annual position has no single trace of its own; the trace behind each figure is in the assessment register.',
    policyGateStatement: disclosure.scope.policyGate,

    // 6
    dq: null,
    dqOption: null,
    dqOptionLabel: null,
    dqScore: null,
    dqScale: SCALE_QUALIFIER,
    dqTable: TABLE_5_3_2,
    dqTableCitation: TABLE_CITATION,
    dqPremiumWeighted: dqd.overall ? dqd.overall.weighted : null,
    dqPremiumWeightedBasis: (roll.dataQuality && roll.dataQuality.basis) || null,
    dqCeded: dqd.ceded || null,
    dqScope1and2: dqd.scope1and2 ? dqd.scope1and2.weighted : null,
    dqScope1and2Option: null,
    dqScope3: dqd.scope3 ? dqd.scope3.weighted : null,
    dqScope3Option: null,
    dqUseStage: {
      scored: false, applies: useStageApplies,
      reason: (roll.dataQuality && roll.dataQuality.useStageNote) || null,
      statements: []
    },
    dqInternalAid: null,
    dqPolicyCoverage: dqd.overall || null,
    dqInputBasis: (roll.dataQuality && roll.dataQuality.inputBasis) || [],
    dqDistribution: disclosure.dataQuality.distribution || [],
    dqImprovement: disclosure.dataQuality.improvement || null,
    everyFigureScored: dqd.overall ? dqd.overall.weighted !== null : false,
    dqStatement: null,

    // 7
    baseYear: settings.baseYear || null,
    significanceThresholdPct: typeof settings.significanceThresholdPct === 'number' ? settings.significanceThresholdPct : null,
    restatementThresholdPct: typeof settings.restatementThresholdPct === 'number' ? settings.restatementThresholdPct : null,
    recalculationTriggers: settings.recalculationTriggers || [],
    recalculationPolicy: settings.recalculationPolicy || '',
    restatements: (disclosure.restatements && disclosure.restatements.entries) || [],
    restatementNote: disclosure.restatements ? disclosure.restatements.note : null,
    priorYear: disclosure.priorYear,

    // 8
    premiumTotal: roll.intensity ? roll.intensity.premiumTotal : 0,
    projectCostTotal: roll.intensity ? roll.intensity.projectCostTotal : 0,
    insuredArea_m2: roll.intensity ? roll.intensity.insuredArea_m2 : 0,
    intensityPerMillionPremium: roll.intensity ? roll.intensity.constructionPerMillionPremium_tCO2e : null,
    intensityIaePerMillionPremium: roll.intensity ? roll.intensity.iaePerMillionPremium_tCO2e : null,
    intensityPerMillionCost: roll.intensity ? roll.intensity.constructionPerMillionCost_tCO2e : null,
    intensityPerM2: roll.intensity ? roll.intensity.constructionPerM2_kgCO2e : null,

    // 9
    limitations: (disclosure.annexes.A && disclosure.annexes.A.entries) || [],
    dataGaps: (disclosure.annexes.B && disclosure.annexes.B.entries) || [],

    // 10
    conformanceStatement: disclosure.conformance.statement,
    conformanceRules: disclosure.conformance.rules || [],

    // 11
    factorRegister: factorRows,
    auditTrail: [],
    auditTrailEntries: (disclosure.annexes.C && disclosure.annexes.C.entries || []).length,
    assessmentRegister: (disclosure.annexes.C && disclosure.annexes.C.entries) || [],
    beyondPcafAnnex: null,
    memo: null,
    registers: null
  };

  facts.endorsementLanguageFound = _scanLanguage(facts).length > 0;
  return facts;
}

// ---------------------------------------------------------------------------
// Sections — the same blocks for both documents
// ---------------------------------------------------------------------------

const b = {
  h2:      text => ({ kind: 'h2', text }),
  band:    text => ({ kind: 'band', text }),
  body:    text => ({ kind: 'body', text }),
  caption: text => ({ kind: 'caption', text }),
  bullets: items => ({ kind: 'bullets', items }),
  callout: (text, title) => ({ kind: 'callout', text, title }),
  figure:  o => ({ kind: 'figure', ...o }),
  table:   o => ({ kind: 'table', ...o }),
  legend:  () => ({ kind: 'legend' }),
  checklist: () => ({ kind: 'checklist' }),
  pageBreak: () => ({ kind: 'pageBreak' })
};

const keep = blocks => blocks.filter(Boolean);

module.exports = { _scanLanguage, _factorRegister, _equations, assessmentFacts, _gwpBasis, annualFacts, b, keep };
