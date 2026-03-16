/**
 * CarbonIQ FinTech — Taxonomy Alignment Endpoint
 *
 * GET /v1/projects/:projectId/taxonomy
 *
 * Checks project against ASEAN v3, EU 2024, HK GCF, and Singapore TSC.
 * Returns tier/classification per taxonomy with threshold deltas.
 *
 * Query params:
 *   ?buildingArea_m2=15000   GFA in m² (required for intensity-based checks)
 *   ?reductionPct=22.5       Achieved reduction % vs baseline (overrides engine value)
 *   ?hasLCA=true             Whether a whole-life carbon assessment exists
 *   ?hasEPD=true             Whether project-specific EPDs have been obtained
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');
const config = require('../../config');
const engine = require('../../bridge/engine');
const { checkAllTaxonomies } = require('../../services/taxonomy');

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

      const { projectId } = req.params;

      const emissionSummary = await engine.getEmissionSummary(projectId);
      if (!emissionSummary) {
        return res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: `No carbon data found for project ${projectId}.`
        });
      }

      const buildingArea_m2 = parseFloat(req.query.buildingArea_m2) || 0;

      const projectMetrics = {
        totalEmission_tCO2e: emissionSummary.totalBaseline_tCO2e,
        buildingArea_m2,
        reductionPct: parseFloat(req.query.reductionPct) || emissionSummary.reductionPct,
        hasLCA:       req.query.hasLCA  === 'true',
        hasEPD:       req.query.hasEPD  === 'true'
      };

      const result = checkAllTaxonomies(projectMetrics);

      res.json({
        projectId,
        projectMetrics: {
          totalEmission_tCO2e: projectMetrics.totalEmission_tCO2e,
          buildingArea_m2:     projectMetrics.buildingArea_m2,
          intensity_kgCO2e_m2: buildingArea_m2 > 0
            ? Math.round((projectMetrics.totalEmission_tCO2e * 1000) / buildingArea_m2)
            : null,
          reductionPct: projectMetrics.reductionPct
        },
        taxonomyAlignment: result
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
