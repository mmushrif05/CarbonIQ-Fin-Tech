/**
 * CarbonIQ FinTech — PCAF Part C: prior-year comparatives and restatements
 *
 * A disclosure that shows only this year's number invites the reader to
 * assume last year's was the same or was never touched. PCAF requires
 * neither assumption to be made silently, so this module answers two
 * questions the annual disclosure must answer explicitly:
 *
 *   How does this year compare with last year?
 *   Has last year's published figure changed since it was published?
 *
 * ── Why the totals are not compared like for like ────────────────────────
 *
 * A policy's reporting year is its inception year, so a policy belongs to
 * exactly one year and the book is composed of different policies each
 * year. Two annual totals are therefore not two measurements of one thing;
 * they are measurements of two different books. Presenting their difference
 * as a reduction would be false — a smaller total can simply mean fewer
 * projects were written.
 *
 * What genuinely compares across years is intensity: emissions per square
 * metre insured, and the emissions-weighted data-quality score. Those are
 * properties of how the insurer underwrites and measures, not of how much
 * it happened to write. This module reports the movement in the totals as
 * fact, and reports the intensity alongside it as the comparable measure —
 * it never calls a change in the total a performance improvement.
 *
 * ── Restatements ─────────────────────────────────────────────────────────
 *
 * When an assessment supersedes a locked one and moves the figure by at
 * least the settings threshold, it is a restatement. Where that happens to
 * a *prior* year, the comparative in this year's disclosure is no longer
 * the number that was published then. Both are reported: as previously
 * reported, and as restated, with the reason recorded at lock time.
 */

'use strict';

const registry    = require('./partc-registry');
const assessments = require('./partc-assessments');
const portfolio   = require('./partc-portfolio');

function _round(n, dp = 2) {
  const f = Math.pow(10, dp);
  return Math.round((Number(n) || 0) * f) / f;
}

function _movement(current, prior) {
  const abs = _round(current - prior);
  const pct = prior > 0 ? _round(((current - prior) / prior) * 100) : null;
  return {
    current: _round(current),
    prior: _round(prior),
    absolute: abs,
    pct,
    direction: abs > 0 ? 'up' : abs < 0 ? 'down' : 'unchanged'
  };
}

/**
 * Emissions per square metre insured — the measure that survives a change
 * of book. Built from the assessments themselves rather than from the
 * roll-up, because GIFA lives on the project.
 */
async function _intensity(orgId, year) {
  const locked = await assessments.listAssessments(orgId, {
    reportingYear: year, status: assessments.STATUS.LOCKED
  });
  if (locked.length === 0) return { kgCO2e_per_m2: null, area_m2: 0, assessments: 0 };

  // Each assessment already carries its own per-m2 factor; recovering the
  // area from it keeps this consistent with the figure that was disclosed
  // rather than re-deriving it from a project record that may have moved.
  let emissions = 0, area = 0;
  for (const a of locked) {
    const perM2 = Number(a.summary.perM2Factor_kgCO2e_m2) || 0;
    const kg    = Number(a.summary.construction_kgCO2e) || 0;
    emissions += kg;
    if (perM2 > 0) area += kg / perM2;
  }
  return {
    kgCO2e_per_m2: area > 0 ? _round(emissions / area) : null,
    area_m2: _round(area),
    assessments: locked.length
  };
}

/**
 * Every restatement recorded against a reporting year.
 *
 * A restatement is only meaningful once it is itself locked — a draft that
 * would move the figure has not moved it yet.
 */
async function restatementsFor(orgId, year) {
  const locked = await assessments.listAssessments(orgId, {
    reportingYear: Number(year), status: assessments.STATUS.LOCKED
  });

  const entries = locked
    .filter(a => a.restatement && a.restatement.isRestatement)
    .map(a => ({
      assessmentId: a.assessmentId,
      version: a.version,
      clientName: a.clientName,
      projectName: a.projectName,
      policyRef: a.policyRef,
      lineType: a.lineType,
      boqRevision: a.boqRevisionLabel,
      supersedes: a.restatement.supersedesAssessmentId,
      asPreviouslyReported_kgCO2e: _round(a.restatement.previousValue),
      asRestated_kgCO2e: _round(a.restatement.newValue),
      movement_kgCO2e: _round(a.restatement.newValue - a.restatement.previousValue),
      movementPct: _round(a.restatement.deltaPct),
      thresholdPct: a.restatement.thresholdPct,
      reason: a.restatement.reason,
      lockedAt: a.lockedAt
    }))
    .sort((x, y) => Math.abs(y.movement_kgCO2e) - Math.abs(x.movement_kgCO2e));

  const movement = entries.reduce((n, e) => n + e.movement_kgCO2e, 0);

  return {
    reportingYear: Number(year),
    count: entries.length,
    entries,
    netMovement_kgCO2e: _round(movement),
    note: entries.length
      ? `${entries.length} figure${entries.length === 1 ? ' was' : 's were'} restated for FY${year}, moving the total by ${movement >= 0 ? '+' : ''}${_round(movement)} kgCO2e. Each restatement carries the reason recorded when it was locked.`
      : `No figure disclosed for FY${year} has been restated.`
  };
}

/**
 * This year against last year, with the comparative stated on both bases
 * where last year has been restated.
 */
async function compare(orgId, reportingYear) {
  const year  = Number(reportingYear);
  const prior = year - 1;

  const [current, previous, curIntensity, priorIntensity, priorRestatements, settings] =
    await Promise.all([
      portfolio.rollUp(orgId, year),
      portfolio.rollUp(orgId, prior),
      _intensity(orgId, year),
      _intensity(orgId, prior),
      restatementsFor(orgId, prior),
      registry.getSettings(orgId)
    ]);

  const hasPrior = previous.assessments.locked > 0;

  // The prior total as it stands today already includes any restatement,
  // because a restatement supersedes the locked assessment it replaces.
  const priorAsRestated = previous.construction.total_kgCO2e;
  const priorAsPreviouslyReported = _round(priorAsRestated - priorRestatements.netMovement_kgCO2e);

  return {
    reportingYear: year,
    priorYear: prior,
    insurer: settings.insurerName,
    hasPrior,

    construction: _movement(current.construction.total_kgCO2e, priorAsRestated),
    insurerIAE:   _movement(current.construction.insurerIAE_tCO2e, previous.construction.insurerIAE_tCO2e),

    // Composition, because the movement above is mostly explained by it.
    composition: {
      policiesInYear:   { current: current.coverage.policiesInYear,   prior: previous.coverage.policiesInYear },
      assessedPolicies: { current: current.coverage.assessedPolicies, prior: previous.coverage.assessedPolicies },
      coveragePct:      { current: current.coverage.coveragePct,      prior: previous.coverage.coveragePct },
      insuredArea_m2:   { current: curIntensity.area_m2,              prior: priorIntensity.area_m2 }
    },

    // The measure that survives a change of book.
    intensity: {
      current: curIntensity.kgCO2e_per_m2,
      prior:   priorIntensity.kgCO2e_per_m2,
      movementPct: (curIntensity.kgCO2e_per_m2 && priorIntensity.kgCO2e_per_m2)
        ? _round(((curIntensity.kgCO2e_per_m2 - priorIntensity.kgCO2e_per_m2) / priorIntensity.kgCO2e_per_m2) * 100)
        : null,
      basis: 'Construction emissions per square metre insured, across locked assessments.'
    },

    dataQuality: {
      current: current.dataQuality.weighted,
      prior:   previous.dataQuality.weighted,
      movement: (current.dataQuality.weighted !== null && previous.dataQuality.weighted !== null)
        ? _round(current.dataQuality.weighted - previous.dataQuality.weighted)
        : null,
      basis: 'Emissions-weighted, so the movement reflects the assessments that carry the position.'
    },

    restatements: {
      priorYear: prior,
      asPreviouslyReported_kgCO2e: hasPrior ? priorAsPreviouslyReported : null,
      asRestated_kgCO2e: hasPrior ? priorAsRestated : null,
      ...priorRestatements
    },

    // Stated rather than implied: a smaller total need not mean less carbon
    // per project, and this disclosure must not let a reader assume it does.
    comparabilityNote: hasPrior
      ? 'A policy\'s reporting year is its inception year, so each year covers a different set of policies. The movement in the totals reflects what was written as well as how it was built, and is not on its own a change in performance. Intensity (kgCO2e per m² insured) and the emissions-weighted data-quality score are the comparable measures.'
      : `No locked assessment exists for FY${prior}, so no comparative is available. This is the first reported year.`,

    generatedAt: new Date().toISOString()
  };
}

module.exports = { compare, restatementsFor };
