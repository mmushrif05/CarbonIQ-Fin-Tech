// @ts-check
/**
 * The GCF project activity cycle — where a project can be, and what comes next.
 *
 * GCF describes ten stages from origination to closure (docs/GCF-PIPELINE-
 * RESEARCH.md §2). The record's own `stage` vocabulary is finer at the front —
 * a bank tells a concept from a pre-feasibility from a drafted concept note —
 * and every value maps onto exactly one of the ten, so a pipeline can be drawn
 * on the Fund's own axis while the bank keeps its working states.
 *
 * Three timing facts the Fund has published are held here with their source,
 * and used only as projections: six weeks for concept-note feedback, nine
 * months from concept note to Board approval, about eleven months from
 * approval to first disbursement. A projection is drawn as one and never as a
 * date the Fund has given.
 */

'use strict';

/** The ten stages, GCF's order. */
const CYCLE = Object.freeze([
  { n: 1, key: 'programming', label: 'Country and entity programming', actor: 'NDA · AE',
    deliverable: 'On the entity work programme, aligned to the Country Programme (NAP, NDC)' },
  { n: 2, key: 'origination', label: 'Project origination', actor: 'AE · NDA',
    deliverable: 'A project idea with a climate rationale, a results area and a stream' },
  { n: 3, key: 'concept_note', label: 'Concept note', actor: 'AE → Secretariat',
    deliverable: 'Concept note submitted; Secretariat feedback; NDA informed; PPF may be requested' },
  { n: 4, key: 'fp_development', label: 'Funding proposal development', actor: 'AE (with PPF where granted)',
    deliverable: 'Funding proposal drafted with its annexes; NDA no-objection requested' },
  { n: 5, key: 'fp_review', label: 'Funding proposal review', actor: 'Secretariat · ORMC',
    deliverable: 'Second-level due diligence complete; conditions and recommendations drafted' },
  { n: 6, key: 'board', label: 'Board consideration', actor: 'iTAP → Board',
    deliverable: 'Independent technical assessment; Board decision with conditions' },
  { n: 7, key: 'legal', label: 'Legal arrangements', actor: 'GCF · AE',
    deliverable: 'Funded Activity Agreement signed and effective' },
  { n: 8, key: 'implementation', label: 'Implementation and monitoring', actor: 'AE',
    deliverable: 'First disbursement; annual performance reports' },
  { n: 9, key: 'adaptive', label: 'Adaptive management', actor: 'AE · Secretariat',
    deliverable: 'Interim evaluation; restructuring where needed' },
  { n: 10, key: 'closure', label: 'Closure and evaluation', actor: 'AE · IEU',
    deliverable: 'Completion report, final audit, exit strategy executed' },
]);

/** The record's stage values, in order, each on its cycle stage. */
const STAGE_INFO = Object.freeze({
  concept:         { label: 'Concept',                          cycle: 2 },
  pre_feasibility: { label: 'Pre-feasibility',                  cycle: 2 },
  cn_drafted:      { label: 'Concept note drafted',             cycle: 3 },
  cn_submitted:    { label: 'Concept note submitted',           cycle: 3 },
  ppf:             { label: 'Project preparation (PPF)',        cycle: 4 },
  fp:              { label: 'Funding proposal in development',  cycle: 4 },
  fp_submitted:    { label: 'Funding proposal submitted',       cycle: 5 },
  board:           { label: 'Before the Board',                 cycle: 6 },
  approved:        { label: 'Approved by the Board',            cycle: 6 },
  faa:             { label: 'Funded Activity Agreement signed', cycle: 7 },
  implementation:  { label: 'Under implementation',             cycle: 8 },
  closed:          { label: 'Closed',                           cycle: 10 },
});

const STAGES = Object.freeze(Object.keys(STAGE_INFO));

/** What happens next from each stage: the step, who takes it, the document it produces. */
const NEXT_STEP = Object.freeze({
  concept: { what: 'Complete the pre-feasibility: climate rationale, results area, NDC alignment, indicative cost and ask', who: 'DFCC deal team', document: 'Pre-feasibility note' },
  pre_feasibility: { what: 'Draft the concept note (Sections A–C) and inform the NDA', who: 'DFCC · NDA', document: 'Concept note (template v2.2)' },
  cn_drafted: { what: 'Submit the concept note to the Secretariat', who: 'DFCC', document: 'Concept note; NDA notification' },
  cn_submitted: { what: 'Act on the Secretariat’s feedback; request Project Preparation Facility support where preparation needs funding; begin the funding proposal', who: 'DFCC · Secretariat', document: 'Secretariat feedback; PPF application' },
  ppf: { what: 'Complete preparation — feasibility, financial model, ESIA or ESMP, gender assessment — and draft the funding proposal', who: 'DFCC with the PPF service provider', document: 'Funding proposal draft with annexes' },
  fp: { what: 'Complete the annexes, obtain the NDA no-objection letter and submit the funding proposal', who: 'DFCC · NDA', document: 'Funding proposal A–H; no-objection letter' },
  fp_submitted: { what: 'Answer second-level due diligence; agree the conditions and recommendations', who: 'Secretariat · DFCC', document: 'Responses to the Secretariat; revised proposal' },
  board: { what: 'Independent technical assessment, then the Board’s decision', who: 'iTAP · Board', document: 'iTAP assessment; Board decision' },
  approved: { what: 'Negotiate and sign the Funded Activity Agreement; meet the conditions precedent', who: 'GCF · DFCC', document: 'Funded Activity Agreement' },
  faa: { what: 'Reach FAA effectiveness and first disbursement; start implementation', who: 'DFCC', document: 'Effectiveness notice; first disbursement request' },
  implementation: { what: 'Annual performance reports; disbursement by tranche; interim evaluation', who: 'DFCC · Secretariat', document: 'Annual performance report' },
  closed: { what: 'Nothing further: the completion report, final audit and exit strategy are filed', who: 'DFCC · IEU', document: 'Completion report' },
});

/** Timing the Fund has published, held with its source and used only as projections. */
const TIMING = Object.freeze({
  cnFeedbackWeeks: { value: 6, source: 'GCF revised concept-note submission process, December 2024: feedback within six weeks' },
  cnToApprovalMonths: { value: 9, source: 'GCF annual progress report 2024: nine months from concept note to Board approval' },
  approvalToDisbursementMonths: { value: 11, source: 'GCF: average time from approval to first disbursement under eleven months (2022)' },
});

/**
 * @param {string} stage
 * @returns {{stage: string, label: string, cycle: {n: number, key: string, label: string, actor: string, deliverable: string}} | null}
 */
function stageInfo(stage) {
  const info = STAGE_INFO[stage];
  if (!info) return null;
  const cycle = CYCLE.find(c => c.n === info.cycle) || CYCLE[0];
  return { stage, label: info.label, cycle };
}

function nextStage(stage) {
  const i = STAGES.indexOf(stage);
  return i < 0 || i === STAGES.length - 1 ? null : STAGES[i + 1];
}

/** The instant the project entered its current stage, from the history or the record's provenance. */
function enteredStageAt(project) {
  const history = Array.isArray(project.stageHistory) ? project.stageHistory : [];
  const last = [...history].reverse().find(h => h && h.stage === project.stage);
  if (last && last.at) return last.at;
  const prov = project.provenance || {};
  return prov.updatedAt || prov.enteredAt || null;
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso); const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function daysInStage(project, now = new Date().toISOString()) {
  const at = enteredStageAt(project);
  return at ? daysBetween(at, now) : null;
}

function addDays(iso, days) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Milestones the Fund's published timing implies from the dates the record
 * holds. Each is marked `projected: true` and carries the basis; none is a
 * date the Fund has given this project.
 */
function projections(project) {
  const t = project.timeline || {};
  const out = [];
  if (t.cnSubmitted && !t.cnFeedback) {
    out.push({ key: 'cnFeedbackDue', milestone: 'Secretariat feedback on the concept note', date: addDays(t.cnSubmitted, TIMING.cnFeedbackWeeks.value * 7),
      projected: true, basis: TIMING.cnFeedbackWeeks.source });
  }
  if (t.cnSubmitted && !t.boardDecision) {
    out.push({ key: 'boardDecisionProjected', milestone: 'Board approval, at the Fund’s nine-month commitment', date: addDays(t.cnSubmitted, Math.round(TIMING.cnToApprovalMonths.value * 30.44)),
      projected: true, basis: TIMING.cnToApprovalMonths.source });
  }
  if (t.boardDecision && !t.firstDisbursement) {
    out.push({ key: 'firstDisbursementProjected', milestone: 'First disbursement, at the Fund’s average', date: addDays(t.boardDecision, Math.round(TIMING.approvalToDisbursementMonths.value * 30.44)),
      projected: true, basis: TIMING.approvalToDisbursementMonths.source });
  }
  return out.filter(x => x.date);
}

/** The recorded milestones, in cycle order, with the targets beside the actuals. */
const MILESTONES = Object.freeze([
  { key: 'conceptStarted', label: 'Concept started', cycle: 2 },
  { key: 'cnSubmissionTarget', label: 'Concept note — target submission', cycle: 3, target: true },
  { key: 'cnSubmitted', label: 'Concept note submitted', cycle: 3 },
  { key: 'cnFeedback', label: 'Secretariat feedback received', cycle: 3 },
  { key: 'ppfRequested', label: 'PPF requested', cycle: 4 },
  { key: 'ppfApproved', label: 'PPF approved', cycle: 4 },
  { key: 'fpSubmissionTarget', label: 'Funding proposal — target submission', cycle: 4, target: true },
  { key: 'fpSubmitted', label: 'Funding proposal submitted', cycle: 5 },
  { key: 'boardTarget', label: 'Board meeting targeted', cycle: 6, target: true },
  { key: 'boardDecision', label: 'Board decision', cycle: 6 },
  { key: 'faaSigned', label: 'FAA signed', cycle: 7 },
  { key: 'faaEffective', label: 'FAA effective', cycle: 7 },
  { key: 'firstDisbursement', label: 'First disbursement', cycle: 8 },
  { key: 'implementationStart', label: 'Implementation started', cycle: 8 },
  { key: 'commissioning', label: 'Commissioning', cycle: 8 },
  { key: 'completion', label: 'Completion', cycle: 10 },
]);

function timeline(project, now = new Date().toISOString()) {
  const t = project.timeline || {};
  const today = now.slice(0, 10);
  const recorded = MILESTONES.filter(m => t[m.key]).map(m => ({
    key: m.key, label: m.label, date: t[m.key], cycle: m.cycle, target: Boolean(m.target),
    overdue: Boolean(m.target) && t[m.key] < today && !t[m.key.replace('SubmissionTarget', 'Submitted').replace('boardTarget', 'boardDecision')],
  }));
  return { recorded, projected: projections(project), today };
}

module.exports = {
  CYCLE, STAGE_INFO, STAGES, NEXT_STEP, TIMING, MILESTONES,
  stageInfo, nextStage, enteredStageAt, daysInStage, projections, timeline, addDays,
};
