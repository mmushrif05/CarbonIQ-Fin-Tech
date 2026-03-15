/**
 * CarbonIQ FinTech — PCAF v3 Output Endpoint
 *
 * GET /v1/projects/:projectId/pcaf — PCAF-compliant carbon assessment
 *
 * Returns embodied carbon data formatted per PCAF v3 methodology:
 * - Attribution factor calculation
 * - Data quality score (1-5)
 * - Emission factor sources and methodology
 * - Scope classification (A1-A3)
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');

const router = Router();

router.get('/:projectId/pcaf',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      // TODO (Step 7): Implement PCAF v3 output formatting
      // - Call services/pcaf.js → generatePCAFOutput()
      // - Uses PCAF_DATA_QUALITY from constants.js
      // - Returns PCAF-compliant JSON with data quality justification

      res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message: 'PCAF v3 output endpoint — implementation in Step 7',
        planned: {
          standard: 'PCAF v3.0 (December 2025)',
          output: {
            financedEmissions_tCO2e: 'Total attributed emissions',
            dataQualityScore: '1-5 (lower is better)',
            dataQualityJustification: 'Why this score was assigned',
            attributionFactor: 'Bank share of project emissions',
            methodology: 'ISO 21930, A1-A3 + ICE v3.0',
            scope: 'Cradle-to-gate (A1-A3)'
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
