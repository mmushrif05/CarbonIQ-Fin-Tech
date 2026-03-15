/**
 * CarbonIQ FinTech — Portfolio Aggregation Service
 *
 * Aggregates carbon metrics across multiple projects for bank-level reporting.
 * Supports total financed emissions, PCAF weighted score, taxonomy distribution.
 *
 * Implementation: Step 9
 */

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

  return {
    totalProjects: projectSummaries.length,
    totalFinancedEmissions_tCO2e: Math.round(totalEmissions * 100) / 100,
    taxonomyDistribution: taxonomyDist,
    topContributors,
    aggregatedAt: new Date().toISOString()
  };
}

module.exports = { aggregatePortfolio };
