/**
 * CarbonIQ FinTech — the GCF project record
 *
 * The spine. One record per candidate project, entered once, read by the
 * pipeline screen, the emissions model, the statutory disclosure, the
 * instrument structuring and the Concept Note export. Nobody re-keys anything
 * and no two views can disagree, because there is only one set of numbers.
 *
 * ── Every figure carries its evidence ──────────────────────────────────────
 *
 * A bare number is not usable in a GCF submission or a statutory disclosure.
 * A traced value is `{ value, tier, ... }` where tier is one of measured,
 * modelled, benchmark or declared. The schema refuses a figure with no tier,
 * which is the only way to stop a benchmark default quietly becoming a
 * measured fact somewhere downstream.
 *
 * Deliberately NOT PCAF's 1-5 data-quality scale. That scale is defined for
 * financed-emissions inventory and reusing it for project appraisal would
 * misrepresent both — the same reason Part A must not inherit Part C's
 * option-to-score mapping.
 *
 * ── Three carbon boundaries, kept apart in the shape itself ────────────────
 *
 * `mitigation` is what the project achieves against a baseline (GCF Core
 * Indicator 1). `embodiedCarbon` is what building it costs, inside the project
 * boundary. Financed emissions — what the bank carries — are not in this
 * record at all; they belong to the capital book. Three questions, three
 * boundaries, and the schema gives them no place to be added together.
 *
 * ── Adaptation is never ranked on carbon ───────────────────────────────────
 *
 * An adaptation project may carry a real mitigation co-benefit. It is flagged
 * `isCoBenefit` and reported in its own column. Ranking a mangrove project
 * against a solar farm on carbon per dollar would systematically defund
 * adaptation, which is half of what GCF exists to do.
 */

'use strict';

const Joi = require('joi');

const { IRMF } = require('./reference');
const { RESULTS_AREAS: AREAS } = require('./reference');

const TIERS = IRMF.evidenceTiers.map(t => t.tier);
const AREA_CODES = AREAS.areas.map(a => a.code);
const STREAMS = ['mitigation', 'adaptation'];

/** Where a project has reached: the bank's working states, each mapped onto
 *  one of the Fund's ten cycle stages in ./cycle.js. The list used to stop at
 *  the Board; a pipeline has to carry a project past the day it is approved. */
const STAGES = [...require('./cycle').STAGES];
const sections = require('./sections');

const ISO_DATE = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null);
const DOC_STATUS = Joi.object({
  status: Joi.string().valid('not_started', 'in_progress', 'complete').default('not_started'),
  reference: Joi.string().max(200).allow('', null).optional(),
  date: ISO_DATE.optional(),
  note: Joi.string().max(600).allow('', null).optional(),
});
const DOCUMENT_KINDS = ['feasibility_study', 'financial_model', 'economic_analysis', 'esia', 'esmp', 'esap',
  'gender_assessment', 'gender_action_plan', 'stakeholder_consultation', 'procurement_plan', 'me_plan',
  'risk_register', 'term_sheet', 'no_objection_letter', 'cofinancing_letter', 'ppf_application',
  'theory_of_change', 'completion_report', 'map', 'other'];
const NDA_STATUSES = ['not_requested', 'informed', 'requested', 'issued', 'declined'];
const COFINANCING_STATUSES = ['indicative', 'committed', 'letter_received'];

/** GCF applies IFC Performance Standards on a scaled risk basis. DFCC is
 *  accredited to B/I-2, so category A is out of scope entirely — a gate the
 *  model enforces rather than a penalty it applies. */
const ESS_CATEGORIES = ['A', 'B', 'C', 'I-1', 'I-2', 'I-3'];
const ESS_WITHIN_DFCC_ACCREDITATION = ['B', 'C', 'I-2', 'I-3'];

const BASELINE_TYPES = ['reduced', 'avoided', 'removal'];

/**
 * A figure with its provenance. `value` may be null — an absent figure is a
 * fact, and reporting it absent is the rule everywhere in this application.
 * What it may not be is a number with no account of where it came from.
 */
const traced = (extra = {}) => Joi.object({
  value: Joi.number().allow(null).required(),
  tier: Joi.string().valid(...TIERS).required(),
  method: Joi.string().max(400).optional(),
  definition: Joi.string().max(400).optional(),
  note: Joi.string().max(600).optional(),
  ...extra,
});

/* A baseline is what makes a tCO2e figure mean anything: reduced and avoided
   are different claims, and which one applies is decided entirely by the
   counterfactual. No mitigation figure is accepted without one. */
const baselineSchema = Joi.object({
  description: Joi.string().max(400).required(),
  counterfactual: Joi.string().max(400).required(),
  type: Joi.string().valid(...BASELINE_TYPES).required(),
  gridEF_tCO2e_per_mwh: traced().optional(),
  note: Joi.string().max(600).optional(),
});

const mitigationSchema = Joi.object({
  annual_tCO2e: traced().required(),
  lifetime_tCO2e: traced().required(),
  baseline: baselineSchema.required(),
  isCoBenefit: Joi.boolean().default(false),
  coBenefitNote: Joi.string().max(600).optional(),
  uncertaintyPct: Joi.number().min(0).max(100).optional(),
});

const financingSchema = Joi.object({
  currency: Joi.string().max(8).default('USD'),
  totalCost: Joi.number().min(0).required(),
  gcfAsk: Joi.number().min(0).required(),
  dfcc: Joi.number().min(0).required(),
  other: Joi.number().min(0).default(0),
  otherLabel: Joi.string().max(120).allow('', null).optional(),
  instrument: Joi.string().max(60).required(),
  gcfInstrumentDetail: Joi.string().max(800).optional(),
  grantEquivalentPct: traced().optional(),
  modalityGap: Joi.boolean().default(false),
  /* GCF applies minimum concessionality: a project already viable on
     commercial terms does not need concessional money. The ToR requires
     viability shown with AND without support, so the record has a place to
     say "this does not need GCF" — an appraisal that can only say yes is not
     an appraisal. */
  viabilityWithoutGcf: Joi.object({
    viable: Joi.boolean().required(),
    reason: Joi.string().max(800).required(),
  }).required(),
});

const beneficiariesSchema = Joi.object({
  /* Direct and indirect are two separate IRMF core indicators measuring
     different things. The schema keeps them apart and nothing downstream adds
     them — one combined "people reached" figure would be reportable to
     nobody. */
  direct: traced().required(),
  indirect: traced().required(),
  womenPct: traced().optional(),
});

/* The sponsor's pre-check answers — shared by the record (where they are
   stored) and the stateless pre-check route (where they are read into an
   advisory). Declared once so the two cannot drift. */
const preCheckSchema = Joi.object({
  counterfactual: Joi.string().max(1200).allow('', null).optional(),
  essCategoryGuess: Joi.string().valid('A', 'B', 'C', 'unsure').optional(),
  estimatedCost_usd: Joi.number().min(0).allow(null).optional(),
  stream: Joi.string().valid(...STREAMS, 'unsure').optional(),
  hasRevenueStream: Joi.boolean().optional(),
  dependsOnGrant: Joi.boolean().optional(),
  landAndConsent: Joi.string().valid('clear', 'in_progress', 'unclear', 'not_applicable').optional(),
  ndaInformed: Joi.boolean().optional(),
  sponsor: Joi.string().max(200).allow('', null).optional(),
  answeredAt: Joi.string().max(40).optional(),
  notes: Joi.string().max(1200).allow('', null).optional(),
}).unknown(false);

const projectSchema = Joi.object({
  id: Joi.string().max(80).required(),
  code: Joi.string().max(20).required(),
  name: Joi.string().max(200).required(),
  location: Joi.object({
    province: Joi.string().max(120).optional(),
    districts: Joi.array().items(Joi.string().max(80)).default([]),
    country: Joi.string().max(8).default('LK'),
  }).required(),
  sector: Joi.string().max(120).required(),
  resultsArea: Joi.string().valid(...AREA_CODES).required(),
  stream: Joi.string().valid(...STREAMS).required(),
  stage: Joi.string().valid(...STAGES).required(),

  selectedForCN: Joi.boolean().default(false),
  /* Selecting two out of five is the answer this model exists to produce, so
     the reasoning is stored beside the outcome. A ranking that cannot say why
     is not a decision a credit committee can argue with. */
  selectionReason: Joi.string().max(1200).required(),

  essCategory: Joi.string().valid(...ESS_CATEGORIES).required(),
  essFlags: Joi.array().items(Joi.string().max(60)).default([]),
  essNote: Joi.string().max(800).optional(),

  taxonomy: Joi.object({
    framework: Joi.string().max(40).required(),
    band: Joi.string().max(40).required(),
    objective: Joi.string().max(8).optional(),
  }).required(),
  ndcSectorTargets: Joi.array().items(Joi.string().max(40)).default([]),
  /* Why this project is not already financed commercially. Named from the
     vocabulary in data/gcf/instruments.json, because an instrument is only
     the right answer to a barrier somebody has actually stated — matching a
     structure to a project on anything else is decoration. */
  barriers: Joi.array().items(Joi.string().max(40)).default([]),

  technical: Joi.object().unknown(true).default({}),

  /* The pipeline's time axis. Every milestone is a date the bank or the Fund
     set; nothing here is projected. Targets sit beside actuals so an overdue
     target is a fact the screen can state. */
  timeline: Joi.object({
    conceptStarted: ISO_DATE, cnSubmissionTarget: ISO_DATE, cnSubmitted: ISO_DATE, cnFeedback: ISO_DATE,
    ppfRequested: ISO_DATE, ppfApproved: ISO_DATE, fpSubmissionTarget: ISO_DATE, fpSubmitted: ISO_DATE,
    boardTarget: ISO_DATE, boardDecision: ISO_DATE, faaSigned: ISO_DATE, faaEffective: ISO_DATE,
    firstDisbursement: ISO_DATE, implementationStart: ISO_DATE, commissioning: ISO_DATE, completion: ISO_DATE,
  }).default({}),
  stageHistory: Joi.array().items(Joi.object({
    stage: Joi.string().valid(...STAGES).required(),
    at: Joi.string().max(40).required(),
    by: Joi.string().max(160).allow('', null).optional(),
    note: Joi.string().max(600).allow('', null).optional(),
  })).default([]),

  /* The process state a concept note and a funding proposal are judged on —
     the NDA's no-objection, the safeguards documents by category, gender,
     consent, co-financing, the executing entity, the documents themselves.
     Each used to exist only as a line of prose saying it was outstanding. */
  nda: Joi.object({
    status: Joi.string().valid(...NDA_STATUSES).default('not_requested'),
    requestedAt: ISO_DATE.optional(), issuedAt: ISO_DATE.optional(),
    reference: Joi.string().max(200).allow('', null).optional(),
    note: Joi.string().max(600).allow('', null).optional(),
  }).default({ status: 'not_requested' }),
  safeguards: Joi.object({
    esia: DOC_STATUS.optional(), esmp: DOC_STATUS.optional(), esap: DOC_STATUS.optional(),
    genderAssessment: DOC_STATUS.optional(), genderActionPlan: DOC_STATUS.optional(),
    stakeholderConsultation: DOC_STATUS.optional(), grm: DOC_STATUS.optional(),
    fpic: Joi.object({
      required: Joi.boolean().default(false),
      status: Joi.string().valid('not_required', 'not_started', 'in_progress', 'obtained').default('not_started'),
      communities: Joi.string().max(400).allow('', null).optional(),
      note: Joi.string().max(600).allow('', null).optional(),
    }).optional(),
  }).default({}),
  coFinancing: Joi.array().items(Joi.object({
    name: Joi.string().max(200).required(),
    role: Joi.string().valid('sponsor', 'lender', 'dfi', 'government', 'grant', 'other').default('other'),
    amount: Joi.number().min(0).required(),
    currency: Joi.string().max(8).default('USD'),
    instrument: Joi.string().max(60).allow('', null).optional(),
    status: Joi.string().valid(...COFINANCING_STATUSES).default('indicative'),
    reference: Joi.string().max(200).allow('', null).optional(),
    date: ISO_DATE.optional(),
  })).default([]),
  executingEntity: Joi.object({
    name: Joi.string().max(200).required(),
    role: Joi.string().max(200).allow('', null).optional(),
    trackRecord: Joi.string().max(1200).allow('', null).optional(),
  }).optional(),
  documents: Joi.array().items(Joi.object({
    kind: Joi.string().valid(...DOCUMENT_KINDS).required(),
    title: Joi.string().max(200).required(),
    reference: Joi.string().max(300).allow('', null).optional(),
    version: Joi.string().max(40).allow('', null).optional(),
    date: ISO_DATE.optional(),
  })).default([]),
  /* The evidence for the three criteria no engine can score — a reviewer's
     question, answered by the bank in its own words. */
  narrative: Joi.object({
    paradigmShift: Joi.string().max(2000).allow('', null).optional(),
    enablingEnvironment: Joi.string().max(2000).allow('', null).optional(),
    sustainableDevelopment: Joi.string().max(2000).allow('', null).optional(),
    needsOfRecipient: Joi.string().max(2000).allow('', null).optional(),
    theoryOfChange: Joi.string().max(3000).allow('', null).optional(),
  }).default({}),

  financing: financingSchema.required(),
  mitigation: mitigationSchema.required(),
  embodiedCarbon: Joi.object({
    a1a5_tCO2e: traced().required(),
    paybackYears: traced().optional(),
    note: Joi.string().max(800).optional(),
  }).optional(),
  beneficiaries: beneficiariesSchema.required(),
  area: Joi.object({ hectares: traced().allow(null).optional() }).default({}),
  assets: Joi.object({ valueProtected_usd: traced().allow(null).optional() }).default({}),

  /* The results logframe GCF reports against: for each core indicator, where
     the project starts (baseline), where it commits to reach (target) and by
     when. The current/expected figure is the indicator field itself
     (mitigation.lifetime_tCO2e, beneficiaries.direct, …); this holds the
     baseline and target beside it so a reader sees "from X to Y by year Z".
     Keyed by IRMF indicator id (MCI-1, ACI-1, ACI-2, SUP-AREA, SUP-ASSET);
     every entry optional, so a project recorded before this existed is
     unaffected. */
  results: Joi.object().pattern(Joi.string().max(40), Joi.object({
    baseline: traced().optional(),
    target: traced().optional(),
    targetYear: Joi.number().integer().min(2000).max(2100).allow(null).optional(),
    note: Joi.string().max(600).allow('', null).optional(),
  }).unknown(false)).default({}),

  /* The sections a concept note and a funding proposal are written from,
     held as structured facts (domain/sections.js): the risk register, the
     implementation arrangements and timetable, sustainability and exit, the
     stakeholder consultations, the adaptation climate rationale, the
     financial terms, monitoring and evaluation, and post-approval reporting.
     Every one optional and every record recorded before this existed is
     unaffected; a document of the same kind still counts. */
  risks: sections.SCHEMAS.risks.optional(),
  implementation: sections.SCHEMAS.implementation.optional(),
  sustainability: sections.SCHEMAS.sustainability.optional(),
  stakeholders: sections.SCHEMAS.stakeholders.optional(),
  climateRationale: sections.SCHEMAS.climateRationale.optional(),
  financialTerms: sections.SCHEMAS.financialTerms.optional(),
  monitoring: sections.SCHEMAS.monitoring.optional(),
  reporting: sections.SCHEMAS.reporting.optional(),

  /* The sponsor's pre-check — the plain-language self-screen answered before
     the full form. Recorded as given, never believed: the counterfactual and
     the environmental category are the two that decide whether this is a GCF
     project at all, and `domain/precheck.js` turns them into an advisory read.
     Optional, so nothing recorded before this existed is affected. */
  preCheck: preCheckSchema.optional(),

  /* The assessor's validation — the sign-off lifecycle (domain/validation.js).
     Optional and backward compatible: a project recorded before this existed
     reads as an unvalidated draft. Ratings are words (strong/adequate/weak),
     never a number, so they cannot be quoted as a GCF or a PCAF score; every
     transition is a dated, attributed entry in `history`. Written only through
     the validate-scoped route, never through the ordinary intake. */
  validation: Joi.object({
    state: Joi.string().valid('draft', 'under_review', 'validated').default('draft'),
    ratings: Joi.object().pattern(Joi.string().max(40), Joi.object({
      rating: Joi.string().valid('strong', 'adequate', 'weak').required(),
      note: Joi.string().max(1000).allow('', null).optional(),
    }).unknown(false)).default({}),
    recommendation: Joi.string().valid('recommend', 'recommend_with_conditions', 'not_recommend').allow(null).default(null),
    recommendationNote: Joi.string().max(2000).allow('', null).optional(),
    validatedBy: Joi.string().max(160).allow(null).optional(),
    validatedAt: Joi.string().max(40).allow(null).optional(),
    history: Joi.array().items(Joi.object({
      from: Joi.string().valid('draft', 'under_review', 'validated').required(),
      to: Joi.string().valid('draft', 'under_review', 'validated').required(),
      at: Joi.string().max(40).required(),
      by: Joi.string().max(160).allow('', null).optional(),
      note: Joi.string().max(1000).allow('', null).optional(),
      changed: Joi.array().items(Joi.string().max(60)).default([]),
    })).default([]),
    /* The return-to-sponsor loop (Stage 6): each recorded return snapshots the
       gap list at that instant, so the resubmission comparison has a fixed
       point a later edit cannot move. Optional and backward compatible. */
    returns: Joi.array().items(Joi.object({
      at: Joi.string().max(40).required(),
      by: Joi.string().max(160).allow('', null).optional(),
      recommendation: Joi.string().valid('recommend', 'recommend_with_conditions', 'not_recommend').allow(null).optional(),
      gaps: Joi.array().items(Joi.object({
        kind: Joi.string().valid('evidence', 'rating').required(),
        criterionId: Joi.string().max(60).required(),
        criterion: Joi.string().max(200).required(),
        subId: Joi.string().max(60).optional(),
        detail: Joi.string().max(400).allow('', null).optional(),
        status: Joi.string().max(40).optional(),
        rating: Joi.string().max(40).optional(),
        remedy: Joi.string().max(600).allow('', null).optional(),
      }).unknown(false)).default([]),
    }).unknown(false)).default([]),
    updatedBy: Joi.string().max(160).optional(),
    updatedAt: Joi.string().max(40).optional(),
  }).optional(),

  /* Who entered this and when. Real data entered by a bank is evidence in a
     GCF submission and in a statutory disclosure; an unattributed figure is
     not evidence, and an audit that cannot say who keyed a number is not an
     audit. */
  provenance: Joi.object({
    enteredBy: Joi.string().max(160).optional(),
    enteredAt: Joi.string().max(40).optional(),
    updatedBy: Joi.string().max(160).optional(),
    updatedAt: Joi.string().max(40).optional(),
    source: Joi.string().max(400).optional(),
  }).default({}),
}).unknown(false);

/**
 * The facts only the reporting entity can state.
 *
 * Board oversight, management's role, the strategy narrative, the risk process
 * and the entity's own climate targets. Software cannot compute any of these
 * and must not invent them — the portfolio reports in this codebase once
 * carried a board meeting quarterly and a three-person ESG team, printed under
 * a cited clause. So there is a place to record them, and until something is
 * recorded the disclosure reports each one absent with the clause that
 * requires it.
 */
const accreditationSchema = Joi.object({
  decision: Joi.string().max(40).required(),
  accreditedAt: ISO_DATE.optional(),
  amaExecutedAt: ISO_DATE.optional(),
  amaEffectiveAt: ISO_DATE.optional(),
  sizeCategory: Joi.string().valid('micro', 'small', 'medium', 'large').required(),
  sizeRange_usd: Joi.array().items(Joi.number().min(0)).length(2).required(),
  essCategory: Joi.string().max(20).required(),
  modalities: Joi.array().items(Joi.string().max(60)).default([]),
  grantModality: Joi.boolean().required(),
  grantNote: Joi.string().max(600).allow('', null).optional(),
  source: Joi.string().max(300).allow('', null).optional(),
});

const entitySchema = Joi.object({
  entityName: Joi.string().max(200).allow('', null).optional(),
  /* The entity's own accreditation. Until recorded the shipped one stands in
     — DFCC's under B.36/10 — and every gate says which it read. */
  accreditation: accreditationSchema.optional(),
  climateGovernance: Joi.string().max(4000).allow('', null).optional(),
  managementRole: Joi.string().max(4000).allow('', null).optional(),
  strategyNarrative: Joi.string().max(6000).allow('', null).optional(),
  riskManagementProcess: Joi.string().max(6000).allow('', null).optional(),
  climateTargets: Joi.array().items(Joi.string().max(1000)).optional(),
  updatedBy: Joi.string().max(160).optional(),
  updatedAt: Joi.string().max(40).optional(),
}).unknown(false);

function validateEntity(body) {
  const { error, value } = entitySchema.validate(body || {}, { abortEarly: false, convert: true });
  if (error) {
    const err = new Error(error.details.map(d => d.message).join('; '));
    err.statusCode = 400;
    err.code = 'INVALID_ENTITY_DISCLOSURES';
    throw err;
  }
  return value;
}

/** Validate one project. Returns `{ value }` or throws a 400-shaped error. */
function validate(project) {
  const { error, value } = projectSchema.validate(project, { abortEarly: false, convert: true });
  if (error) {
    const err = new Error(error.details.map(d => d.message).join('; '));
    err.statusCode = 400;
    err.code = 'INVALID_GCF_PROJECT';
    throw err;
  }
  return value;
}

/** The weakest tier present anywhere in a record — what a reviewer should ask about first. */
function weakestTier(project) {
  const rank = Object.fromEntries(IRMF.evidenceTiers.map(t => [t.tier, t.rank]));
  let worst = null;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.tier === 'string' && rank[node.tier]) {
      if (!worst || rank[node.tier] > rank[worst]) worst = node.tier;
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(project);
  return worst;
}

/** Every traced figure in a record, flattened, so a reviewer can sort by tier. */
function tracedFigures(project, path = '', out = []) {
  if (!project || typeof project !== 'object') return out;
  if (typeof project.tier === 'string' && 'value' in project) {
    out.push({ path: path.replace(/^\./, ''), ...project });
    return out;
  }
  for (const [k, v] of Object.entries(project)) tracedFigures(v, `${path}.${k}`, out);
  return out;
}

/**
 * Is this project within what DFCC is accredited to carry?
 *
 * A gate, not a score. Category A triggers exclusion because DFCC is
 * accredited to B/I-2 — scoring it down instead would push the pipeline
 * towards projects that touch nobody, which is the opposite of the intent.
 */
function withinAccreditation(project, { sizeRange = [0, Infinity] } = {}) {
  const reasons = [];
  if (!ESS_WITHIN_DFCC_ACCREDITATION.includes(project.essCategory)) {
    reasons.push(`Environmental and social category ${project.essCategory} is outside DFCC's accreditation (B/I-2).`);
  }
  const cost = project.financing.totalCost;
  if (cost > sizeRange[1]) {
    reasons.push(`Total cost ${cost} exceeds the accredited size ceiling ${sizeRange[1]}.`);
  }
  return { within: reasons.length === 0, reasons };
}

module.exports = {
  projectSchema, validate, entitySchema, validateEntity, preCheckSchema,
  weakestTier, tracedFigures, withinAccreditation,
  TIERS, AREA_CODES, STREAMS, STAGES, ESS_CATEGORIES, ESS_WITHIN_DFCC_ACCREDITATION,
  BASELINE_TYPES, DOCUMENT_KINDS, NDA_STATUSES, COFINANCING_STATUSES, accreditationSchema,
  SECTION_KEYS: sections.SECTION_KEYS,
  RISK_CATEGORIES: sections.RISK_CATEGORIES, RISK_LEVELS: sections.RISK_LEVELS,
  STAKEHOLDER_GROUPS: sections.STAKEHOLDER_GROUPS, CONSULTATION_MODES: sections.CONSULTATION_MODES,
  CLIMATE_HAZARDS: sections.CLIMATE_HAZARDS, REPAYMENT_PROFILES: sections.REPAYMENT_PROFILES,
  MONITORING_FREQUENCIES: sections.MONITORING_FREQUENCIES, APR_STATUSES: sections.APR_STATUSES,
};
