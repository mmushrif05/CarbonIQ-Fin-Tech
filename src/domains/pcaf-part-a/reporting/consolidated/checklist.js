// @ts-check
/**
 * The PCAF Part A disclosure checklist for the consolidated document —
 * Chapter 6's reporting requirements at the level of the whole financed
 * book, with the verifier's items beside them — answered from the same facts
 * the document was built from. Every test reads a fact the document prints;
 * no item is a constant.
 *
 * The item that used to be the most important was the one that could never be
 * answered Yes: the entity's own gross scope 1, 2 and 3 inventory. That was
 * true while the inventory was collected nowhere. It is collected now, so the
 * item is answered from the facts like every other — which is how a caveat is
 * removed, by collecting the fact rather than by suppressing the item.
 *
 * The SLFRS S2 items beside it read the entity's own statements. Each can
 * fail, and on a book whose entity has stated nothing every one of them does.
 */

'use strict';

const SHALL = 'shall';
const SHOULD = 'should';
const YES = 'Yes', NO = 'No', NA = 'Not applicable';

const num = v => typeof v === 'number' && Number.isFinite(v);
const entity = f => f.entity || {};

/** One S2 item's provenance, read from the facts the document printed. */
const itemAt = (f, path) => (f.s2 ? f.s2.items.find(i => i.path === path) : null);
const stated = (f, path) => { const i = itemAt(f, path); return Boolean(i && i.state !== 'absent'); };
const missing = (f, paths) => paths.filter(p => !stated(f, p))
  .map(p => { const i = itemAt(f, p); return i ? `${i.label.toLowerCase()} (${i.paragraph})` : p; }).join('; ') || 'none';
const recorded = f => (f.classes || []).filter(c => c.status === 'recorded');
const unrecorded = f => (f.classes || []).filter(c => c.status !== 'recorded');

/** @type {Array<{id:string,group:string,clause:string,duty:string,item:string,section:string,test:(f:any)=>any,justify?:(f:any)=>string}>} */
const ITEMS = [
  {
    id: 'GOV-1', group: 'Governance', clause: 'Part A ch.6 (p.161)', duty: SHALL, section: 'entity',
    item: 'The reporting entity is named and its consolidation approach is stated, with the standard edition applied.',
    test: f => Boolean(f.standard) && entity(f).nameStated && Boolean(entity(f).consolidationApproach),
    justify: f => !entity(f).nameStated
      ? 'The reporting entity has not recorded its legal name.'
      : 'The consolidation approach — operational control, financial control or equity share — has not been stated.',
  },
  {
    id: 'GOV-2', group: 'Governance', clause: 'ISAE 3000 §12(a); ISO 14064-3 §5.2', duty: SHALL, section: 'entity',
    item: 'The responsible party is named: who prepared the disclosure and who approved it, with the approval date.',
    test: f => Boolean(entity(f).preparedBy && entity(f).approvedBy && entity(f).approvedBy.date),
    justify: f => !entity(f).preparedBy ? 'Nobody is recorded as having prepared the disclosure.'
      : !entity(f).approvedBy ? 'Nobody is recorded as having approved the disclosure.' : 'The approval carries no date.',
  },
  {
    id: 'APR-1', group: 'Governance', clause: 'ISAE 3000 §12(a); ISO 14064-3 §5.2', duty: SHALL, section: 'entity',
    item: 'Every exposure in the register has been reviewed and approved by the reporting entity before the disclosure is filed.',
    test: f => Boolean(f.approval && f.approval.total > 0 && f.approval.approved === f.approval.total),
    justify: f => !f.approval || !f.approval.total
      ? 'No exposure in a register class is recorded, so none stands approved.'
      : `${f.approval.total - f.approval.approved} of ${f.approval.total} exposure(s) are not yet approved — recorded or under review.`,
  },
  {
    id: 'PER-1', group: 'Governance', clause: 'Part A ch.4; ch.6 (p.161)', duty: SHALL, section: 'entity',
    item: 'The reporting period is stated, with the fiscal year-end the position is taken at.',
    test: f => Boolean(entity(f).period),
    justify: () => 'The reporting entity has not recorded its fiscal year-end.',
  },
  {
    id: 'COV-1', group: 'Coverage', clause: 'Part A ch.6 (p.161); DCL p.124', duty: SHALL, section: 'coverage',
    item: 'The asset classes reported are named, each with its outstanding, and the share of total loans and investments they cover is stated.',
    test: f => recorded(f).length > 0 && num(f.coverage && f.coverage.sharePct),
    justify: f => !recorded(f).length ? 'No asset class holds exposures for the year.'
      : (f.coverage && f.coverage.remedy) || 'The book total is not stated, or no recorded class shares its currency.',
  },
  {
    id: 'COV-2', group: 'Coverage', clause: 'Part A ch.6 (p.162)', duty: SHALL, section: 'entity',
    item: 'Every asset class not reported is named with the reason (data, size, or no methodology).',
    test: f => unrecorded(f).length > 0 && unrecorded(f).every(c => Boolean(c.reason)),
    justify: f => !unrecorded(f).length ? 'Every Part A asset class is recorded, so there is none to name.' : 'A class not reported carries no reason.',
  },
  {
    id: 'GAS-1', group: 'Gases and units', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'gases',
    item: 'The seven Kyoto gases are covered, in CO2e on a stated IPCC 100-year GWP basis.',
    test: f => Array.isArray(f.KYOTO_GASES) && f.KYOTO_GASES.length === 7 && Boolean(entity(f).gwpBasis),
    justify: () => 'The reporting entity has not stated which IPCC assessment report the global warming potentials come from.',
  },
  {
    id: 'ABS-1', group: 'Absolute emissions', clause: 'Part A ch.6 (p.163)', duty: SHALL, section: 'absolute',
    item: 'Absolute financed emissions are reported per asset class and in total, on the boundary each class contributes, with scope 3 apart.',
    test: f => num(f.totals && f.totals.headline && f.totals.headline.value) && recorded(f).every(c => num(c.headline.value)),
    justify: () => 'A recorded class carries no headline figure.',
  },
  {
    id: 'ABS-2', group: 'Absolute emissions', clause: 'Part A p.126', duty: SHALL, section: 'absolute',
    item: 'Removals and credits sit outside the inventory, scope 3 is never summed into the headline, and the boundaries summed are named.',
    test: f => Boolean(f.totals && f.totals.headline && /never/i.test(f.totals.headline.note || '')) && Boolean(f.totals.scope3 && f.totals.scope3.note),
    justify: () => 'The totals carry no statement of what is and is not summed.',
  },
  {
    id: 'ABS-3', group: 'Absolute emissions', clause: 'Part A ch.6 (p.163); Annex 10.2', duty: SHALL, section: 'absolute',
    item: 'Emissions are disaggregated by asset class, and within a class by sector or sovereign.',
    test: f => recorded(f).length > 0 && ((f.bySector || []).length > 0 || (f.bySovereign || []).length > 0),
    justify: () => 'No recorded class carries a disaggregation.',
  },
  {
    id: 'MTH-1', group: 'Methodology', clause: 'Part A §5.2 (p.57); §5.9 (p.144)', duty: SHALL, section: 'methodology',
    item: 'The attribution and estimation approach is stated per class, and every factor set or dataset is named with a version and a checksum.',
    test: f => (f.releases || []).length === recorded(f).length && (f.releases || []).every(r => Boolean(r.checksum)),
    justify: () => 'A recorded class has no release named, or a release carries no checksum.',
  },
  {
    id: 'DQ-1', group: 'Data quality', clause: 'Part A DCL p.128; Box 6.1-6', duty: SHALL, section: 'dataquality',
    item: 'A data-quality score is disclosed per asset class, weighted by outstanding amount within it, and never averaged across classes.',
    test: f => f.dataQuality && f.dataQuality.byClass.length === recorded(f).length && f.dataQuality.byClass.every(c => num(c.score)) && /never averaged/i.test(f.dataQuality.note || ''),
    justify: () => 'A recorded class carries no score.',
  },
  {
    id: 'REC-1', group: 'Recalculation', clause: 'Part A ch.6 (p.164)', duty: SHALL, section: 'recalculation',
    item: 'A baseline recalculation policy is stated, with a disclosed significance threshold and the triggers.',
    test: f => num(f.recalculation && f.recalculation.significanceThresholdPct) && (f.recalculation.triggers || []).length > 0,
    justify: () => 'The reporting entity’s settings carry no significance threshold or no recalculation triggers.',
  },
  {
    id: 'INV-1', group: 'Entity inventory', clause: 'Part A ch.6 (p.160); SLFRS S2 §29(a)', duty: SHALL, section: 's2Inventory',
    item: 'The reporting entity’s own gross scope 1 and location-based scope 2 are disclosed beside the financed emissions this system measures.',
    test: f => Boolean(f.s2 && f.s2.inventoryStated),
    justify: () => 'The entity has not stated its own gross scope 1 or its location-based scope 2, so this document '
      + 'remains the Category 15 input to an S2 inventory rather than the inventory itself.',
  },
  {
    id: 'S2-GOV-1', group: 'SLFRS S2 governance', clause: 'SLFRS S2 §6(a)–(b)', duty: SHALL, section: 's2Governance',
    item: 'The body responsible for oversight is named, with how it exercises oversight and management’s role.',
    test: f => ['governance.body', 'governance.oversight', 'governance.managementRole'].every(p => stated(f, p)),
    justify: f => `Not stated: ${missing(f, ['governance.body', 'governance.oversight', 'governance.managementRole'])}.`,
  },
  {
    id: 'S2-STR-1', group: 'SLFRS S2 strategy', clause: 'SLFRS S2 §10(a)–(c), §13, §14(a)', duty: SHALL, section: 's2Strategy',
    item: 'The climate-related risks and opportunities are identified with the horizons the entity defines, and the effects on the business model and the transition plan are described.',
    test: f => ['strategy.exposures', 'strategy.horizonDefinitions', 'strategy.businessModel'].every(p => stated(f, p)),
    justify: f => `Not stated: ${missing(f, ['strategy.exposures', 'strategy.horizonDefinitions', 'strategy.businessModel'])}.`,
  },
  {
    id: 'S2-RSK-1', group: 'SLFRS S2 risk management', clause: 'SLFRS S2 §25(a)–(c)', duty: SHALL, section: 's2RiskManagement',
    item: 'How climate-related risks are identified, assessed and monitored is described, and how those processes sit inside overall risk management.',
    test: f => ['riskManagement.identification', 'riskManagement.monitoring', 'riskManagement.integration'].every(p => stated(f, p)),
    justify: f => `Not stated: ${missing(f, ['riskManagement.identification', 'riskManagement.monitoring', 'riskManagement.integration'])}.`,
  },
  {
    id: 'S2-MET-1', group: 'SLFRS S2 metrics', clause: 'SLFRS S2 §29(b)–(d)', duty: SHALL, section: 's2CrossIndustry',
    item: 'The amount and percentage of assets vulnerable to transition risk, vulnerable to physical risk and aligned with climate-related opportunities are reported, with the unassessed amount stated beside them.',
    test: f => Boolean(f.s2) && num(f.s2.exposure.transitionRisk.sharePct) && num(f.s2.exposure.physicalRisk.sharePct) && num(f.s2.exposure.opportunities.sharePct),
    justify: () => 'No exposure carries a climate classification, so no share can be taken: a percentage over a book '
      + 'nobody has classified would read as a finding rather than as the absence it is.',
  },
  {
    id: 'S2-IND-1', group: 'SLFRS S2 metrics', clause: 'SLFRS S2 §32; banking guidance', duty: SHALL, section: 's2Industry',
    item: 'Gross exposure and financed emissions are disaggregated by industry, with lending to carbon-related industries identified on a stated boundary.',
    test: f => Boolean(f.s2 && f.s2.exposure.industries.rows.length && f.s2.exposure.industries.carbonRelated.basis),
    justify: () => 'No exposure carries a sector, so no industry table can be given.',
  },
  {
    id: 'S2-TGT-1', group: 'SLFRS S2 targets', clause: 'SLFRS S2 §33–36', duty: SHALL, section: 's2Targets',
    item: 'Each climate-related target is disclosed with its metric, what it covers, its base year and its target year.',
    test: f => {
      const t = f.s2 && f.s2.targets.entries;
      const rows = (t && t.state !== 'absent' && Array.isArray(t.value)) ? t.value : [];
      return rows.length > 0 && rows.every(r => r.targetKind && r.scopeCovered);
    },
    justify: () => 'No climate-related target is stated by the reporting entity, or a stated target names neither what it covers nor whether it is absolute or an intensity.',
  },
  {
    id: 'S2-PRV-1', group: 'SLFRS S2 provenance', clause: 'SLFRS S2 §5–37', duty: SHOULD, section: 's2Governance',
    item: 'Every climate-related statement in the document is the reporting entity’s own: no illustrative trial content remains.',
    test: f => Boolean(f.s2) && f.s2.readiness.illustrative === 0,
    justify: f => `${f.s2.readiness.illustrative} statement(s) are still the illustrative content supplied with the tool. `
      + 'Each is marked where it is printed, so nothing reads as the entity’s own; replacing the words makes them the entity’s.',
  },
  {
    id: 'TRC-1', group: 'Traceability', clause: 'ISO 14064-3 §6.1.3; ISAE 3000 §48', duty: SHALL, section: 'annexRegister',
    item: 'Every disclosed total can be followed to the exposures behind it: one register row per exposure of every class, each resolving to its stored record.',
    test: f => Array.isArray(f.exposureRegister) && f.exposureRegister.length === Number(f.exposures) && f.exposureRegister.length > 0,
    justify: () => 'The register does not carry one row per recorded exposure.',
  },
  {
    id: 'UNC-1', group: 'Uncertainty', clause: 'ISO 14064-3 §6.1.5; Part A ch.6 (p.167)', duty: SHOULD, section: 'uncertainty',
    item: 'An uncertainty statement is made by data-quality score, and everything the document does not contain is listed in one place.',
    test: f => (f.optionDistribution || []).length > 0 && Array.isArray(f.gaps),
    justify: () => 'No scored exposure in the book’s currency, so no statement by score can be made.',
  },
  {
    id: 'INT-1', group: 'Intensity', clause: 'Part A ch.6 (p.166); DCL p.127', duty: SHOULD, section: 'intensity',
    item: 'An economic emission intensity is reported per class and, where the classes share the book’s currency, across them.',
    test: f => recorded(f).every(c => num(c.intensity && c.intensity.value)),
    justify: () => 'A recorded class carries no intensity.',
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
    const justification = answer === YES ? null : (def.justify ? def.justify(f) : 'Not present in this document.');
    return { id: def.id, group: def.group, clause: def.clause, duty: def.duty, item: def.item, section: def.section, answer, justification };
  });
  const required = items.filter(i => i.duty === SHALL);
  const recommended = items.filter(i => i.duty === SHOULD);
  const met = i => i.answer === YES || i.answer === NA;
  return {
    title: 'PCAF Disclosure Checklist for Part A — completed',
    provenance:
      'A self-assessment of the consolidated financed-emissions disclosure against the reporting '
      + 'requirements of PCAF Part A, Chapter 6, with the items an independent verifier under '
      + 'ISO 14064-3 / ISAE 3000 reads beside them. The wording of each item is CarbonIQ’s and the '
      + 'governing clause is printed beside it. Every answer is read from the document’s own facts; '
      + 'no item is answered by assertion. This annex is not a reproduction of any form published by '
      + 'PCAF, and inclusion of a completed checklist is not an endorsement, approval or certification '
      + 'by PCAF. The SLFRS S2 items beside the PCAF ones are answered from the reporting entity’s own '
      + 'statements, so a document whose entity has stated nothing fails every one of them.',
    header: {
      entityLabel: meta.entityLabel || 'Reporting entity',
      entity: meta.insurer || 'Not stated',
      reinsurer: meta.insurer || 'Not stated',
      reportTitle: meta.title || 'PCAF Part A financed-emissions disclosure',
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
