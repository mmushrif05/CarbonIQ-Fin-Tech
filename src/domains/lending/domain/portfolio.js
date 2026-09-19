// @ts-check
/**
 * CarbonIQ FinTech — Portfolio Aggregation Service
 *
 * Aggregates carbon metrics across multiple projects for bank-level reporting.
 * Supports total financed emissions, PCAF weighted score, taxonomy distribution.
 *
 */

'use strict';

const { numberOr, sumNumeric } = require('../../../shared/numbers');

/**
 * Aggregate carbon metrics across a set of projects.
 *
 * @param {Object[]} projectSummaries - Array of per-project emission summaries
 * @returns {Object} Portfolio-level aggregation
 */
function aggregatePortfolio(projectSummaries) {
  if (!projectSummaries || projectSummaries.length === 0) {
    return {
      totalProjects: 0,
      totalFinancedEmissions_tCO2e: 0,
      message: 'No projects in portfolio.'
    };
  }

  const totalEmissions = projectSummaries.reduce(
    (sum, p) => sum + (p.financedEmissions_tCO2e || 0), 0
  );

  const taxonomyDist = { green: 0, transition: 0, brown: 0 };
  for (const p of projectSummaries) {
    const cls = p.classification || 'brown';
    if (taxonomyDist[cls] !== undefined) taxonomyDist[cls]++;
  }

  const topContributors = [...projectSummaries]
    .sort((a, b) => (b.financedEmissions_tCO2e || 0) - (a.financedEmissions_tCO2e || 0))
    .slice(0, 5)
    .map(p => ({
      projectId: p.projectId,
      name: p.name,
      financedEmissions_tCO2e: p.financedEmissions_tCO2e,
      classification: p.classification
    }));

  return withDerivedFigures({
    totalProjects: projectSummaries.length,
    totalFinancedEmissions_tCO2e: Math.round(totalEmissions * 100) / 100,
    taxonomyDistribution: taxonomyDist,
    topContributors,
    aggregatedAt: new Date().toISOString()
  });
}

/**
 * The shares and ratios the Portfolio screen prints, computed once here.
 *
 * They used to be computed in the browser from the counts — the green-loan
 * ratio, the taxonomy and CFS distribution percentages, the top-emitter
 * concentration, the economic intensity, the coverage fallback, each
 * contributor's own intensity — so a screen carried arithmetic the engine
 * never ran and published the formulas to anyone who loaded the page. The
 * portfolio carries them under `derived` now, and absence is null rather
 * than nought: a book with no outstanding stated has no intensity.
 *
 * @template {Record<string, any>} T
 * @param {T} portfolio
 * @returns {T & {derived: Record<string, any>}}
 */
function withDerivedFigures(portfolio) {
  const p = /** @type {Record<string, any>} */ (portfolio);
  const pct = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : null;
  const tax = p.taxonomyDistribution || {};
  const cfs = p.cfsDistribution || p.taxonomyDistribution || {};
  const classified = (tax.green || 0) + (tax.transition || 0) + (tax.brown || 0);
  const scored = (cfs.green || 0) + (cfs.transition || 0) + (cfs.brown || 0);
  const totalEm = Number(p.totalFinancedEmissions_tCO2e);
  const outstanding = Number(p.totalOutstanding);
  const contributors = Array.isArray(p.topContributors) ? p.topContributors : [];
  const topEm = sumNumeric(contributors.map(c => c.financedEmissions_tCO2e)).total;
  const meta = p.meta || {};
  const coveragePct = typeof p.coveragePct === 'number'
    ? p.coveragePct
    : pct(numberOr(meta.resolvedProjects, 0), numberOr(meta.requestedProjects, 0));

  const derived = {
    coveragePct,
    greenLoanPct: pct(tax.green || 0, classified),
    taxonomySharePct: {
      green: pct(tax.green || 0, classified),
      transition: pct(tax.transition || 0, classified),
      brown: pct(tax.brown || 0, classified),
      classified,
    },
    cfsSharePct: {
      green: pct(cfs.green || 0, scored),
      transition: pct(cfs.transition || 0, scored),
      brown: pct(cfs.brown || 0, scored),
      scored,
    },
    economicIntensity_tCO2e_per_M: outstanding > 0 && Number.isFinite(totalEm)
      ? Math.round((totalEm / (outstanding / 1e6)) * 10) / 10 : null,
    concentration: {
      topN: contributors.length,
      topEmissions_tCO2e: Math.round(topEm * 100) / 100,
      pct: totalEm > 0 ? Math.round((topEm / totalEm) * 100) : null,
    },
    contributors: contributors.map(c => ({
      projectId: c.projectId,
      intensity_tCO2e_per_M: Number(c.loanOutstanding) > 0 && Number.isFinite(Number(c.financedEmissions_tCO2e))
        ? Math.round((Number(c.financedEmissions_tCO2e) / (Number(c.loanOutstanding) / 1e6)) * 10) / 10
        : null,
    })),
    lowDataQualityPct: p.dqDistribution
      ? numberOr(p.dqDistribution[4], 0) + numberOr(p.dqDistribution[5], 0) : null,
  };
  return /** @type {any} */ ({ ...p, derived });
}

module.exports = { aggregatePortfolio, withDerivedFigures };
