/**
 * CarbonIQ FinTech — Carbon Finance Score Endpoint
 *
 * GET /v1/projects/:projectId/score
 *
 * Returns a 0-100 Carbon Finance Score (CFS) with full breakdown.
 * Classification: Green (>=70) | Transition (40-69) | Brown (<40)
 *
 * Query params (all optional — improves score completeness):
 *   ?approvalRate=0.85        Fraction of entries approved in workflow (0-1)
 *   ?verificationStatus=verified|in_review|submitted
 *   ?reductionPct=22.5        Actual % reduction achieved vs baseline
 *   ?certificationLevel=gold  Green certification level achieved
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');
const engine = require('../../bridge/engine');
const { calculateCarbonFinanceScore } = require('../../services/score');

const router = Router();

router.get('/:projectId/score',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      // Fetch 80% significant materials from engine bridge
      const materials80Pct = await engine.get80PctMaterials(projectId);
      const emissionSummary = await engine.getEmissionSummary(projectId);

      if (!materials80Pct || !emissionSummary) {
        return res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: `No carbon data found for project ${projectId}.`
        });
      }

      // Build projectData from engine + optional query params
      const projectData = {
        materials80Pct,

        approvalStatus: {
          total:    parseInt(req.query.approvalTotal, 10)    || emissionSummary.totalMaterials,
          approved: parseInt(req.query.approvalApproved, 10) ||
            Math.round((parseFloat(req.query.approvalRate) || 0.75) * emissionSummary.totalMaterials),
          pending:  0,
          rejected: 0
        },

        verification: {
          status: req.query.verificationStatus || 'submitted'
        },

        reduction: {
          actual: emissionSummary.reductionPct,
          target: parseFloat(req.query.reductionTarget) || 20
        },

        certification: req.query.certificationLevel
          ? { level: req.query.certificationLevel }
          : null
      };

      const result = calculateCarbonFinanceScore(projectData);

      res.json({
        projectId,
        ...result,
        interpretation: {
          green:      'Score ≥ 70: Eligible for green loan pricing advantage',
          transition: 'Score 40–69: Eligible with enhanced monitoring covenants',
          brown:      'Score < 40: Does not meet green loan criteria'
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
