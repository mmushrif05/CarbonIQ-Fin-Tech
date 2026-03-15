/**
 * CarbonIQ FinTech — Portfolio Aggregation Endpoint
 *
 * GET /v1/portfolio — Aggregated carbon metrics across all projects
 *
 * Returns portfolio-level view for bank reporting:
 * - Total financed emissions
 * - PCAF weighted average data quality
 * - Taxonomy distribution (Green/Transition/Brown)
 * - Top carbon contributors
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { portfolioLimiter } = require('../../middleware/rate-limit');
const config = require('../../config');

const router = Router();

router.get('/',
  apiKeyAuth,
  portfolioLimiter,
  async (req, res, next) => {
    try {
      if (!config.features.portfolioAggregation) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Portfolio aggregation is not enabled.'
        });
      }

      // TODO (Step 9): Implement portfolio aggregation
      // - Call services/portfolio.js → aggregatePortfolio()
      // - Scoped to API key's projectIds
      // - Returns aggregated metrics

      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'Portfolio aggregation endpoint — implementation in Step 9',
        planned: {
          output: {
            totalProjects: 'Number of projects in portfolio',
            totalFinancedEmissions_tCO2e: 'Sum of all project emissions',
            pcafWeightedScore: 'Weighted average PCAF data quality (1-5)',
            taxonomyDistribution: '{ green: N, transition: N, brown: N }',
            carbonIntensity_per_M_lent: 'tCO2e per $1M in construction loans',
            topContributors: 'Top 5 projects by emission',
            trend: 'Portfolio emission trend over time'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
