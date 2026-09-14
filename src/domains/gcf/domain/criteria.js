// @ts-check
/**
 * The six investment criteria, as evidence coverage.
 *
 * The Fund and the iTAP score a proposal on six criteria (docs/GCF-PIPELINE-
 * RESEARCH.md §3). `screening.js` scores three from data it holds and names
 * the other three unscored with reasons; that stays. What this module adds is
 * the reviewer's first question — for each sub-criterion, does the record hold
 * what a reviewer would ask for — answered evidenced, partial or absent. It is
 * not a score and it does not become one.
 */

'use strict';

const screening = require('./screening');

const E = 'evidenced'; const P = 'partial'; const A = 'absent';
const has = v => v !== undefined && v !== null && v !== '';
const tiered = f => (f && typeof f === 'object' && typeof f.tier === 'string' && Number.isFinite(f.value) ? E : A);
const narrative = (p, k) => (p.narrative && has(p.narrative[k]) ? E : A);
const doc = (p, kind) => (Array.isArray(p.documents) && p.documents.some(d => d && d.kind === kind) ? E : A);

/** @type {ReadonlyArray<{id:string,label:string,scoredByEngine:boolean,sub:ReadonlyArray<{id:string,label:string,check:(p:any)=>string}>}>} */
const CRITERIA = Object.freeze([
  { id: 'impactPotential', label: 'Impact potential', scoredByEngine: true, sub: [
    { id: 'mitigation', label: 'tCO2e reduced, avoided or removed — Core Indicator 1', check: p => (p.stream === 'mitigation' ? tiered(p.mitigation && p.mitigation.lifetime_tCO2e) : (p.mitigation && p.mitigation.isCoBenefit ? tiered(p.mitigation.lifetime_tCO2e) : E)) },
    { id: 'beneficiaries', label: 'Direct and indirect beneficiaries — Core Indicator 2', check: p => (tiered(p.beneficiaries && p.beneficiaries.direct) === E && tiered(p.beneficiaries && p.beneficiaries.indirect) === E ? E : A) },
    { id: 'assets_area', label: 'Assets made resilient and hectares under improved management — Core Indicators 3 and 4', check: p => (p.stream === 'adaptation' ? (tiered(p.assets && p.assets.valueProtected_usd) === E || tiered(p.area && p.area.hectares) === E ? E : A) : E) },
  ] },
  { id: 'paradigmShift', label: 'Paradigm-shift potential', scoredByEngine: false, sub: [
    { id: 'scale_replication', label: 'Potential for scaling up and replication', check: p => narrative(p, 'paradigmShift') },
    { id: 'knowledge', label: 'Knowledge and learning — a monitoring and evaluation plan', check: p => doc(p, 'me_plan') },
    { id: 'enabling', label: 'Contribution to the enabling environment and regulatory frameworks', check: p => narrative(p, 'enablingEnvironment') },
  ] },
  { id: 'sustainableDevelopment', label: 'Sustainable development potential', scoredByEngine: false, sub: [
    { id: 'cobenefits', label: 'Environmental, social and economic co-benefits', check: p => narrative(p, 'sustainableDevelopment') },
    { id: 'gender', label: 'Gender-sensitive development impact — assessment and action plan', check: p => { const s = p.safeguards || {}; const a = s.genderAssessment && s.genderAssessment.status === 'complete'; const b = s.genderActionPlan && s.genderActionPlan.status === 'complete'; return a && b ? E : a || b ? P : A; } },
  ] },
  { id: 'needsOfRecipient', label: 'Needs of the recipient', scoredByEngine: false, sub: [
    { id: 'vulnerability', label: 'Vulnerability of the country and the target population', check: p => narrative(p, 'needsOfRecipient') },
    { id: 'alternatives', label: 'Absence of alternative funding — barriers named', check: p => (Array.isArray(p.barriers) && p.barriers.length ? E : A) },
  ] },
  { id: 'countryOwnership', label: 'Country ownership', scoredByEngine: true, sub: [
    { id: 'ndc', label: 'Alignment with NDC 3.0 and the NAP', check: p => (Array.isArray(p.ndcSectorTargets) && p.ndcSectorTargets.length ? E : A) },
    { id: 'nda', label: 'NDA engagement and no-objection', check: p => { const s = (p.nda && p.nda.status) || 'not_requested'; return s === 'issued' ? E : s === 'not_requested' || s === 'declined' ? A : P; } },
    { id: 'stakeholders', label: 'Stakeholder engagement', check: p => { const s = p.safeguards && p.safeguards.stakeholderConsultation; return s && s.status === 'complete' ? E : s && s.status === 'in_progress' ? P : A; } },
    { id: 'capacity', label: 'The accredited entity’s capacity to deliver — executing entity and track record', check: p => (p.executingEntity && has(p.executingEntity.name) ? (has(p.executingEntity.trackRecord) ? E : P) : A) },
  ] },
  { id: 'efficiencyEffectiveness', label: 'Efficiency and effectiveness', scoredByEngine: true, sub: [
    { id: 'cofinancing', label: 'Co-financing and the amount of GCF funding requested', check: p => (p.financing && p.financing.totalCost > 0 && p.financing.gcfAsk > 0 ? E : A) },
    { id: 'viability', label: 'Financial viability with and without support — minimum concessionality', check: p => (p.financing && p.financing.viabilityWithoutGcf && has(p.financing.viabilityWithoutGcf.reason) ? E : A) },
    { id: 'financial_model', label: 'Economic and financial analysis', check: p => (doc(p, 'financial_model') === E && doc(p, 'economic_analysis') === E ? E : doc(p, 'financial_model') === E || doc(p, 'economic_analysis') === E ? P : A) },
  ] },
]);

/** The six criteria for one project: evidence held, not a score. */
function assess(project) {
  const scored = new Set(screening.GCF_CRITERIA.filter(c => c.scored).map(c => c.id));
  const criteria = CRITERIA.map(c => {
    const sub = c.sub.map(s => ({ id: s.id, label: s.label, status: s.check(project) }));
    const n = sub.length; const e = sub.filter(s => s.status === E).length; const a = sub.filter(s => s.status === A).length;
    return {
      id: c.id, label: c.label, scoredByEngine: scored.has(c.id),
      status: e === n ? E : a === n ? A : P,
      sub,
    };
  });
  return {
    criteria,
    evidenced: criteria.filter(c => c.status === E).length,
    partial: criteria.filter(c => c.status === P).length,
    absent: criteria.filter(c => c.status === A).length,
    note: 'Evidence held on the record for each criterion the Fund assesses. Not a score: the Secretariat and the independent Technical Advisory Panel score a proposal; this says what they would find on the record.',
  };
}

module.exports = { CRITERIA, assess };
