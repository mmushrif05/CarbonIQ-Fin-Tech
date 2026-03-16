/**
 * CarbonIQ FinTech — AI BOQ Material Extraction Endpoint
 *
 * POST /v1/extract
 *
 * Accepts raw BOQ content (CSV, text, or JSON) and uses Claude AI
 * to parse and map materials to ICE v3 carbon factors.
 * Returns a structured materials array ready for /v1/score and /v1/pcaf.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { extractRequestSchema } = require('../../schemas/extract');
const { extractMaterials } = require('../../services/extract');

const router = Router();

router.post('/', apiKeyAuth, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = extractRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: error.details.map(d => ({ field: d.path.join('.'), message: d.message }))
      });
    }

    const { content, format, projectName, computeTotal } = value;

    // Call AI extraction service
    const result = await extractMaterials(content, format);

    // Optionally compute total embodied carbon
    let carbonTotals = null;
    if (computeTotal) {
      carbonTotals = computeCarbonTotals(result.materials);
    }

    const response = {
      success: true,
      projectName: projectName || null,
      extraction: {
        materials: result.materials,
        summary: result.summary
      },
      carbonTotals,
      nextSteps: {
        score: 'POST /v1/score — submit these materials with project details for a 0-100 Carbon Finance Score',
        pcaf: 'POST /v1/pcaf — compute PCAF v3 financed emissions attribution',
        taxonomy: 'POST /v1/taxonomy — check taxonomy alignment (ASEAN/EU/HK/SG)'
      },
      meta: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        extractedAt: new Date().toISOString(),
        inputFormat: format,
        factorSource: 'ICE Database v3'
      }
    };

    res.json(response);
  } catch (err) {
    // Surface AI config errors as 503
    if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({
        error: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI extraction service is not configured. Contact your administrator.'
      });
    }
    next(err);
  }
});

/**
 * Compute totals and per-category breakdown from extracted materials.
 */
function computeCarbonTotals(materials) {
  const validMaterials = materials.filter(m => m.totalKgCO2e != null);

  if (validMaterials.length === 0) {
    return { totalKgCO2e: 0, totalTCO2e: 0, byCategory: {}, coveragePercent: 0 };
  }

  const totalKgCO2e = validMaterials.reduce((sum, m) => sum + m.totalKgCO2e, 0);
  const totalQuantityKg = validMaterials.reduce((sum, m) => sum + (m.quantity || 0), 0);

  // Group by category
  const byCategory = {};
  for (const mat of validMaterials) {
    if (!byCategory[mat.category]) {
      byCategory[mat.category] = { kgCO2e: 0, quantityKg: 0, itemCount: 0 };
    }
    byCategory[mat.category].kgCO2e += mat.totalKgCO2e;
    byCategory[mat.category].quantityKg += (mat.quantity || 0);
    byCategory[mat.category].itemCount += 1;
  }

  // Add percentage share per category
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].kgCO2e = parseFloat(byCategory[cat].kgCO2e.toFixed(2));
    byCategory[cat].pct = totalKgCO2e > 0
      ? parseFloat((byCategory[cat].kgCO2e / totalKgCO2e * 100).toFixed(1))
      : 0;
  }

  const coveragePercent = materials.length > 0
    ? parseFloat((validMaterials.length / materials.length * 100).toFixed(1))
    : 0;

  return {
    totalKgCO2e: parseFloat(totalKgCO2e.toFixed(2)),
    totalTCO2e: parseFloat((totalKgCO2e / 1000).toFixed(3)),
    totalQuantityKg: parseFloat(totalQuantityKg.toFixed(2)),
    byCategory,
    itemsExtracted: materials.length,
    itemsWithEmissions: validMaterials.length,
    coveragePercent
  };
}

module.exports = router;
