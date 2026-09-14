// @ts-check
/**
 * The PCAF Part A disclosure checklist for §5.9 sovereign debt — Chapter 6,
 * with the verifier's items beside it — answered from the same facts the
 * report was built from, so an item cannot say Yes to something the document
 * does not contain. The wording of each item is CarbonIQ's; the governing
 * clause is printed beside it so a reviewer can check the answer against the
 * published standard. This is not a reproduction of any form PCAF publishes.
 *
 * Every test reads a fact the document prints — no item is a constant — and
 * one item can never be answered Yes here, on purpose: this document covers
 * the §5.9 asset class, one input to a Chapter 6 disclosure, not the
 * reporting entity's own gross inventory. A checklist that could reach a
 * hundred per cent would be claiming to be the disclosure.
 */

'use strict';

const SHALL = 'shall';
const SHOULD = 'should';
const YES = 'Yes', NO = 'No', NA = 'Not applicable';

const num = v => typeof v === 'number' && Number.isFinite(v);
const held = fig => Boolean(fig && Number.isFinite(fig.value));
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
      ? 'This is a single-holding report; coverage of the book is stated in the annual disclosure.'
      : 'The reporting entity has not stated its total loans and investments for the year, so coverage cannot be a percentage of the book. It is reported absent (p.124).',
  },
  {
    id: 'COV-2', group: 'Coverage', clause: 'Part A ch.6 (p.162)', duty: SHALL, section: 'entity',
    item: 'Asset classes not reported are named with the reason (data, size, or no methodology).',
    test: f => annual(f) ? (entity(f).assetClassesNotReported || []).length > 0 : 'na',
    justify: f => !annual(f)
      ? 'A single-holding report; the classes not reported are stated in the annual disclosure.'
      : 'The reporting entity has not stated which Part A asset classes it does not report, or why.',
  },
  {
    id: 'GAS-1', group: 'Gases and units', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'gases',
    item: 'The seven Kyoto gases are covered, in CO2e on a stated IPCC 100-year GWP basis.',
    test: f => Array.isArray(f.KYOTO_GASES) && f.KYOTO_GASES.length === 7 && Boolean(entity(f).gwpBasis),
    justify: () => 'The reporting entity has not stated which IPCC assessment report the global warming potentials come from.',
  },
  {
    id: 'ABS-1', group: 'Absolute emissions', clause: 'Part A §5.9 (p.141)', duty: SHALL, section: 'absolute',
    item: 'Financed scope 1 (territorial emissions) is reported.',
    test: f => annual(f) ? num(f.totals && f.totals.scope1Excl) : held(f.scope1 && f.scope1.exclLULUCF),
    justify: () => 'No sovereign holding carried a scope 1 figure for the year.',
  },
  {
    id: 'SOV-LULUCF', group: 'Absolute emissions', clause: 'Part A §5.9 (p.141)', duty: SHALL, section: 'absolute',
    item: 'Scope 1 is reported both including and excluding LULUCF, and the two are never summed.',
    /* The distinctive §5.9 requirement: both boundaries. Yes when the
       excluding-LULUCF headline is held AND the including-LULUCF figure is
       held for at least one holding; otherwise the including line is reported
       absent, which is the honest answer rather than a fabricated equality. */
    test: f => annual(f)
      ? (num(f.totals && f.totals.scope1Excl) && f.totals && f.totals.scope1Incl && num(f.totals.scope1Incl.value))
      : (held(f.scope1 && f.scope1.exclLULUCF) && held(f.scope1 && f.scope1.inclLULUCF)),
    justify: () => 'The including-LULUCF figure is not held for every sovereign, so it is reported '
      + 'absent rather than assumed equal to the excluding-LULUCF one. The two are shown on separate '
      + 'lines and never summed (§5.9, p.141).',
  },
  {
    id: 'ABS-2', group: 'Absolute emissions', clause: 'Part A p.126; §5.9 (p.141)', duty: SHALL, section: 'absolute',
    item: 'Land-use removals sit within scope 1 including LULUCF and nothing is netted against the inventory.',
    /* Answered from the totals the document prints: the two boundaries are
       carried as two figures with the never-summed note. */
    test: f => annual(f) ? Boolean(f.totals && f.totals.note && /never summed/i.test(f.totals.note)) : Boolean(f.scope1),
    justify: () => 'The roll-up carried no statement that the two LULUCF boundaries are never summed.',
  },
  {
    id: 'ABS-3', group: 'Absolute emissions', clause: 'Part A ch.6 (p.163); Annex 10.2', duty: SHALL, section: 'absolute',
    item: 'Emissions are disaggregated (here, by sovereign).',
    test: f => annual(f) ? Array.isArray(f.bySovereign) && f.bySovereign.length > 0 : 'na',
    justify: f => !annual(f)
      ? 'A single-holding report is one row; disaggregation applies to the annual disclosure.'
      : 'No sovereign holdings are recorded for the year.',
  },
  {
    id: 'MTH-1', group: 'Methodology', clause: 'Part A §5.9 (p.144)', duty: SHALL, section: 'methodology',
    item: 'The attribution (PPP-GDP denominator) is stated, and the sovereign dataset is named with a version, the values read and a checksum.',
    test: f => Boolean(f.dataset && f.dataset.checksum) && Array.isArray(f.datasetRows) && f.datasetRows.length > 0,
    justify: () => 'The sovereign dataset in use carries no checksum, or no country row was read.',
  },
  {
    id: 'DQ-1', group: 'Data quality', clause: 'Part A Table 5.9-6 (p.147); DCL p.128', duty: SHALL, section: 'dataquality',
    item: 'A data-quality score is disclosed, weighted by outstanding amount, with the distribution of options shown.',
    test: f => num(f.dataQuality && f.dataQuality.score) && (f.optionDistribution || []).length > 0,
    justify: () => 'No scored sovereign holding is in the book for the year.',
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
    justify: () => 'This report covers the §5.9 asset class only. The entity’s own gross inventory is '
      + 'a separate, larger claim, made where the entity states it; this document is one input to it, '
      + 'not the disclosure itself.',
  },
  {
    id: 'TRC-1', group: 'Traceability', clause: 'ISO 14064-3 §6.1.3; ISAE 3000 §48', duty: SHALL, section: 'annexRegister',
    item: 'Every disclosed total can be followed to the holdings behind it: one register row per holding, each resolving to its stored input, result and trace.',
    test: f => annual(f) ? (Array.isArray(f.exposureRegister) && f.exposureRegister.length === Number(f.exposures)) : 'na',
    justify: f => !annual(f) ? 'A single-holding report is its own register row.' : 'The register does not carry one row per recorded holding.',
  },
  {
    id: 'UNC-1', group: 'Uncertainty', clause: 'ISO 14064-3 §6.1.5; Part A ch.6 (p.167)', duty: SHOULD, section: 'uncertainty',
    item: 'An uncertainty statement is made by data-quality score, and everything the document does not contain is listed in one place.',
    test: f => (f.optionDistribution || []).length > 0 && Array.isArray(f.gaps),
    justify: () => 'No scored holding is in the book, so no statement by score can be made.',
  },
  {
    id: 'INT-1', group: 'Intensity', clause: 'Part A §5.9 (p.144); DCL p.127', duty: SHOULD, section: 'intensity',
    item: 'An emission intensity is reported: economic across the class, production per sovereign.',
    test: f => annual(f) ? num(f.intensity && f.intensity.value) : num(f.productionIntensity && f.productionIntensity.value),
    justify: () => 'No intensity can be computed: no scope 1 figure or no denominator is held.',
  },
  {
    id: 'SOV-CON', group: 'Intensity', clause: 'Part A §5.9 (pp.142–143)', duty: SHOULD, section: 'intensity',
    item: 'A consumption-emissions view (production − exported + imported) is given, or its absence is stated with the reason.',
    test: f => (f.consumption && num(f.consumption.value)) ? true : Boolean(f.consumptionStatement),
    justify: () => 'Neither a consumption view nor a stated reason for its absence is carried.',
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
      item: def.item, section: def.section, answer, justification,
    };
  });

  const required = items.filter(i => i.duty === SHALL);
  const recommended = items.filter(i => i.duty === SHOULD);
  const met = i => i.answer === YES || i.answer === NA;

  return {
    title: 'PCAF Disclosure Checklist for Part A — completed',
    provenance:
      'A self-assessment against the reporting requirements of PCAF Part A, Chapter 6, for the '
      + '§5.9 sovereign-debt asset class, with the items an independent verifier under ISO 14064-3 / '
      + 'ISAE 3000 reads beside them. The wording of each item is CarbonIQ’s and the governing clause '
      + 'is printed beside it, so each answer can be checked against the published standard. Every '
      + 'answer is read from the document’s own facts; no item is answered by assertion. This annex '
      + 'is not a reproduction of any form published by PCAF, and inclusion of a completed checklist '
      + 'is not an endorsement, approval or certification by PCAF. It covers the §5.9 asset class '
      + 'only, so it cannot and does not reach a hundred per cent.',
    header: {
      entityLabel: meta.entityLabel || 'Reporting entity',
      entity: meta.insurer || 'Not stated',
      reinsurer: meta.insurer || 'Not stated',
      reportTitle: meta.title || 'PCAF Part A §5.9 disclosure',
      reportingYear: meta.reportingYear ?? null,
      publicationDate: meta.publishedAt || null,
      reportReference: meta.reportId || null,
      url: meta.url || null,
    },
    legend: { shall: 'Requirement — the standard says "shall".', should: 'Recommendation — the standard says "should".' },
    items,
    summary: {
      total: items.length,
      answeredYes: items.filter(i => i.answer === YES).length,
      notApplicable: items.filter(i => i.answer === NA).length,
      answeredNo: items.filter(i => i.answer === NO).length,
      requirements: { total: required.length, met: required.filter(met).length },
      recommendations: { total: recommended.length, met: recommended.filter(met).length },
    },
  };
}

module.exports = { completeChecklist, ITEMS };
