/**
 * CarbonIQ FinTech — PCAF v3 Output Endpoint
 *
 * GET /v1/projects/:projectId/pcaf
 *
 * Returns financed emissions formatted per PCAF v3 methodology including:
 *   - Attribution factor (bank's share of project value)
 *   - Data quality score (1-5, lower is better)
 *   - Scope A1-A3 breakdown
 *   - Methodology justification
 *
 * Query params:
 *   ?loanAmount=5000000      Bank's outstanding loan (default: uses full attribution)
 *   ?projectValue=20000000   Total project value (used to compute attribution factor)
 *   ?attributionFactor=0.25  Override direct attribution (0-1, takes precedence)
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');
const engine = require('../../bridge/engine');
const { generatePCAFOutput } = require('../../services/pcaf');

const router = Router();

router.get('/:projectId/pcaf',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      const [emissionSummary, materials80Pct] = await Promise.all([
        engine.getEmissionSummary(projectId),
        engine.get80PctMaterials(projectId)
      ]);

      if (!emissionSummary || !materials80Pct) {
        return res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: `No carbon data found for project ${projectId}.`
        });
      }

      const loanAmount        = parseFloat(req.query.loanAmount)        || null;
      const projectValue      = parseFloat(req.query.projectValue)      || null;
      const attributionFactor = parseFloat(req.query.attributionFactor) || null;

      const result = generatePCAFOutput({
        emissionSummary,
        materials80Pct,
        attributionFactor,
        loanAmount,
        projectValue
      });

      res.json({ projectId, ...result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
