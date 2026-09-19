// @ts-check
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

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { portfolioLimiter } = require('../../../../platform/http/rate-limit');
const config = require('../../../../platform/config');
const engine = require('../../../../platform/bridge/engine');
const { aggregatePortfolio, withDerivedFigures } = require('../../domain/portfolio');
const { doc, body, str, num, bool, obj } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const { checked } = require('../../../../shared/reference-data');
const Joi = require('joi');

const router = Router();

/**
 * The sample book.
 *
 * It was a static file under `ui/data/`, fetched by the browser with no
 * credential and published with the site, so anyone who knew the path could
 * read a worked example of a bank's book without signing in. It is served
 * here now, behind the door like every other figure, with the derived shares
 * computed beside it; the Portfolio screen asks for it only when the live
 * book has nothing in it, and says which it is showing.
 */
const sampleSchema = Joi.object({
  _meta: Joi.object({ label: Joi.string().valid('SAMPLE DATA').required() }).unknown(true).required(),
  totalProjects: Joi.number().integer().min(1).required(),
  totalFinancedEmissions_tCO2e: Joi.number().min(0).required(),
  totalOutstanding: Joi.number().min(0).required(),
  topContributors: Joi.array().items(Joi.object({
    projectId: Joi.string().required(), name: Joi.string().required(),
    financedEmissions_tCO2e: Joi.number().required(),
  }).unknown(true)).required(),
}).unknown(true);
const SAMPLE = checked('data/lending/portfolio-sample.json', require('../../../../../data/lending/portfolio-sample.json'), sampleSchema);

router.get('/sample',
  doc({ summary: 'The sample book — a worked example drawn only when the live portfolio has nothing to show',
    response: body({ sample: bool, sampleNote: str, totalProjects: num, derived: obj }, ['sample', 'totalProjects']) }),
  authenticate,
  portfolioLimiter,
  referenceCache(),
  (req, res) => {
    res.json({
      ...withDerivedFigures(SAMPLE),
      sample: true,
      sampleNote: 'Sample data — a worked example, not this organisation\'s portfolio. Every figure is invented.',
    });
  }
);

router.get('/',
  doc({ summary: 'Portfolio carbon risk aggregation across the key\'s projects',
    response: body({
      totalProjects: num, totalFinancedEmissions_tCO2e: num,
      message: str, aggregatedAt: str,
    }, ['totalProjects']) }),
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

      /* `.value` exists only on a fulfilled result; reading it off the union
         is how a rejected settlement reads as a null summary. */
      const fulfilled = summaryResults.filter(
        /** @returns {r is PromiseFulfilledResult<any>} */ (r) => r.status === 'fulfilled');
      const projectSummaries = fulfilled.map(r => r.value).filter(v => v !== null);
      const failedCount = summaryResults.length - projectSummaries.length;

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
