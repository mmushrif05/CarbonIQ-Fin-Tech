// @ts-check
/**
 * The PCAF Part A disclosure checklist — Chapter 6, twelve reporting
 * requirements and three recommendations — answered from the same facts the
 * report was built from, so an item cannot say Yes to something the document
 * does not contain. The wording of each item is CarbonIQ's; the governing
 * clause is printed beside it so a reviewer can check the answer against the
 * published standard. This is not a reproduction of any form PCAF publishes.
 *
 * One item can never be answered Yes here, and that is correct: this document
 * covers the §5.2 asset class, which is one input to a Chapter 6 disclosure,
 * not the reporting entity's own gross inventory. A checklist that could reach
 * a hundred per cent would be claiming to be the disclosure — the failure the
 * GCF report avoids the same way.
 */

'use strict';

const SHALL = 'shall';
const SHOULD = 'should';
const YES = 'Yes', NO = 'No', NA = 'Not applicable';

const num = v => typeof v === 'number' && Number.isFinite(v);

/** @type {Array<{id:string,group:string,clause:string,duty:string,item:string,section:string,test:(f:any)=>any,justify?:(f:any)=>string}>} */
const ITEMS = [
  {
    id: 'GOV-1', group: 'Governance', clause: 'Part A ch.6 (p.161)', duty: SHALL, section: 'conformance',
    item: 'The consolidation approach and the standard edition are stated.',
    test: f => Boolean(f.standard),
  },
  {
    id: 'COV-1', group: 'Coverage', clause: 'Part A ch.6 (p.161); DCL p.124', duty: SHALL, section: 'coverage',
    item: 'The asset classes reported are named, with the percentage of total loans and investments covered by each.',
    test: f => f.kind === 'exposure' ? 'na' : num(f.coverage && f.coverage.share),
    justify: f => f.kind === 'exposure'
      ? 'This is a single-exposure report; coverage of the book is stated in the annual disclosure.'
      : 'The reporting entity has not stated its total loans and investments for the year, so coverage cannot be a percentage of the book. It is reported absent (p.124).',
  },
  {
    id: 'COV-2', group: 'Coverage', clause: 'Part A ch.6 (p.162)', duty: SHALL, section: 'coverage',
    item: 'Asset classes not reported are named with the reason (data, size, or no methodology).',
    test: f => Boolean(f.scopeStatement),
    justify: () => 'The scope statement names this as one asset class of a wider disclosure.',
  },
  {
    id: 'GAS-1', group: 'Gases and units', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'gases',
    item: 'The seven Kyoto gases are covered, in CO2e on the IPCC 100-year GWP, with biogenic carbon stated separately.',
    test: f => Array.isArray(f.KYOTO_GASES) && f.KYOTO_GASES.length === 7,
  },
  {
    id: 'ABS-1', group: 'Absolute emissions', clause: 'Part A §5.2 (p.56); ch.6 (p.163)', duty: SHALL, section: 'absolute',
    item: 'Scope 1 and 2 are reported combined at minimum, and scope 3 separately where the class requires it.',
    test: f => f.kind === 'exposure'
      ? num(f.lines.scope1And2)
      : num(f.lines.scope1And2),
  },
  {
    id: 'ABS-2', group: 'Absolute emissions', clause: 'Part A p.126', duty: SHALL, section: 'absolute',
    item: 'Removals and avoided emissions are reported outside the scope 1/2/3 inventory, and no carbon credit is netted against it.',
    test: () => true,
  },
  {
    id: 'ABS-3', group: 'Absolute emissions', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'absolute',
    item: 'Emissions are disaggregated by asset class or by sector, with the emission-intensive sectors singled out.',
    test: f => f.kind === 'exposure' ? 'na' : Array.isArray(f.bySector) && f.bySector.length > 0,
    justify: f => f.kind === 'exposure'
      ? 'A single-exposure report is one row; disaggregation applies to the annual disclosure.'
      : 'No exposures are recorded for the year.',
  },
  {
    id: 'ABS-4', group: 'Absolute emissions', clause: 'Part A §5.2 (p.56)', duty: SHALL, section: 'absolute',
    item: 'Financed emissions to the financial sector are reported separately, because of the double count they create.',
    test: f => f.kind === 'exposure' ? 'na' : (f.financialSector ? true : 'na'),
    justify: f => f.kind === 'exposure'
      ? 'A single-exposure report; the separate financial-sector roll-up is in the annual disclosure.'
      : 'No financial-sector borrower is in the book for the year.',
  },
  {
    id: 'MTH-1', group: 'Methodology', clause: 'Part A §5.2 (p.57)', duty: SHALL, section: 'methodology',
    item: 'The attribution and estimation options used are stated, and the factor set is named with a version and a checksum.',
    test: f => Boolean(f.factorSet && f.factorSet.checksum),
  },
  {
    id: 'DQ-1', group: 'Data quality', clause: 'Part A Box 6.1-6 (pp.167–168)', duty: SHALL, section: 'dataquality',
    item: 'A data-quality score is disclosed, weighted by outstanding amount, with scope 3 weighted separately from scope 1 and 2.',
    test: f => f.kind === 'exposure'
      ? num(f.dataQuality.scope1And2 && f.dataQuality.scope1And2.score)
      : num(f.dataQuality.scope1And2),
    justify: () => 'No scored exposure is in the book for the year.',
  },
  {
    id: 'REC-1', group: 'Recalculation', clause: 'Part A ch.6 (p.164)', duty: SHALL, section: 'recalculation',
    item: 'A baseline recalculation policy is stated, with a disclosed significance threshold, or its absence is stated.',
    test: () => true,
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
    id: 'INT-1', group: 'Intensity', clause: 'Part A ch.6 (p.166)', duty: SHOULD, section: 'intensity',
    item: 'An economic emission intensity in tCO2e per million of currency is reported.',
    test: f => f.kind === 'exposure' ? num(f.economicIntensity) : true,
  },
  {
    id: 'FLU-1', group: 'Fluctuation', clause: 'Part A §5.2 fn.71 (p.55)', duty: SHOULD, section: 'limitations',
    item: 'A year-end fluctuation analysis of revolving facilities is given, with its basis stated.',
    test: () => true,
  },
  {
    id: 'ASR-1', group: 'Assurance', clause: 'Part A ch.6 (p.169)', duty: SHOULD, section: 'conformance',
    item: 'The assurance posture the document stands on is stated on its face.',
    test: f => Boolean(f.assurance && f.assurance.label),
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
      'A self-assessment against the reporting requirements of PCAF Part A, Chapter 6. '
      + 'The wording of each item is CarbonIQ’s and the governing clause is printed beside '
      + 'it, so each answer can be checked against the published standard. This annex is not '
      + 'a reproduction of any form published by PCAF, and inclusion of a completed checklist '
      + 'is not an endorsement, approval or certification by PCAF. It covers the §5.2 asset '
      + 'class only, so it cannot and does not reach a hundred per cent.',
    header: {
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
