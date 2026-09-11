// @ts-check
/**
 * The facts a PCAF Part A §5.9 sovereign-debt disclosure is built from — one
 * reporting year of the sovereign register, and, for the per-holding report,
 * one engine result.
 *
 * Nothing here computes an emission. Every figure arrives from the sovereign
 * roll-up (which reads the engine's stored results) or from an engine result
 * handed in; this module arranges them in the order Chapter 6 reads and says
 * where each came from. The checklist is answered from the same facts.
 *
 * One rule shapes the whole document, and it is the §5.2 rule again: this
 * report covers the **§5.9 asset class** — sovereign debt — which is one input
 * to a bank's Chapter 6 financed-emissions disclosure, not the disclosure. The
 * entity's own gross scope 1/2/3 inventory (SLFRS S2 §29(a)) is a different,
 * larger claim, and this document says so on its face.
 *
 * What makes a sovereign document different from a §5.2 one, and each is a way
 * a figure could quietly say the wrong thing:
 *   Scope 1 is territorial (production) emissions on TWO LULUCF boundaries,
 *   reported both ways and never summed (§5.9, p.141).
 *   Scope 2 and 3 are shoulds — reported absent rather than zero where not held.
 *   The denominator is PPP-adjusted GDP, never equity plus debt (p.144).
 *   The disclosed data-quality score is one score, weighted by outstanding
 *   amount (p.128), from Table 5.9-6 — not §5.2's option mapping.
 */

'use strict';

const { faceStatement, resolve: resolveAssuranceMode } = require('../../../../shared/assurance-mode');
const { release: datasetRelease } = require('../../domain/sovereign/dataset');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition, §5.9 and Chapter 6.';

const ASSET_CLASS_LABEL = 'Sovereign debt (§5.9)';

/* The seven Kyoto gases, named because Chapter 6 asks for the seven, with
   where each arises in a national territorial inventory. A sovereign figure is
   a country's own UNFCCC inventory attributed by output, so the gases are the
   inventory's, not a single borrower's. */
const KYOTO_GASES = [
  { gas: 'Carbon dioxide', formula: 'CO2', arises: 'Fuel combustion, industry and land use across the national territory.' },
  { gas: 'Methane', formula: 'CH4', arises: 'Agriculture, waste and fossil-fuel supply in the national inventory.' },
  { gas: 'Nitrous oxide', formula: 'N2O', arises: 'Agricultural soils and combustion in the national inventory.' },
  { gas: 'Hydrofluorocarbons', formula: 'HFCs', arises: 'Refrigeration and air-conditioning reported to the UNFCCC.' },
  { gas: 'Perfluorocarbons', formula: 'PFCs', arises: 'Aluminium and electronics production in the national inventory.' },
  { gas: 'Sulphur hexafluoride', formula: 'SF6', arises: 'Electrical transmission and distribution equipment.' },
  { gas: 'Nitrogen trifluoride', formula: 'NF3', arises: 'Electronics manufacture, where the national inventory reports it.' },
];

const SCOPE_STATEMENT =
  'This report covers one PCAF asset class — sovereign debt (Part A §5.9). It is '
  + 'one input to a Chapter 6 financed-emissions disclosure, not the disclosure: the '
  + 'reporting entity’s own gross scope 1, 2 and 3 inventory is a separate and larger '
  + 'claim, made where the entity states it.';

function conformanceStatement() {
  return 'The method in this report conforms to PCAF’s Global GHG Accounting and '
    + 'Reporting Standard Part A (Third Edition, December 2025), §5.9 and Chapter 6. '
    + 'PCAF sets the method; it does not approve, endorse or certify this report or the '
    + 'figures in it. Sovereign debt is an asset class the Third Edition adds, and it has '
    + 'not been reviewed by the GHG Protocol; this report does not carry the GHG Protocol’s '
    + '"Built on" mark for it.';
}

function coverageStatement(coverage) {
  if (!coverage || coverage.share === null || coverage.share === undefined) {
    return 'Coverage cannot be stated as a percentage until the reporting entity states '
      + 'its total loans and investments for the year. It is reported absent rather than '
      + 'assumed, because a coverage figure is meaningful only against the whole book '
      + '(PCAF Disclosure Checklist Part A, p.124).';
  }
  return `Coverage is the assessed outstanding amount over the reporting entity’s total `
    + `loans and investments for the year, ${Number(coverage.share).toFixed(2)}%. A total drawn `
    + `from part of the book means something different from one drawn from all of it, so the `
    + `percentage is stated beside the figures it qualifies (p.124).`;
}

/* A document built without an assurance position falls back to the honest
   default rather than to silence — the failure report-integrity exists to
   prevent. */
const DEFAULT_ASSURANCE = (() => {
  const r = resolveAssuranceMode({});
  return { ...r, statement: faceStatement(r) };
})();

/** The entity's recalculation protocol, normalised for the section that prints it. */
function recalculationOf(r) {
  const s = r || {};
  return {
    baseYear: (s.baseYear === null || s.baseYear === undefined) ? null : s.baseYear,
    significanceThresholdPct: Number.isFinite(Number(s.significanceThresholdPct)) ? Number(s.significanceThresholdPct) : null,
    triggers: Array.isArray(s.recalculationTriggers) ? s.recalculationTriggers : [],
    policy: s.recalculationPolicy || '',
  };
}

/**
 * Facts for the annual §5.9 disclosure of one reporting year.
 *
 * @param {object} input
 * @param {any} input.position    the sovereign register's reporting-year roll-up
 * @param {string|number} input.reportingYear
 * @param {string} [input.insurer]
 * @param {string} [input.currency]
 * @param {any} [input.assurance]
 * @param {any} [input.recalculation]
 * @param {object} [input.meta]
 */
function disclosureFacts(input) {
  const pos = input.position || {};
  const totals = pos.totals || {};
  const dq = pos.dataQuality || {};
  const coverage = pos.coverage || {};
  const assurance = input.assurance || DEFAULT_ASSURANCE;
  /* Sovereign debt is denominated in international USD by construction (the
     PPP-GDP denominator), so the currency is USD unless a stated book says
     otherwise for its own total. */
  const currency = input.currency || (coverage.currency) || 'USD';

  return {
    kind: 'disclosure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    title: 'PCAF Part A §5.9 — Financed emissions of sovereign debt',
    subtitle: `Reporting year ${input.reportingYear}`,
    insurer: input.insurer || 'Reporting entity not stated',
    reportingYear: input.reportingYear,
    currency,
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    exposures: pos.exposures,
    totals: {
      scope1Excl: Number.isFinite(totals.financedScope1ExclLULUCF) ? totals.financedScope1ExclLULUCF : null,
      scope1Incl: totals.financedScope1InclLULUCF || { value: null, heldCount: 0, total: pos.exposures || 0 },
      scope2: totals.financedScope2 || { value: null, heldCount: 0 },
      scope3: totals.financedScope3 || { value: null, heldCount: 0 },
      note: totals.note || '',
      category: totals.category || 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },
    dataQuality: {
      score: (dq && dq.score !== undefined) ? dq.score : null,
      scored: dq.scored || 0,
      excluded: dq.excluded || 0,
      reference: dq.reference || 'PCAF Disclosure Checklist Part A, p.128',
    },
    coverage: {
      share: coverage.share,
      totalLoansAndInvestments: coverage.totalLoansAndInvestments,
      assessedOutstanding: coverage.assessedOutstanding,
      statedBy: coverage.basisStatedBy || null,
      basis: coverage.basis,
      remedy: coverage.remedy || null,
    },
    bySovereign: pos.bySovereign || [],
    improvementPlan: pos.improvementPlan || [],
    dataset: datasetRelease(),
    recalculation: recalculationOf(input.recalculation),

    assurance,
    conformanceStatement: conformanceStatement(),
    coverageStatement: coverageStatement(coverage),
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
}

/**
 * Facts for a single sovereign holding — one bond or loan.
 *
 * @param {object} input
 * @param {any} input.result   an assessSovereign() result
 * @param {any} [input.assurance]
 * @param {string} [input.insurer]
 * @param {object} [input.meta]
 */
function holdingFacts(input) {
  const r = input.result;
  const sov = r.sovereign || {};
  const inv = r.inventory || {};
  const assurance = input.assurance || DEFAULT_ASSURANCE;

  return {
    kind: 'holding',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    title: `PCAF Part A §5.9 — ${sov.name || sov.country || 'Sovereign'}`,
    subtitle: 'Financed emissions of one sovereign bond or loan',
    insurer: input.insurer || 'Reporting entity not stated',
    reportingYear: sov.reportingYear || null,
    currency: 'USD',
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    sovereign: sov,
    attribution: r.attribution || null,
    inventory: inv,
    scope1: inv.scope1 || {},
    scope2: inv.scope2 || null,
    scope3: inv.scope3 || null,
    dataQuality: inv.dataQuality || {},
    productionIntensity: inv.productionIntensity || null,
    consumption: r.consumption || null,
    removalsNote: r.removalsNote || '',
    findings: (r.validation && r.validation.findings) || [],
    validationNote: (r.validation && r.validation.note) || '',
    dataset: datasetRelease(),

    assurance,
    conformanceStatement: conformanceStatement(),
    coverageStatement: 'This report describes one sovereign holding. A hundred per cent of a '
      + 'one-holding inventory is not a claim about the reporting entity’s book, and coverage '
      + 'of the book is stated only in the annual disclosure.',
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
}

module.exports = { disclosureFacts, holdingFacts, STANDARD, KYOTO_GASES, ASSET_CLASS_LABEL };
