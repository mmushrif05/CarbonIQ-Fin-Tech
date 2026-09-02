/**
 * CarbonIQ FinTech — PCAF Part A (financed emissions)
 *
 *   GET  /v1/pcaf/part-a/reference   asset classes, archetypes, data-quality options
 *   POST /v1/pcaf/part-a/assess      assess one exposure
 *
 * Deterministic and synchronous. No model call, so none of the deadline
 * machinery the agent routes need applies here — an assessment is arithmetic
 * and returns in single-digit milliseconds.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const validate   = require('../../middleware/validate');
const { defaultLimiter } = require('../../middleware/rate-limit');

const parta = require('../../services/pcaf-parta');
const { assessRequestSchema } = require('../../schemas/pcaf-parta');

const router = Router();

/**
 * What a form needs to render itself.
 *
 * The options come from the asset class's own table rather than a list held in
 * the UI, so a screen cannot offer an option the engine would then reject, and
 * the two cannot drift.
 */
router.get('/reference', apiKeyAuth, defaultLimiter, (_req, res, next) => {
  try {
    res.json({
      standard: parta.STANDARD,
      assetClasses: [
        {
          id: 'project-finance',
          label: 'Project finance',
          section: '5.3',
          definition: 'On-balance sheet loans or equity to projects or activities designated '
            + 'for specific purposes, with known use of proceeds — for example the construction '
            + 'and operation of a power plant, a wind or solar project, or energy efficiency projects.',
          denominator: 'total project equity plus debt',
          scopes: 'Scope 1 and 2 shall be reported. Scope 3 should be covered if relevant.',
          dataQualityOptions: parta.dataQuality.optionsFor('project-finance'),
          dataQualityTable: parta.dataQuality.tableFor('project-finance').table,
        },
      ],
      archetypes: parta.archetypes.list(),
      notes: {
        avoidedEmissions: 'Avoided emissions are no longer covered by Part A. From the '
          + 'Third Edition (December 2025) they sit in optional supplemental guidance, and '
          + 'figures resting on it are reported separately from the inventory.',
        dataQuality: 'The option-to-score mapping differs between asset classes, so the '
          + 'options above belong to this asset class alone.',
      },
    });
  } catch (err) { next(err); }
});

router.post('/assess', apiKeyAuth, defaultLimiter,
  validate({ body: assessRequestSchema }),
  (req, res, next) => {
    try {
      const startedAt = Date.now();
      const result = parta.assessExposure(req.body);
      res.json({ ...result, elapsedMs: Date.now() - startedAt });
    } catch (err) { next(err); }
  });

module.exports = router;
