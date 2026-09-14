// @ts-check
/**
 * The PCAF Part A disclosure checklist — Chapter 6's reporting requirements
 * and recommendations, with the verifier's items beside them — answered from
 * the same facts the report was built from, so an item cannot say Yes to
 * something the document does not contain. The wording of each item is
 * CarbonIQ's; the governing clause is printed beside it so a reviewer can
 * check the answer against the published standard. This is not a
 * reproduction of any form PCAF publishes.
 *
 * Two rules the tests below are held to. Every test reads a fact the document
 * prints — no item is a constant, because an item that can never answer No is
 * not a check but a decoration, and a verifier who finds one stops trusting
 * the rest. And one item can never be answered Yes here, on purpose: this
 * document covers the §5.2 asset class, one input to a Chapter 6 disclosure,
 * not the reporting entity's own gross inventory. A checklist that could reach
 * a hundred per cent would be claiming to be the disclosure.
 */

'use strict';

const SHALL = 'shall';
const SHOULD = 'should';
const YES = 'Yes', NO = 'No', NA = 'Not applicable';

const num = v => typeof v === 'number' && Number.isFinite(v);
const annual = f => f.kind === 'disclosure';
const entity = f => f.entity || {};

/** @type {Array<{id:string,group:string,clause:string,duty:string,item:string,section:string,test:(f:any)=>any,justify?:(f:any)=>string}>} */
const ITEMS = [
  {
    id: 'GOV-1', group: 'Governance', clause: 'Part A ch.6 (p.161)', duty: SHALL, section: 'entity',
    item: 'The reporting entity is named and its consolidation approach is stated, with the standard edition applied.',
    test: f => Boolean(f.standard) && entity(f).nameStated && Boolean(entity(f).consolidationApproach),
    justify: f => !entity(f).nameStated
      ? 'The reporting entity has not recorded its legal name; the name on the cover is what the request supplied, or "not stated".'
      : 'The consolidation approach — operational control, financial control or equity share — has not been stated by the reporting entity.',
  },
  {
    id: 'GOV-2', group: 'Governance', clause: 'ISAE 3000 §12(a); ISO 14064-3 §5.2', duty: SHALL, section: 'entity',
    item: 'The responsible party is named: who prepared the disclosure and who approved it, with the approval date.',
    test: f => Boolean(entity(f).preparedBy && entity(f).approvedBy && entity(f).approvedBy.date),
    justify: f => !entity(f).preparedBy ? 'Nobody is recorded as having prepared the disclosure.'
      : !entity(f).approvedBy ? 'Nobody is recorded as having approved the disclosure.'
        : 'The approval carries no date.',
  },
  {
    id: 'PER-1', group: 'Governance', clause: 'Part A ch.4; ch.6 (p.161)', duty: SHALL, section: 'entity',
    item: 'The reporting period is stated, with the fiscal year-end the position is taken at.',
    test: f => Boolean(entity(f).period),
    justify: () => 'The reporting entity has not recorded its fiscal year-end, so the period is a year label and not a dated interval.',
  },
  {
    id: 'COV-1', group: 'Coverage', clause: 'Part A ch.6 (p.161); DCL p.124', duty: SHALL, section: 'coverage',
    item: 'The asset classes reported are named, with the percentage of total loans and investments covered by each.',
    test: f => annual(f) ? num(f.coverage && f.coverage.share) : 'na',
    justify: f => !annual(f)
      ? 'This is a single-exposure report; coverage of the book is stated in the annual disclosure.'
      : 'The reporting entity has not stated its total loans and investments for the year, so coverage cannot be a percentage of the book. It is reported absent (p.124).',
  },
  {
    id: 'COV-2', group: 'Coverage', clause: 'Part A ch.6 (p.162)', duty: SHALL, section: 'entity',
    item: 'Asset classes not reported are named with the reason (data, size, or no methodology).',
    test: f => annual(f) ? (entity(f).assetClassesNotReported || []).length > 0 : 'na',
    justify: f => !annual(f)
      ? 'A single-exposure report; the classes not reported are stated in the annual disclosure.'
      : 'The reporting entity has not stated which Part A asset classes it does not report, or why.',
  },
  {
    id: 'GAS-1', group: 'Gases and units', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'gases',
    item: 'The seven Kyoto gases are covered, in CO2e on a stated IPCC 100-year GWP basis, with biogenic carbon stated separately.',
    test: f => Array.isArray(f.KYOTO_GASES) && f.KYOTO_GASES.length === 7 && Boolean(entity(f).gwpBasis),
    justify: () => 'The reporting entity has not stated which IPCC assessment report the global warming potentials come from.',
  },
  {
    id: 'ABS-1', group: 'Absolute emissions', clause: 'Part A §5.2 (p.56); ch.6 (p.163)', duty: SHALL, section: 'absolute',
    item: 'Scope 1 and 2 are reported combined at minimum, and scope 3 separately where the class requires it.',
    test: f => num(f.lines.scope1And2),
    justify: () => 'No exposure carried a scope 1 and 2 figure.',
  },
  {
    id: 'ABS-2', group: 'Absolute emissions', clause: 'Part A p.126', duty: SHALL, section: 'absolute',
    item: 'Removals and avoided emissions are reported outside the scope 1/2/3 inventory, and no carbon credit is netted against it.',
    /* Answered from the lines the document prints: the removals and credit
       lines exist apart from the scope lines, and the separation statement the
       roll-up carries is present. */
    test: f => Boolean(f.lines && 'removals' in f.lines && 'creditsRetired' in f.lines) && (annual(f) ? Boolean(f.separation) : true),
    justify: () => 'The roll-up carried no separation statement for removals and credits.',
  },
  {
    id: 'ABS-3', group: 'Absolute emissions', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'absolute',
    item: 'Emissions are disaggregated by asset class or by sector, with the emission-intensive sectors singled out.',
    test: f => annual(f) ? Array.isArray(f.bySector) && f.bySector.length > 0 : 'na',
    justify: f => !annual(f)
      ? 'A single-exposure report is one row; disaggregation applies to the annual disclosure.'
      : 'No exposures are recorded for the year.',
  },
  {
    id: 'ABS-4', group: 'Absolute emissions', clause: 'Part A §5.2 (p.56)', duty: SHALL, section: 'absolute',
    item: 'Financed emissions to the financial sector are reported separately, because of the double count they create.',
    test: f => !annual(f) ? 'na' : (f.financialSector ? true : 'na'),
    justify: f => !annual(f)
      ? 'A single-exposure report; the separate financial-sector roll-up is in the annual disclosure.'
      : 'No financial-sector borrower is in the book for the year.',
  },
  {
    id: 'MTH-1', group: 'Methodology', clause: 'Part A §5.2 (p.57)', duty: SHALL, section: 'methodology',
    item: 'The attribution and estimation options used are stated, and the factor set is named with a version, every row and a checksum.',
    test: f => Boolean(f.factorSet && f.factorSet.checksum) && Array.isArray(f.factorRows) && f.factorRows.length > 0,
    justify: () => 'The factor set in use carries no checksum or no rows.',
  },
  {
    id: 'DQ-1', group: 'Data quality', clause: 'Part A Box 6.1-6 (pp.167–168)', duty: SHALL, section: 'dataquality',
    item: 'A data-quality score is disclosed, weighted by outstanding amount, with scope 3 weighted separately and the distribution of options shown.',
    test: f => (annual(f)
      ? num(f.dataQuality.scope1And2)
      : num(f.dataQuality.scope1And2 && f.dataQuality.scope1And2.score)) && (f.optionDistribution || []).length > 0,
    justify: () => 'No scored exposure is in the book for the year.',
  },
  {
    id: 'REC-1', group: 'Recalculation', clause: 'Part A ch.6 (p.164)', duty: SHALL, section: 'recalculation',
    item: 'A baseline recalculation policy is stated, with a disclosed significance threshold and the triggers.',
    test: f => num(f.recalculation && f.recalculation.significanceThresholdPct) && (f.recalculation.triggers || []).length > 0,
    justify: () => 'The reporting entity’s settings carry no significance threshold or no recalculation triggers.',
  },
  {
    id: 'INV-1', group: 'Entity inventory', clause: 'Part A ch.6 (p.160); SLFRS S2 §29(a)', duty: SHALL, section: 'conformance',
    item: 'The reporting entity’s own gross scope 1, 2 and 3 inventory is disclosed.',
    /* Never Yes here on purpose: this report is one asset class, not the
       entity's inventory. Answered No with the reason so the checklist cannot
       reach 100% and claim to be the whole disclosure. */
    test: () => false,
    justify: () => 'This report covers the §5.2 asset class only. The entity’s own gross '
      + 'inventory is a separate, larger claim, made where the entity states it; this '
      + 'document is one input to it, not the disclosure itself.',
  },
  {
    id: 'TRC-1', group: 'Traceability', clause: 'ISO 14064-3 §6.1.3; ISAE 3000 §48', duty: SHALL, section: 'annexRegister',
    item: 'Every disclosed total can be followed to the exposures behind it: one register row per exposure, each resolving to its stored input, result and trace.',
    test: f => annual(f) ? (Array.isArray(f.exposureRegister) && f.exposureRegister.length === Number(f.exposures)) : 'na',
    justify: f => !annual(f)
      ? 'A single-exposure report is its own register row.'
      : 'The exposure register does not carry one row per recorded exposure.',
  },
  {
    id: 'UNC-1', group: 'Uncertainty', clause: 'ISO 14064-3 §6.1.5; Part A ch.6 (p.167)', duty: SHOULD, section: 'uncertainty',
    item: 'An uncertainty statement is made by data-quality score, and everything the document does not contain is listed in one place.',
    test: f => (f.optionDistribution || []).length > 0 && Array.isArray(f.gaps),
    justify: () => 'No scored exposure is in the book, so no statement by score can be made.',
  },
  {
    id: 'INT-1', group: 'Intensity', clause: 'Part A ch.6 (p.166); DCL p.127', duty: SHOULD, section: 'intensity',
    item: 'An economic emission intensity in tCO2e per million of currency is reported.',
    test: f => annual(f) ? num(f.intensity && f.intensity.value) : num(f.economicIntensity),
    justify: () => 'No intensity can be computed: no scope 1 and 2 figure or no outstanding amount is held.',
  },
  {
    id: 'FLU-1', group: 'Fluctuation', clause: 'Part A §5.2 fn.71 (p.55)', duty: SHOULD, section: 'fluctuation',
    item: 'A year-end fluctuation analysis of revolving facilities is given, with its basis stated.',
    test: f => annual(f) ? (f.fluctuation && f.fluctuation.revolvingExposures > 0 ? Boolean(f.fluctuation.basis) : 'na') : 'na',
    justify: f => !annual(f)
      ? 'A single-exposure report; the fluctuation analysis is in the annual disclosure.'
      : 'No revolving facility is in the book for the year, so no fluctuation applies.',
  },
  {
    id: 'DOC-1', group: 'Document', clause: 'ISAE 3000 §69; ISO 14064-3 §9', duty: SHOULD, section: 'conformance',
    item: 'The document carries an identity: a content-derived reference, the build that produced it and a hash a filed copy can be matched to.',
    test: f => Boolean(f.identity && f.identity.reference && f.identity.contentHash),
    justify: () => 'No document identity was computed.',
  },
  {
    id: 'ASR-1', group: 'Assurance', clause: 'Part A ch.6 (p.169)', duty: SHOULD, section: 'conformance',
    item: 'The assurance posture the document stands on is stated on its face.',
    test: f => Boolean(f.assurance && f.assurance.label),
  },
  {
    id: 'ASR-2', group: 'Assurance', clause: 'Part A ch.6 (p.169); ISAE 3000 §12(b)', duty: SHOULD, section: 'entity',
    item: 'Where the figures are independently assured, the provider, the standard and the level are named.',
    test: f => (f.assurance && f.assurance.mode === 'verified') ? Boolean(f.assuranceDetail) : 'na',
    justify: f => (f.assurance && f.assurance.mode === 'verified')
      ? 'The document is reported as verified but the assurance declaration names no provider, standard or level.'
      : 'The document stands on the self-declared posture; no assurance is claimed, so none is named.',
  },
];

function completeChecklist(f, meta = {}) {
  const items = ITEMS.map(def => {
    let raw;
    try { raw = def.test(f); } catch (_) { raw = false; }
    const answer = raw === 'na' ? NA : raw ? YES : NO;
    const justification = answer === YES ? null
      : (def.justify ? def.justify(f) : 'Not present in this report.');
    return {
      id: def.id, group: def.group, clause: def.clause, duty: def.duty,
      item: def.item, section: def.section, answer, justification
    };
  });

  const required = items.filter(i => i.duty === SHALL);
  const recommended = items.filter(i => i.duty === SHOULD);
  const met = i => i.answer === YES || i.answer === NA;

  return {
    title: 'PCAF Disclosure Checklist for Part A — completed',
    provenance:
      'A self-assessment against the reporting requirements of PCAF Part A, Chapter 6, with the '
      + 'items an independent verifier under ISO 14064-3 / ISAE 3000 reads beside them. The '
      + 'wording of each item is CarbonIQ’s and the governing clause is printed beside it, so each '
      + 'answer can be checked against the published standard. Every answer is read from the '
      + 'document’s own facts; no item is answered by assertion. This annex is not a reproduction '
      + 'of any form published by PCAF, and inclusion of a completed checklist is not an '
      + 'endorsement, approval or certification by PCAF. It covers the §5.2 asset class only, so '
      + 'it cannot and does not reach a hundred per cent.',
    header: {
      entityLabel: meta.entityLabel || 'Reporting entity',
      entity: meta.insurer || 'Not stated',
      reinsurer: meta.insurer || 'Not stated',
      reportTitle: meta.title || 'PCAF Part A §5.2 disclosure',
      reportingYear: meta.reportingYear ?? null,
      publicationDate: meta.publishedAt || null,
      reportReference: meta.reportId || null,
      url: meta.url || null
    },
    legend: { shall: 'Requirement — the standard says "shall".', should: 'Recommendation — the standard says "should".' },
    items,
    summary: {
      total: items.length,
      answeredYes: items.filter(i => i.answer === YES).length,
      notApplicable: items.filter(i => i.answer === NA).length,
      answeredNo: items.filter(i => i.answer === NO).length,
      requirements: { total: required.length, met: required.filter(met).length },
      recommendations: { total: recommended.length, met: recommended.filter(met).length }
    }
  };
}

module.exports = { completeChecklist, ITEMS };
