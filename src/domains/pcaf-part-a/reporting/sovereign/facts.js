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
 *
 * What a verifier reads first is the same as in §5.2, from the same entity
 * settings: the reporting entity and its boundary, the responsible party, the
 * document's identity, the uncertainty by score, the list of what is not
 * contained, and one row per holding.
 */

'use strict';

const { faceStatement, resolve: resolveAssuranceMode } = require('../../../../shared/assurance-mode');
const { release: datasetRelease, countryFor } = require('../../domain/sovereign/dataset');
const { entityOf } = require('../entity');
const { identityOf } = require('../identity');
const { assuranceDetailOf, recalculationOf } = require('../facts');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition, §5.9 and Chapter 6.';

const ASSET_CLASS_LABEL = 'Sovereign debt (§5.9)';
const ENTITY_LABEL = 'Reporting entity';

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

const CONSUMPTION_STATEMENT =
  'A consumption-emissions view (production, less emissions embodied in exports, plus '
  + 'emissions embodied in imports) is recommended by §5.9 (pp.142–143). The sovereign '
  + 'dataset in use holds no trade-embodied emissions, so the consumption view is reported '
  + 'as not computed, with that reason, rather than invented.';

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

const num = v => typeof v === 'number' && Number.isFinite(v);

/** The options actually used across the holdings, with their share of outstanding. */
function distributionOf(rows) {
  const total = (rows || []).reduce((s, r) => s + (num(r.outstanding) ? r.outstanding : 0), 0);
  const m = new Map();
  for (const r of rows || []) {
    if (!num(r.dqScore)) continue;
    const key = `${r.dqOption || 'n/a'}|${r.dqScore}`;
    const row = m.get(key) || { option: r.dqOption || 'n/a', score: r.dqScore, exposures: 0, outstanding: 0 };
    row.exposures += 1;
    row.outstanding += num(r.outstanding) ? r.outstanding : 0;
    m.set(key, row);
  }
  return [...m.values()]
    .map(x => ({ ...x, outstanding: +x.outstanding.toFixed(2), shareOfBook: total > 0 ? +(x.outstanding / total).toFixed(4) : null }))
    .sort((a, b) => a.score - b.score);
}

/** One row per holding, from the projected rows the roll-up read. */
function registerRows(rows) {
  return (rows || []).map(r => ({
    exposureId: r.exposureId,
    sovereign: (r.country && (r.country.name || r.country.code)) || null,
    code: (r.country && r.country.code) || null,
    outstanding: num(r.outstanding) ? r.outstanding : null,
    attributionFactor: num(r.attributionFactor) ? r.attributionFactor : null,
    option: r.dqOption || null,
    score: num(r.dqScore) ? r.dqScore : null,
    scope1Excl: num(r.attributed && r.attributed.scope1Excl) ? r.attributed.scope1Excl : null,
    scope1Incl: num(r.attributed && r.attributed.scope1Incl) ? r.attributed.scope1Incl : null,
    provisional: Boolean(r.provisional),
    findings: (r.findings || []).length,
  }));
}

/** The dataset rows the book actually read — the values a tonne rests on. */
function datasetRows(bySovereign) {
  return (bySovereign || []).map(s => {
    const c = s.country ? countryFor(s.country) : null;
    const s1 = (c && c.scope1) || {};
    const fig = f => (f && num(f.value)) ? { value: f.value, year: f.year || null, basis: f.basis || null } : null;
    return {
      code: s.country || null, name: (c && c.name) || s.name || null,
      scope1Excl: fig(s1.exclLULUCF), scope1Incl: fig(s1.inclLULUCF),
      pppGdp: fig(c && c.pppGdp),
      provisional: Boolean(c && c.provisional),
    };
  });
}

function regulatoryMappingOf(f) {
  const yes = 'Yes', no = 'No', elsewhere = 'Elsewhere';
  return [
    { requirement: 'Absolute gross financed emissions of sovereign holdings — scope 1 on both LULUCF boundaries', clause: 'SLFRS S2 §29(a)(vi); B61(a)', status: num(f.totals.scope1Excl) ? yes : no, where: 'Section 4; Annex B (by sovereign)' },
    { requirement: 'Gross exposure (outstanding) by sovereign', clause: 'SLFRS S2 B61(b)', status: f.bySovereign && f.bySovereign.length ? yes : no, where: 'Annex B' },
    { requirement: 'Percentage of gross exposure included in the financed-emissions calculation', clause: 'SLFRS S2 B61(c); DCL p.124', status: num(f.coverage && f.coverage.share) ? yes : no, where: 'Section 2 — coverage of the book' },
    { requirement: 'Methodology, inputs and assumptions, including the standard applied', clause: 'SLFRS S2 B61(d); §29(a)(iv)', status: yes, where: 'Section 5; Annex A' },
    { requirement: 'Economic emission intensity', clause: 'SLFRS S2 §29(b); DCL p.127', status: num(f.intensity && f.intensity.value) ? yes : no, where: 'Section 8' },
    { requirement: 'Data-quality approach and score', clause: 'PCAF Table 5.9-6; DCL p.128; SLFRS S2 B63', status: num(f.dataQuality && f.dataQuality.score) ? yes : no, where: 'Section 6' },
    { requirement: 'The reporting entity’s own gross scope 1, 2 and 3 inventory', clause: 'SLFRS S2 §29(a)(i)–(iii)', status: no, where: 'Not this document: the entity’s inventory is a separate claim this asset class is one input to' },
    { requirement: 'Sustainable-finance classification of the lending book under the SLGFT', clause: 'CBSL Direction No. 05 of 2022', status: elsewhere, where: 'The taxonomy screen and the Green Loan Certificate, not a financed-emissions document' },
  ];
}

function gapsOf(f) {
  const e = f.entity || {};
  const out = [...(e.gaps || []).map(g => ({ what: g.what, why: 'Not stated by the reporting entity.', clause: g.clause }))];
  if (f.kind === 'disclosure') {
    if (!num(f.coverage.share)) out.push({ what: 'Coverage as a percentage of total loans and investments', why: 'The entity has not stated its total loans and investments for the year.', clause: 'DCL p.124' });
    const t = f.totals;
    if (t.scope1Incl && t.scope1Incl.heldCount < t.scope1Incl.total) out.push({ what: `Scope 1 including LULUCF for ${t.scope1Incl.total - t.scope1Incl.heldCount} holding(s)`, why: 'The including-LULUCF figure is not held for every sovereign; the sum is partial and says so.', clause: 'Part A §5.9 (p.141)' });
    if (!t.scope2 || !num(t.scope2.value)) out.push({ what: 'Financed scope 2 (imported grid energy)', why: 'A §5.9 should; not held in the dataset in use.', clause: 'Part A §5.9 (p.142)' });
    if (!t.scope3 || !num(t.scope3.value)) out.push({ what: 'Financed scope 3 (non-energy imports)', why: 'A §5.9 should; not held in the dataset in use.', clause: 'Part A §5.9 (p.142)' });
    if (!e.assetClassesNotReported || !e.assetClassesNotReported.length) out.push({ what: 'The asset classes not reported, with reasons', why: 'Not stated by the reporting entity.', clause: 'Part A ch.6 (p.162)' });
    out.push({ what: 'Prior-year comparatives and restatements', why: 'The register holds no locked prior position yet; nothing can be restated until the lock-and-supersede lifecycle exists.', clause: 'Part A ch.6 (p.164)' });
  }
  out.push({ what: 'A consumption-emissions view per sovereign', why: 'The dataset holds no trade-embodied emissions; reported as not computed.', clause: 'Part A §5.9 (pp.142–143)' });
  if (!f.recalculation.baseYear) out.push({ what: 'The inventory base year', why: 'Not stated by the reporting entity.', clause: 'Part A ch.6 (p.164)' });
  if (f.dataset && f.dataset.provisionalTables && f.dataset.provisionalTables.length) {
    out.push({ what: 'A released sovereign dataset', why: `The set in use is provisional (${f.dataset.provisionalTables.join(', ')}); every provisional country carries the gap it stands in for.`, clause: 'Part A Table 10.3-4 (pp.205–206)' });
  }
  out.push({ what: 'The reporting entity’s own gross scope 1, 2 and 3 inventory', why: 'This document is one asset class of a wider disclosure and never claims to be the inventory.', clause: 'SLFRS S2 §29(a); Part A ch.6 (p.160)' });
  return out;
}

function finish(f, prefix) {
  f.gaps = gapsOf(f);
  if (f.kind === 'disclosure') f.regulatoryMapping = regulatoryMappingOf(f);
  f.identity = identityOf(f, prefix);
  f.reportId = f.reportId || f.identity.reference;
  return f;
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
 * @param {any} [input.assuranceDeclaration]
 * @param {any} [input.recalculation]   the entity's settings
 * @param {any[]} [input.rows]          the projected holding rows the roll-up read
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
  const entity = entityOf(input.recalculation, input.reportingYear, input.insurer);
  const bySovereign = pos.bySovereign || [];

  const f = {
    kind: 'disclosure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    entityLabel: ENTITY_LABEL,
    title: 'PCAF Part A §5.9 — Financed emissions of sovereign debt',
    subtitle: `Reporting year ${input.reportingYear}`,
    insurer: entity.name || 'Reporting entity not stated',
    entity,
    responsibleParty: entity.responsibleParty,
    reportingYear: input.reportingYear,
    currency,
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    exposures: pos.exposures,
    totals: {
      scope1Excl: num(totals.financedScope1ExclLULUCF) ? totals.financedScope1ExclLULUCF : null,
      scope1Incl: totals.financedScope1InclLULUCF || { value: null, heldCount: 0, total: pos.exposures || 0 },
      scope2: totals.financedScope2 || { value: null, heldCount: 0 },
      scope3: totals.financedScope3 || { value: null, heldCount: 0 },
      note: totals.note || '',
      category: totals.category || 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },
    intensity: {
      value: num(totals.economicIntensity_tCO2e_per_M) ? totals.economicIntensity_tCO2e_per_M : null,
      unit: `tCO2e per million ${currency}`,
      basis: 'Financed scope 1 excluding LULUCF across the class over the assessed outstanding amount, in millions (DCL p.127).',
    },
    dataQuality: {
      score: (dq && dq.score !== undefined) ? dq.score : null,
      scored: dq.scored || 0,
      excluded: dq.excluded || 0,
      reference: dq.reference || 'PCAF Disclosure Checklist Part A, p.128',
    },
    optionDistribution: distributionOf(input.rows),
    coverage: {
      share: coverage.share,
      totalLoansAndInvestments: coverage.totalLoansAndInvestments,
      assessedOutstanding: coverage.assessedOutstanding,
      statedBy: coverage.basisStatedBy || null,
      basis: coverage.basis,
      remedy: coverage.remedy || null,
    },
    bySovereign,
    improvementPlan: pos.improvementPlan || [],
    exposureRegister: registerRows(input.rows),
    datasetRows: datasetRows(bySovereign),
    dataset: datasetRelease(),
    recalculation: recalculationOf(input.recalculation),
    consumptionStatement: CONSUMPTION_STATEMENT,

    assurance,
    assuranceDetail: assuranceDetailOf(input.assuranceDeclaration),
    conformanceStatement: conformanceStatement(),
    coverageStatement: coverageStatement(coverage),
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
  return finish(f, 'PA59');
}

/**
 * Facts for a single sovereign holding — one bond or loan.
 *
 * @param {object} input
 * @param {any} input.result   an assessSovereign() result
 * @param {any} [input.assurance]
 * @param {any} [input.assuranceDeclaration]
 * @param {any} [input.recalculation]  the entity's settings — the same protocol the annual disclosure prints
 * @param {string} [input.insurer]
 * @param {object} [input.meta]
 */
function holdingFacts(input) {
  const r = input.result;
  const sov = r.sovereign || {};
  const inv = r.inventory || {};
  const assurance = input.assurance || DEFAULT_ASSURANCE;
  const entity = entityOf(input.recalculation, sov.reportingYear || null, input.insurer);
  const dq = inv.dataQuality || {};

  const f = {
    kind: 'holding',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    entityLabel: ENTITY_LABEL,
    title: `PCAF Part A §5.9 — ${sov.name || sov.country || 'Sovereign'}`,
    subtitle: 'Financed emissions of one sovereign bond or loan',
    insurer: entity.name || 'Reporting entity not stated',
    entity,
    responsibleParty: entity.responsibleParty,
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
    dataQuality: dq,
    optionDistribution: num(dq.score) ? [{ option: dq.option || 'n/a', score: dq.score, exposures: 1, shareOfBook: 1 }] : [],
    productionIntensity: inv.productionIntensity || null,
    consumption: r.consumption || null,
    consumptionStatement: CONSUMPTION_STATEMENT,
    removalsNote: r.removalsNote || '',
    findings: (r.validation && r.validation.findings) || [],
    validationNote: (r.validation && r.validation.note) || '',
    dataset: datasetRelease(),
    datasetRows: datasetRows(sov.country ? [{ country: sov.country, name: sov.name }] : []),
    recalculation: recalculationOf(input.recalculation),

    assurance,
    assuranceDetail: assuranceDetailOf(input.assuranceDeclaration),
    conformanceStatement: conformanceStatement(),
    coverageStatement: 'This report describes one sovereign holding. A hundred per cent of a '
      + 'one-holding inventory is not a claim about the reporting entity’s book, and coverage '
      + 'of the book is stated only in the annual disclosure.',
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
  return finish(f, 'PA59X');
}

module.exports = { disclosureFacts, holdingFacts, STANDARD, KYOTO_GASES, ASSET_CLASS_LABEL, ENTITY_LABEL };
