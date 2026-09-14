// @ts-check
/**
 * What each stage of the cycle needs, answered from the record.
 *
 * The Fund publishes what a concept note and a funding proposal must contain
 * (docs/GCF-PIPELINE-RESEARCH.md §7) and what it asks of an accredited entity
 * along the way — the NDA's no-objection, the safeguards documents by category,
 * the gender assessment and action plan, the co-financing commitments. This
 * module turns that into one list per project: each item held, partial or
 * missing, with the clause that asks for it and the fact that would close it.
 *
 * It computes no figure and passes no judgement on quality. "Held" means the
 * record holds the fact; whether the fact is good enough is the Secretariat's
 * and the iTAP's to say. The gate is advisory: a project may be moved with a
 * gap open, and the gap travels with it, because the bank and not the tool
 * decides what it submits.
 */

'use strict';

const cycle = require('./cycle');

const HELD = 'held'; const PARTIAL = 'partial'; const MISSING = 'missing';

const has = v => v !== undefined && v !== null && v !== '';
const tiered = f => (f && typeof f === 'object' && typeof f.tier === 'string' && Number.isFinite(f.value) ? HELD : MISSING);
const doc = (project, kind) => (Array.isArray(project.documents) && project.documents.some(d => d && d.kind === kind) ? HELD : MISSING);
const docStatus = s => (!s || !s.status || s.status === 'not_started' ? MISSING : s.status === 'complete' ? HELD : PARTIAL);
const ndaAtLeast = (project, level) => {
  const order = ['not_requested', 'informed', 'requested', 'issued'];
  const status = (project.nda && project.nda.status) || 'not_requested';
  if (status === 'declined') return MISSING;
  return order.indexOf(status) >= order.indexOf(level) ? HELD : MISSING;
};
const date = (project, key) => (project.timeline && has(project.timeline[key]) ? HELD : MISSING);

/**
 * The requirements, by the cycle stage they belong to. `check` answers from
 * the record and nothing else.
 * @type {ReadonlyArray<{id:string, cycle:number, label:string, clause:string, remedy:string, check:(p:any)=>string}>}
 */
const REQUIREMENTS = Object.freeze([
  /* Stage 2 — origination: the idea with its rationale. */
  { id: 'climate_rationale', cycle: 2, label: 'Climate rationale — baseline and counterfactual stated', clause: 'Concept note B.1, B.2',
    remedy: 'Record the baseline description and the counterfactual on the mitigation block.',
    check: p => (p.mitigation && p.mitigation.baseline && has(p.mitigation.baseline.description) && has(p.mitigation.baseline.counterfactual) ? HELD : MISSING) },
  { id: 'results_area', cycle: 2, label: 'Results area and stream named', clause: 'GCF results areas',
    remedy: 'Choose one of the eight results areas.', check: p => (has(p.resultsArea) && has(p.stream) ? HELD : MISSING) },
  { id: 'ndc_alignment', cycle: 2, label: 'NDC 3.0 sector target cited', clause: 'Country ownership — alignment with the NDC',
    remedy: 'Name at least one NDC 3.0 sector target the project serves.', check: p => (Array.isArray(p.ndcSectorTargets) && p.ndcSectorTargets.length ? HELD : MISSING) },
  { id: 'taxonomy', cycle: 2, label: 'Sri Lanka taxonomy band', clause: 'SLGFT',
    remedy: 'Record the SLGFT band the activity falls in.', check: p => (p.taxonomy && has(p.taxonomy.band) ? HELD : MISSING) },
  { id: 'indicative_cost', cycle: 2, label: 'Indicative cost and GCF ask', clause: 'Concept note C',
    remedy: 'Record the total cost and the GCF ask.', check: p => (p.financing && p.financing.totalCost > 0 && p.financing.gcfAsk > 0 ? HELD : MISSING) },

  /* Stage 3 — the concept note. */
  { id: 'selection_reason', cycle: 3, label: 'Why this project — the selection reasoning', clause: 'Lot 2 — the two concepts defended',
    remedy: 'Write the reason this project is put forward.', check: p => (has(p.selectionReason) ? HELD : MISSING) },
  { id: 'impact_figure', cycle: 3, label: 'Impact figure with its evidence tier', clause: 'Concept note B.3; IRMF core indicators 1 and 2',
    remedy: 'Record the lifetime mitigation, or the direct and indirect beneficiaries for adaptation, each with its tier.',
    check: p => (p.stream === 'mitigation' ? tiered(p.mitigation && p.mitigation.lifetime_tCO2e)
      : (tiered(p.beneficiaries && p.beneficiaries.direct) === HELD && tiered(p.beneficiaries && p.beneficiaries.indirect) === HELD ? HELD : MISSING)) },
  { id: 'barriers', cycle: 3, label: 'Barriers to commercial finance named', clause: 'Concept note B.2 — why GCF',
    remedy: 'Name the barriers from the catalogue; the instrument is matched to them.', check: p => (Array.isArray(p.barriers) && p.barriers.length ? HELD : MISSING) },
  { id: 'viability', cycle: 3, label: 'Viability with and without GCF support', clause: 'Efficiency and effectiveness — minimum concessionality',
    remedy: 'Record whether the project is viable without concessional support, and why.',
    check: p => (p.financing && p.financing.viabilityWithoutGcf && has(p.financing.viabilityWithoutGcf.reason) ? HELD : MISSING) },
  { id: 'ess_category', cycle: 3, label: 'Environmental and social risk category', clause: 'GCF Environmental and Social Policy',
    remedy: 'Categorise the project A, B, C or I-1 to I-3.', check: p => (has(p.essCategory) ? HELD : MISSING) },
  { id: 'executing_entity', cycle: 3, label: 'Executing entity named', clause: 'Concept note A; funding proposal A',
    remedy: 'Name the executing entity and its track record.', check: p => (p.executingEntity && has(p.executingEntity.name) ? HELD : MISSING) },
  { id: 'nda_informed', cycle: 3, label: 'NDA informed of the concept', clause: 'Sri Lanka NDA Operation Manual; concept note A',
    remedy: 'Record that the Ministry of Environment has been informed.', check: p => ndaAtLeast(p, 'informed') },
  { id: 'cn_target', cycle: 3, label: 'Concept-note submission date targeted', clause: 'CarbonIQ — the pipeline carries a date',
    remedy: 'Set the target submission date.', check: p => date(p, 'cnSubmissionTarget') },

  /* Stage 4 — funding proposal development. */
  { id: 'cn_submitted', cycle: 4, label: 'Concept note submitted', clause: 'Project cycle stage 3',
    remedy: 'Record the submission date.', check: p => date(p, 'cnSubmitted') },
  { id: 'feasibility', cycle: 4, label: 'Feasibility study', clause: 'Funding proposal annex — feasibility study',
    remedy: 'Attach the feasibility study reference.', check: p => doc(p, 'feasibility_study') },
  { id: 'financial_model', cycle: 4, label: 'Economic and financial analysis with the financial model', clause: 'Funding proposal annex — economic and financial analysis',
    remedy: 'Attach the financial model and the economic analysis.', check: p => (doc(p, 'financial_model') === HELD && doc(p, 'economic_analysis') === HELD ? HELD : doc(p, 'financial_model') === HELD || doc(p, 'economic_analysis') === HELD ? PARTIAL : MISSING) },
  { id: 'safeguards_docs', cycle: 4, label: 'Safeguards documents for the category', clause: 'GCF Environmental and Social Policy — ESIA/ESMP (B), ESAP (C)',
    remedy: 'Complete the ESMP for a category B project, or the ESAP for category C.',
    check: p => (['C', 'I-3'].includes(p.essCategory) ? docStatus(p.safeguards && p.safeguards.esap) : docStatus(p.safeguards && p.safeguards.esmp)) },
  { id: 'gender', cycle: 4, label: 'Gender assessment and action plan', clause: 'GCF Gender Policy — assessment with the proposal, action plan at preparation',
    remedy: 'Complete the gender assessment and the gender action plan with sex-disaggregated targets.',
    check: p => { const a = docStatus(p.safeguards && p.safeguards.genderAssessment); const b = docStatus(p.safeguards && p.safeguards.genderActionPlan);
      return a === HELD && b === HELD ? HELD : a === MISSING && b === MISSING ? MISSING : PARTIAL; } },
  { id: 'stakeholders', cycle: 4, label: 'Stakeholder consultation recorded', clause: 'Funding proposal annex — summary of consultations',
    remedy: 'Record the consultations held.', check: p => docStatus(p.safeguards && p.safeguards.stakeholderConsultation) },
  { id: 'fpic', cycle: 4, label: 'Free, prior and informed consent where Indigenous Peoples are affected', clause: 'GCF Indigenous Peoples Policy',
    remedy: 'Record the consent process with the affected communities.',
    check: p => { const f = p.safeguards && p.safeguards.fpic; const required = (f && f.required) || (Array.isArray(p.essFlags) && p.essFlags.includes('fpic_required'));
      if (!required) return HELD; if (!f || !f.status || f.status === 'not_started') return MISSING; return f.status === 'obtained' ? HELD : PARTIAL; } },
  { id: 'grm', cycle: 4, label: 'Grievance redress mechanism', clause: 'GCF Environmental and Social Policy',
    remedy: 'Record the project-level grievance mechanism.', check: p => docStatus(p.safeguards && p.safeguards.grm) },
  { id: 'cofinancing', cycle: 4, label: 'Co-financiers named, each committed or evidenced by letter', clause: 'Funding proposal annex — co-financing commitment letters',
    remedy: 'Record each co-financier with its amount and whether it is indicative, committed or evidenced by letter.',
    check: p => { const c = Array.isArray(p.coFinancing) ? p.coFinancing : []; if (!c.length) return MISSING;
      return c.every(x => x.status === 'committed' || x.status === 'letter_received') ? HELD : PARTIAL; } },
  { id: 'me_plan', cycle: 4, label: 'Monitoring and evaluation plan', clause: 'Funding proposal annex — M&E plan',
    remedy: 'Attach the monitoring and evaluation plan.', check: p => doc(p, 'me_plan') },
  { id: 'procurement', cycle: 4, label: 'Procurement plan', clause: 'Funding proposal annex — procurement plan',
    remedy: 'Attach the procurement plan.', check: p => doc(p, 'procurement_plan') },
  { id: 'risk_register', cycle: 4, label: 'Risk register', clause: 'Funding proposal F — risk assessment and management',
    remedy: 'Attach the risk register.', check: p => doc(p, 'risk_register') },
  { id: 'nda_requested', cycle: 4, label: 'NDA no-objection requested', clause: 'Sri Lanka NDA Operation Manual — no-objection procedure',
    remedy: 'Request the no-objection letter from the Ministry of Environment.', check: p => ndaAtLeast(p, 'requested') },

  /* Stage 5 — the proposal in review. */
  { id: 'fp_submitted', cycle: 5, label: 'Funding proposal submitted', clause: 'Project cycle stage 4',
    remedy: 'Record the submission date.', check: p => date(p, 'fpSubmitted') },
  { id: 'nda_issued', cycle: 5, label: 'NDA no-objection letter issued', clause: 'GCF no-objection procedure',
    remedy: 'Record the letter reference and date.', check: p => ndaAtLeast(p, 'issued') },
  { id: 'term_sheet', cycle: 5, label: 'Term sheet', clause: 'Funding proposal annex — term sheet',
    remedy: 'Attach the term sheet.', check: p => doc(p, 'term_sheet') },

  /* Stages 6 to 8 and 10 — dates the Fund and the bank set. */
  { id: 'board_target', cycle: 6, label: 'Board meeting targeted', clause: 'CarbonIQ — the pipeline carries a date',
    remedy: 'Set the Board meeting the proposal is aimed at.', check: p => date(p, 'boardTarget') },
  { id: 'board_decision', cycle: 7, label: 'Board decision recorded', clause: 'Project cycle stage 6',
    remedy: 'Record the decision date.', check: p => date(p, 'boardDecision') },
  { id: 'faa_signed', cycle: 7, label: 'Funded Activity Agreement signed', clause: 'Project cycle stage 7',
    remedy: 'Record the signing date.', check: p => date(p, 'faaSigned') },
  { id: 'faa_effective', cycle: 8, label: 'FAA effective', clause: 'Project cycle stage 7',
    remedy: 'Record the effectiveness date.', check: p => date(p, 'faaEffective') },
  { id: 'first_disbursement', cycle: 8, label: 'First disbursement', clause: 'Project cycle stage 8',
    remedy: 'Record the date.', check: p => date(p, 'firstDisbursement') },
  { id: 'completion', cycle: 10, label: 'Completion report', clause: 'Project cycle stage 10',
    remedy: 'Record the completion date and attach the completion report.', check: p => (date(p, 'completion') === HELD && doc(p, 'completion_report') === HELD ? HELD : date(p, 'completion') === HELD ? PARTIAL : MISSING) },
]);

/** GCF funding of at most USD 25 million with minimal risk — decision B.32/05. */
function sapEligibility(project) {
  const reasons = [];
  const ask = project.financing ? project.financing.gcfAsk : null;
  if (!(ask <= 25e6)) reasons.push('GCF funding requested exceeds USD 25 million.');
  if (!['C', 'I-3'].includes(project.essCategory)) reasons.push(`Environmental and social category ${project.essCategory} is not C or I-3.`);
  return { eligible: reasons.length === 0, reasons, basis: 'Simplified Approval Process — up to USD 25 million of GCF funding, category C or I-3 (decision B.32/05).' };
}

/** Preparation funding of up to 10% of the ask, capped at USD 1.5 million, at concept-note stage. */
function ppfEligibility(project) {
  const ask = project.financing ? project.financing.gcfAsk : 0;
  const atStage = ['cn_drafted', 'cn_submitted', 'ppf', 'fp'].includes(project.stage);
  const maxSupport_usd = Math.min(0.1 * (ask || 0), 1.5e6);
  return {
    eligible: atStage && ask > 0, maxSupport_usd: Math.round(maxSupport_usd),
    basis: 'Project Preparation Facility — up to 10% of the GCF funding requested, at most USD 1.5 million; micro and small direct-access projects are its stated focus.',
    note: atStage ? null : 'Available once a concept note exists and until the funding proposal is submitted.',
  };
}

/**
 * The project's readiness against its own stage and the next one.
 * @param {any} project
 * @param {{now?: string}} [opts]
 */
function assess(project, { now = new Date().toISOString() } = {}) {
  const info = cycle.stageInfo(project.stage);
  const currentCycle = info ? info.cycle.n : 2;
  const next = cycle.nextStage(project.stage);
  const nextInfo = next ? cycle.stageInfo(next) : null;
  const nextCycle = nextInfo ? nextInfo.cycle.n : null;

  const answer = r => ({ id: r.id, cycle: r.cycle, label: r.label, clause: r.clause, remedy: r.remedy, status: r.check(project) });
  const current = REQUIREMENTS.filter(r => r.cycle <= currentCycle).map(answer);
  const ahead = nextCycle && nextCycle > currentCycle ? REQUIREMENTS.filter(r => r.cycle === nextCycle).map(answer) : [];
  const held = current.filter(i => i.status === HELD).length;

  return {
    stage: project.stage, stageLabel: info ? info.label : project.stage,
    cycle: info ? { n: info.cycle.n, label: info.cycle.label, actor: info.cycle.actor } : null,
    daysInStage: cycle.daysInStage(project, now),
    items: current,
    pctReady: current.length ? Math.round((held / current.length) * 100) : null,
    blockers: current.filter(i => i.status !== HELD),
    next: next ? {
      stage: next, stageLabel: nextInfo ? nextInfo.label : next,
      cycle: nextInfo ? nextInfo.cycle.n : null,
      items: ahead, missing: ahead.filter(i => i.status !== HELD).length,
    } : null,
    nextStep: cycle.NEXT_STEP[project.stage] || null,
    sap: sapEligibility(project),
    ppf: ppfEligibility(project),
    timeline: cycle.timeline(project, now),
    note: 'Held means the record holds the fact; whether it is good enough is for the Secretariat and the iTAP. A gap does not stop a stage move; it travels with the project.',
  };
}

module.exports = { REQUIREMENTS, assess, sapEligibility, ppfEligibility, HELD, PARTIAL, MISSING };
