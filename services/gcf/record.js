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

const IRMF = require('../../data/gcf/irmf.json');
const AREAS = require('../../data/gcf/results-areas.json');

const TIERS = IRMF.evidenceTiers.map(t => t.tier);
const AREA_CODES = AREAS.areas.map(a => a.code);
const STREAMS = ['mitigation', 'adaptation'];

/** Where a project has reached. The ToR's own progression. */
const STAGES = ['concept', 'pre_feasibility', 'cn_drafted', 'cn_submitted', 'ppf', 'fp', 'board'];

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

  technical: Joi.object().unknown(true).default({}),
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
  projectSchema, validate, weakestTier, tracedFigures, withinAccreditation,
  TIERS, AREA_CODES, STREAMS, STAGES, ESS_CATEGORIES, ESS_WITHIN_DFCC_ACCREDITATION,
  BASELINE_TYPES,
};
