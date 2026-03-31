/**
 * CarbonIQ FinTech — NDC & SDG Alignment Endpoint
 *
 * POST /v1/ndc-sdg/assess
 *
 * AI-powered analysis of a project's alignment with Sri Lanka's
 * National Determined Contributions (NDC) and the SDGs, per the
 * Sri Lanka Green Finance Taxonomy (SLGFT v2024).
 *
 * Powered by Claude claude-sonnet-4-6 with prompt caching.
 */

const { Router } = require('express');
const Joi = require('joi');
const apiKeyAuth = require('../../middleware/api-key');
const validate   = require('../../middleware/validate');
const { assessLimiter } = require('../../middleware/rate-limit');
const { assessNdcSdgAlignment } = require('../../services/ndc-sdg');

const router = Router();

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const ndcSdgSchema = Joi.object({
  name:             Joi.string().max(200).required().messages({ 'any.required': 'Project name is required.' }),
  buildingType:     Joi.string().max(100).optional().allow('', null),
  slsicSector:      Joi.string().valid('A','B','C','D','E','F','G','H','I','J','K','L','M').optional().allow('', null),
  activityCode:     Joi.string().max(10).uppercase().optional().allow('', null),
  emissions_tCO2e:  Joi.number().positive().optional().allow(null),
  buildingArea_m2:  Joi.number().positive().optional().allow(null),
  reductionPct:     Joi.number().min(0).max(100).optional().allow(null),
  hasEPD:           Joi.boolean().default(false),
  hasLCA:           Joi.boolean().default(false),
  region:           Joi.string().valid('LK').default('LK'),
});

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/assess
// ---------------------------------------------------------------------------

router.post('/assess',
  apiKeyAuth,
  validate({ body: ndcSdgSchema }),
  assessLimiter,
  async (req, res, next) => {
    try {
      const result = await assessNdcSdgAlignment(req.body);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      if (err.message && (
        err.message.includes('ANTHROPIC_API_KEY') ||
        err.message.includes('api_key')
      )) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'AI assessment service is not configured. Contact your administrator.',
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/ndc-sdg/framework
// Returns SLGFT framework metadata (NDC targets, SDGs, sectors) — no AI
// ---------------------------------------------------------------------------

router.get('/framework', apiKeyAuth, (_req, res) => {
  const { TAXONOMY_LK } = require('../../config/constants');
  res.json({
    framework:   TAXONOMY_LK.name,
    version:     TAXONOMY_LK.version,
    regulator:   TAXONOMY_LK.regulator,
    ndcTargets:  TAXONOMY_LK.ndcTargets,
    sectors:     TAXONOMY_LK.sectors,
    objectives:  TAXONOMY_LK.environmentalObjectives,
    thresholds:  TAXONOMY_LK.thresholds,
    activities:  TAXONOMY_LK.constructionActivities,
    guidingPrinciples: TAXONOMY_LK.guidingPrinciples,
  });
});

module.exports = router;
