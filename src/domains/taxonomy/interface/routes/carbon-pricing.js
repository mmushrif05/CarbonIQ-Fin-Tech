// @ts-check
/**
 * CarbonIQ FinTech — Carbon Pricing & Financial Impact Route
 *
 *   POST /v1/carbon-pricing/calculate
 *     Full financial impact: tax exposure, loan pricing, stranded asset risk, sensitivity
 *
 *   GET  /v1/carbon-pricing/rates
 *     Reference table of current carbon tax rates by region
 */

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const { carbonPricingSchema } = require('../schemas/carbon-pricing');
const { calculateFinancialImpact, CARBON_TAX_RATES, PRICING_TIERS } = require('../../domain/carbon-pricing');
const validate = require('../../../../platform/http/validate');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/carbon-pricing/calculate
// ---------------------------------------------------------------------------

router.post('/calculate', authenticate, validate({ body: carbonPricingSchema }), async (req, res, next) => {
  try {
    const result = calculateFinancialImpact(req.body);
    res.json({ success: true, ...result });

  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/carbon-pricing/rates  — no auth, reference data
// ---------------------------------------------------------------------------

router.get('/rates', referenceCache(), doc({ summary: 'Carbon tax rates by jurisdiction' }), (_req, res) => {
  const rates = Object.entries(CARBON_TAX_RATES).map(([code, r]) => ({
    code,
    name:        r.name,
    currency:    r.currency,
    currentRate: r.current,
    unit:        `${r.currency}/tCO2e`,
    trajectory:  r.trajectory,
    notes:       r.notes,
  }));

  const pricingTiers = Object.entries(PRICING_TIERS).map(([key, t]) => ({
    classification: key,
    label:         t.label,
    adjustment_bps: t.bps,
    range_bps:     { min: t.minBps, max: t.maxBps },
    description:   t.description,
  }));

  res.json({ carbonTaxRates: rates, loanPricingTiers: pricingTiers });
});

module.exports = router;
