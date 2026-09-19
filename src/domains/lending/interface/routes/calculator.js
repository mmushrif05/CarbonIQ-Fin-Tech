// @ts-check
/**
 * CarbonIQ FinTech — the lending calculator routes
 *
 * POST /v1/lending/attribution   the PCAF calculator's answer
 * POST /v1/lending/estimate      the new-project wizard's review figures
 *
 * Both are reads: they store nothing, issue no id, and the same body twice
 * returns the same answer. They exist so the two screens compute nothing —
 * the formulas and the factor table used to live in the browser, readable
 * from the developer tools by anyone who could load the page.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const validate = require('../../../../platform/http/validate');
const { doc, body, num, obj, orNull, arr } = require('../../../../platform/http/openapi-hints');
const { MATERIAL_CARBON_FACTORS } = require('../../../../shared/models/constants');
const calculator = require('../../domain/calculator');
const { attributionRequestSchema, estimateRequestSchema } = require('../schemas/calculator');

const router = Router();

router.post('/attribution',
  doc({ summary: 'PCAF attribution for one facility — outstanding over equity plus debt, applied to the project\'s emissions',
    description: 'A read that stores nothing. The scope lines are an indicative allocation by phase and building type, '
      + 'never a measured inventory, and the response says so beside them.',
    response: body({
      attribution: num, financedEmissions_tCO2e: num, economicIntensity_tCO2e_per_M: num,
      scopes: obj, dataQuality: orNull(obj),
    }, ['attribution', 'financedEmissions_tCO2e']) }),
  authenticate,
  defaultLimiter,
  validate({ body: attributionRequestSchema }),
  (req, res, next) => {
    try { res.json(calculator.attribute(req.body)); } catch (err) { next(err); }
  }
);

router.post('/estimate',
  doc({ summary: 'A bill of materials priced on the factor table, with intensity and attribution — the wizard\'s review figures',
    description: 'A read that stores nothing. A line whose category the table does not hold is unpriced (null, never zero) '
      + 'and the count left out travels with the total.',
    response: body({ lines: arr(), totals: obj, attribution: orNull(obj) }, ['lines', 'totals']) }),
  authenticate,
  defaultLimiter,
  validate({ body: estimateRequestSchema }),
  (req, res, next) => {
    try { res.json(calculator.estimate(req.body, MATERIAL_CARBON_FACTORS)); } catch (err) { next(err); }
  }
);

module.exports = router;
