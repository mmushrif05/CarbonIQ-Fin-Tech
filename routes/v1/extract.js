/**
 * CarbonIQ FinTech — AI BOQ Material Extraction Endpoint
 *
 * POST /v1/extract
 *
 * Accepts raw BOQ content (CSV, text, or JSON) and uses Claude AI to
 * parse and map materials to ICE v3 carbon factors.
 * Returns a structured materials array ready for /v1/score and /v1/pcaf.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate = require('../../middleware/validate');
const { extractLimiter } = require('../../middleware/rate-limit');
const { extractRequestSchema } = require('../../schemas/extract');
const { extractMaterials } = require('../../services/extract');

const router = Router();

router.post('/',
  apiKeyAuth,
  validate({ body: extractRequestSchema }),
  extractLimiter,
  async (req, res, next) => {
    try {
      const { content, format, projectName, computeTotal } = req.body;

      const result = await extractMaterials(content, format);

      let carbonTotals = null;
      if (computeTotal) {
        carbonTotals = _computeCarbonTotals(result.materials);
      }

      res.json({
        success: true,
        projectName: projectName || null,
        extraction: {
          materials: result.materials,
          summary:   result.summary
        },
        carbonTotals,
        nextSteps: {
          score:    'POST /v1/score — submit these materials with project details for a 0-100 Carbon Finance Score',
          pcaf:     'POST /v1/pcaf — compute PCAF v3 financed emissions attribution',
          taxonomy: 'POST /v1/taxonomy — check taxonomy alignment (ASEAN/EU/HK/SG)'
        },
        meta: {
          model:        result.model,
          tokensUsed:   result.tokensUsed,
          extractedAt:  new Date().toISOString(),
          inputFormat:  format,
          factorSource: 'ICE Database v3'
        }
      });
    } catch (err) {
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'AI extraction service is not configured. Contact your administrator.'
        });
      }
      next(err);
    }
  }
);

/**
 * Compute total embodied carbon and per-category breakdown.
 * @param {Object[]} materials
 * @returns {Object}
 */
function _computeCarbonTotals(materials) {
  const valid = materials.filter((m) => m.totalKgCO2e != null);

  if (valid.length === 0) {
    return {
      totalKgCO2e: 0, totalTCO2e: 0, byCategory: {},
      itemsExtracted: materials.length, itemsWithEmissions: 0, coveragePercent: 0
    };
  }

  const totalKgCO2e = valid.reduce((sum, m) => sum + m.totalKgCO2e, 0);

  const byCategory = {};
  for (const mat of valid) {
    if (!byCategory[mat.category]) {
      byCategory[mat.category] = { kgCO2e: 0, quantityKg: 0, itemCount: 0 };
    }
    byCategory[mat.category].kgCO2e    += mat.totalKgCO2e;
    byCategory[mat.category].quantityKg += mat.quantity || 0;
    byCategory[mat.category].itemCount  += 1;
  }

  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].kgCO2e = parseFloat(byCategory[cat].kgCO2e.toFixed(2));
    byCategory[cat].pct    = totalKgCO2e > 0
      ? parseFloat((byCategory[cat].kgCO2e / totalKgCO2e * 100).toFixed(1))
      : 0;
  }

  return {
    totalKgCO2e:        parseFloat(totalKgCO2e.toFixed(2)),
    totalTCO2e:         parseFloat((totalKgCO2e / 1000).toFixed(3)),
    byCategory,
    itemsExtracted:     materials.length,
    itemsWithEmissions: valid.length,
    coveragePercent:    parseFloat((valid.length / materials.length * 100).toFixed(1))
  };
}

module.exports = router;
