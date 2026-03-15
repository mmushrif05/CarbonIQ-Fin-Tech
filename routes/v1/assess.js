/**
 * CarbonIQ FinTech — BOQ Assessment Endpoint
 *
 * POST /v1/assess
 *
 * Accepts BOQ data and triggers the full CarbonIQ assessment pipeline:
 * ECCS 6-step classification → A1-A3/ICE matching → unit conversion →
 * emission calculation → 80% Pareto identification
 *
 * This is the core product endpoint for banks.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { assessLimiter } = require('../../middleware/rate-limit');

const router = Router();

router.post('/', apiKeyAuth, assessLimiter, async (req, res, next) => {
  try {
    // TODO (Step 4): Implement BOQ assessment trigger via AI bridge
    // - Accept BOQ content (text, structured JSON, or file reference)
    // - Call bridge/ai.js → triggerBOQAssessment()
    // - Return structured assessment result with PCAF score

    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: 'BOQ assessment endpoint — implementation in Step 4 (AI Agent Bridge)',
      planned: {
        input: 'BOQ content (text/JSON)',
        output: 'Full carbon assessment with PCAF score, taxonomy alignment, 80% materials',
        pipeline: 'ECCS 6-step → A1-A3/ICE match → unit conversion → emission calc → 80% Pareto'
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
