// @ts-check
/**
 * The GCF pipeline disclosure as a document — the file a bank puts beside its
 * SLFRS S2 disclosure, rendered to PDF and Word.
 *
 * `reporting.js` builds the lines SLFRS S1/S2 and GRI 305 actually ask for
 * from the pipeline — and until now they were served as JSON and read on a
 * screen. This module lays the same report out as a document through the
 * platform report standard, the one renderer Part A and Part C also use, so
 * the GCF file shares their furniture without either scope importing the
 * other. It adds no figure: every number is one `reporting.js`,
 * `portfolio.js` or the gap register already returned, moved and never
 * recomputed.
 *
 * ── What it says on its face ───────────────────────────────────────────────
 *
 * A pipeline of financed projects is not the bank's inventory. The inventory
 * lines are printed absent with the clause that requires them and where the
 * figure actually comes from; the pipeline is disclosed where it belongs —
 * §29(d) climate-related opportunities, §29(e) capital deployment, and an
 * avoided-and-reduced line stated apart and never netted. NDC 3.0's two
 * commitments stay in two ledgers with no row summing them.
 *
 * ── Three kinds of statement, and no fourth ────────────────────────────────
 *
 * A section prints the entity's own words, or *not stated* with the
 * paragraph that asks for it — never a sentence written on the bank's
 * behalf. The endorsement-language guard reads the entity's own statements
 * as well as this document's prose, and refuses the whole document naming
 * the phrase, because a form is otherwise the route by which a claim of
 * endorsement returns to a page.
 *
 * ── One position, one reference ────────────────────────────────────────────
 *
 * The reference on the cover is a SHA-256 over the canonical facts and the
 * build commit; the publication instant sits outside it, so a position
 * rendered twice carries one reference and a filed copy can be matched.
 */

'use strict';

const crypto = require('crypto');
const { b, keep } = require('../../../platform/reporting/report-standard/blocks');
const { renderStandardPDF } = require('../../../platform/reporting/report-standard/render-pdf');
const { renderStandardDOCX } = require('../../../platform/reporting/report-standard/render-docx');
const { canonical } = require('../../../shared/checksum');
const { containsForbiddenLanguage, isPlaceholder } = require('../../../shared/report-integrity');
const config = require('../../../platform/config');
const { positionFor } = require('../../baseline/application/assurance-position');
const reporting = require('./reporting');
const portfolio = require('../domain/portfolio');
const gaps = require('../domain/gaps');

const TITLE = 'GCF pipeline climate-related disclosure';
const STANDARD = 'SLFRS S1 and S2 (IFRS S1/S2 as adopted in Sri Lanka); GRI 305: Emissions 2016; GCF IRMF';

const usd = n => (Number.isFinite(Number(n)) ? `USD ${Number(n).toLocaleString('en-US')}` : '—');
const t = n => (Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('en-US')} tCO₂e` : '—');
const pct = n => (Number.isFinite(Number(n)) ? `${Number(n)}%` : '—');

/** A declared entity fact as printed: the entity's words, or null where it stated nothing. */
const stated = v => (v === null || v === undefined || isPlaceholder(v) ? null : v);
const statedText = v => { const s = stated(v); return s === null ? null : (Array.isArray(s) ? s.join('; ') : String(s)); };

/** A statement block: the entity's own words, or not stated with the clause. */
function statement(label, value, clause) {
  const s = statedText(value);
  return s
    ? b.callout(s, label)
    : b.callout(`Not stated. ${clause} asks the reporting entity for ${label.toLowerCase()}; nothing is written on its behalf.`, `${label} — not stated`);
}

/**
 * @typedef {object} DisclosureContext
 * @property {any} [entityDisclosures]   the facts only the entity can state
 * @property {any} [accreditation]       the envelope every gate reads
 * @property {number} [reportingYear]
 * @property {boolean} [sample]
 * @property {string|null} [sampleNote]
 * @property {number} [bauCumulative_tCO2e]
 * @property {any} [assurance]           the assurance position, resolved by the caller
 * @property {string} [now]
 * @property {string} [source]           'recorded' or 'seed'
 */

/**
 * The facts the document rests on, drawn from what the engines already
 * returned. Synchronous, so a golden can pin it; the assurance position is
 * handed in by the caller that resolved it.
 * @param {any[]} projects
 * @param {DisclosureContext} [opts]
 */
function disclosureFacts(projects, {
  entityDisclosures = null, accreditation = null, reportingYear = new Date().getUTCFullYear(),
  sample = false, sampleNote = null, bauCumulative_tCO2e = undefined, assurance = null,
  now = new Date().toISOString(), source = 'recorded',
} = {}) {
  const report = reporting.buildDisclosure(projects, { entityDisclosures, reportingYear, sample, sampleNote, bauCumulative_tCO2e });
  const port = portfolio.portfolio(projects, { accreditation, now });
  const register = gaps.register(projects, { now, entityGaps: report.gaps });
  const entityName = statedText(report.basis.entity);

  const own = [
    report.governance.oversight, report.governance.managementRole, report.strategy.opportunitiesIdentified,
    report.riskManagement.process, report.metricsAndTargets.targets.entityTargets,
  ].map(statedText).filter(Boolean).join('\n');
  const offending = containsForbiddenLanguage(own);
  if (offending.length > 0) {
    const err = /** @type {any} */ (new Error(`The document was not produced: the reporting entity’s own statements contain endorsement language (${offending.join(', ')}). Only conformance language is permitted; edit the statement on the entity facts.`));
    err.statusCode = 422; err.code = 'FORBIDDEN_LANGUAGE';
    throw err;
  }

  const commit = (config.runtime.build && config.runtime.build.commit) ? String(config.runtime.build.commit).slice(0, 12) : null;
  const content = canonical({
    reportingYear, entity: entityName, decision: accreditation ? accreditation.decision : null,
    projects: port.rows.map(r => ({ id: r.id, stage: r.stage, gate: r.gate, totalCost: r.totalCost, gcfAsk: r.gcfAsk, assessment: r.assessment.state })),
    checklist: report.checklist.map(i => i.met), commit,
  });
  const reportId = 'GCF-DISC-' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12).toUpperCase();

  return {
    report, portfolio: port, register, accreditation: accreditation || {}, entityName,
    reportingYear, sample, sampleNote, source, assurance, commit, reportId,
    publishedAt: new Date().toISOString(),
    safeName: `gcf-disclosure-${reportingYear}`,
  };
}

/* ── Sections, in the order SLFRS S2 reads ────────────────────────────────── */

function basisSection(f) {
  const a = f.accreditation;
  return { id: 'basis', title: 'Reporting entity and basis of preparation', blocks: keep([
    b.body(f.report.basis.covers),
    b.table({ head: ['Field', 'Stated'], widths: [2, 4], rows: [
      ['Reporting entity', f.entityName || 'Not stated — SLFRS S1 §B38'],
      ['Accreditation', a.decision ? `Green Climate Fund Direct Access Entity, Board decision ${a.decision}${a.recorded ? '' : ' (as shipped; the entity has not recorded its own)'}` : 'Not stated'],
      ['Accredited size and risk category', a.sizeCategory ? `${a.sizeCategory}; environmental and social category ${a.essCategory || '—'}` : '—'],
      ['Grant award modality', a.grantModality === false ? 'Not held — a fact to verify with DFCC or the NDA' : a.grantModality === true ? 'Held' : '—'],
      ['Reporting year', String(f.reportingYear)],
      ['Prepared from', `${f.portfolio.count} candidate project(s) in the ${f.source === 'seed' ? 'shipped illustrative' : 'recorded'} pipeline`],
      ['Standards', STANDARD],
    ] }),
    f.sample ? b.callout(f.sampleNote || 'Illustrative dataset — not client records.', 'Illustrative dataset') : null,
    b.body(f.report.basis.preparedFrom),
  ]) };
}

function governanceSection(f) {
  return { id: 'governance', title: 'Governance', blocks: keep([
    b.body('SLFRS S2 §6 asks how the board oversees climate-related risks and opportunities and what management’s role is. Both are the entity’s own statements.'),
    statement('Board oversight', f.report.governance.oversight, 'SLFRS S2 §6(a)'),
    statement('Management’s role', f.report.governance.managementRole, 'SLFRS S2 §6(b)'),
  ]) };
}

function strategySection(f) {
  const p = f.portfolio;
  return { id: 'strategy', title: 'Strategy — the pipeline as evidence', blocks: keep([
    statement('Climate-related opportunities identified', f.report.strategy.opportunitiesIdentified, 'SLFRS S2 §9'),
    b.body(`The candidate pipeline is evidence of the strategy the entity states: ${p.count} project(s) on the Green Climate Fund’s project activity cycle, ${p.byStream.map(s => `${s.count} ${s.stream}`).join(' and ')}.`),
    b.table({ head: ['Stage of the cycle', 'Projects', 'GCF ask'], widths: [3, 1, 2], align: ['left', 'right', 'right'], zebra: true,
      rows: p.byStage.filter(s => s.count > 0).map(s => [s.label, String(s.count), usd(s.gcfAsk)]) }),
  ]) };
}

function riskSection(f) {
  const e = f.report.riskManagement.essScreening;
  const g = f.portfolio.gate;
  return { id: 'risk', title: 'Risk management', blocks: keep([
    statement('Process for identifying, assessing and monitoring climate-related risks', f.report.riskManagement.process, 'SLFRS S2 §25'),
    b.body(`The environmental and social gate this pipeline applies is a risk process and can be evidenced: ${e.framework} Accreditation ceiling ${e.accreditationCeiling}.`),
    b.table({ head: ['Environmental and social category', 'Projects'], widths: [4, 2], align: ['left', 'right'],
      rows: Object.entries(e.byCategory).map(([k, v]) => [`Category ${k}`, String(v)]) }),
    b.table({ head: ['Accreditation gate', 'Projects'], widths: [4, 2], align: ['left', 'right'], rows: [
      ['Eligible — within the accreditation, nothing to resolve', String(g.eligible)],
      ['Flagged — eligible with something to verify', String(g.flagged)],
      ['Excluded — outside the accreditation envelope', String(g.excluded)],
    ] }),
    e.outsideAccreditation.length ? b.callout(`Outside the accredited category: ${e.outsideAccreditation.join(', ')}. Excluded, not down-ranked.`, 'Accreditation') : null,
  ]) };
}

function inventorySection(f) {
  const inv = f.report.metricsAndTargets.inventory;
  const row = (label, x) => [label, 'Absent', `${x.reason} (${x.standardRef})`];
  return { id: 'inventory', title: 'Greenhouse gas inventory — SLFRS S2 §29(a)', blocks: keep([
    b.callout(inv.note, 'Not derivable from a pipeline'),
    b.table({ head: ['Line', 'Answer', 'Where the figure comes from'], widths: [2, 0.8, 3.2], zebra: true, rows: [
      row('Absolute gross scope 1 emissions', inv.scope1),
      row('Absolute gross scope 2 emissions', inv.scope2),
      row('Absolute gross scope 3 emissions, including category 15', inv.scope3),
    ] }),
  ]) };
}

function opportunitiesSection(f) {
  const c = f.report.metricsAndTargets.climateOpportunities;
  return { id: 'opportunities', title: 'Assets aligned with climate-related opportunities — SLFRS S2 §29(d)', blocks: keep([
    b.body(c.standardRef),
    b.table({ head: ['Measure', 'Value'], widths: [3, 3], rows: [
      ['Projects aligned', String(c.alignedProjects)],
      ['Aligned amount (total project cost)', usd(c.alignedAmount)],
      ['Share of the pipeline', pct(c.alignedPctOfPipeline)],
      ['Framework', c.framework],
    ] }),
    b.table({ head: ['Taxonomy band', 'Projects'], widths: [4, 2], align: ['left', 'right'],
      rows: Object.entries(c.byBand).map(([k, v]) => [k, String(v)]) }),
  ]) };
}

function capitalSection(f) {
  const c = f.report.metricsAndTargets.capitalDeployment;
  return { id: 'capital', title: 'Capital deployment — SLFRS S2 §29(e)', blocks: keep([
    b.body(c.standardRef),
    b.bars({ label: 'Pipeline financing by source', unit: 'USD', decimals: 0, rows: [
      { label: 'GCF ask', value: c.gcfAsk },
      { label: 'DFCC commitment', value: c.dfccCommitment },
      { label: 'Other sources', value: c.otherSources },
    ], caption: `Total project cost ${usd(c.pipelineTotalCost)}. ${c.note}` }),
  ]) };
}

function avoidedSection(f) {
  const a = f.report.metricsAndTargets.avoidedAndReduced;
  const bt = a.byBaselineType || {};
  return { id: 'avoided', title: 'Emissions avoided, reduced and removed by financed projects — stated apart', blocks: keep([
    b.callout(a.note, 'Never netted against an inventory'),
    b.body(a.standardRef),
    b.table({ head: ['Line', 'Annual', 'Lifetime', 'Projects'], widths: [2.6, 1.2, 1.2, 1], align: ['left', 'right', 'right', 'right'], zebra: true, rows: [
      [a.indicator, t(a.annual_tCO2e), t(a.lifetime_tCO2e), String(f.portfolio.byStream.find(s => s.stream === 'mitigation')?.count ?? '—')],
      ...['reduced', 'avoided', 'removal'].filter(k => bt[k]).map(k => [`  of which ${k}`, t(bt[k].annual_tCO2e), t(bt[k].lifetime_tCO2e), String(bt[k].projects)]),
      ['Adaptation co-benefit — on its own line, never in the headline', t(a.adaptationCoBenefit && a.adaptationCoBenefit.annual_tCO2e), t(a.adaptationCoBenefit && a.adaptationCoBenefit.lifetime_tCO2e), String(a.adaptationCoBenefit ? a.adaptationCoBenefit.projects : 0)],
      ['Embodied carbon A1–A5 — a separate boundary, never deducted', '—', t(a.embodiedCarbon && a.embodiedCarbon.a1a5_tCO2e), String(a.embodiedCarbon ? a.embodiedCarbon.projects : 0)],
    ] }),
    b.caption(`Weakest evidence tier in the headline: ${(a.evidence && a.evidence.weakestTier) || '—'}. ${(a.evidence && a.evidence.note) || ''}`),
  ]) };
}

function beneficiariesSection(f) {
  const be = f.report.metricsAndTargets.beneficiaries;
  return { id: 'beneficiaries', title: 'Beneficiaries — IRMF core indicator 2', blocks: keep([
    b.body(be.standardRef),
    b.table({ head: ['Indicator', 'People'], widths: [4, 2], align: ['left', 'right'], rows: [
      ['Direct beneficiaries', Number(be.direct).toLocaleString('en-US')],
      ['Indirect beneficiaries', Number(be.indirect).toLocaleString('en-US')],
    ], caption: be.note }),
  ]) };
}

function targetsSection(f) {
  const tg = f.report.metricsAndTargets.targets;
  const n = tg.nationalContext;
  const share = s => (s && s.available === false ? `Absent — ${s.needs || 'needs the BAU tonnage'}` : s && Number.isFinite(Number(s.pct)) ? pct(s.pct) : '—');
  return { id: 'targets', title: 'Targets — SLFRS S2 §33–37, and the national context', blocks: keep([
    statement('The entity’s own climate-related targets', tg.entityTargets, 'SLFRS S2 §33'),
    b.body(`${n.ndc.version}, issued ${n.ndc.issued}, period ${n.ndc.period}. Two commitments, carried in two ledgers; no row here sums them.`),
    b.table({ head: ['Commitment', 'Target', 'Pipeline, inside the period', 'Share of the target'], widths: [1.8, 1.6, 1.4, 1.6], zebra: true, rows: [
      ['Reduction against BAU', `${n.reduction.commitment.totalPct}% (${n.reduction.commitment.unconditionalPct}% unconditional, ${n.reduction.commitment.conditionalPct}% conditional)`, t(n.reduction.pipelineCumulative_tCO2e), share(n.reduction.share)],
      ['Increase in net removal', `${n.removal.commitment.totalPct}% (${n.removal.commitment.unconditionalPct}% unconditional, ${n.removal.commitment.conditionalPct}% conditional)`, t(n.removal.pipelineCumulative_tCO2e), share(n.removal.share)],
    ] }),
    b.caption(n.note || ''),
    b.caption(n.ndc.verify || ''),
  ]) };
}

function griSection(f) {
  const g = f.report.gri;
  const row = k => [k, g[k].metric, `${g[k].reason}`];
  return { id: 'gri', title: 'GRI 305 — answered honestly', blocks: keep([
    b.table({ head: ['Disclosure', 'Line', 'Answer'], widths: [0.8, 2, 3.2], zebra: true,
      rows: ['305-1', '305-2', '305-3', '305-4', '305-5'].map(row) }),
    b.table({ head: [g.supplementary.title, 'Annual', 'Lifetime'], widths: [3.2, 1.4, 1.4], align: ['left', 'right', 'right'], rows: [
      ['Financed projects', t(g.supplementary.annual_tCO2e), t(g.supplementary.lifetime_tCO2e)],
    ], caption: g.supplementary.note }),
  ]) };
}

function gapsSection(f) {
  const r = f.register;
  return { id: 'gaps', title: 'What this disclosure could not state, and what is blocking the pipeline', blocks: keep([
    b.body(f.report.completenessNote),
    f.report.gaps.length ? b.table({ head: ['Where', 'What is missing', 'Clause'], widths: [1.6, 2.8, 1.6], zebra: true,
      rows: f.report.gaps.map(g => [g.path, g.what, g.standardRef || '—']) }) : b.body('Nothing outstanding on the entity’s own statements.'),
    b.body(`The pipeline’s own register: ${r.totals.project} open item(s) across ${r.totals.blocked} of ${r.totals.projects} project(s), by who holds the key.`),
    b.table({ head: ['Who closes it', 'Open now', 'Projects'], widths: [2.4, 1, 2.6], align: ['left', 'right', 'left'], zebra: true,
      rows: r.byOwner.filter(o => o.now > 0).map(o => [o.label, String(o.now), o.projects.join(', ') || (o.entity ? 'entity facts' : '—')]) }),
    b.caption(r.note),
  ]) };
}

function registerAnnex(f) {
  return { id: 'annexRegister', annex: 'A', title: 'The candidate pipeline', blocks: keep([
    b.body('One row per candidate, as recorded. Every figure carries an evidence tier on the record; the weakest tier per project is the one a reviewer should ask about first.'),
    b.table({ head: ['Code', 'Project', 'Stream', 'Stage', 'Gate', 'ESS', 'Total cost', 'GCF ask', 'Weakest tier', 'Assessment'],
      widths: [0.7, 2.2, 0.8, 1, 0.7, 0.5, 1, 1, 0.8, 0.9], zebra: true,
      rows: f.portfolio.rows.map(r => [r.code, r.name, r.stream, r.stageLabel, r.gate, r.essCategory || '—', usd(r.totalCost), usd(r.gcfAsk), r.weakestTier || '—', r.assessment.stateLabel]) }),
  ]) };
}

/** The checklist, answered from the report so an item can fail. */
function checklistModel(f) {
  const SECTION_OF = {
    'SLFRS S1 §B38': 'basis', 'SLFRS S2 §6(a)': 'governance', 'SLFRS S2 §6(b)': 'governance', 'SLFRS S2 §9': 'strategy',
    'SLFRS S2 §25': 'risk', 'SLFRS S2 §29(a)': 'inventory', 'SLFRS S2 §29(d)': 'opportunities', 'SLFRS S2 §29(e)': 'capital',
    'GRI 305; PCAF Part A p.126': 'avoided', 'SLFRS S2 §33': 'targets',
  };
  const items = f.report.checklist.map((i, n) => ({
    id: `D-${n + 1}`, group: 'Disclosure', clause: i.standardRef || '—', duty: 'shall', item: i.item,
    section: SECTION_OF[i.standardRef] || 'gaps', answer: i.met ? 'Yes' : 'No', justification: i.met ? null : i.basis,
  }));
  const yes = items.filter(i => i.answer === 'Yes').length;
  return {
    title: 'Disclosure checklist — completed',
    provenance: 'A self-assessment of this document against the lines SLFRS S1/S2 and GRI 305 ask of a climate-related disclosure drawn from a financed-project pipeline. Every answer is read from the document’s own facts; no item is answered by assertion, and the inventory item stays No while the entity’s own inventory is held elsewhere. Not a reproduction of any form published by the ISSB, CA Sri Lanka, GRI or the Green Climate Fund, and nothing here is endorsed by any of them.',
    header: { entityLabel: 'Reporting entity', entity: f.entityName || 'Not stated', reinsurer: f.entityName || 'Not stated', reportTitle: TITLE, reportingYear: f.reportingYear, publicationDate: f.publishedAt, reportReference: f.reportId, url: null },
    legend: { shall: 'Requirement — the standard says "shall".', should: 'Recommendation — the standard says "should".' },
    items,
    summary: { total: items.length, answeredYes: yes, notApplicable: 0, answeredNo: items.length - yes,
      requirements: { total: items.length, met: yes }, recommendations: { total: 0, met: 0 } },
  };
}

/** The whole document model — cover, sections, annexes, checklist. */
function buildModel(f) {
  const a = f.assurance || {};
  return {
    cover: {
      title: TITLE,
      subtitle: 'SLFRS S2 §29(d)–(e) and GRI 305 supplementary lines from the Green Climate Fund candidate pipeline — one input to the entity’s disclosure, not the disclosure itself',
      entityLabel: 'Reporting entity',
      insurer: f.entityName || 'Not stated',
      reportingYear: f.reportingYear,
      publishedAt: f.publishedAt,
      standard: STANDARD,
      preparedBy: null,
      reportId: f.reportId,
      responsibleParty: [],
      identity: keep([`Report reference: ${f.reportId}`, f.commit ? `Build: ${f.commit}` : null, `Source: ${f.source === 'seed' ? 'shipped illustrative pipeline' : 'recorded pipeline'}`]),
      assuranceMode: a.mode || null,
      assuranceLabel: a.label || null,
      assuranceStatement: a.statement || null,
    },
    footerNote: `${TITLE} — FY${f.reportingYear}`,
    sections: [
      basisSection(f), governanceSection(f), strategySection(f), riskSection(f), inventorySection(f),
      opportunitiesSection(f), capitalSection(f), avoidedSection(f), beneficiariesSection(f), targetsSection(f),
      griSection(f), gapsSection(f),
    ],
    annexes: [
      registerAnnex(f),
      { id: 'annexChecklist', annex: 'B', title: 'Disclosure checklist — completed', blocks: [b.checklist()] },
    ],
    checklist: checklistModel(f),
    facts: f,
  };
}

/**
 * The model for one organisation's pipeline, with the assurance position
 * read where every document reads it.
 * @param {string} orgId
 * @param {any[]} projects
 * @param {DisclosureContext} [ctx]
 */
async function disclosureModel(orgId, projects, ctx = {}) {
  const assurance = ctx.assurance || await positionFor(orgId, {});
  return buildModel(disclosureFacts(projects, { ...ctx, assurance }));
}

/** @param {string} orgId @param {any[]} projects @param {DisclosureContext} [ctx] */
async function disclosurePDF(orgId, projects, ctx) { return renderStandardPDF(await disclosureModel(orgId, projects, ctx)); }
/** @param {string} orgId @param {any[]} projects @param {DisclosureContext} [ctx] */
async function disclosureDOCX(orgId, projects, ctx) { return renderStandardDOCX(await disclosureModel(orgId, projects, ctx)); }

module.exports = { TITLE, disclosureFacts, buildModel, disclosureModel, disclosurePDF, disclosureDOCX, checklistModel };
