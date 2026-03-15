/**
 * CarbonIQ FinTech — Green Loan Covenant Endpoint
 *
 * POST /v1/projects/:projectId/covenant  — Run a single covenant check
 * GET  /v1/projects/:projectId/covenants — List all covenants for a project
 *
 * Checks project carbon metrics against loan covenant KPIs defined in the
 * green loan agreement (SLL). Returns pass / warning / breach with full detail,
 * variance from threshold, and per-covenant remediation guidance.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const validate = require('../../middleware/validate');
const { schemas } = require('../../middleware/validate');
const { defaultLimiter } = require('../../middleware/rate-limit');
const config = require('../../config');
const { checkCovenant } = require('../../services/covenant');

const router = Router();

// ---------------------------------------------------------------------------
// Covenant remediation library — indexed by metric id
// ---------------------------------------------------------------------------
const REMEDIATION_GUIDANCE = {
  total_tco2e: [
    'Replace high-GWP concrete with GGBS/fly-ash blend (30–35% substitution) in remaining structural pours',
    'Switch steel procurement to EAF-route (recycled content) supplier for all remaining rebar orders',
    'Request project-specific EPDs from manufacturer — verified EFs typically 10–20% lower than ICE generic'
  ],
  tco2e_per_m2: [
    'Commission structural optimisation review — post-tensioned slabs can reduce concrete volume by 8–12%',
    'Source low-carbon admixture suppliers for foundation concrete (GGBS, silica fume)',
    'Eliminate over-specified steel grades in non-structural secondary members'
  ],
  epd_coverage: [
    'Obtain EPDs for the top 5 materials by emission contribution (typically covers 65–75% of total tCO₂e)',
    'Engage specialist material consultant to source EPD-verified alternatives for high-impact categories',
    'Submit interim EPD tracker to lender within current reporting cycle'
  ],
  reduction_pct: [
    'Implement substitution strategy targeting concrete and structural steel (typically 70–80% of A1-A3 total)',
    'Fast-track consultant approval of low-carbon concrete design mix (GGBS replacement)',
    'Coordinate with main contractor to mandate alternative sourcing for B500B reinforcement steel'
  ],
  material_substitution_rate: [
    'Identify additional substitution opportunities from ICE v3.0 database across all 80%-band materials',
    'Issue Contractor Instruction mandating GGBS cement replacement in all Phase 2 structural concrete',
    'Require low-carbon supplier shortlist from procurement team for all steel categories'
  ]
};

// ---------------------------------------------------------------------------
// POST /v1/projects/:projectId/covenant
// Body: { metric, operator, threshold, buildingArea_m2? }
// ---------------------------------------------------------------------------
router.post('/:projectId/covenant',
  apiKeyAuth,
  requireProjectAccess,
  validate({ body: schemas.covenantCheck, params: schemas.projectId }),
  defaultLimiter,
  async (req, res, next) => {
    try {
      if (!config.features.covenantEngine) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Covenant engine is not enabled for this tenant.'
        });
      }

      const { projectId } = req.params;
      const { metric, operator, threshold, buildingArea_m2, checkFrequency } = req.body;

      // Pull project metrics from the request context (set by requireProjectAccess middleware)
      // In production this would fetch from Firebase. We use req.projectMetrics if available,
      // or construct a minimal object from the body for stateless checks.
      const projectMetrics = req.projectMetrics || {
        totalBaseline_tCO2e: req.body.totalBaseline_tCO2e || 0,
        epdCoveragePct:       req.body.epdCoveragePct     || 0,
        reductionPct:         req.body.reductionPct       || 0,
        substitutionRate:     req.body.substitutionRate   || 0
      };

      const covenant = { metric, operator, threshold, buildingArea_m2 };
      const result   = checkCovenant(covenant, projectMetrics);

      // Determine breach severity
      let severity = null;
      if (result.result === 'breach') {
        severity = Math.abs(result.variancePct) > 20 ? 'critical'
                 : Math.abs(result.variancePct) > 10 ? 'high'
                 : 'medium';
      } else if (result.result === 'warning') {
        severity = 'low';
      }

      // Attach remediation guidance
      const remediations = REMEDIATION_GUIDANCE[metric] || [];

      // Build response
      const response = {
        projectId,
        covenant: { metric, operator, threshold, buildingArea_m2, checkFrequency },
        result:        result.result,
        severity,
        currentValue:  result.currentValue,
        threshold:     result.threshold,
        variance:      result.variance,
        variancePct:   result.variancePct,
        checkedAt:     result.checkedAt,
        lenderNotificationRequired: result.result === 'breach',
        notificationDeadlineDays:   result.result === 'breach' ? 5 : null,
        remediations:  result.result !== 'pass' ? remediations : [],
        reportingStandard: _reportingStandard(metric)
      };

      // Fire webhook if breach (non-blocking)
      if (result.result === 'breach' && config.webhooks && config.webhooks.covenantBreach) {
        _fireWebhook(config.webhooks.covenantBreach, response).catch(err =>
          console.error('[covenant] webhook error:', err.message)
        );
      }

      return res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/projects/:projectId/covenants
// Returns all standard SLL covenant checks for the project in one call.
// ---------------------------------------------------------------------------
router.get('/:projectId/covenants',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      if (!config.features.covenantEngine) {
        return res.status(503).json({
          error: 'FEATURE_DISABLED',
          message: 'Covenant engine is not enabled for this tenant.'
        });
      }

      const { projectId } = req.params;
      const projectMetrics = req.projectMetrics || {};
      const buildingArea_m2 = req.query.buildingArea_m2
        ? parseFloat(req.query.buildingArea_m2) : null;

      // Standard SLL covenant suite
      const covenantSuite = [
        { metric: 'total_tco2e',              operator: 'lte', threshold: parseFloat(req.query.threshold_tco2e       || 0), buildingArea_m2 },
        { metric: 'tco2e_per_m2',             operator: 'lte', threshold: parseFloat(req.query.threshold_intensity   || 500), buildingArea_m2 },
        { metric: 'epd_coverage',             operator: 'gte', threshold: parseFloat(req.query.threshold_epd         || 80) },
        { metric: 'reduction_pct',            operator: 'gte', threshold: parseFloat(req.query.threshold_reduction   || 15) },
        { metric: 'material_substitution_rate',operator:'gte', threshold: parseFloat(req.query.threshold_subrate     || 40) }
      ];

      const results = covenantSuite.map(c => {
        const r = checkCovenant(c, projectMetrics);
        const severity = r.result === 'breach'
          ? (Math.abs(r.variancePct) > 20 ? 'critical' : Math.abs(r.variancePct) > 10 ? 'high' : 'medium')
          : r.result === 'warning' ? 'low' : null;
        return {
          ...c,
          result:        r.result,
          severity,
          currentValue:  r.currentValue,
          variance:      r.variance,
          variancePct:   r.variancePct,
          checkedAt:     r.checkedAt,
          lenderNotificationRequired: r.result === 'breach',
          remediations:  r.result !== 'pass' ? (REMEDIATION_GUIDANCE[c.metric] || []) : [],
          reportingStandard: _reportingStandard(c.metric)
        };
      });

      const breachCount  = results.filter(r => r.result === 'breach').length;
      const warningCount = results.filter(r => r.result === 'warning').length;
      const passCount    = results.filter(r => r.result === 'pass').length;
      const complianceScore = Math.round((passCount * 100 + warningCount * 60) / Math.max(results.length, 1));

      return res.status(200).json({
        projectId,
        checkedAt: new Date().toISOString(),
        summary: { total: results.length, pass: passCount, warning: warningCount, breach: breachCount, complianceScore },
        lenderNotificationRequired: breachCount > 0,
        notificationDeadlineDays: breachCount > 0 ? 5 : null,
        covenants: results
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _reportingStandard(metric) {
  const standards = {
    total_tco2e:              'EN 15978 / ISO 21930',
    tco2e_per_m2:             'ASEAN Taxonomy v3 / EU Taxonomy 2024',
    epd_coverage:             'LMA/APLMA Green Loan Principles 2021',
    reduction_pct:            'ICMA Green Bond Principles / GLP 2021',
    material_substitution_rate: 'EN 15978 / ECCS Classification'
  };
  return standards[metric] || 'GLP 2021';
}

async function _fireWebhook(url, payload) {
  const https = require('https');
  const http  = require('http');
  const body  = JSON.stringify(payload);
  const parsed = new URL(url);
  const lib   = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => resolve(res.statusCode));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = router;
