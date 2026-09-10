// @ts-check
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

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { requireProjectAccess } = require('../../../../platform/auth/api-key');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const config = require('../../../../platform/config');
const engine = require('../../../../platform/bridge/engine');
const { checkAllTaxonomies } = require('../../domain/taxonomy');
/* The Sri Lanka bands are governed, not hardcoded: they resolve from the
   master baseline table, and the answer carries which baseline it used. */
const baselines = require('../../../baseline/application/registry');
const { doc, body, str, obj } = require('../../../../platform/http/openapi-hints');

const router = Router();

router.get('/:projectId/taxonomy',
  doc({ summary: 'EU, ASEAN, Hong Kong, Singapore and Sri Lanka alignment for one project',
    description: 'The five frameworks answer different questions and nothing here is summed '
      + 'into a single verdict. The Sri Lanka bands are regional judgement under governance, '
      + 'not a taxonomy threshold — the SLGFT sets no absolute figure per unit area.',
    response: body({
      projectId: str, projectMetrics: obj, taxonomyAlignment: obj,
    }, ['projectId', 'taxonomyAlignment']) }),
  authenticate,
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

      const screen = await baselines.effective('construction_intensity_kgCO2e_m2',
        { country: String(req.query.country || 'LK').toUpperCase(), orgId: req.orgId || null });

      const result = checkAllTaxonomies(projectMetrics, {
        sriLanka: screen.values
          ? /** @type {any} */ ({ ...screen.values, basis: screen.basis, provisional: screen.provisional })
          : undefined,
      });

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
