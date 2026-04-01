/**
 * CarbonIQ FinTech — Agent Request Schemas
 *
 * Joi validation schemas for all agent endpoints.
 * Each schema validates the request body before it reaches the agent.
 */

const Joi = require('joi');

// ---------------------------------------------------------------------------
// Underwriting Agent — POST /v1/agent/underwrite
// ---------------------------------------------------------------------------

const underwritingRequestSchema = Joi.object({
  // BOQ content — optional (preliminary estimates if omitted)
  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities: CSV rows, pasted text, or JSON string'),

  boqFormat: Joi.string().valid('csv', 'text', 'json').default('text')
    .description('Format of the BOQ content'),

  // Project details
  projectName: Joi.string().max(300).optional()
    .description('Project name for the underwriting memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for benchmarking'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  // Loan parameters for PCAF attribution
  loanAmount: Joi.number().positive().optional()
    .description('Outstanding loan amount (local currency) for PCAF attribution factor'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value (local currency) for PCAF attribution factor'),

  // Target green performance
  reductionTarget: Joi.number().min(0).max(100).optional()
    .description('Target embodied carbon reduction vs baseline (%)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),
});

// ---------------------------------------------------------------------------
// Screening Agent — POST /v1/agent/screen
// ---------------------------------------------------------------------------

const screeningRequestSchema = Joi.object({
  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Free-text project description: building purpose, design intent, sustainability goals'),

  projectName: Joi.string().max(300).optional()
    .description('Project name for the eligibility memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type — required for benchmark lookup'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres — required for carbon estimate'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification if known'),

  investorJurisdiction: Joi.string().max(200).optional()
    .description('Investor jurisdiction(s) for taxonomy selection, e.g. "ASEAN, Singapore"'),

  loanAmount: Joi.number().positive().optional()
    .description('Indicative loan amount for context'),
});

// ---------------------------------------------------------------------------
// Covenant Design Agent — POST /v1/agent/covenants
// ---------------------------------------------------------------------------

const covenantsRequestSchema = Joi.object({
  projectName: Joi.string().max(300).optional()
    .description('Project name for the covenant report'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type for benchmark anchoring'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark and carbon tax calculations'),

  // Current underwritten carbon metrics (from prior underwriting assessment)
  currentTCO2e: Joi.number().positive().optional()
    .description('Total embodied carbon from underwriting assessment (tCO2e)'),

  currentIntensity_kgCO2e_m2: Joi.number().positive().optional()
    .description('Carbon intensity from underwriting assessment (kgCO2e/m²)'),

  reductionPct: Joi.number().min(0).max(100).optional()
    .description('Current carbon reduction vs baseline (%)'),

  epdCoveragePct: Joi.number().min(0).max(100).optional()
    .description('EPD data coverage of significant materials (%)'),

  // Loan parameters
  loanAmount: Joi.number().positive().optional()
    .description('Loan amount for pricing ratchet context'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years — used for covenant trajectory design'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),
});

// ---------------------------------------------------------------------------
// Monitoring Agent — POST /v1/agent/monitor
// ---------------------------------------------------------------------------

const covenantItemSchema = Joi.object({
  metric: Joi.string().valid(
    'total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'
  ).required().description('KPI metric key'),
  operator: Joi.string().valid('lt', 'lte', 'gt', 'gte', 'eq').required(),
  threshold: Joi.number().required().description('Agreed threshold value'),
  label: Joi.string().max(100).optional().description('Human-readable label, e.g. "Carbon Intensity"')
});

const currentMetricsSchema = Joi.object({
  totalBaseline_tCO2e: Joi.number().positive().required()
    .description('Total embodied carbon measured to date (tCO2e)'),
  reductionPct: Joi.number().min(0).max(100).optional().default(0)
    .description('Carbon reduction achieved vs baseline (%)'),
  epdCoveragePct: Joi.number().min(0).max(100).optional().default(0)
    .description('EPD data coverage of significant materials sourced to date (%)'),
  substitutionRate: Joi.number().min(0).max(100).optional().default(0)
    .description('Material substitution rate achieved (%)')
});

const monitoringRequestSchema = Joi.object({
  projectName: Joi.string().max(300).optional()
    .description('Project name for the monitoring report'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type for benchmark trajectory'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for benchmark calculations'),

  covenants: Joi.array().items(covenantItemSchema).min(1).max(10).required()
    .description('The agreed covenant package from the facility agreement'),

  currentMetrics: currentMetricsSchema.required()
    .description('Current carbon metrics measured at this construction stage'),

  projectComplete_pct: Joi.number().min(0).max(100).required()
    .description('How far through construction the project currently is (%)'),

  drawdownRequested: Joi.boolean().optional().default(false)
    .description('Whether this assessment is triggering a drawdown request'),

  drawdownAmount: Joi.number().positive().optional()
    .description('Amount of drawdown being requested (if applicable)'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none').description('Current external verification status'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years')
});

// ---------------------------------------------------------------------------
// Portfolio Reporting Agent — POST /v1/agent/portfolio
// ---------------------------------------------------------------------------

const portfolioAssetItemSchema = Joi.object({
  loanId: Joi.string().max(100).optional()
    .description('Loan reference ID'),

  projectName: Joi.string().max(300).optional()
    .description('Project name'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type'),

  buildingArea_m2: Joi.number().positive().optional()
    .description('Gross floor area (m²)'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region'),

  totalTCO2e: Joi.number().positive().optional()
    .description('Total embodied carbon from underwriting/monitoring assessment (tCO2e)'),

  reductionPct: Joi.number().min(0).max(100).optional()
    .description('Carbon reduction % vs baseline'),

  epdCoveragePct: Joi.number().min(0).max(100).optional()
    .description('EPD data coverage (%)'),

  loanAmount: Joi.number().positive().optional()
    .description('Outstanding loan balance (local currency)'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value (local currency)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Achieved or target certification'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().description('External verification status')
});

const portfolioReportRequestSchema = Joi.object({
  portfolioName: Joi.string().max(300).optional()
    .description('Portfolio name for the report header'),

  reportingEntity: Joi.string().max(300).optional()
    .description('Bank or reporting entity name'),

  reportingPeriod: Joi.string().max(50).optional()
    .description('Reporting period, e.g. "2025 Q4" or "FY2025"'),

  assets: Joi.array().items(portfolioAssetItemSchema).min(1).max(50).required()
    .description('Array of loan assets in the portfolio')
});

// ---------------------------------------------------------------------------
// Loan Origination Agent — POST /v1/agent/originate  (Stage 2)
//
// Construction-specific loan origination. Unlike Persefoni/Watershed/Sweep/
// Plan A (general Scope 1-3 platforms that cannot process BOQs), this agent
// integrates directly at the point of loan application, processing the bill
// of quantities that the bank already holds and producing a complete Green
// Loan Origination Decision Package in a single API call.
// ---------------------------------------------------------------------------

const originationRequestSchema = Joi.object({
  applicationReference: Joi.string().max(100).optional()
    .description('Bank-internal loan application reference number'),

  applicantName: Joi.string().max(300).optional()
    .description('Borrower / applicant name'),

  projectName: Joi.string().max(300).optional()
    .description('Project name'),

  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities: CSV rows, pasted text, or JSON string. '
      + 'When supplied, CarbonIQ performs material-level embodied carbon assessment '
      + 'rather than sector-average proxies — upgrading PCAF DQ score from 4-5 to 2-3.'),

  boqFormat: Joi.string().valid('csv', 'text', 'json').default('text')
    .description('Format of the BOQ content'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).required().description('Building type — required for benchmark lookup and taxonomy screening'),

  buildingArea_m2: Joi.number().positive().max(5000000).required()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Region for regulatory taxonomy and carbon tax context'),

  loanAmount: Joi.number().positive().optional()
    .description('Requested loan amount (local currency)'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value for PCAF attribution factor'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years for covenant trajectory design'),

  greenLoanTarget: Joi.boolean().optional().default(true)
    .description('Whether the bank is targeting green loan classification'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Borrower-stated target green certification'),

  investorJurisdiction: Joi.string().max(200).optional()
    .description('Taxonomies to screen against, e.g. "ASEAN, Singapore, EU"'),

  projectDescription: Joi.string().max(5000).optional()
    .description('Free-text project description for context'),
});

// ---------------------------------------------------------------------------
// Covenant Human Review — POST /v1/agent/covenants/:runId/review  (Stage 3)
//
// EU AI Act Article 22 + Annex III, point 5(b): AI systems used for
// creditworthiness assessment and credit scoring in financial services are
// classified as HIGH-RISK. Banks must maintain mandatory human oversight
// before AI-recommended covenant terms take legal effect. Enforcement begins
// August 2026. This schema validates the human reviewer's decision payload.
// ---------------------------------------------------------------------------

const covenantModificationSchema = Joi.object({
  metric: Joi.string().valid(
    'total_tco2e', 'tco2e_per_m2', 'epd_coverage', 'reduction_pct', 'material_substitution_rate'
  ).required().description('KPI metric being overridden'),

  originalThreshold: Joi.number().required()
    .description('AI-recommended threshold'),

  revisedThreshold: Joi.number().required()
    .description('Human-approved threshold (override)'),

  justification: Joi.string().min(10).max(1000).required()
    .description('Documented reason for overriding the AI recommendation — required for EU AI Act audit trail')
});

const covenantReviewSchema = Joi.object({
  decision: Joi.string().valid('approved', 'modified', 'rejected').required()
    .description(
      'approved  — Accept all AI-recommended covenant terms as-is.\n'
      + 'modified  — Accept with specific threshold changes (requires modifications array).\n'
      + 'rejected  — Reject all recommendations; agent run must be re-submitted.\n'
      + 'This decision and its rationale are immutably recorded per EU AI Act Art. 22.'
    ),

  reviewerId: Joi.string().min(1).max(300).required()
    .description('Bank officer identifier (email or user ID) — recorded in audit trail'),

  reason: Joi.string().min(5).max(2000).when('decision', {
    is: Joi.valid('modified', 'rejected'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }).description('Required for modified/rejected decisions. Becomes part of the immutable audit record.'),

  modifications: Joi.array().items(covenantModificationSchema)
    .min(1).max(10)
    .when('decision', {
      is: 'modified',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
    .description('Required when decision is modified. Each entry documents an AI override with justification.')
});

// ---------------------------------------------------------------------------
// Borrower Coaching Agent — POST /v1/agent/coach
// ---------------------------------------------------------------------------

const borrowerCoachingRequestSchema = Joi.object({
  // Project identity
  projectName: Joi.string().max(300).optional()
    .description('Project name for the coaching report header'),

  // Core building data — both needed for preliminary carbon estimate
  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for carbon benchmarking'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Project region for benchmark and carbon tax calculations'),

  // Financial parameters
  loanAmount: Joi.number().positive().optional()
    .description('Requested loan amount in local currency'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value in local currency'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years'),

  // Carbon / green performance data
  boqContent: Joi.string().min(10).max(200000).optional()
    .description('Raw Bill of Quantities if available: CSV, text, or JSON'),

  hasBOQ: Joi.boolean().optional().default(false)
    .description('Whether a Bill of Quantities has been submitted'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),

  reductionTarget: Joi.number().min(0).max(100).optional()
    .description('Target embodied carbon reduction vs baseline (%)'),

  hasLCA: Joi.boolean().optional().default(false)
    .description('Whether a Life Cycle Assessment has been commissioned'),

  hasEPD: Joi.boolean().optional().default(false)
    .description('Whether any Environmental Product Declarations exist for project materials'),

  verificationStatus: Joi.string()
    .valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none')
    .description('Current external verification status'),

  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Free-text project description for personalised coaching'),

  // Free-text borrower questions answered at the end of the coaching report
  borrowerQuestions: Joi.string().max(2000).optional()
    .description('Specific questions from the borrower — answered in the coaching report')
});

// ---------------------------------------------------------------------------
// Decision Triage — POST /v1/agent/triage
// ---------------------------------------------------------------------------

const decisionTriageRequestSchema = Joi.object({
  // Project context
  projectName: Joi.string().max(300).optional()
    .description('Project name for the review memo'),

  buildingType: Joi.string().valid(
    'residential_low_rise', 'residential_high_rise', 'commercial_office',
    'retail', 'industrial_warehouse', 'hospital', 'education', 'infrastructure'
  ).optional().description('Building type for covenant calibration context'),

  buildingArea_m2: Joi.number().positive().max(5000000).optional()
    .description('Gross floor area in square metres'),

  region: Joi.string().max(100).optional().default('Singapore')
    .description('Project region'),

  // Financial parameters
  loanAmount: Joi.number().positive().optional()
    .description('Loan amount in local currency — used for tier threshold check'),

  projectValue: Joi.number().positive().optional()
    .description('Total project value for PCAF attribution context'),

  loanTermYears: Joi.number().integer().min(1).max(30).optional()
    .description('Loan term in years'),

  // Carbon Finance Score — used for tier classification
  cfsScore: Joi.number().min(0).max(100).optional()
    .description('Carbon Finance Score (0–100) from the underwriting or screening assessment'),

  cfsClassification: Joi.string().valid('green', 'transition', 'brown').optional()
    .description('CFS classification label corresponding to the cfsScore'),

  // CFS component breakdown for AI review context
  cfsComponents: Joi.object({
    epdCoveragePct:    Joi.number().min(0).max(100).optional(),
    reductionPct:      Joi.number().min(0).max(100).optional(),
    certificationLevel: Joi.string().optional(),
    verificationStatus: Joi.string().optional()
  }).optional().description('CFS score component values for AI review context'),

  // Taxonomy results — object with per-taxonomy alignment status
  taxonomyAlignments: Joi.object().optional()
    .description('Per-taxonomy alignment results from check_taxonomy_alignment tool'),

  // PCAF data
  pcafDataQualityScore: Joi.number().integer().min(1).max(5).optional()
    .description('PCAF data quality score 1–5 (1=Audited, 5=Unknown)'),

  pcafFinancedEmissions_tCO2e: Joi.number().positive().optional()
    .description('Bank\'s PCAF financed emissions in tCO2e'),

  // Carbon metrics for covenant calibration
  carbonIntensity_kgCO2e_m2: Joi.number().positive().optional()
    .description('Carbon intensity in kgCO2e/m² — used to calibrate covenant thresholds'),

  totalTCO2e: Joi.number().positive().optional()
    .description('Total project embodied carbon in tCO2e'),

  epdCoveragePct: Joi.number().min(0).max(100).optional().default(0)
    .description('EPD data coverage (%)'),

  reductionPct: Joi.number().min(0).max(100).optional().default(0)
    .description('Achieved carbon reduction vs baseline (%)'),

  certificationLevel: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Achieved or target green certification level'),

  targetCertification: Joi.string().valid(
    'platinum', 'gold', 'silver', 'certified',
    'gold_plus', 'green_mark', 'super_low_energy', 'zero_carbon_ready'
  ).optional().description('Target green certification level'),

  verificationStatus: Joi.string().valid('verified', 'in_review', 'submitted', 'none')
    .optional().default('none').description('External verification status'),

  hasBOQ: Joi.boolean().optional().default(false)
    .description('Whether a BOQ has been submitted'),

  projectDescription: Joi.string().min(10).max(5000).optional()
    .description('Project description — used by AI review for Tier 2 decisions'),

  // Reference to prior agent run for traceability
  underwritingRunId: Joi.string().max(100).optional()
    .description('Run ID of the prior underwriting agent run (for cross-reference in the review memo)'),

  // Override flag — always escalate to manual regardless of other criteria
  forceManualReview: Joi.boolean().optional().default(false)
    .description('Set to true to force Tier 3 manual review regardless of scoring criteria')
});

module.exports = {
  underwritingRequestSchema,
  screeningRequestSchema,
  originationRequestSchema,
  covenantsRequestSchema,
  covenantReviewSchema,
  monitoringRequestSchema,
  portfolioReportRequestSchema,
  borrowerCoachingRequestSchema,
  decisionTriageRequestSchema,
};
