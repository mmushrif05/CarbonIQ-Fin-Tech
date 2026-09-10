// @ts-check
/**
 * The core entities, declared once.
 *
 * A Part C assessment was declared three times and agreed nowhere: as a
 * 42-field object literal in `partc-assessments.js`, as an 18-field projection
 * in the collections registry, and again as the same 18 fields inside a SQL
 * function in a migration. Three declarations of one record, and the only
 * thing holding them together was a test that happened to walk all three.
 *
 * This file is the vocabulary. It is **declaration, not validation**: nothing
 * here coerces, defaults or rejects. Validation happens at the boundary a
 * value crosses — Joi at HTTP, the schema in the migration at the database —
 * and this says what the thing is once, so a developer reading `store.get()`
 * has somewhere to look.
 *
 * ---------------------------------------------------------------------------
 * **"Project" is three unrelated entities sharing one word.**
 * ---------------------------------------------------------------------------
 *
 * That is the single most expensive ambiguity in this codebase, and no amount
 * of typing fixes it while all three are called `Project`. They are named
 * apart here and the names are used in every `@param` and `@returns` that
 * touches one:
 *
 *   `LendingProject`  — a construction loan a bank is underwriting. Lives in
 *                       `fintech_projects`. Its emissions are the *bank's*
 *                       attributed financed emissions (PCAF Part A).
 *
 *   `InsuredProject`  — a building an insurer has written cover on, carrying
 *                       its policies inline and a series of BOQ revisions.
 *                       Lives in `partc_projects`. Its emissions are the
 *                       *insurer's* attributed insurance-associated emissions
 *                       (PCAF Part C). It has no borrower and no loan.
 *
 *   `PipelineProject` — a GCF candidate awaiting accreditation screening.
 *                       Lives in `gcf_pipeline`. Its emissions are the
 *                       *project's own* mitigation against a counterfactual —
 *                       neither financed nor insurance-associated, and never
 *                       summed with either.
 *
 * The three carry three different emission boundaries. A function that took
 * "a project" and read `.emissions` off it would be reading three different
 * claims about the world through one field name, which is exactly the merge
 * the three-scope rule exists to prevent.
 */

'use strict';

/**
 * Every stored record carries these. `orgId` is the tenant and is on the
 * record as well as in the partition, so a record read out of context still
 * says whose it is.
 *
 * @typedef {object} StoredBase
 * @property {string} orgId
 * @property {string} createdAt  ISO 8601
 * @property {string} updatedAt  ISO 8601
 */

// ---------------------------------------------------------------------------
// PCAF Part C — the insurer's book
// ---------------------------------------------------------------------------

/**
 * A locked assessment enters the disclosure and is never edited again, only
 * superseded. That is why so much is copied onto it rather than resolved at
 * read time: the data-quality score, the economics and the module values are
 * all frozen with the figure, because recomputing any of them later from a
 * changed factor store would report a quality the disclosure never had.
 *
 * The exception is premium, which is carried **both** ways on purpose:
 * `economics.premium` is what the policy was worth when the assessment was
 * made, and the roll-up reads premium from the live book so a repriced policy
 * weights on what it is now. A disclosure published years later still has to
 * be able to say what it was weighted on at the time.
 *
 * @typedef {StoredBase & {
 *   assessmentId: string,
 *   projectId: string, projectName: string,
 *   clientId: string,  clientName: string,
 *   policyId: string,  policyRef: string|null,
 *   lineType: string,
 *   reportingYear: number,
 *   boqRevisionId: string, boqRevisionLabel: string,
 *   version: number,
 *   status: 'draft'|'under_review'|'locked'|'superseded',
 *   supersedes: string|null,
 *   restatement: Restatement|null,
 *   inputs: {siteInputs: object, useStage: object, distances: object},
 *   economics: {currency: string, premium: number, projectCost: number, gifa_m2: number},
 *   summary: object,
 *   moduleValues: object,
 *   dataQuality: {option: string, score: number, [k: string]: any},
 *   dqScoring: object|null,
 *   dqStatement: string|null,
 *   disclosureNote: string,
 *   registerBadges: object,
 *   limitations: {severity: string, message: string}[],
 *   lockedAt: string|null,
 *   lockedBy: string|null
 * }} PartCAssessment
 */

/**
 * What a new version did to a locked figure. Below the threshold it is
 * recorded and is not a restatement; at or above it, a reason is required
 * before the new version can be locked.
 *
 * @typedef {object} Restatement
 * @property {boolean} isRestatement
 * @property {string} supersedesAssessmentId
 * @property {number} previousValue
 * @property {number} newValue
 * @property {number} deltaPct
 * @property {number} thresholdPct
 * @property {string|null} reason  required at or above the threshold
 * @property {string} note
 */

/**
 * A building an insurer has written cover on. **Not** a lending project and
 * not a GCF candidate — see the note at the top of this file.
 *
 * Policies live on the project rather than beside it because one building
 * typically carries CAR through construction and then IDI for ten years, and
 * a policy's reporting year is its **inception** year.
 *
 * @typedef {StoredBase & {
 *   projectId: string,
 *   clientId: string, clientName: string,
 *   name: string,
 *   projectType: string,
 *   gifa_m2: number,
 *   projectCost: number,
 *   policies: InsurancePolicy[]
 * }} InsuredProject
 */

/**
 * One policy on an insured project. `reinsuranceCeded` is the field Box 6-4
 * weighting reads; the roll-up once read a `cededPremium` no schema defines,
 * so the disclosure was silently never made on any book.
 *
 * @typedef {object} InsurancePolicy
 * @property {string} policyId
 * @property {string} [reference]
 * @property {'CAR'|'EAR'|'IDI'|'Property'} lineType
 * @property {string} inception  ISO date — the reporting year is its year
 * @property {string} expiry
 * @property {number} premium
 * @property {number} reinsuranceCeded  0 where no treaty business applies
 * @property {number} [yearsOfCover]
 */

// ---------------------------------------------------------------------------
// Lending — the bank's loan book
// ---------------------------------------------------------------------------

/**
 * A construction loan under assessment. **Not** an insured project.
 *
 * @typedef {StoredBase & {
 *   projectId: string,
 *   name: string,
 *   borrower?: string,
 *   projectType?: string,
 *   buildingArea_m2?: number,
 *   loanAmount?: number,
 *   region?: string,
 *   status?: string
 * }} LendingProject
 */

// ---------------------------------------------------------------------------
// The capital book
// ---------------------------------------------------------------------------

/**
 * One facility on the capital book.
 *
 * **Two lifecycle axes, never one field.** `status` is the bank's position;
 * `delivery` is the asset's own progress. They move independently — a facility
 * can be exited on a plant still under construction, and a completed building
 * can sit on the book for another decade.
 *
 * `origin` and `pledge` are written once at adoption and never again:
 * recomputing the pledge from the live GCF record would mean every later edit
 * silently rewrote what a committee was told.
 *
 * @typedef {StoredBase & {
 *   investmentId: string,
 *   portfolioId: string,
 *   name: string,
 *   commitment: number,
 *   tenorYears?: number,
 *   status: 'pipeline'|'committed'|'deployed'|'exited'|'declined',
 *   delivery: 'not_started'|'under_construction'|'completed',
 *   emissions?: {forward_tCO2e?: number, incurred_tCO2e?: number,
 *                reduction_tCO2e?: number, avoided_tCO2e?: number},
 *   origin?: {system: string, recordId: string, adoptedAt: string},
 *   screening?: object,
 *   pledge?: {value: number, tier: string, counterfactual: string}
 * }} CapitalInvestment
 */

// ---------------------------------------------------------------------------
// GCF — the accreditation pipeline
// ---------------------------------------------------------------------------

/**
 * A GCF candidate. Every figure on it is `{value, tier}` rather than a bare
 * number, where tier is **measured · modelled · benchmark · declared**. Those
 * are GCF appraisal classes and are deliberately **not** PCAF's 1–5 scale —
 * reusing those numerals here would invite them to be quoted as PCAF scores.
 *
 * @typedef {StoredBase & {
 *   recordId: string,
 *   name: string,
 *   stream: 'mitigation'|'adaptation'|'cross-cutting',
 *   countsInHeadline: boolean,
 *   totalCost?: TieredFigure,
 *   gcfAsk?: TieredFigure,
 *   esCategory?: 'A'|'B'|'C'|'I-1'|'I-2'|'I-3',
 *   barriers?: string[]
 * }} PipelineProject
 */

/**
 * A figure and how well it is evidenced. A bare number is refused by the
 * schema: without the tier, a benchmark grid factor becomes a measured fact by
 * the time it reaches a submission and nothing on the page says otherwise.
 *
 * @typedef {object} TieredFigure
 * @property {number} value
 * @property {'measured'|'modelled'|'benchmark'|'declared'} tier
 */

/** The three entities that share the word "project", and what each one is. */
const PROJECT_KINDS = Object.freeze({
  lending:  { entity: 'LendingProject',  table: 'fintech_projects',
    boundary: 'the bank\'s attributed financed emissions (PCAF Part A)' },
  insured:  { entity: 'InsuredProject',  table: 'partc_projects',
    boundary: 'the insurer\'s attributed insurance-associated emissions (PCAF Part C)' },
  pipeline: { entity: 'PipelineProject', table: 'gcf_projects',
    boundary: 'the project\'s own mitigation against a counterfactual (GCF)' },
});

/** Part C assessment lifecycle, in the order it moves. */
const ASSESSMENT_STATUS = Object.freeze(
  /** @type {const} */ (['draft', 'under_review', 'locked', 'superseded']));

/** The bank's position on a facility. */
const INVESTMENT_STATUS = Object.freeze(
  /** @type {const} */ (['pipeline', 'committed', 'deployed', 'exited', 'declined']));

/**
 * The asset's own progress. Three states and not four: an earlier draft
 * carried `operating` beside `completed`, which for a construction facility is
 * one fact said twice, and two labels for one state is how two screens
 * disagree about the same project.
 */
const DELIVERY_STATE = Object.freeze(
  /** @type {const} */ (['not_started', 'under_construction', 'completed']));

/** How well a GCF figure is evidenced. Not a PCAF score — see above. */
const EVIDENCE_TIERS = Object.freeze(
  /** @type {const} */ (['measured', 'modelled', 'benchmark', 'declared']));

module.exports = {
  PROJECT_KINDS, ASSESSMENT_STATUS, INVESTMENT_STATUS, DELIVERY_STATE, EVIDENCE_TIERS,
};
