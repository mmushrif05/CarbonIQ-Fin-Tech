// @ts-check
/**
 * CarbonIQ FinTech — NDC & SDG Alignment Endpoint
 *
 * POST /v1/ndc-sdg/assess
 *
 * AI-powered analysis of a project's alignment with Sri Lanka's
 * National Determined Contributions (NDC) and the SDGs, per the
 * Sri Lanka Green Finance Taxonomy (SLGFT v2024).
 *
 * Powered by Claude claude-sonnet-4-6 with prompt caching.
 */

const { Router } = require('express');
const Joi = require('joi');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, str, bool, obj, arr } = require('../../../../platform/http/openapi-hints');
const handle = require('../../../../platform/http/async-handler');
const validate   = require('../../../../platform/http/validate');
const { assessLimiter } = require('../../../../platform/http/rate-limit');
const { assessNdcSdgAlignment } = require('../../application/ndc-sdg');
const { generateCertificate, verifyCertificate } = require('../../domain/certificate');
const baselines = require('../../../baseline/application/registry');
const { asError } = require('../../../../shared/types');
const { certificateVerifySchema } = require('../schemas/taxonomy');

const router = Router();

// Certificate request schema
const certSchema = Joi.object({
  projectName:        Joi.string().max(200).required().messages({ 'any.required': 'projectName is required.' }),
  projectId:          Joi.string().max(100).optional().allow('', null),
  bankName:           Joi.string().max(200).required().messages({ 'any.required': 'bankName is required.' }),
  bankOrgId:          Joi.string().max(100).optional().allow('', null),
  slsicSector:        Joi.string().valid('A','B','C','D','E','F','G','H','I','J','K','L','M').optional().allow('', null),
  activityCode:       Joi.string().max(10).uppercase().optional().allow('', null),
  emissions_tCO2e:    Joi.number().positive().optional().allow(null),
  buildingArea_m2:    Joi.number().positive().optional().allow(null),
  ndcTier:            Joi.string().valid('strong','moderate','partial','not_aligned').optional().allow('', null),
  ndcContrib_pct:     Joi.number().min(0).max(100).optional().allow(null),
  sdgs:               Joi.array().items(Joi.number().integer().min(1).max(17)).optional().default([]),
  dnshStatus:         Joi.string().valid('pass','conditional','fail').optional().default('pass'),
  classificationTier: Joi.string().valid('green','transition','directly_eligible','conditional').optional().allow('', null),
  loanAmount_M:       Joi.number().positive().optional().allow(null),
  currency:           Joi.string().valid('LKR','USD','SGD','EUR').optional().default('LKR'),
});

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const ndcSdgSchema = Joi.object({
  name:             Joi.string().max(200).required().messages({ 'any.required': 'Project name is required.' }),
  buildingType:     Joi.string().max(100).optional().allow('', null),
  slsicSector:      Joi.string().valid('A','B','C','D','E','F','G','H','I','J','K','L','M').optional().allow('', null),
  activityCode:     Joi.string().max(10).uppercase().optional().allow('', null),
  emissions_tCO2e:  Joi.number().positive().optional().allow(null),
  buildingArea_m2:  Joi.number().positive().optional().allow(null),
  reductionPct:     Joi.number().min(0).max(100).optional().allow(null),
  hasEPD:           Joi.boolean().default(false),
  hasLCA:           Joi.boolean().default(false),
  region:           Joi.string().valid('LK').default('LK'),
});

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/assess
// ---------------------------------------------------------------------------

router.post('/assess',
  doc({ summary: 'NDC and SDG alignment for a project',
    description: 'Reduction and removal are two commitments and are never summed: no key '
      + 'anywhere holds their total. Only the years falling inside 2026-2035 count against a '
      + '2026-2035 commitment.',
    response: body({ success: bool, alignment: obj }, ['success']) }),
  authenticate,
  validate({ body: ndcSdgSchema }),
  assessLimiter,
  async (req, res, next) => {
    try {
      const result = await assessNdcSdgAlignment(req.body);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (thrown) {
      const err = asError(thrown);
      if (err.message && (
        err.message.includes('ANTHROPIC_API_KEY') ||
        err.message.includes('api_key')
      )) {
        return res.status(503).json({
          error:   'AI_SERVICE_UNAVAILABLE',
          message: 'AI assessment service is not configured. Contact your administrator.',
        });
      }
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/certificate
// Generate a tamper-evident SLGFT Green Loan Certificate (no AI required)
// ---------------------------------------------------------------------------

router.post('/certificate',
  doc({ summary: 'Generate an SLGFT Green Loan Certificate', status: 201,
    description: 'The tier is assigned from the governed intensity bands, so the certificate '
      + 'records the baseline version behind its own classification. The audit hash covers the '
      + 'tier that was assigned, not the bands that assigned it, so a later change to the '
      + 'bands does not invalidate a certificate already issued.',
    response: body({ success: bool, certificate: obj }, ['success', 'certificate']) }),
  authenticate,
  validate({ body: certSchema }),
  async (req, res, next) => {
    try {
      /* The tier a certificate carries is assigned from the governed bands,
         resolved here and handed to the engine, so a certificate records the
         baseline version behind its own classification. */
      const screen = await baselines.effective('construction_intensity_kgCO2e_m2',
        { country: String(req.body.country || 'LK').toUpperCase(), orgId: req.orgId || null });
      const cert = generateCertificate({
        ...req.body,
        screen: screen.values
          ? { ...screen.values, basis: screen.basis, provisional: screen.provisional, version: screen.version }
          : undefined,
      });
      return res.status(201).json({ success: true, certificate: cert });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/ndc-sdg/certificate/verify
// Verify a certificate's tamper-evident hash
// ---------------------------------------------------------------------------

router.post('/certificate/verify',
  doc({ summary: "Verify a certificate against its own audit hash",
    description: 'The stamp sits inside the hash, so the verifier reads it off the certificate '
      + 'with a legacy fallback — every already-issued certificate still verifies.',
    response: body({ success: bool, valid: bool, reason: str }, ['success']) }),
  authenticate,
  validate({ body: certificateVerifySchema }, { stripUnknown: false }),
  async (req, res, next) => {
    try {
      const result = verifyCertificate(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/ndc-sdg/framework
// Returns SLGFT framework metadata (NDC targets, SDGs, sectors) — no AI
// ---------------------------------------------------------------------------

router.get('/framework',
  doc({ summary: 'SLGFT framework metadata, and the intensity screen in force',
    description: 'The framework is fixed by the published document; the intensity screen '
      + 'beside it is not in that document and is governed here, so this reports what is '
      + 'actually in force rather than a second constant.',
    response: body({
      framework: str, version: str, regulator: str, ndcTargets: obj, sectors: obj,
      objectives: obj, activities: arr(), guidingPrinciples: arr(str), intensityScreen: obj,
    }, ['framework', 'intensityScreen']) }), authenticate, doc({ summary: 'SLGFT framework metadata, the NDC 3.0 targets, and the intensity screen in force' }), handle(async (req, res) => {
  const { TAXONOMY_LK } = require('../../../../shared/constants');
  /* The framework's own content is fixed by the published document; the
     intensity screen beside it is not part of that document and is governed
     here, so this endpoint reports what is actually in force rather than a
     second constant that disagreed with the taxonomy screen. */
  const screen = await baselines.effective('construction_intensity_kgCO2e_m2',
    { country: String(req.query.country || 'LK').toUpperCase(), orgId: req.orgId || null });
  res.json({
    framework:   TAXONOMY_LK.name,
    version:     TAXONOMY_LK.version,
    regulator:   TAXONOMY_LK.regulator,
    ndcTargets:  TAXONOMY_LK.ndcTargets,
    sectors:     TAXONOMY_LK.sectors,
    objectives:  TAXONOMY_LK.environmentalObjectives,
    activities:  TAXONOMY_LK.constructionActivities,
    guidingPrinciples: TAXONOMY_LK.guidingPrinciples,
    intensityScreen: {
      ...(screen.values || {}),
      unit: screen.unit,
      basis: screen.basis,
      source: screen.source,
      provisional: screen.provisional,
      baselineVersion: screen.version,
      isTaxonomyThreshold: false,
      note: 'The taxonomy sets no absolute kgCO2e/m² figure. These bands are this '
        + "product's own screen, governed through the master baseline table.",
    },
  });
}));

module.exports = router;
