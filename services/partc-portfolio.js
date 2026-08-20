/**
 * CarbonIQ FinTech — PCAF Part C: Portfolio Roll-up
 *
 * What the insurer discloses for a reporting year: every locked assessment,
 * summed.
 *
 * Two rules from the standard are load-bearing here and are enforced rather
 * than assumed:
 *
 *   Per project, then sum. Attribution is applied to each policy against its
 *   own project cost, and only the results are added. Premiums, costs and
 *   emissions are never pooled before attribution — a portfolio-level
 *   premium ÷ portfolio-level cost would be a different and wrong number.
 *
 *   Construction and use-stage stay apart. A4+A5 is the PCAF figure; B1/B4/B7
 *   is an optional line reported separately. This module never produces a
 *   combined total, at any level.
 *
 * Data quality is weighted by emissions, as PCAF requires, so a small weak
 * policy cannot drag the reported position further than its share of the
 * figure — and, read the other way, tells the insurer that fixing the largest
 * assessment is what actually moves the book.
 */

'use strict';

const registry    = require('./partc-registry');
const assessments = require('./partc-assessments');

/** The best data-quality score a physical-activity assessment can reach. */
const BEST_ACHIEVABLE_SCORE = 2;   // Option 2a — primary emission factors

function _round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((Number(n) || 0) * f) / f;
}

/**
 * The full reporting-year position.
 *
 * @param {string} orgId
 * @param {number|string} reportingYear
 */
async function rollUp(orgId, reportingYear) {
  const year     = Number(reportingYear);
  const settings = await registry.getSettings(orgId);
  const policies = await registry.listPolicies(orgId, { reportingYear: year });
  const all      = await assessments.listAssessments(orgId, { reportingYear: year });
  const locked   = all.filter(a => a.status === assessments.STATUS.LOCKED);

  const rows = locked.map(a => ({
    assessmentId: a.assessmentId,
    clientName:   a.clientName,
    projectName:  a.projectName,
    policyRef:    a.policyRef,
    lineType:     a.lineType,
    boqRevision:  a.boqRevisionLabel,
    version:      a.version,
    construction_kgCO2e: a.summary.construction_kgCO2e,
    useStage_kgCO2e:     a.summary.useStage_kgCO2e,
    attributionFactor:   a.summary.attributionFactor,
    insurerIAE_tCO2e:    a.summary.insurerIAE_tCO2e,
    useStageShare_tCO2e: a.summary.useStageInsurerShare_tCO2e,
    perM2:               a.summary.perM2Factor_kgCO2e_m2,
    dataQualityOption:   a.dataQuality.option,
    dataQualityScore:    a.dataQuality.score,
    isRestatement:       !!(a.restatement && a.restatement.isRestatement),
    lockedAt:            a.lockedAt
  })).sort((x, y) => y.construction_kgCO2e - x.construction_kgCO2e);

  const construction = rows.reduce((n, r) => n + r.construction_kgCO2e, 0);
  const useStage     = rows.reduce((n, r) => n + r.useStage_kgCO2e, 0);
  const iae          = rows.reduce((n, r) => n + r.insurerIAE_tCO2e, 0);
  const useStageIAE  = rows.reduce((n, r) => n + (r.useStageShare_tCO2e || 0), 0);

  const weightedDQ = construction > 0
    ? _round(rows.reduce((n, r) => n + r.construction_kgCO2e * r.dataQualityScore, 0) / construction)
    : null;
  const simpleDQ = rows.length
    ? _round(rows.reduce((n, r) => n + r.dataQualityScore, 0) / rows.length)
    : null;

  const assessedPolicyIds = new Set(locked.map(a => a.policyId));
  const unassessed = policies.filter(p => !assessedPolicyIds.has(p.policyId));

  // Share of the figure, so a reader can see what the book actually rests on.
  for (const r of rows) {
    r.shareOfConstructionPct = construction > 0 ? _round((r.construction_kgCO2e / construction) * 100) : 0;
  }

  return {
    reportingYear: year,
    insurer: settings.insurerName,
    currency: settings.currency,
    premiumBasis: settings.premiumBasis,

    construction: {
      label: 'Construction (A4 + A5) — the PCAF figure',
      total_kgCO2e: _round(construction),
      total_tCO2e:  _round(construction / 1000, 4),
      insurerIAE_tCO2e: _round(iae, 4)
    },
    useStage: {
      label: 'Use-stage (B1 + B4 + B7) — optional, reported separately',
      total_kgCO2e: _round(useStage),
      total_tCO2e:  _round(useStage / 1000, 4),
      insurerShare_tCO2e: _round(useStageIAE, 4),
      note: 'Optional under PCAF Part C v2 §5.3. Never added to the construction figure.'
    },
    scopeNote: 'Construction and use-stage are reported as separate lines and are never summed. The voluntary whole-life annex (B2/B5/B8) is excluded entirely.',

    dataQuality: {
      weighted: weightedDQ,
      simpleAverage: simpleDQ,
      basis: 'Weighted by construction emissions, as PCAF requires.',
      note: weightedDQ !== null && simpleDQ !== null && weightedDQ !== simpleDQ
        ? `The weighted score (${weightedDQ}) differs from a simple average (${simpleDQ}) because the book is not evenly sized — the largest assessments carry the position.`
        : null
    },

    coverage: {
      policiesInYear: policies.length,
      assessedPolicies: assessedPolicyIds.size,
      coveragePct: policies.length > 0 ? _round((assessedPolicyIds.size / policies.length) * 100) : 0,
      unassessed: unassessed.map(p => ({
        policyId: p.policyId, reference: p.reference, lineType: p.lineType,
        clientName: p.clientName, projectName: p.projectName, premium: p.premium
      }))
    },

    assessments: {
      locked: locked.length,
      draft: all.filter(a => a.status === assessments.STATUS.DRAFT).length,
      underReview: all.filter(a => a.status === assessments.STATUS.UNDER_REVIEW).length,
      superseded: all.filter(a => a.status === assessments.STATUS.SUPERSEDED).length,
      restatements: rows.filter(r => r.isRestatement).length
    },

    rows,
    aggregationNote: 'Attribution is applied per policy against its own project cost; only the results are summed. Premiums and emissions are never pooled before attribution.',
    generatedAt: new Date().toISOString()
  };
}

/**
 * What to fix first, ranked by how much of the disclosed figure it would move.
 *
 * Ranking by data-quality score alone would send an insurer to chase a tiny
 * policy with a weak score. Ranking by emissions alone ignores whether there
 * is anything to fix. The product of the two is what actually improves the
 * reported position, and every action here is a limitation the engine itself
 * recorded rather than generic advice.
 */
async function improvementPlan(orgId, reportingYear) {
  const year   = Number(reportingYear);
  const roll   = await rollUp(orgId, year);
  const locked = await assessments.listAssessments(orgId, {
    reportingYear: year, status: assessments.STATUS.LOCKED
  });

  const byId = new Map(locked.map(a => [a.assessmentId, a]));
  const construction = roll.construction.total_kgCO2e;

  const items = roll.rows
    .map(r => {
      const a = byId.get(r.assessmentId);
      const headroom = Math.max(r.dataQualityScore - BEST_ACHIEVABLE_SCORE, 0);
      // Actions come from the assessment's own register, not from a template.
      const actions = (a.limitations || [])
        .filter(l => l.severity === 'material')
        .map(l => l.message);
      return {
        assessmentId: r.assessmentId,
        projectName: r.projectName, clientName: r.clientName,
        policyRef: r.policyRef, lineType: r.lineType,
        construction_kgCO2e: r.construction_kgCO2e,
        shareOfConstructionPct: r.shareOfConstructionPct,
        currentScore: r.dataQualityScore,
        currentOption: r.dataQualityOption,
        achievableScore: Math.min(r.dataQualityScore, BEST_ACHIEVABLE_SCORE),
        headroom,
        // The ranking metric: emissions that would move × points available.
        impact: _round(r.construction_kgCO2e * headroom),
        actions: actions.length ? actions : ['No material limitation recorded — this assessment is already at its practical ceiling.']
      };
    })
    .filter(i => i.headroom > 0)
    .sort((a, b) => b.impact - a.impact)
    .map((i, idx) => ({ rank: idx + 1, ...i }));

  // If every listed item reached the achievable score, where would the book sit?
  const improvedWeighted = construction > 0
    ? _round(roll.rows.reduce((n, r) => {
        const item = items.find(i => i.assessmentId === r.assessmentId);
        const score = item ? item.achievableScore : r.dataQualityScore;
        return n + r.construction_kgCO2e * score;
      }, 0) / construction)
    : null;

  return {
    reportingYear: year,
    current: roll.dataQuality.weighted,
    achievable: improvedWeighted,
    achievableNote: improvedWeighted !== null
      ? `If every assessment below reached Option 2a (primary emission factors), the emissions-weighted score would move from ${roll.dataQuality.weighted} to ${improvedWeighted}.`
      : null,
    ranking: 'Ordered by construction emissions × data-quality points available, so effort goes where it moves the disclosed figure.',
    items,
    unassessed: roll.coverage.unassessed,
    unassessedNote: roll.coverage.unassessed.length
      ? `${roll.coverage.unassessed.length} polic${roll.coverage.unassessed.length === 1 ? 'y is' : 'ies are'} in force this year with no locked assessment. Coverage is ${roll.coverage.coveragePct}%.`
      : 'Every policy in force this year carries a locked assessment.',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Which factors to localise first, aggregated across the whole book.
 *
 * Spec §0a names Sri Lankan factor gaps as a strategic differentiator. This
 * turns "our factors should be localised" into a ranked list backed by the
 * insurer's own emissions.
 */
async function factorGapPriority(orgId, reportingYear) {
  const { aggregateResearchPriority } = require('./learning-store');
  const fb = require('../bridge/firebase');
  const learnings = await fb.listPartCLearnings(orgId).catch(() => []);
  const ranked = aggregateResearchPriority(learnings || []);
  return {
    reportingYear: Number(reportingYear),
    factors: ranked.slice(0, 10),
    note: ranked.length
      ? 'Ranked by the emissions flowing through each factor across every assessment recorded. Localising the top entries improves the whole book, not one project.'
      : 'No factor gaps recorded yet. Run and lock an assessment first.'
  };
}

module.exports = { rollUp, improvementPlan, factorGapPriority, BEST_ACHIEVABLE_SCORE };
