// @ts-check
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
const authenticate  = require('../../../../platform/auth/authenticate');
const validate    = require('../../../../platform/http/validate');
const { extractLimiter } = require('../../../../platform/http/rate-limit');
const { extractRequestSchema } = require('../schemas/extract');
const { extractFromRequest }   = require('../../application/extract');
const { asError } = require('../../../../shared/types');
const { doc, body, str, bool, obj, orNull, arr } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const { MATERIAL_CARBON_FACTORS } = require('../../../../shared/models/constants');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/extract — extract materials from text, CSV, JSON, or PDF
// ---------------------------------------------------------------------------
router.post('/',
  doc({ summary: 'Extract construction materials from a BOQ',
    description: 'Claude extracts and classifies; the engine computes. The emission factor '
      + 'and the total are recomputed here from the factor table and are never taken from '
      + 'the model, because an LLM must not compute a figure that reaches a disclosure.',
    /* The shape the route actually answers with: the materials are nested
       under `extraction`, and the totals are a sibling. The hint named them at
       the top level, which the live contract sweep could not catch because it
       drives GETs only — and a client generated from it would have read
       `materials` off an object that does not carry it. */
    response: body({
      success: bool, projectName: orNull(str), inputMode: str,
      extraction: body({ materials: arr(), summary: obj }, ['materials']),
      carbonTotals: obj, meta: body({ model: str, tokensUsed: obj }),
    }, ['success', 'extraction']) }),
  authenticate,
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
    } catch (thrown) {
      const err = asError(thrown);
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

/**
 * The material factor table the engine multiplies by.
 *
 * It is served because the screens need it, and a screen that needs it will
 * otherwise keep its own copy — which is what happened twice. Two browser
 * files held factor tables of their own, and they disagreed with this one and
 * with each other: timber at 0.263 and at -1.00, aluminium at 8.240 and at
 * 6.67. A figure a page computed from its own table is not this product's
 * figure, however much it looks like one.
 *
 * Every row carries the source it came from, because a factor that cannot say
 * where it came from cannot be defended, and timber's negative value is a
 * biogenic credit rather than a mistake — which only the source line makes
 * legible.
 */
router.get('/factors', authenticate, extractLimiter, referenceCache(),
  doc({ summary: 'The A1-A3 material factors the engine multiplies by, with the source of each',
    description: 'Served so a screen never needs a copy. A negative factor is a biogenic '
      + 'credit, not an error.',
    response: body({
      factors: obj, categories: arr(str), unit: str, note: str,
    }, ['factors', 'categories']) }),
  (_req, res) => {
    res.json({
      factors: MATERIAL_CARBON_FACTORS,
      categories: Object.keys(MATERIAL_CARBON_FACTORS),
      unit: 'kgCO2e/kg',
      note: 'Defaults used where a material carries no EPD or supplied factor. '
        + 'An EPD improves the factor; it does not change the data-quality option.',
    });
  });

module.exports = router;
