// @ts-check
/**
 * CarbonIQ FinTech — the intensity screen
 *
 * GET  /v1/taxonomy/frameworks   the five frameworks and their bands, cached reference data
 * POST /v1/taxonomy/screen       one intensity against all five — a read, stores nothing
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const validate = require('../../../../platform/http/validate');
const referenceCache = require('../../../../platform/http/reference-cache');
const { doc, body, num, obj, arr } = require('../../../../platform/http/openapi-hints');
const baselines = require('../../../baseline/application/registry');
const screen = require('../../domain/intensity-screen');
const { intensityScreenSchema } = require('../schemas/intensity-screen');

const router = Router();

/** The Sri Lanka bands in force for this caller, or nothing where none resolve. */
async function sriLankaBands(req, country) {
  const eff = await baselines.effective('construction_intensity_kgCO2e_m2',
    { country: String(country || 'LK').toUpperCase(), orgId: req.orgId || null });
  const v = eff && eff.values;
  if (!v || !Number.isFinite(Number(v.green)) || !Number.isFinite(Number(v.transition))) return undefined;
  return { green: Number(v.green), transition: Number(v.transition), basis: eff.basis, provisional: eff.provisional };
}

router.get('/frameworks',
  doc({ summary: 'The five frameworks the intensity screen draws, with their bands and what each band is',
    response: body({ frameworks: arr(), scaleMax_kgCO2e_m2: num }, ['frameworks']) }),
  authenticate, defaultLimiter, referenceCache(),
  async (req, res, next) => {
    try {
      res.json({
        frameworks: screen.frameworks({ sriLanka: await sriLankaBands(req, req.query.country) }),
        scaleMax_kgCO2e_m2: screen.SCALE_MAX_KGCO2E_M2,
      });
    } catch (err) { next(err); }
  }
);

router.post('/screen',
  doc({ summary: 'One embodied-carbon intensity screened against the five frameworks',
    description: 'A read that stores nothing. Only ASEAN publishes an embodied-carbon threshold; the Sri Lanka '
      + 'bands are governed baselines and the other three are indicative proxies, and every row says which.',
    response: body({ intensity_kgCO2e_m2: num, frameworks: arr(), summary: obj }, ['frameworks', 'summary']) }),
  authenticate, defaultLimiter,
  validate({ body: intensityScreenSchema }),
  async (req, res, next) => {
    try {
      res.json(screen.screenIntensity(req.body.intensity_kgCO2e_m2,
        { sriLanka: await sriLankaBands(req, req.body.country) }));
    } catch (err) { next(err); }
  }
);

module.exports = router;
