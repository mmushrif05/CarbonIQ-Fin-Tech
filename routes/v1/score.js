/**
 * CarbonIQ FinTech — Carbon Finance Score Endpoint
 *
 * GET /v1/projects/:projectId/score — Carbon Finance Score (0-100)
 *
 * Returns the CFS with breakdown: material, compliance, verification,
 * reduction, and certification sub-scores.
 * Classification: Green (>=70) / Transition (40-69) / Brown (<40)
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');

const router = Router();

router.get('/:projectId/score',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      // TODO (Step 5): Implement Carbon Finance Score calculation
      // - Call services/score.js → calculateCarbonFinanceScore()
      // - Uses CFS_WEIGHTS and CFS_THRESHOLDS from constants.js
      // - Returns: score, classification, breakdown, dataCompleteness

      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'Carbon Finance Score endpoint — implementation in Step 5',
        planned: {
          output: {
            score: '0-100',
            classification: 'green | transition | brown',
            breakdown: {
              material: '0-100 (30% weight)',
              compliance: '0-100 (20% weight)',
              verification: '0-100 (15% weight)',
              reduction: '0-100 (20% weight)',
              certification: '0-100 (15% weight)'
            },
            dataCompleteness: '0-100%'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
