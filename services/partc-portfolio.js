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
const { splitStageTotals, SCOPE_OF } = require('./pcaf-partc/ghg-scopes');
const assessments = require('./partc-assessments');

/** The best data-quality score a physical-activity assessment can reach. */
const BEST_ACHIEVABLE_SCORE = 2;   // Option 2a — primary emission factors

function _round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((Number(n) || 0) * f) / f;
}

/** A number from the book, or zero when the policy has since been removed. */
const _policyNum = (policy, field) => (policy ? Number(policy[field]) || 0 : 0);

/** Two decimals, as a disclosed weighted score is printed. */
const _dp2 = n => (n === null || n === undefined) ? null : Math.round(Number(n) * 100) / 100;

/** One GHG-scope score from a locked assessment, null where it was never recorded. */
function _scopeScore(assessment, scope) {
  const g = assessment.dqScoring && assessment.dqScoring.byGhgScope;
  return (g && g[scope] && typeof g[scope].score === 'number') ? g[scope].score : null;
}

/**
 * The disclosed data-quality score: premium-weighted across policies.
 *
 * PCAF Part C asks for the score an insurer discloses to be weighted by
 * outstanding premium, not by emissions. The two answer different questions
 * and are kept apart everywhere: premium weighting says how well evidenced
 * the book the insurer actually wrote is, emission weighting says which
 * module to go and fix. Blending them would produce a number that answers
 * neither.
 *
 * A policy carrying no score for this scope is excluded from the weighting
 * rather than counted as zero, which would report a book better evidenced
 * than it is; the count of what was excluded travels with the score.
 */
function _premiumWeighted(rows, field, { premiumField = 'premium' } = {}) {
  const scored = rows.filter(r =>
    r[field] !== null && r[field] !== undefined && _num(r[premiumField]) > 0);
  const premium = scored.reduce((n, r) => n + _num(r[premiumField]), 0);
  return {
    weighted: premium > 0
      ? _dp2(scored.reduce((n, r) => n + _num(r[premiumField]) * r[field], 0) / premium)
      : null,
    premiumBasis: premiumField === 'cededPremium' ? 'ceded premium (treaty)' : 'premium',
    premiumTotal: _round(premium),
    policiesScored: scored.length,
    policiesWithoutScore: rows.length - scored.length
  };
}

const _num = v => Number(v) || 0;

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

  /* Premium, project cost and floor area come from the book rather than the
     assessment, so a policy repriced after its assessment was locked weights
     on what it is now. The emissions stay as locked — those are the figure. */
  const policyById = new Map(policies.map(p => [p.policyId, p]));

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
    /* One score per project, assigned by the option used (Table 5.3-2).
       There is no use-stage score: PCAF publishes no table for it. */
    dataQualityOption:   a.dataQuality.option,
    dataQualityScore:    a.dataQuality.score,
    dqScope1and2: _scopeScore(a, 'scope1and2'),
    dqScope3:     _scopeScore(a, 'scope3'),
    premium:     _policyNum(policyById.get(a.policyId), 'premium'),
    projectCost: _policyNum(policyById.get(a.policyId), 'projectCost'),
    gifa_m2:     _policyNum(policyById.get(a.policyId), 'gifa_m2'),
    isRestatement:       !!(a.restatement && a.restatement.isRestatement),
    lockedAt:            a.lockedAt
  })).sort((x, y) => y.construction_kgCO2e - x.construction_kgCO2e);

  const construction = rows.reduce((n, r) => n + r.construction_kgCO2e, 0);
  const useStage     = rows.reduce((n, r) => n + r.useStage_kgCO2e, 0);
  const iae          = rows.reduce((n, r) => n + r.insurerIAE_tCO2e, 0);
  const useStageIAE  = rows.reduce((n, r) => n + (r.useStageShare_tCO2e || 0), 0);

  /* A simple average is kept only to show how far the premium weighting
     moves the position; it is never the disclosed figure. There is no
     emission-weighted score: PCAF weights by premium (Box 6-3), and a
     second weighting reported beside it would invite the wrong one being
     quoted. */
  const simpleDQ = rows.length
    ? _dp2(rows.reduce((n, r) => n + r.dataQualityScore, 0) / rows.length)
    : null;

  /* The insured's scope 1 and 2 combined, and its scope 3, across the book.
     Stage totals are summed from the locked assessments and split by the
     same map a single run uses, so the annual figure and the assessment
     behind it can never state a different scope 1 and 2 for the same
     emissions. */
  const stageTotals = { A4: 0, 'A5.1': 0, 'A5.2': 0, 'A5.3': 0, B1: 0, B4: 0, B7: 0 };
  for (const a of locked) {
    const mv = a.moduleValues || {};
    stageTotals.A4 += Number(mv.a4) || 0;
    for (const sub of (mv.a5Breakdown || [])) {
      if (stageTotals[sub.module] !== undefined) stageTotals[sub.module] += Number(sub.value) || 0;
    }
    stageTotals.B1 += Number(mv.b1) || 0;
    stageTotals.B4 += Number(mv.b4) || 0;
    stageTotals.B7 += Number(mv.b7) || 0;
  }
  const ghgScopes = splitStageTotals(stageTotals, useStage > 0);

  /* What basis the book's assessments actually used for each input.
     An internal transparency aid, in words: it says where evidence is thin
     so effort can be aimed, and it carries no number precisely so it cannot
     be mistaken for, averaged into, or exported as the PCAF score. */
  const basisIndex = new Map();
  for (const a of locked) {
    const aid = a.dqScoring && a.dqScoring.internalAid;
    for (const i of ((aid && aid.rows) || [])) {
      if (i.applies === false) continue;
      const key = `${i.stage}::${i.input}`;
      if (!basisIndex.has(key)) {
        basisIndex.set(key, {
          stage: i.stage, input: i.input, ghgScope: i.ghgScope, line: i.line,
          assessments: 0, bases: new Map(), strengths: new Map()
        });
      }
      const row = basisIndex.get(key);
      row.assessments += 1;
      row.bases.set(`${i.basis}::${i.source}`, (row.bases.get(`${i.basis}::${i.source}`) || 0) + 1);
      row.strengths.set(i.strength, (row.strengths.get(i.strength) || 0) + 1);
    }
  }
  const dqInputBasis = [...basisIndex.values()].map(r => {
    const top = [...r.bases.entries()].sort((a, b) => b[1] - a[1])[0];
    const [basis, source] = String(top ? top[0] : '::').split('::');
    const strongest = [...r.strengths.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      stage: r.stage, input: r.input, ghgScope: r.ghgScope, line: r.line,
      assessments: r.assessments,
      predominantBasis: basis || 'not recorded',
      source: source || 'not recorded',
      basesInUse: r.bases.size,
      strength: strongest ? strongest[0] : null,
      strengthsInUse: [...r.strengths.keys()].filter(Boolean)
    };
  });

  /* The disclosed scores. Premium-weighted, and the insured's scope 3 kept
     apart from its scope 1 and 2, both as the Part C checklist requires. */
  const disclosed = {
    overall:    _premiumWeighted(rows, 'dataQualityScore'),
    scope1and2: _premiumWeighted(rows, 'dqScope1and2'),
    scope3:     _premiumWeighted(rows, 'dqScope3'),
    /* Treaty reinsurance weights by ceded premium instead (Box 6-4, p.108).
       Reported only where the book actually carries ceded premium. */
    ceded: rows.some(r => _num(r.cededPremium) > 0)
      ? _premiumWeighted(rows, 'dataQualityScore', { premiumField: 'cededPremium' })
      : null
  };

  /* Line of business, because the checklist asks for the aggregate broken
     down that way. Each line keeps its own premium-weighted score: a line
     written thinly against poor data should not be flattered by a large,
     well-evidenced one somewhere else in the book. */
  const lobIndex = new Map();
  for (const r of rows) {
    const key = r.lineType || 'Not stated';
    if (!lobIndex.has(key)) lobIndex.set(key, []);
    lobIndex.get(key).push(r);
  }
  const byLineOfBusiness = [...lobIndex.entries()].map(([lineOfBusiness, rs]) => ({
    lineOfBusiness,
    policies: rs.length,
    premium: _round(rs.reduce((n, r) => n + r.premium, 0)),
    construction_kgCO2e: _round(rs.reduce((n, r) => n + r.construction_kgCO2e, 0)),
    construction_tCO2e:  _round(rs.reduce((n, r) => n + r.construction_kgCO2e, 0) / 1000, 4),
    useStage_kgCO2e:     _round(rs.reduce((n, r) => n + r.useStage_kgCO2e, 0)),
    insurerIAE_tCO2e:    _round(rs.reduce((n, r) => n + r.insurerIAE_tCO2e, 0), 4),
    useStageShare_tCO2e: _round(rs.reduce((n, r) => n + (r.useStageShare_tCO2e || 0), 0), 4),
    dataQuality: _premiumWeighted(rs, 'dataQualityScore').weighted
  })).sort((a, b) => b.construction_kgCO2e - a.construction_kgCO2e);

  /* Economic emission intensity, the recommendation at p.101. Reported per
     million of premium and per million of insured project cost: premium is
     what the insurer earns, project cost is what it stands behind, and a
     book can move sharply on one while barely moving on the other. */
  const premiumTotal = rows.reduce((n, r) => n + r.premium, 0);
  const costTotal    = rows.reduce((n, r) => n + r.projectCost, 0);
  const areaTotal    = rows.reduce((n, r) => n + r.gifa_m2, 0);
  const perMillion = (t, base) => base > 0 ? _round((t / (base / 1e6)), 4) : null;

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

    byLineOfBusiness,

    /* The insured's GHG scopes across the book — the cut the Part C
       checklist asks for, alongside the lifecycle cut above. */
    ghgScopes,

    /* Section 8 of a Part C disclosure: economic emission intensity. */
    intensity: {
      currency: settings.currency,
      premiumTotal: _round(premiumTotal),
      projectCostTotal: _round(costTotal),
      insuredArea_m2: _round(areaTotal),
      constructionPerMillionPremium_tCO2e: perMillion(construction / 1000, premiumTotal),
      iaePerMillionPremium_tCO2e:          perMillion(iae, premiumTotal),
      constructionPerMillionCost_tCO2e:    perMillion(construction / 1000, costTotal),
      constructionPerM2_kgCO2e:            areaTotal > 0 ? _round(construction / areaTotal) : null,
      basis: `tCO2e per million ${settings.currency} of premium and of insured project cost, and kgCO2e per m2 of insured floor area. Reported for the construction line; the use-stage line is never added into it.`
    },

    dataQuality: {
      /* The disclosed figure. PCAF Part C asks for the score to be weighted
         by outstanding premium, so that is what leads here; the
         emission-weighted score below it is the internal diagnostic and is
         labelled as one. */
      disclosed,
      weighted: disclosed.overall.weighted,
      scale: 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest. A lower weighted score is better.',
      basis: 'Premium-weighted across the policies in this reporting year: sum(premium x score) / sum(premium), per Box 6-3 (p.107). Each policy carries one score, assigned by the option used to estimate its emissions (Table 5.3-2).',
      scopeSplitNote: 'The insured party\'s scope 3 score is reported separately from its scope 1 and 2 score, as Chapter 6 (p.106) requires, and the two are never blended. Every figure in this disclosure remains the re/insurer\'s own scope 3.',
      useStageNote: 'No data-quality score is reported for the optional use-stage line. PCAF publishes no data quality table for lifetime emissions on project insurance, so its basis is described qualitatively instead.',
      simpleAverage: simpleDQ,
      simpleAverageNote: simpleDQ !== null && disclosed.overall.weighted !== null
        && simpleDQ !== disclosed.overall.weighted
        ? `The premium-weighted score (${disclosed.overall.weighted}) differs from a simple average (${simpleDQ}) because the book is not evenly written — the larger premiums carry the disclosed position.`
        : null,
      inputBasis: dqInputBasis
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
