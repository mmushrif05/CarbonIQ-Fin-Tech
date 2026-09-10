/**
 * CarbonIQ FinTech — Portfolio Aggregation Endpoint
 *
 * GET /v1/portfolio
 *
 * Returns aggregated carbon metrics across all projects accessible to
 * the authenticated API key. Scoped to req.apiKey.projectIds.
 *
 * Query params:
 *   ?loanAmount[projectId]=5000000   Per-project loan amounts for attribution
 *   ?projectValue[projectId]=20M     Per-project total values for attribution
 */

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { portfolioLimiter } = require('../../../../platform/http/rate-limit');
const config = require('../../../../platform/config');
const engine = require('../../../../platform/bridge/engine');
const { aggregatePortfolio } = require('../../domain/portfolio');

const router = Router();

router.get('/',
  authenticate,
  portfolioLimiter,
  async (req, res, next) => {
    try {
      if (!config.features.portfolioAggregation) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Portfolio aggregation is not enabled.'
        });
      }

      const projectIds = (req.apiKey && req.apiKey.projectIds) || [];

      if (projectIds.length === 0) {
        return res.json({
          totalProjects: 0,
          totalFinancedEmissions_tCO2e: 0,
          message: 'No projects are associated with this API key.',
          aggregatedAt: new Date().toISOString()
        });
      }

      res.json(await aggregateForProjects(projectIds));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The portfolio roll-up for a set of project ids — the route's answer, and
 * the `portfolio.aggregate` job's, so a book too large for one request
 * gets the same figures from the queue.
 */
async function aggregateForProjects(projectIds) {
      // Fetch emission summaries for all accessible projects concurrently
      const summaryResults = await Promise.allSettled(
        projectIds.map(async (projectId) => {
          const summary = await engine.getEmissionSummary(projectId);
          if (!summary) return null;
          return {
            projectId,
            financedEmissions_tCO2e: summary.totalBaseline_tCO2e,
            classification: _classifyEmissions(summary.reductionPct),
            reductionPct: summary.reductionPct,
            totalMaterials: summary.totalMaterials,
          };
        })
      );

      const projectSummaries = summaryResults
        .filter((r) => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value);

      const failedCount = summaryResults.filter(
        (r) => r.status === 'rejected' || r.value === null
      ).length;

      const result = aggregatePortfolio(projectSummaries);

      return {
        ...result,
        meta: {
          requestedProjects: projectIds.length,
          resolvedProjects:  projectSummaries.length,
          failedProjects:    failedCount
        }
      };
}

/**
 * Classify a project based on its achieved reduction percentage.
 * Mirrors the CFS colour-band logic for quick portfolio roll-up.
 */
function _classifyEmissions(reductionPct = 0) {
  if (reductionPct >= 40) return 'green';
  if (reductionPct >= 15) return 'transition';
  return 'brown';
}

module.exports = router;
module.exports.aggregateForProjects = aggregateForProjects;
