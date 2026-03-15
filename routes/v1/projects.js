/**
 * CarbonIQ FinTech — Project Endpoints
 *
 * GET /v1/projects/:projectId — Project carbon data summary
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { requireProjectAccess } = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');
const engine = require('../../bridge/engine');
const { getProject } = require('../../bridge/firebase');

const router = Router();

router.get('/:projectId',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      const [project, summary, breakdown] = await Promise.all([
        getProject(projectId),
        engine.getEmissionSummary(projectId),
        engine.getMaterialBreakdown(projectId)
      ]);

      if (!project) {
        return res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: `Project ${projectId} not found.`
        });
      }

      res.json({
        projectId,
        name: project.name || projectId,
        status: project.status || 'active',
        carbonSummary: summary,
        materialBreakdown: breakdown,
        retrievedAt: new Date().toISOString()
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
