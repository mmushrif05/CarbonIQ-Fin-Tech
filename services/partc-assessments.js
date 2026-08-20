/**
 * CarbonIQ FinTech — PCAF Part C Assessments
 *
 * One assessment is one PCAF calculation, bound to a policy, a BOQ revision
 * and a reporting year. The binding is the point: a figure in an annual
 * disclosure can be traced to the exact bill of quantities behind it.
 *
 * Lifecycle:
 *
 *   draft ──submit──▶ under_review ──lock──▶ locked
 *     ▲                    │                    │
 *     └──────return────────┘                    │
 *                                    a new version supersedes it
 *
 * Only a LOCKED assessment enters the annual disclosure. A locked assessment
 * is never edited in place — correcting it means a new version, which keeps
 * the original readable. Where the correction moves the figure by at least
 * the settings threshold, it is a restatement and must carry a reason, so an
 * auditor reading the disclosure can see what changed and why.
 *
 * Who can lock: every API key in this deployment belongs to the insurer's own
 * organisation — there is no client-facing login — so "only the insurer
 * locks" holds by construction rather than by a role check. The organisation
 * is recorded on the lock either way.
 */

'use strict';

const crypto   = require('crypto');
const store    = require('./partc-store');
const registry = require('./partc-registry');
const boq      = require('./partc-boq');
const { runPartC }       = require('./pcaf-partc');
const { buildRegisters } = require('./partc-registers');
const { recordLearnings } = require('./learning-store');

const COLLECTION = 'assessments';

const STATUS = { DRAFT: 'draft', UNDER_REVIEW: 'under_review', LOCKED: 'locked', SUPERSEDED: 'superseded' };

/** Which moves are legal from each state. */
const TRANSITIONS = {
  [STATUS.DRAFT]:        [STATUS.UNDER_REVIEW],
  [STATUS.UNDER_REVIEW]: [STATUS.DRAFT, STATUS.LOCKED],
  [STATUS.LOCKED]:       [],
  [STATUS.SUPERSEDED]:   []
};

const _id = () => `as_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const _now = () => new Date().toISOString();

function _fail(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code; err.statusCode = statusCode;
  throw err;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function listAssessments(orgId, { projectId, policyId, reportingYear, status } = {}) {
  let all = await store.list(COLLECTION, orgId, { limit: 500 });
  if (projectId)     all = all.filter(a => a.projectId === projectId);
  if (policyId)      all = all.filter(a => a.policyId === policyId);
  if (reportingYear) all = all.filter(a => a.reportingYear === Number(reportingYear));
  if (status)        all = all.filter(a => a.status === status);
  return all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getAssessment(orgId, assessmentId) {
  return store.get(COLLECTION, orgId, assessmentId);
}

/** The locked assessment for a policy-year, if there is one. */
async function lockedFor(orgId, policyId, reportingYear) {
  const all = await listAssessments(orgId, { policyId, reportingYear, status: STATUS.LOCKED });
  return all.length ? all[0] : null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Run the engine for a policy against a BOQ revision and store the result.
 *
 * Everything the engine needs that the book already knows — floor area,
 * premium, project cost, the scope gate — is taken from the registry rather
 * than asked for again.
 */
async function createAssessment(orgId, input) {
  const ctx = await registry.buildAssessmentContext(orgId, input.projectId, input.policyId);
  if (!ctx) _fail('No such project or policy in this organisation.', 'CONTEXT_NOT_FOUND', 404);

  const revision = await boq.getRevision(orgId, input.boqRevisionId);
  if (!revision) _fail(`No BOQ revision ${input.boqRevisionId}.`, 'REVISION_NOT_FOUND', 404);
  if (revision.projectId !== input.projectId) {
    _fail('That BOQ revision belongs to a different project.', 'REVISION_PROJECT_MISMATCH');
  }

  const settings = await registry.getSettings(orgId);

  const engineInput = {
    policy:    ctx.enginePolicy,
    materials: revision.materials || [],
    distances: input.distances || {},
    siteInputs: {
      gifa_m2:         ctx.project.gifa_m2,
      demolitionKm:    input.siteInputs.demolitionKm,
      wasteDisposalKm: input.siteInputs.wasteDisposalKm,
      demolitionItems: revision.demolitionItems || [],
      previousProject: input.siteInputs.previousProject || null
    },
    useStage: input.useStage || {},
    hasEPD:   !!input.hasEPD
  };

  const result    = runPartC(engineInput);
  const registers = buildRegisters(result);

  // Versioning within a policy-year.
  const siblings = await listAssessments(orgId, { policyId: ctx.policy.policyId, reportingYear: ctx.reportingYear });
  const version  = siblings.length + 1;
  const locked   = siblings.find(a => a.status === STATUS.LOCKED) || null;

  // Restatement check against whatever is already locked for this policy-year.
  let restatement = null;
  if (locked) {
    const before   = locked.summary.construction_kgCO2e;
    const after    = result.summary.construction_kgCO2e;
    const deltaPct = before > 0 ? ((after - before) / before) * 100 : 0;
    const material = Math.abs(deltaPct) >= settings.restatementThresholdPct;

    if (material && !String(input.restatementReason || '').trim()) {
      _fail(
        `This assessment moves the locked ${ctx.reportingYear} figure by ${deltaPct.toFixed(2)}%, ` +
        `which reaches the ${settings.restatementThresholdPct}% restatement threshold. ` +
        'A restatement reason is required so the disclosure can explain what changed.',
        'RESTATEMENT_REASON_REQUIRED');
    }

    restatement = {
      isRestatement: material,
      supersedesAssessmentId: locked.assessmentId,
      previousValue: before,
      newValue: after,
      deltaPct,
      thresholdPct: settings.restatementThresholdPct,
      reason: String(input.restatementReason || '').trim() || null,
      note: material
        ? `Restates the locked ${ctx.reportingYear} figure: ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%.`
        : `Movement of ${deltaPct.toFixed(2)}% is below the ${settings.restatementThresholdPct}% threshold, so the locked figure stands until this version is itself locked.`
    };
  }

  const record = {
    assessmentId: _id(), orgId,
    projectId: ctx.project.projectId, projectName: ctx.project.name,
    clientId:  ctx.project.clientId,  clientName:  ctx.project.clientName,
    policyId:  ctx.policy.policyId,   policyRef:   ctx.policy.reference || null,
    lineType:  ctx.policy.lineType,   reportingYear: ctx.reportingYear,
    boqRevisionId: revision.revisionId, boqRevisionLabel: revision.label,
    version, status: STATUS.DRAFT,
    supersedes: locked ? locked.assessmentId : null,
    restatement,
    inputs: {
      siteInputs: engineInput.siteInputs,
      useStage:   engineInput.useStage,
      distances:  engineInput.distances
    },
    summary:        result.summary,
    moduleValues: {
      a4: result.modules.a4.value, a5: result.modules.a5.value,
      a5Breakdown: result.modules.a5Breakdown,
      b1: result.modules.b1.value, b4: result.modules.b4.value, b7: result.modules.b7.value
    },
    dataQuality:    result.dataQuality,
    // The score is locked with the figure. Recomputing it later from a
    // changed factor store would report a quality the disclosure never had.
    dqScoring:      result.dqScoring || null,
    dqStatement:    result.dqDisclosureStatement || null,
    disclosureNote: result.disclosureNote,
    registerBadges: registers.badges,
    limitations:    registers.assumptions.limitations.map(l => ({ severity: l.severity, message: l.message })),
    createdAt: _now(), updatedAt: _now(), lockedAt: null, lockedBy: null
  };

  await store.put(COLLECTION, orgId, record.assessmentId, record);

  await recordLearnings({
    orgId, runId: record.assessmentId, result,
    context: { region: settings.region, projectType: ctx.project.projectType },
    materials: revision.materials || []
  }).catch(() => {});

  return { assessment: record, result, registers };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Move an assessment through the lifecycle.
 *
 * @param {string} [actor] the organisation performing the change, recorded on a lock
 */
async function changeStatus(orgId, assessmentId, nextStatus, { note, actor } = {}) {
  const current = await getAssessment(orgId, assessmentId);
  if (!current) _fail(`No assessment ${assessmentId}.`, 'ASSESSMENT_NOT_FOUND', 404);

  if (current.status === nextStatus) {
    _fail(`This assessment is already ${nextStatus.replace('_', ' ')}.`, 'STATUS_UNCHANGED', 409);
  }

  const allowed = TRANSITIONS[current.status] || [];
  if (!allowed.includes(nextStatus)) {
    _fail(
      current.status === STATUS.LOCKED
        ? 'A locked assessment cannot be changed. Create a new version instead — the locked figure stays readable.'
        : `Cannot move from "${current.status}" to "${nextStatus}". Allowed: ${allowed.join(', ') || 'none'}.`,
      'ILLEGAL_TRANSITION', 409);
  }

  const updates = { status: nextStatus, updatedAt: _now() };
  if (note) updates.statusNote = note;

  if (nextStatus === STATUS.LOCKED) {
    // Only one locked assessment per policy-year: locking supersedes the last.
    const previouslyLocked = await lockedFor(orgId, current.policyId, current.reportingYear);
    if (previouslyLocked && previouslyLocked.assessmentId !== assessmentId) {
      await store.patch(COLLECTION, orgId, previouslyLocked.assessmentId, {
        status: STATUS.SUPERSEDED,
        supersededBy: assessmentId,
        updatedAt: _now()
      });
    }
    updates.lockedAt = _now();
    updates.lockedBy = actor || 'insurer';
  }

  return store.patch(COLLECTION, orgId, assessmentId, updates);
}

async function deleteAssessment(orgId, assessmentId) {
  const current = await getAssessment(orgId, assessmentId);
  if (!current) _fail(`No assessment ${assessmentId}.`, 'ASSESSMENT_NOT_FOUND', 404);
  if (current.status === STATUS.LOCKED) {
    _fail('A locked assessment is part of the disclosure record and cannot be deleted.', 'LOCKED_IMMUTABLE', 409);
  }
  await store.remove(COLLECTION, orgId, assessmentId);
  return { deleted: true, assessmentId };
}

/**
 * What the book looks like for a reporting year — the shape W5 will roll up.
 */
async function yearSummary(orgId, reportingYear) {
  const policies = await registry.listPolicies(orgId, { reportingYear });
  const all      = await listAssessments(orgId, { reportingYear });
  const locked   = all.filter(a => a.status === STATUS.LOCKED);

  const assessedPolicyIds = new Set(locked.map(a => a.policyId));
  const construction = locked.reduce((n, a) => n + a.summary.construction_kgCO2e, 0);
  const iae          = locked.reduce((n, a) => n + a.summary.insurerIAE_tCO2e, 0);

  // PCAF weights data quality by emissions, so a small weak policy cannot
  // drag the reported position more than its share of the figure.
  // Rounded to two places: this is a disclosed figure, and floating-point
  // accumulation would otherwise report a score as 2.9999999999999996.
  const weightedDQ = construction > 0
    ? Math.round((locked.reduce((n, a) => n + a.summary.construction_kgCO2e * a.dataQuality.score, 0) / construction) * 100) / 100
    : null;

  return {
    reportingYear: Number(reportingYear),
    policies: policies.length,
    assessments: { total: all.length, locked: locked.length, draft: all.filter(a => a.status === STATUS.DRAFT).length,
                   underReview: all.filter(a => a.status === STATUS.UNDER_REVIEW).length },
    coveragePct: policies.length > 0 ? (assessedPolicyIds.size / policies.length) * 100 : 0,
    construction_kgCO2e: construction,
    insurerIAE_tCO2e: iae,
    weightedDataQuality: weightedDQ,
    unassessedPolicies: policies.filter(p => !assessedPolicyIds.has(p.policyId))
      .map(p => ({ policyId: p.policyId, reference: p.reference, projectName: p.projectName, lineType: p.lineType })),
    note: 'Only locked assessments are included. Per-policy figures are summed; premiums and emissions are never pooled before attribution.'
  };
}

module.exports = {
  createAssessment, listAssessments, getAssessment, changeStatus,
  deleteAssessment, lockedFor, yearSummary,
  STATUS, TRANSITIONS, COLLECTION
};
