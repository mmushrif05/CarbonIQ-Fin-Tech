/**
 * CarbonIQ FinTech — BOQ Assessment Endpoint
 *
 * POST /v1/assess
 *
 * Full-pipeline BOQ assessment: AI material extraction →
 * ICE v3 carbon factors → embodied carbon totals → next-step guidance.
 *
 * Uses the same Claude-powered extraction engine as /v1/extract but
 * returns an enriched assessment response aligned with the ECCS
 * 6-step classification pipeline, suitable for storing against a project.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate = require('../../middleware/validate');
const { assessLimiter } = require('../../middleware/rate-limit');
const { extractRequestSchema } = require('../../schemas/extract');
const { extractMaterials } = require('../../services/extract');

const router = Router();

router.post('/',
  apiKeyAuth,
  validate({ body: extractRequestSchema }),
  assessLimiter,
  async (req, res, next) => {
    try {
      const { content, format, projectName } = req.body;
      const startedAt = new Date().toISOString();

      const result = await extractMaterials(content, format);

      // Compute totals and 80% Pareto
      const totals = _computeCarbonTotals(result.materials);
      const pareto80 = _identify80PctMaterials(result.materials);

      return res.status(200).json({
        success:     true,
        projectName: projectName || null,
        assessment: {
          materials:    result.materials,
          summary:      result.summary,
          carbonTotals: totals,
          pareto80Pct: {
            materials:    pareto80,
            count:        pareto80.length,
            coverage:     pareto80.length > 0
              ? parseFloat((pareto80.reduce((s, m) => s + (m.totalKgCO2e || 0), 0) / Math.max(totals.totalKgCO2e, 1) * 100).toFixed(1))
              : 0
          }
        },
        pipeline: {
          step1_classification: 'ECCS 6-step hierarchy applied via Claude AI',
          step2_factorMatch:    'ICE Database v3 A1-A3 carbon factors',
          step3_unitConversion: 'Applied where m³/t → kg conversions required',
          step4_emission:       'totalKgCO2e = quantityKg × emissionFactor',
          step5_pareto:         `${pareto80.length} materials covering 80% of emissions identified`,
          step6_reporting:      'Ready for /v1/pcaf, /v1/score, /v1/taxonomy'
        },
        nextSteps: {
          score:    'GET /v1/projects/:projectId/score',
          pcaf:     'GET /v1/projects/:projectId/pcaf',
          taxonomy: 'GET /v1/projects/:projectId/taxonomy',
          covenant: 'POST /v1/projects/:projectId/covenant'
        },
        meta: {
          model:       result.model,
          tokensUsed:  result.tokensUsed,
          startedAt,
          completedAt: new Date().toISOString(),
          inputFormat: format,
          factorSource: 'ICE Database v3'
        }
      });
    } catch (err) {
      if (err.message && err.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'AI assessment service is not configured. Contact your administrator.'
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
  const valid = materials.filter(m => m.totalKgCO2e != null);
  if (valid.length === 0) {
    return { totalKgCO2e: 0, totalTCO2e: 0, byCategory: {}, itemsExtracted: materials.length, itemsWithEmissions: 0, coveragePercent: 0 };
  }

  const totalKgCO2e = valid.reduce((s, m) => s + m.totalKgCO2e, 0);
  const byCategory = {};

  for (const m of valid) {
    if (!byCategory[m.category]) byCategory[m.category] = { kgCO2e: 0, itemCount: 0 };
    byCategory[m.category].kgCO2e   += m.totalKgCO2e;
    byCategory[m.category].itemCount += 1;
  }

  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].kgCO2e = parseFloat(byCategory[cat].kgCO2e.toFixed(2));
    byCategory[cat].pct    = parseFloat((byCategory[cat].kgCO2e / totalKgCO2e * 100).toFixed(1));
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

function _identify80PctMaterials(materials) {
  const sorted = materials
    .filter(m => m.totalKgCO2e != null && m.totalKgCO2e > 0)
    .sort((a, b) => b.totalKgCO2e - a.totalKgCO2e);

  const total = sorted.reduce((s, m) => s + m.totalKgCO2e, 0);
  const target = total * 0.80;

  let running = 0;
  const pareto = [];

  for (const m of sorted) {
    pareto.push(m);
    running += m.totalKgCO2e;
    if (running >= target) break;
  }

  return pareto;
}

module.exports = router;
