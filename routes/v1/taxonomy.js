/**
 * CarbonIQ FinTech — Taxonomy Alignment Endpoint
 *
 * GET /v1/projects/:projectId/taxonomy — Multi-taxonomy alignment check
 *
 * Checks project against: ASEAN Taxonomy v3, EU Taxonomy, HK Green
 * Classification Framework, Singapore Green Mark criteria.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');
const config = require('../../config');

const router = Router();

router.get('/:projectId/taxonomy',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      if (!config.features.taxonomyChecker) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Taxonomy alignment checker is not enabled.'
        });
      }

      // TODO (Step 6): Implement taxonomy alignment checks
      // - Call services/taxonomy.js → checkAllTaxonomies()
      // - Uses TAXONOMY_* constants from constants.js
      // - Returns alignment result per taxonomy

      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'Taxonomy alignment endpoint — implementation in Step 6',
        planned: {
          taxonomies: ['ASEAN v3', 'EU 2024', 'HK GCF', 'Singapore TSC'],
          output: {
            asean: '{ tier, criteria, score }',
            eu: '{ aligned, dnsh, score }',
            hongKong: '{ classification, criteria }',
            singapore: '{ greenMark, bca }'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
