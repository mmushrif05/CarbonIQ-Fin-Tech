// @ts-check
/**
 * The sections a concept note and a funding proposal are written from, held
 * as structured facts on the record rather than as a document flag.
 *
 * The pipeline used to know eight of GCF's sections only as "a document of
 * this kind is on the list": a risk register, the implementation
 * arrangements, sustainability and exit, the stakeholder consultations, the
 * adaptation climate rationale, the financial terms, monitoring and
 * evaluation, and the reporting the FAA asks for after approval. A flag says
 * a file exists; it cannot say what is in it, so the readiness checklist
 * could only ask for the file and the Concept Note package could only mark
 * the input external. Each is a block on the record now, with a closed
 * vocabulary where GCF's templates use one, and one function here answers
 * held / partial / missing for readiness and the package alike — the two
 * cannot disagree about whether a section is there because both read this.
 *
 * Every block is optional and every record recorded before this existed is
 * unaffected; a document of the same kind still counts, so nothing that was
 * held becomes missing. Nothing here judges quality: held means the facts are
 * on the record, and whether they satisfy the Secretariat is the
 * Secretariat's to say.
 */

'use strict';

const Joi = require('joi');

const HELD = 'held'; const PARTIAL = 'partial'; const MISSING = 'missing';

const ISO_DATE = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null);
const text = n => Joi.string().max(n).allow('', null).optional();
const has = v => v !== undefined && v !== null && String(v).trim() !== '';

/* Closed vocabularies, in the words GCF's own templates use. */
const RISK_CATEGORIES = ['technical', 'financial', 'political', 'social', 'environmental', 'climate', 'operational', 'fiduciary', 'other'];
const RISK_LEVELS = ['low', 'medium', 'high'];
const STAKEHOLDER_GROUPS = ['government', 'community', 'private_sector', 'ngo', 'academia', 'financier', 'indigenous_peoples', 'workers', 'other'];
const CONSULTATION_MODES = ['consultation', 'workshop', 'interview', 'survey', 'written', 'site_visit', 'other'];
const CLIMATE_HAZARDS = ['flood', 'drought', 'sea_level_rise', 'cyclone', 'storm_surge', 'heat', 'salinity', 'landslide', 'erratic_rainfall', 'coastal_erosion', 'other'];
const REPAYMENT_PROFILES = ['bullet', 'equal_principal', 'annuity', 'other'];
const MONITORING_FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual', 'once'];
const APR_STATUSES = ['due', 'submitted', 'accepted'];

const SCHEMAS = Object.freeze({
  /* Funding proposal F — risk assessment and management. */
  risks: Joi.array().items(Joi.object({
    category: Joi.string().valid(...RISK_CATEGORIES).required(),
    description: Joi.string().max(600).required(),
    likelihood: Joi.string().valid(...RISK_LEVELS).required(),
    impact: Joi.string().valid(...RISK_LEVELS).required(),
    mitigation: text(800),
    owner: text(160),
  })),
  /* Funding proposal B.4 — implementation arrangements and timetable. */
  implementation: Joi.object({
    arrangements: text(2000), governance: text(1200), procurementApproach: text(1200),
    timetable: Joi.array().items(Joi.object({
      milestone: Joi.string().max(200).required(), start: ISO_DATE.optional(), end: ISO_DATE.optional(), note: text(400),
    })).default([]),
  }),
  /* Funding proposal B.6 — sustainability and exit strategy. */
  sustainability: Joi.object({
    strategy: text(2000), exitStrategy: text(2000), ownershipAfterClosure: text(1200), financialSustainability: text(1200),
  }),
  /* Funding proposal annex — summary of stakeholder consultations. */
  stakeholders: Joi.array().items(Joi.object({
    name: Joi.string().max(200).required(),
    group: Joi.string().valid(...STAKEHOLDER_GROUPS).required(),
    date: ISO_DATE.optional(),
    mode: Joi.string().valid(...CONSULTATION_MODES).default('consultation'),
    outcome: text(800), reference: text(200),
  })),
  /* Concept note B.1 — the adaptation climate rationale: hazards, vulnerability, evidence. */
  climateRationale: Joi.object({
    hazards: Joi.array().items(Joi.string().valid(...CLIMATE_HAZARDS)).default([]),
    vulnerability: text(2000), exposure: text(1200), adaptiveCapacity: text(1200),
    evidenceSource: text(600), scenario: text(600),
  }),
  /* Funding proposal C.2 and C.3 — the financial terms the term sheet will carry. */
  financialTerms: Joi.object({
    currency: Joi.string().max(8).default('USD'),
    tenorYears: Joi.number().min(0).max(60).allow(null).optional(),
    gracePeriodYears: Joi.number().min(0).max(30).allow(null).optional(),
    interestRatePct: Joi.number().min(0).max(100).allow(null).optional(),
    repaymentProfile: Joi.string().valid(...REPAYMENT_PROFILES).allow(null).optional(),
    securityPackage: text(1200), onLendingTerms: text(1200),
    disbursements: Joi.array().items(Joi.object({
      tranche: Joi.string().max(80).required(), amount: Joi.number().min(0).allow(null).optional(),
      condition: text(400), date: ISO_DATE.optional(),
    })).default([]),
  }),
  /* Funding proposal annex — monitoring and evaluation plan. */
  monitoring: Joi.object({
    arrangements: text(2000),
    indicators: Joi.array().items(Joi.object({
      indicator: Joi.string().max(200).required(),
      frequency: Joi.string().valid(...MONITORING_FREQUENCIES).required(),
      method: text(400), responsible: text(200), verification: text(400),
    })).default([]),
    evaluationPlan: text(1200), reportingSchedule: text(600),
  }),
  /* Project cycle stage 8 — what the FAA asks for after approval. */
  reporting: Joi.object({
    aprs: Joi.array().items(Joi.object({
      year: Joi.number().integer().min(2000).max(2100).required(),
      status: Joi.string().valid(...APR_STATUSES).default('due'),
      submittedAt: ISO_DATE.optional(), reference: text(200),
    })).default([]),
    midTermReview: Joi.object({ plannedAt: ISO_DATE.optional(), completedAt: ISO_DATE.optional(), reference: text(200) }).optional(),
    finalEvaluation: Joi.object({ plannedAt: ISO_DATE.optional(), completedAt: ISO_DATE.optional(), reference: text(200) }).optional(),
    audits: Joi.array().items(Joi.object({
      year: Joi.number().integer().min(2000).max(2100).required(), reference: text(200), submittedAt: ISO_DATE.optional(),
    })).default([]),
  }),
});

const SECTION_KEYS = Object.freeze(Object.keys(SCHEMAS));

const list = v => (Array.isArray(v) ? v : []);
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One answer per section: held, partial or missing, with a summary in words
 * for the package and the sentence that would raise it. Reads the record and
 * nothing else; computes no figure beyond a count of what is recorded.
 * @param {any} project
 * @param {string} key one of SECTION_KEYS
 * @returns {{status: string, summary: string|null, missing: string|null}}
 */
function status(project, key) {
  const p = project || {};
  switch (key) {
    case 'risks': {
      const r = list(p.risks);
      if (!r.length) return { status: MISSING, summary: null, missing: 'No risk recorded.' };
      const bare = r.filter(x => !has(x.mitigation)).length;
      const high = r.filter(x => x.impact === 'high').length;
      const summary = `${count(r.length, 'risk')} recorded — ${high} with high impact; ${bare ? `${bare} without a mitigation` : 'each with its mitigation'}`;
      return bare ? { status: PARTIAL, summary, missing: `${count(bare, 'risk')} recorded without a mitigation.` } : { status: HELD, summary, missing: null };
    }
    case 'implementation': {
      const i = p.implementation || {};
      const t = list(i.timetable);
      const a = has(i.arrangements);
      if (!a && !t.length) return { status: MISSING, summary: null, missing: 'No implementation arrangements or timetable recorded.' };
      const summary = `${a ? 'Arrangements stated' : 'Arrangements not stated'}; ${count(t.length, 'timetable milestone')}${t.length ? ` — ${t.slice(0, 3).map(m => m.milestone).join(', ')}${t.length > 3 ? '…' : ''}` : ''}`;
      if (a && t.length) return { status: HELD, summary, missing: null };
      return { status: PARTIAL, summary, missing: a ? 'The timetable has no milestone.' : 'The implementation arrangements are not stated.' };
    }
    case 'sustainability': {
      const s = p.sustainability || {};
      const held = has(s.strategy) && has(s.exitStrategy);
      const any = ['strategy', 'exitStrategy', 'ownershipAfterClosure', 'financialSustainability'].some(k => has(s[k]));
      if (!any) return { status: MISSING, summary: null, missing: 'No sustainability or exit strategy recorded.' };
      const summary = `${has(s.strategy) ? 'Sustainability stated' : 'Sustainability not stated'}; ${has(s.exitStrategy) ? 'exit strategy stated' : 'exit strategy not stated'}`;
      return held ? { status: HELD, summary, missing: null } : { status: PARTIAL, summary, missing: has(s.strategy) ? 'The exit strategy is not stated.' : 'The sustainability strategy is not stated.' };
    }
    case 'stakeholders': {
      const s = list(p.stakeholders);
      if (!s.length) return { status: MISSING, summary: null, missing: 'No consultation recorded.' };
      const bare = s.filter(x => !has(x.outcome)).length;
      const groups = [...new Set(s.map(x => x.group))];
      const summary = `${count(s.length, 'consultation')} recorded across ${count(groups.length, 'group')} (${groups.join(', ')})${bare ? `; ${bare} without an outcome` : ''}`;
      return bare ? { status: PARTIAL, summary, missing: `${count(bare, 'consultation')} recorded without its outcome.` } : { status: HELD, summary, missing: null };
    }
    case 'climateRationale': {
      const c = p.climateRationale || {};
      const h = list(c.hazards);
      const any = h.length || ['vulnerability', 'exposure', 'adaptiveCapacity', 'evidenceSource', 'scenario'].some(k => has(c[k]));
      if (!any) return { status: MISSING, summary: null, missing: 'No hazard, vulnerability or evidence recorded.' };
      const held = h.length && has(c.vulnerability) && has(c.evidenceSource);
      const summary = `${h.length ? `Hazards: ${h.join(', ')}` : 'No hazard named'}; ${has(c.vulnerability) ? 'vulnerability stated' : 'vulnerability not stated'}; ${has(c.evidenceSource) ? `evidence: ${c.evidenceSource}` : 'no evidence source'}`;
      if (held) return { status: HELD, summary, missing: null };
      return { status: PARTIAL, summary, missing: !h.length ? 'No climate hazard named.' : !has(c.vulnerability) ? 'The vulnerability is not stated.' : 'The evidence source is not named.' };
    }
    case 'financialTerms': {
      const f = p.financialTerms || {};
      const any = ['tenorYears', 'gracePeriodYears', 'interestRatePct', 'repaymentProfile', 'securityPackage', 'onLendingTerms'].some(k => has(f[k])) || list(f.disbursements).length;
      if (!any) return { status: MISSING, summary: null, missing: 'No financial term recorded.' };
      const held = has(f.tenorYears) && has(f.interestRatePct) && has(f.repaymentProfile);
      const summary = `${has(f.tenorYears) ? `${f.tenorYears}-year tenor` : 'tenor not stated'}${has(f.gracePeriodYears) ? `, ${f.gracePeriodYears}-year grace` : ''}; ${has(f.interestRatePct) ? `${f.interestRatePct}% p.a.` : 'rate not stated'}; ${has(f.repaymentProfile) ? String(f.repaymentProfile).replace(/_/g, ' ') : 'repayment profile not stated'}${list(f.disbursements).length ? `; ${count(list(f.disbursements).length, 'tranche')}` : ''}`;
      if (held) return { status: HELD, summary, missing: null };
      return { status: PARTIAL, summary, missing: !has(f.tenorYears) ? 'The tenor is not stated.' : !has(f.interestRatePct) ? 'The rate is not stated.' : 'The repayment profile is not stated.' };
    }
    case 'monitoring': {
      const m = p.monitoring || {};
      const ind = list(m.indicators);
      const any = has(m.arrangements) || ind.length || has(m.evaluationPlan) || has(m.reportingSchedule);
      if (!any) return { status: MISSING, summary: null, missing: 'No monitoring arrangement or indicator recorded.' };
      const bare = ind.filter(x => !has(x.responsible)).length;
      const held = has(m.arrangements) && ind.length && !bare;
      const summary = `${has(m.arrangements) ? 'Arrangements stated' : 'Arrangements not stated'}; ${count(ind.length, 'indicator')}${ind.length ? ` (${ind.map(x => x.frequency).filter((v, i, a) => a.indexOf(v) === i).join(', ')})` : ''}${bare ? `; ${bare} without a responsible party` : ''}${has(m.evaluationPlan) ? '; evaluation planned' : ''}`;
      if (held) return { status: HELD, summary, missing: null };
      return { status: PARTIAL, summary, missing: !has(m.arrangements) ? 'The monitoring arrangements are not stated.' : !ind.length ? 'No indicator is recorded.' : `${count(bare, 'indicator')} without a responsible party.` };
    }
    case 'reporting': {
      const r = p.reporting || {};
      const aprs = list(r.aprs);
      const filed = aprs.filter(x => x.status === 'submitted' || x.status === 'accepted');
      const any = aprs.length || list(r.audits).length || (r.midTermReview && (r.midTermReview.plannedAt || r.midTermReview.completedAt)) || (r.finalEvaluation && (r.finalEvaluation.plannedAt || r.finalEvaluation.completedAt));
      if (!any) return { status: MISSING, summary: null, missing: 'No annual performance report, review or audit recorded.' };
      const summary = `${count(filed.length, 'annual performance report')} filed of ${aprs.length} recorded${list(r.audits).length ? `; ${count(list(r.audits).length, 'audit report')}` : ''}${r.midTermReview && r.midTermReview.completedAt ? '; mid-term review complete' : ''}`;
      return filed.length ? { status: HELD, summary, missing: null } : { status: PARTIAL, summary, missing: 'A report is recorded as due; none has been filed.' };
    }
    default:
      throw new Error(`Unknown section "${key}"`);
  }
}

/**
 * The better of two answers — the structured fact and a document of the same
 * kind — so nothing that was held by a document becomes missing.
 */
function best(a, b) {
  const rank = { [HELD]: 2, [PARTIAL]: 1, [MISSING]: 0 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

module.exports = {
  SCHEMAS, SECTION_KEYS, status, best,
  HELD, PARTIAL, MISSING,
  RISK_CATEGORIES, RISK_LEVELS, STAKEHOLDER_GROUPS, CONSULTATION_MODES, CLIMATE_HAZARDS,
  REPAYMENT_PROFILES, MONITORING_FREQUENCIES, APR_STATUSES,
};
