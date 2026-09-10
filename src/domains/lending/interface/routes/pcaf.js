// @ts-check
/**
 * CarbonIQ FinTech — lending-side attributed embodied carbon, per project
 *
 * Not PCAF Part A — that is `/v1/pcaf/part-a/assess`. See the note at the top
 * of `src/domains/lending/application/pcaf.js`.
 *
 * GET /v1/projects/:projectId/pcaf
 *
 * Returns attributed A1-A3 embodied carbon for a lending conversation, including:
 *   - Attribution factor (bank's share of project value)
 *   - Data quality score (1-5, lower is better)
 *   - Scope A1-A3 breakdown
 *   - Methodology justification
 *
 * Query params:
 *   ?loanAmount=5000000      Bank's outstanding loan (default: uses full attribution)
 *   ?projectValue=20000000   Total project value (used to compute attribution factor)
 *   ?attributionFactor=0.25  Override direct attribution (0-1, takes precedence)
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { requireProjectAccess } = require('../../../../platform/auth/api-key');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const engine = require('../../../../platform/bridge/engine');
const { generatePCAFOutput } = require('../../application/pcaf');
const { maybeNumber } = require('../../../../shared/numbers');
const { doc, body, str, obj } = require('../../../../platform/http/openapi-hints');

const router = Router();

router.get('/:projectId/pcaf',
  doc({ summary: 'PCAF financed-emissions output for a project',
    response: body({ projectId: str, pcaf: obj }, ['projectId']) }),
  authenticate,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      const [emissionSummary, materials80Pct] = await Promise.all([
        engine.getEmissionSummary(projectId),
        engine.get80PctMaterials(projectId)
      ]);

      if (!emissionSummary || !materials80Pct) {
        return res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: `No carbon data found for project ${projectId}.`
        });
      }

      /* `parseFloat(x) || null` also turned a supplied zero into "not
         supplied". `maybeNumber` answers undefined only for absence, so a
         zero attribution factor is now a zero rather than a default. */
      const loanAmount        = maybeNumber(req.query.loanAmount);
      const projectValue      = maybeNumber(req.query.projectValue);
      const attributionFactor = maybeNumber(req.query.attributionFactor);

      const result = generatePCAFOutput({
        emissionSummary,
        materials80Pct,
        attributionFactor,
        loanAmount,
        projectValue
      });

      res.json({ projectId, ...result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
