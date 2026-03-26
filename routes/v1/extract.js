/**
 * CarbonIQ FinTech — AI BOQ Material Extraction Endpoint
 *
 * POST /v1/extract
 *
 * Three input modes:
 *   1. content + format (text|csv|json)  — paste raw BOQ text
 *   2. pdfBase64 + format=pdf            — upload PDF directly (≤ ~15 MB)
 *   3. fileId                            — reference a pre-uploaded PDF
 *                                          (from POST /v1/extract/upload)
 *
 * Returns a structured materials array ready for /v1/score and /v1/pcaf.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth  = require('../../middleware/api-key');
const validate    = require('../../middleware/validate');
const { extractLimiter } = require('../../middleware/rate-limit');
const { extractRequestSchema } = require('../../schemas/extract');
const { extractFromRequest }   = require('../../services/extract');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/extract — extract materials from text, CSV, JSON, or PDF
// ---------------------------------------------------------------------------
router.post('/',
  apiKeyAuth,
  validate({ body: extractRequestSchema }),
  extractLimiter,
  async (req, res, next) => {
    try {
      const { content, format, pdfBase64, fileId, pageHint, projectName, computeTotal } = req.body;

      const result = await extractFromRequest({ content, format, pdfBase64, fileId, pageHint });

      const carbonTotals = computeTotal ? _computeCarbonTotals(result.materials) : null;

      // Surface cache savings to the caller so they can see the cost benefit
      const cacheInfo = (result.tokensUsed.cacheRead > 0 || result.tokensUsed.cacheCreated > 0)
        ? {
            cacheReadTokens:    result.tokensUsed.cacheRead,
            cacheCreatedTokens: result.tokensUsed.cacheCreated,
            estimatedSavingPct: result.tokensUsed.cacheRead > 0
              ? Math.round(result.tokensUsed.cacheRead / (result.tokensUsed.input + result.tokensUsed.cacheRead) * 90)
              : 0
          }
        : null;

      res.json({
        success:      true,
        projectName:  projectName || null,
        inputMode:    pdfBase64 ? 'pdf_base64' : fileId ? 'pdf_file_id' : 'text',
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
          cacheInfo,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
