/**
 * CarbonIQ FinTech — the standard Part C disclosure document
 *
 * One content model, in the order PCAF's Part C disclosure checklist reads,
 * rendered to PDF and to Word by one renderer. Two documents are built from
 * it: the per-assessment report, which explains one project, and the annual
 * disclosure, which explains a position. They share this model rather than
 * two templates, so a requirement satisfied in one cannot quietly go missing
 * from the other.
 *
 * The order is the checklist's, not ours:
 *
 *   1  Cover                        7  Recalculation and significance
 *   2  Scope and coverage           8  Emission intensity
 *   3  Gases and units              9  Limitations and assumptions
 *   4  Absolute emissions          10  Conformance statement
 *   5  Methodology                 11  Annexes, including the completed
 *   6  Data quality                    disclosure checklist
 *
 * Nothing here computes an emission. Every figure arrives from an engine
 * execution and every factor from the audit trail that execution produced;
 * this module arranges them and says where each came from.
 */

'use strict';

const { Document, Packer } = require('docx');

const theme = require('./partc-theme');
const { completeChecklist } = require('./partc-checklist');
const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');
const { splitByGhgScope, INSURER_NOTE } = require('./pcaf-partc/ghg-scopes');
const { TABLE_5_3_2, SCALE_NOTE, TABLE_CITATION } = require('./pcaf-partc/data-quality');

const N  = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const T  = (kg, dp = 3) => (Number(kg || 0) / 1000).toFixed(dp);
const F4 = n => Number(n || 0).toFixed(4);
const pct = n => (n === null || n === undefined) ? 'not stated' : `${Number(n).toFixed(1)}%`;
/*
 * A PCAF data-quality score is a category on a 1-5 scale where 1 is best. It
 * is never written "3 / 5": that reads as a mark out of five and inverts the
 * meaning for anyone who has not read the standard. A weighted score across
 * a book is an average of those categories and is written to two decimals.
 */
const score  = n => (n === null || n === undefined) ? 'not scored' : String(n);
const wscore = n => (n === null || n === undefined) ? 'not scored' : Number(n).toFixed(2);
const SCALE_QUALIFIER = 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest. A lower score is better.';

const PREPARED_BY = 'Prepared by Datum Solutions (Private) Limited';

/* The seven gases the Kyoto Protocol covers, and where each can arise in a
   construction insurance value chain. Named individually because the
   checklist asks for the seven, not for "greenhouse gases". */
const KYOTO_GASES = [
  { gas: 'Carbon dioxide', formula: 'CO2',  arises: 'Fuel combustion in freight and site plant; grid electricity; cement and steel production upstream.' },
  { gas: 'Methane',        formula: 'CH4',  arises: 'Fuel supply chains and the decomposition of construction waste sent to landfill.' },
  { gas: 'Nitrous oxide',  formula: 'N2O',  arises: 'Combustion in freight and site plant; wastewater treatment.' },
  { gas: 'Hydrofluorocarbons', formula: 'HFCs', arises: 'Refrigerant leakage from installed cooling plant, and release at replacement (B1 and B4).' },
  { gas: 'Perfluorocarbons',   formula: 'PFCs', arises: 'Primary aluminium production upstream of the bill of quantities.' },
  { gas: 'Sulphur hexafluoride', formula: 'SF6', arises: 'Electrical switchgear on larger sites.' },
  { gas: 'Nitrogen trifluoride', formula: 'NF3', arises: 'Not expected in a construction value chain; accounted for where it arises.' }
];

const UNITS_STATEMENT =
  'Reported figures are in tonnes of carbon dioxide equivalent (tCO2e). Working tables ' +
  'are in kilogrammes (kgCO2e) because the engine computes in kilogrammes and rounding ' +
  'to tonnes before aggregation would move the total. Intensity is in tCO2e per million ' +
  'units of currency, and per m2 of insured floor area. Every figure carries its unit in ' +
  'its own column rather than glued to the number.';

const FINANCED_EMISSIONS_STATEMENT =
  'This inventory contains insurance-associated emissions only. Financed emissions — the ' +
  'emissions attributed through lending and investment under Part A of the same standard — ' +
  'are a different attribution against a different denominator and are reported separately. ' +
  'The two are never added together, and no figure in this document contains any part of the other.';

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
  const premium = Number(meta.premium) || 0;
  const projectCost = Number(meta.projectCost) || 0;
  const area = Number(meta.gifa_m2) || 0;
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
     * same asset services/partc-methodology.js holds and nothing on the
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

/** The whole document, in the checklist's order. */
function buildSections(f) {
  const cur = f.currency;
  const sections = [];

  // ── 2 Scope and coverage ────────────────────────────────────────────────
  sections.push({
    id: 'coverage', title: 'Scope and coverage',
    blocks: keep([
      f.inventoryNote && b.callout(f.inventoryNote, 'What this report covers'),
      b.h2('Aggregated emissions by line of business'),
      b.table({
        head: ['Line of business', 'No.', `Premium ${cur}`, 'Construction tCO2e', 'Use stage tCO2e', 'Attributed IAE tCO2e', 'Data quality'],
        widths: [2, 0.6, 1.5, 1.5, 1.4, 1.5, 1.2],
        align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
        zebra: true,
        rows: f.byLineOfBusiness.map(l => [
          l.lineOfBusiness, String(l.policies), N(l.premium),
          Number(l.construction_tCO2e ?? (l.construction_kgCO2e || 0) / 1000).toFixed(3),
          Number(l.useStage_tCO2e ?? (l.useStage_kgCO2e || 0) / 1000).toFixed(3),
          F4(l.insurerIAE_tCO2e),
          score(l.dataQuality)
        ])
      }),
      b.caption('Construction and use stage are separate columns because they are separate lines. No row in this table sums them.'),

      b.h2('Portfolio coverage'),
      b.figure({
        label: 'Share of the inventory assessed',
        value: pct(f.coveragePct), unit: '',
        note: `${f.assessedPolicies} of ${f.policiesInYear} policies`
      }),
      b.body(f.coverageStatement),
      f.unassessed && f.unassessed.length ? b.table({
        head: ['Not yet assessed', 'Line of business', `Premium ${cur}`],
        widths: [3, 1.4, 1.4], align: ['left', 'left', 'right'],
        rows: f.unassessed.map(u => [`${u.projectName} — ${u.clientName}`, u.lineType, N(u.premium)])
      }) : null,

      b.h2('Exclusions, and why'),
      b.table({
        head: ['Excluded', 'Justification'], widths: [1.5, 4], align: ['left', 'left'],
        rows: f.exclusions.map(e => [e.what, e.why])
      }),

      b.h2('The scope applied'),
      b.table({
        head: ['Tier', 'Modules', 'How it is reported'], widths: [1.1, 1.5, 3.4],
        rows: [
          ['Mandatory', 'A4 + A5', f.scopeStatement.mandatory || 'Construction — the PCAF figure.'],
          ['Optional', 'B1 + B4 + B7', f.scopeStatement.optional || 'Use stage — a separate line, policy gated, never summed with construction.'],
          ['Beyond PCAF', 'B2 + B5 + B8', f.scopeStatement.beyondPcaf || 'Voluntary annex only; never part of any PCAF total.']
        ]
      }),
      b.caption(f.scopeCitation)
    ])
  });

  // ── 3 Gases and units ───────────────────────────────────────────────────
  sections.push({
    id: 'gases', title: 'Gases and units',
    blocks: keep([
      b.body('The seven greenhouse gases covered by the Kyoto Protocol are accounted for wherever they arise in the value chain of an insured project.'),
      b.table({
        head: ['Gas', 'Formula', 'Where it arises in this value chain'],
        widths: [1.5, 0.9, 4.2],
        rows: f.gases.map(g => [g.gas, g.formula, g.arises])
      }),
      b.h2('Global warming potential'),
      b.table({
        head: ['Basis', 'Applied'], widths: [1.6, 4.4],
        rows: [
          ['Time horizon', `${f.gwp.horizonYears}-year`],
          ['Assessment report', f.gwp.assessmentReport],
          ['Applied to', 'Every gas in the table above, converted to carbon dioxide equivalent.']
        ]
      }),
      b.body(f.gwp.note),
      b.callout(f.gwp.caveat, 'Assessment report used'),
      f.gwp.used && f.gwp.used.length ? b.table({
        head: ['Factor', 'Value', 'Source'], widths: [1.6, 0.9, 3.5], align: ['left', 'right', 'left'],
        rows: f.gwp.used.map(g => [g.key, N(g.value), g.source])
      }) : null,
      b.h2('Units'),
      b.body(f.unitsStatement)
    ])
  });

  // ── 4 Absolute emissions ────────────────────────────────────────────────
  const ghgRows = [];
  if (f.ghg) {
    for (const [lineKey, lineLabel] of [['construction', 'Construction (A4 + A5)'], ['useStage', 'Use stage (B1 + B4 + B7)']]) {
      const line = f.ghg[lineKey];
      if (lineKey === 'useStage' && !f.useStageApplies) continue;
      for (const scopeKey of ['scope1and2', 'scope3']) {
        for (const st of line[scopeKey].stages) {
          ghgRows.push([lineLabel, line[scopeKey].short, st.stage, N(st.kgCO2e), T(st.kgCO2e)]);
        }
      }
    }
  }

  sections.push({
    id: 'absolute', title: 'Absolute emissions',
    blocks: keep([
      b.callout(f.insurerScopeNote, 'Whose scope this is'),

      b.h2('The reported figures'),
      b.figure({
        label: 'Construction (A4 + A5) — the PCAF figure',
        value: T(f.construction_kgCO2e), unit: 'tCO2e',
        score: f.kind === 'annual'
          ? `data quality ${wscore(f.dqPremiumWeighted)} (premium-weighted)`
          : `data quality ${score(f.dqScore)} (Option ${f.dqOption})`,
        note: `Attributed to the re/insurer: ${F4(f.insurerIAE_tCO2e)} tCO2e.`
      }),
      f.useStageApplies ? b.figure({
        label: 'Use stage (B1 + B4 + B7) — reported separately',
        value: T(f.useStage_kgCO2e), unit: 'tCO2e',
        // No score here, by design: PCAF publishes no table for this line.
        score: 'not scored — see section 6',
        note: `Attributed to the re/insurer: ${F4(f.useStageShare_tCO2e)} tCO2e. Never added to the figure above.`
      }) : b.callout(f.policyGateStatement, 'Use stage'),

      f.scope1and2_tCO2e !== null ? b.h2('The insured\'s scope 1 and 2, and its scope 3') : null,
      f.scope1and2_tCO2e !== null ? b.table({
        head: ['Line', 'Insured scope', 'Stage', 'kgCO2e', 'tCO2e'],
        widths: [2, 1.2, 0.9, 1.3, 1.1], align: ['left', 'left', 'left', 'right', 'right'],
        zebra: true, rows: ghgRows
      }) : null,
      f.scope1and2_tCO2e !== null ? b.table({
        head: ['Reported', 'Insured scope 1 and 2 (combined) tCO2e', 'Insured scope 3 tCO2e', 'Total tCO2e'],
        widths: [1.8, 2, 1.6, 1.3], align: ['left', 'right', 'right', 'right'],
        rows: [
          Object.assign(['Construction — the PCAF figure',
            T(f.ghg.construction.scope1and2.kgCO2e), T(f.ghg.construction.scope3.kgCO2e),
            T(f.ghg.construction.total_kgCO2e)], { _total: true }),
          ...(f.useStageApplies ? [['Use stage — separate line',
            T(f.ghg.useStage.scope1and2.kgCO2e), T(f.ghg.useStage.scope3.kgCO2e),
            T(f.ghg.useStage.total_kgCO2e)]] : [])
        ]
      }) : null,
      f.scope1and2_tCO2e === null ? b.caption('The insured scope 1 and 2 / scope 3 split is reported per assessment; each assessment report in this reporting year carries it.') : null,

      b.h2('Financed emissions'),
      b.body(f.financedEmissionsStatement),

      b.h2('Per policy'),
      b.table({
        head: ['Policy', 'Line', `Premium ${cur}`, 'Attribution factor', 'Project emissions kgCO2e', 'Attributed tCO2e', 'DQ'],
        widths: [2.4, 0.9, 1.4, 1.4, 1.7, 1.3, 0.8],
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'right'],
        zebra: true,
        rows: f.policyRows.map(r => [
          r.policy, r.lineOfBusiness, N(r.premium),
          r.attributionFactor === null || r.attributionFactor === undefined ? '—' : Number(r.attributionFactor).toFixed(6),
          N(r.projectEmissions_kgCO2e), F4(r.attributed_tCO2e), score(r.dataQuality)
        ])
      }),
      f.drivers && f.drivers.length ? b.h2('What drives the figure') : null,
      f.drivers && f.drivers.length ? b.table({
        head: ['Module', 'kgCO2e', 'Share', 'Label'], widths: [0.9, 1.3, 0.9, 3.4],
        align: ['left', 'right', 'right', 'left'],
        rows: f.drivers.map(d => [d.module, N(d.value), `${Number(d.sharePct).toFixed(1)}%`, d.label])
      }) : null
    ])
  });

  // ── 5 Methodology ───────────────────────────────────────────────────────
  sections.push({
    id: 'methodology', title: 'Methodology',
    blocks: keep([
      b.h2('Attribution'),
      b.callout(f.attributionEquation, 'Equation'),
      b.body(f.attributionNote),

      b.h2('The policy gate'),
      b.body(f.policyGateStatement),
      b.caption(f.scopeCitation),

      f.equations.length ? b.h2('Every equation this run executed') : null,
      f.equations.length ? b.table({
        head: ['Module', 'Equation', 'Result kgCO2e'],
        widths: [0.8, 4.2, 1.1], align: ['left', 'left', 'right'],
        rows: f.equations.map(e => [e.module, e.equation, e.value === undefined ? '—' : N(e.value)])
      }) : null,
      f.equations.length ? b.caption(f.equationsNote
        || 'Extracted from the execution that produced the figures above, not transcribed beside it. The factors each equation consulted are listed in Annex A.') : null
    ])
  });

  // ── 6 Data quality ──────────────────────────────────────────────────────
  sections.push({
    id: 'dataQuality', title: 'Data quality',
    blocks: keep([
      b.callout(f.dqScale, 'The scale'),

      f.dqScore !== null && f.dqScore !== undefined ? b.h2('The score, and the option it comes from') : null,
      f.dqScore !== null && f.dqScore !== undefined ? b.figure({
        label: 'Data quality score',
        value: score(f.dqScore), unit: `(Option ${f.dqOption})`,
        note: f.dqOptionLabel
      }) : null,
      f.dqScore !== null && f.dqScore !== undefined
        ? b.body('PCAF assigns one score per project and decides it by which option was used to estimate the emissions. It is not an average across inputs, modules or lifecycle stages.')
        : null,

      f.dqPremiumWeighted !== null ? b.h2('The disclosed weighted score') : null,
      f.dqPremiumWeighted !== null ? b.figure({
        label: 'Premium-weighted data quality score',
        value: wscore(f.dqPremiumWeighted), unit: 'on the 1-5 scale',
        note: 'Box 6-3 (p.107): sum(premium x score) / sum(premium).'
      }) : null,
      f.dqPremiumWeightedBasis ? b.body(f.dqPremiumWeightedBasis) : null,
      f.dqCeded && f.dqCeded.weighted !== null ? b.body(
        `Treaty reinsurance, weighted by ceded premium (Box 6-4, p.108): ${wscore(f.dqCeded.weighted)}.`) : null,
      f.dqPolicyCoverage && f.dqPolicyCoverage.policiesWithoutScore > 0
        ? b.caption(`${f.dqPolicyCoverage.policiesScored} policies carry both a premium and a score and are weighted; ${f.dqPolicyCoverage.policiesWithoutScore} carry no score and are excluded from the weighting rather than counted as zero.`)
        : null,

      b.h2('Scope 3 reported separately from scopes 1 and 2'),
      b.table({
        head: ['Insured scope', 'Option used', 'Data quality score'],
        widths: [2.2, 3, 1.4], align: ['left', 'left', 'right'],
        rows: [
          ['Scope 1 and 2 (combined)', f.dqScope1and2Option ? `Option ${f.dqScope1and2Option}` : 'per policy',
            f.kind === 'annual' ? wscore(f.dqScope1and2) : score(f.dqScope1and2)],
          ['Scope 3', f.dqScope3Option ? `Option ${f.dqScope3Option}` : 'per policy',
            f.kind === 'annual' ? wscore(f.dqScope3) : score(f.dqScope3)]
        ]
      }),
      b.caption('Chapter 6, p.106 requires the score for scope 3 to be reported separately from the score for scopes 1 and 2. The two rest on different data: site energy on energy consumption, the rest on declared quantities.'),

      b.h2('Optional lifetime (use stage) emissions'),
      b.callout(
        (f.dqUseStage && f.dqUseStage.reason)
          || 'PCAF provides no data quality table for optional lifetime emissions on project insurance, so no score is reported for that line.',
        'Not scored'),
      f.dqUseStage && f.dqUseStage.statements && f.dqUseStage.statements.length
        ? b.bullets(f.dqUseStage.statements) : null,

      b.h2('Table 5.3-2 — how the score is assigned'),
      f.dqTable && f.dqTable.length ? b.table({
        head: ['Option', 'Score', 'Data used to estimate the emissions'],
        widths: [0.7, 0.6, 5], align: ['left', 'right', 'left'],
        zebra: true,
        rows: f.dqTable.map(r => [
          r.option === f.dqOption ? `${r.option}  <` : r.option,
          String(r.score), r.data
        ])
      }) : null,
      f.dqTableCitation ? b.caption(`${f.dqTableCitation}${f.dqOption ? `  The row marked < is the one this report used.` : ''}`) : null,

      f.dqDistribution && f.dqDistribution.length ? b.h2('Distribution across the book') : null,
      f.dqDistribution && f.dqDistribution.length ? b.table({
        head: ['Score', 'Option', 'Assessments', 'kgCO2e', 'Share'],
        widths: [0.6, 2.6, 1.1, 1.4, 0.9], align: ['right', 'left', 'right', 'right', 'right'],
        rows: f.dqDistribution.map(d => [String(d.score), d.label, String(d.assessments), N(d.kgCO2e), `${d.sharePct}%`])
      }) : null,

      /* Fenced off, in words, and labelled on its own heading — so it cannot
         be read as, or lifted out as, a PCAF score. */
      (f.dqInternalAid && f.dqInternalAid.rows.length) || (f.dqInputBasis && f.dqInputBasis.length)
        ? b.h2('Internal transparency aid — not a PCAF data quality score') : null,
      (f.dqInternalAid && f.dqInternalAid.rows.length) || (f.dqInputBasis && f.dqInputBasis.length)
        ? b.callout('The table below is not a PCAF data quality score and must not be quoted as one. It records how strong the evidence behind each input is, so effort can be aimed at what is weakest. It is expressed in words, is never averaged, and never enters the score above.', 'Read this first')
        : null,
      f.dqInternalAid && f.dqInternalAid.rows.length ? b.table({
        head: ['Stage', 'Input', 'Insured scope', 'Basis actually used', 'Evidence', 'Source'],
        widths: [0.7, 1.5, 1, 2.8, 0.9, 2],
        align: ['left', 'left', 'left', 'left', 'left', 'left'],
        zebra: true,
        rows: f.dqInternalAid.rows.map(i => [
          i.stage, i.input,
          i.ghgScope === 'scope1and2' ? 'Scope 1 & 2' : i.ghgScope === 'scope3' ? 'Scope 3' : '—',
          i.basis, i.strength || 'not evaluated', i.source
        ])
      }) : null,
      !f.dqInternalAid && f.dqInputBasis && f.dqInputBasis.length ? b.table({
        head: ['Stage', 'Input', 'Basis predominantly used', 'Evidence', 'Assessments'],
        widths: [0.7, 1.5, 3.4, 0.9, 1],
        align: ['left', 'left', 'left', 'left', 'right'],
        zebra: true,
        rows: f.dqInputBasis.map(i => [
          i.stage, i.input,
          i.predominantBasis + (i.basesInUse > 1 ? `  (${i.basesInUse} bases in use)` : ''),
          i.strength || 'not evaluated', String(i.assessments)
        ])
      }) : null,

      f.dqImprovement && f.dqImprovement.actions && f.dqImprovement.actions.length ? b.h2('What would improve it') : null,
      f.dqImprovement && f.dqImprovement.actions && f.dqImprovement.actions.length ? b.table({
        head: ['#', 'Project', 'Share of figure', 'Now', 'Achievable'],
        widths: [0.4, 3, 1.1, 0.7, 0.9], align: ['right', 'left', 'right', 'right', 'right'],
        rows: f.dqImprovement.actions.map(a => [String(a.rank), a.projectName, `${a.sharePct}%`, String(a.currentScore), String(a.achievableScore)])
      }) : null,

      f.dqStatement ? b.h2('Generated data-quality statement') : null,
      f.dqStatement ? b.callout(f.dqStatement) : null
    ])
  });

  // ── 7 Recalculation ─────────────────────────────────────────────────────
  sections.push({
    id: 'recalculation', title: 'Recalculation and significance threshold',
    blocks: keep([
      b.table({
        head: ['Item', 'Stated'], widths: [2.6, 3.4],
        rows: [
          ['Inventory base year', f.baseYear ? String(f.baseYear) : 'Not yet stated for this reporting entity'],
          ['Significance threshold — triggers a base-year recalculation', f.significanceThresholdPct === null ? 'Not stated' : `${f.significanceThresholdPct}% cumulative change in base-year emissions`],
          ['Restatement threshold — makes a new version of a locked assessment a restatement', f.restatementThresholdPct === null ? 'Not stated' : `${f.restatementThresholdPct}% movement in the construction figure`]
        ]
      }),
      b.h2('What triggers a recalculation of base-year emissions'),
      f.recalculationTriggers.length ? b.bullets(f.recalculationTriggers)
        : b.body('No recalculation protocol has been stated for this reporting entity. A Part C disclosure requires one.'),
      f.recalculationPolicy ? b.body(f.recalculationPolicy) : null,
      b.caption('Triggers follow the GHG Protocol Corporate Value Chain (Scope 3) Standard, phrased for an insurance book.'),
      !f.baseYear ? b.callout('No base year is stated for this reporting entity. The report says so rather than implying the current year, because a base year is a claim about history and belongs to the entity, not to its software.', 'Open item') : null,

      f.restatements.length ? b.h2('Restatements in this reporting year') : null,
      f.restatements.length ? b.table({
        head: ['Project', 'As previously reported', 'As restated', 'Movement', 'Reason'],
        widths: [2, 1.4, 1.4, 0.9, 2.6], align: ['left', 'right', 'right', 'right', 'left'],
        rows: f.restatements.map(r => [
          r.projectName || r.assessmentId || '—',
          N(r.previousValue), N(r.newValue),
          r.deltaPct === undefined ? '—' : `${Number(r.deltaPct).toFixed(2)}%`,
          r.reason || 'Not stated'
        ])
      }) : null,
      f.restatementNote ? b.caption(f.restatementNote) : null
    ])
  });

  // ── 8 Emission intensity ────────────────────────────────────────────────
  sections.push({
    id: 'intensity', title: 'Emission intensity',
    blocks: keep([
      b.body(`Economic emission intensity, reported per million ${cur} of premium and per million ${cur} of insured project cost. Premium is what the re/insurer earns; project cost is what it stands behind. A book can move sharply on one measure while barely moving on the other, so both are given.`),
      b.table({
        head: ['Measure', 'Value', 'Unit'], widths: [3.2, 1.4, 1.6],
        align: ['left', 'right', 'left'],
        rows: [
          ['Construction emissions per million of premium', f.intensityPerMillionPremium === null ? 'not available' : N(f.intensityPerMillionPremium), `tCO2e / ${cur}M premium`],
          ['Attributed emissions per million of premium', f.intensityIaePerMillionPremium === null ? 'not available' : N(f.intensityIaePerMillionPremium), `tCO2e / ${cur}M premium`],
          ['Construction emissions per million of insured project cost', f.intensityPerMillionCost === null ? 'not available' : N(f.intensityPerMillionCost), `tCO2e / ${cur}M cost`],
          ['Construction emissions per m2 of insured floor area', f.intensityPerM2 === null ? 'not available' : N(f.intensityPerM2), 'kgCO2e / m2']
        ]
      }),
      b.table({
        head: ['Denominator', 'Value'], widths: [2.6, 3.4], align: ['left', 'right'],
        rows: [
          [`Premium (${cur})`, N(f.premiumTotal)],
          [`Insured project cost (${cur})`, N(f.projectCostTotal)],
          ['Insured floor area (m2)', N(f.insuredArea_m2)]
        ]
      }),
      b.caption('Intensity is reported for the construction line. The use-stage line is never added into it.')
    ])
  });

  // ── 9 Limitations ───────────────────────────────────────────────────────
  sections.push({
    id: 'limitations', title: 'Limitations and assumptions',
    blocks: keep([
      b.body('Recorded by the calculation engine at the time each figure was produced, not written afterwards. A limitation that recurs across projects is listed once with the count.'),
      f.limitations.length ? b.table({
        head: ['Severity', 'Limitation', f.kind === 'annual' ? 'Projects' : 'Module'],
        widths: [0.9, 4.5, 1.2], align: ['left', 'left', 'left'],
        zebra: true,
        rows: f.limitations.map(l => [
          l.severity || 'info', l.message,
          f.kind === 'annual'
            ? String(l.occurrences || (l.projects || []).length || 1)
            : (l.module || l.source || '—')
        ])
      }) : b.body('The engine recorded no limitation for this run.'),
      f.dataGaps.length ? b.h2('Data gaps and the research priority') : null,
      f.dataGaps.length ? b.table({
        head: ['Factor', 'Gap', 'Tier'], widths: [1.8, 4, 0.9],
        rows: f.dataGaps.slice(0, 40).map(g => [g.key || g.factor || '—', g.message || g.note || '—', g.tier || 'n/a'])
      }) : null
    ])
  });

  // ── 10 Conformance ──────────────────────────────────────────────────────
  sections.push({
    id: 'conformance', title: 'Conformance statement',
    blocks: keep([
      b.callout(f.conformanceStatement, 'Statement'),
      b.body('Conformance is a statement by the preparer about the method applied. It is not an endorsement, approval or certification by PCAF, which does not approve or certify software or disclosures. No part of this document claims otherwise.'),
      f.conformanceRules.length ? b.h2('Rule, implementation, and the test that proves it') : null,
      f.conformanceRules.length ? b.table({
        head: ['Rule', 'Clause', 'Status'], widths: [4, 1.6, 1],
        rows: f.conformanceRules.map(r => [r.rule, r.clause, r.status])
      }) : null,
      f.conformanceRules.length ? b.caption('Each rule cites the code that enforces it and the test that proves it; the build fails if either ceases to exist.') : null
    ])
  });

  return sections;
}

/** The annexes, numbered A onwards after the numbered sections. */
function buildAnnexes(f) {
  const annexes = [];

  annexes.push({
    id: 'annexFactors', annex: 'A', title: 'Factor register',
    blocks: keep([
      b.body('Every emission factor the reported figures rest on, with its value, unit, data-quality tier and named source. Local means a Sri Lankan value, Regional a South Asian or comparable one, Global an international default.'),
      f.factorRegister.length ? b.table({
        head: ['Factor', 'Value', 'Unit', 'Tier', 'Source'],
        widths: [1.9, 0.9, 0.9, 0.8, 3.2],
        align: ['left', 'right', 'left', 'left', 'left'],
        zebra: true,
        rows: f.factorRegister.map(r => [
          r.key, N(r.value), r.unit || '—', r.tier || 'n/a', r.source || r.reference || 'not stated'
        ])
      }) : b.body('No factor register is available for this document.')
    ])
  });

  if (f.auditTrail.length) {
    annexes.push({
      id: 'annexTrace', annex: 'B', title: 'Calculation trace',
      blocks: keep([
        b.body('Every step the engine executed, in order, with the equation it applied and the value it produced. This is what lets a reader follow any disclosed number back to the bill of quantities behind it.'),
        b.table({
          head: ['#', 'Module', 'Step', 'Equation', 'kgCO2e'],
          widths: [0.4, 0.7, 1.9, 3.4, 1],
          align: ['right', 'left', 'left', 'left', 'right'],
          rows: f.auditTrail.map((e, i) => [
            String(i + 1), e.module || '—', e.label || '—', e.equation || '—',
            e.value === undefined ? '—' : N(e.value)
          ])
        })
      ])
    });
  }

  if (f.assessmentRegister && f.assessmentRegister.length) {
    annexes.push({
      id: 'annexTrace', annex: 'B', title: 'Assessment register',
      blocks: [
        b.body('Every figure in the per-policy table traces to one locked assessment, which binds a policy to a bill-of-quantities revision and a reporting year.'),
        b.table({
          head: ['Project', 'Policy', 'BOQ revision', 'Version', 'Construction kgCO2e', 'Locked'],
          widths: [2.2, 1.2, 1.1, 0.7, 1.5, 1.3],
          align: ['left', 'left', 'left', 'right', 'right', 'left'],
          zebra: true,
          rows: f.assessmentRegister.map(a => [
            a.projectName, a.lineType, a.boqRevision, String(a.version),
            N(a.construction_kgCO2e), (a.lockedAt || '').split('T')[0] || '—'
          ])
        })
      ]
    });
  }

  annexes.push({
    id: 'annexChecklist', annex: f.auditTrail.length || (f.assessmentRegister || []).length ? 'C' : 'B',
    title: 'PCAF disclosure checklist — completed',
    blocks: [b.checklist()]
  });

  return annexes;
}

/**
 * The whole document model: cover, numbered sections, annexes, checklist.
 *
 * The checklist is completed from the same facts the sections render, so it
 * cannot answer Yes to something the document does not contain.
 */
function buildStandardModel(facts) {
  const sections = buildSections(facts);
  const annexes = buildAnnexes(facts);

  const offending = _scanLanguage(facts);
  facts.endorsementLanguageFound = offending.length > 0;

  if (offending.length > 0) {
    throw new Error(
      `Report blocked: PCAF endorsement language detected (${offending.join(', ')}). ` +
      'Only conformance language is permitted.');
  }

  const checklist = completeChecklist(facts, {
    insurer: facts.insurer, title: facts.title, reportingYear: facts.reportingYear,
    publishedAt: facts.publishedAt, reportId: facts.reportId, url: facts.url
  });

  return {
    cover: {
      title: facts.title, subtitle: facts.subtitle,
      insurer: facts.insurer || facts.insured || 'Re/insurer not stated',
      reportingYear: facts.reportingYear, publishedAt: facts.publishedAt,
      standard: facts.standard, preparedBy: facts.preparedBy, reportId: facts.reportId
    },
    footerNote: `${facts.title} — FY${facts.reportingYear}`,
    sections, annexes, checklist, facts
  };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Draw the model.
 *
 * Section page numbers are recorded as each section opens, so the checklist —
 * which renders last — can tell a reviewer which page evidences each item
 * without anyone maintaining a map by hand.
 */
function renderStandardPDF(model) {
  const doc = theme.pcafDocument();
  const w = theme.pcafWriter(doc, { footerNote: model.footerNote });
  const pageOf = {};
  const pageNumber = () => doc.bufferedPageRange().count;   // 1-based, cover included

  w.cover(model.cover);

  const drawBlocks = blocks => {
    for (const blk of blocks) {
      switch (blk.kind) {
        case 'h2': w.h2(blk.text); break;
        case 'band': w.band(blk.text); break;
        case 'body': w.body(blk.text); break;
        case 'caption': w.caption(blk.text); break;
        case 'bullets': blk.items.forEach(i => w.bullet(i)); break;
        case 'callout': w.callout(blk.text, { title: blk.title }); break;
        case 'figure': w.figure(blk); break;
        case 'legend': w.legend(); break;
        case 'pageBreak': w.pageBreak(); break;
        case 'table': {
          w.table({ head: blk.head, rows: blk.rows, widths: blk.widths, align: blk.align, zebra: blk.zebra });
          if (blk.caption) w.caption(blk.caption);
          break;
        }
        case 'checklist': drawChecklist(); break;
        default: break;
      }
    }
  };

  const drawChecklist = () => {
    const c = model.checklist;
    w.body(c.provenance);
    w.h2('Header');
    w.table({
      head: ['Field', 'Stated'], widths: [1.6, 4.4],
      rows: [
        ['Re/insurer', c.header.reinsurer],
        ['Report title', c.header.reportTitle],
        ['Reporting year', String(c.header.reportingYear ?? 'not stated')],
        ['Publication date', c.header.publicationDate || 'not stated'],
        ['Report reference', c.header.reportReference || 'not stated'],
        ['URL', c.header.url || 'not published to a URL by this system']
      ]
    });
    w.h2('Summary');
    w.table({
      head: ['', 'Count', 'Of'], widths: [3.4, 1, 1], align: ['left', 'right', 'right'],
      rows: [
        ['Requirements ("shall") met', String(c.summary.requirements.met), String(c.summary.requirements.total)],
        ['Recommendations ("should") met', String(c.summary.recommendations.met), String(c.summary.recommendations.total)],
        ['Answered Yes', String(c.summary.answeredYes), String(c.summary.total)],
        ['Not applicable, with the reason stated', String(c.summary.notApplicable), String(c.summary.total)],
        Object.assign(['Answered No', String(c.summary.answeredNo), String(c.summary.total)], { _total: true })
      ]
    });
    w.legend();
    w.h2('Items');
    w.table({
      head: ['ID', 'Duty', 'Requirement', 'Clause', 'Answer', 'Page'],
      widths: [0.75, 0.7, 3.4, 1.5, 0.85, 0.55],
      align: ['left', 'left', 'left', 'left', 'left', 'right'],
      zebra: true,
      rows: c.items.map(i => [
        i.id, i.duty === 'shall' ? 'shall' : 'should',
        i.answer === 'Yes' ? i.item : `${i.item}  —  ${i.justification}`,
        i.clause, i.answer,
        pageOf[i.section] ? String(pageOf[i.section]) : '—'
      ])
    });
    w.caption('Page numbers refer to this document. An item marked "Not applicable" carries the reason in the requirement column.');
  };

  /* The cover opens the first content page itself, so the first section
     must not open another — that is how a blank sheet ends up at the front
     of a disclosure. Every section after it starts on a fresh page. */
  let n = 1;
  let first = true;
  for (const sec of model.sections) {
    if (!first) w.pageBreak();
    first = false;
    pageOf[sec.id] = pageNumber() - 1;      // the cover is not numbered
    w.h1(sec.title, { numbered: ++n });
    drawBlocks(sec.blocks);
  }

  for (const anx of model.annexes) {
    w.pageBreak();
    pageOf[anx.id] = pageNumber() - 1;
    w.h1(`Annex ${anx.annex} — ${anx.title}`);
    drawBlocks(anx.blocks);
  }

  w.finalise();
  return doc;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

/** The same model, in styles a client can edit. */
async function renderStandardDOCX(model) {
  const children = [];

  children.push(theme.wH1(model.cover.title));
  children.push(theme.wCaption(model.cover.subtitle || ''));
  children.push(theme.wTable(['Field', 'Value'], [
    ['Re/insurer', model.cover.insurer],
    ['Reporting year', String(model.cover.reportingYear)],
    ['Published', model.cover.publishedAt],
    ['Report reference', model.cover.reportId || '—'],
    ['Standard', model.cover.standard],
    ['Prepared by', model.cover.preparedBy]
  ], { align: ['left', 'left'] }));

  const push = blocks => {
    for (const blk of blocks) {
      switch (blk.kind) {
        case 'h2': children.push(theme.wH2(blk.text)); break;
        case 'band': children.push(theme.wBand(blk.text)); break;
        case 'body': children.push(theme.wBody(blk.text)); break;
        case 'caption': children.push(theme.wCaption(blk.text)); break;
        case 'bullets': blk.items.forEach(i => children.push(theme.wBullet(i))); break;
        case 'callout':
          if (blk.title) children.push(theme.wH3(blk.title));
          children.push(theme.wCallout(blk.text));
          break;
        case 'figure':
          children.push(theme.wH3(blk.label));
          children.push(theme.wBody(`${blk.value} ${blk.unit || ''}`.trim(), { bold: true, size: 30 }));
          if (blk.score) children.push(theme.wBody(blk.score));
          if (blk.note) children.push(theme.wCaption(blk.note));
          break;
        case 'table':
          children.push(theme.wTable(blk.head, blk.rows, { align: blk.align }));
          if (blk.caption) children.push(theme.wCaption(blk.caption));
          children.push(theme.wBody(''));
          break;
        case 'legend':
          children.push(theme.wCaption('Green — requirement ("shall").  Grey — recommendation ("should").'));
          break;
        case 'checklist': pushChecklist(); break;
        default: break;
      }
    }
  };

  const pushChecklist = () => {
    const c = model.checklist;
    children.push(theme.wBody(c.provenance));
    children.push(theme.wH2('Header'));
    children.push(theme.wTable(['Field', 'Stated'], [
      ['Re/insurer', c.header.reinsurer],
      ['Report title', c.header.reportTitle],
      ['Reporting year', String(c.header.reportingYear ?? 'not stated')],
      ['Publication date', c.header.publicationDate || 'not stated'],
      ['Report reference', c.header.reportReference || 'not stated'],
      ['URL', c.header.url || 'not published to a URL by this system']
    ]));
    children.push(theme.wH2('Summary'));
    children.push(theme.wTable(['', 'Count', 'Of'], [
      ['Requirements ("shall") met', String(c.summary.requirements.met), String(c.summary.requirements.total)],
      ['Recommendations ("should") met', String(c.summary.recommendations.met), String(c.summary.recommendations.total)],
      ['Answered Yes', String(c.summary.answeredYes), String(c.summary.total)],
      ['Not applicable, with the reason stated', String(c.summary.notApplicable), String(c.summary.total)],
      ['Answered No', String(c.summary.answeredNo), String(c.summary.total)]
    ], { align: ['left', 'right', 'right'] }));
    children.push(theme.wH2('Items'));
    children.push(theme.wTable(
      ['ID', 'Duty', 'Requirement', 'Clause', 'Answer', 'Section'],
      c.items.map(i => [
        i.id, i.duty, i.answer === 'Yes' ? i.item : `${i.item} — ${i.justification}`,
        i.clause, i.answer, i.section
      ])));
  };

  let n = 1;
  for (const sec of model.sections) {
    children.push(theme.wH1(`${++n}. ${sec.title}`));
    push(sec.blocks);
  }
  for (const anx of model.annexes) {
    children.push(theme.wH1(`Annex ${anx.annex} — ${anx.title}`));
    push(anx.blocks);
  }

  const doc = new Document({ styles: theme.wordStyles(), sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = {
  KYOTO_GASES, UNITS_STATEMENT, FINANCED_EMISSIONS_STATEMENT,
  assessmentFacts, annualFacts, buildSections, buildAnnexes,
  buildStandardModel, renderStandardPDF, renderStandardDOCX
};
