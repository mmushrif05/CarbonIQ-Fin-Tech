/**
 * CarbonIQ FinTech — Project Endpoints
 *
 * GET    /v1/projects/:projectId              — Project carbon data summary
 * POST   /v1/projects                         — Create or update a fintech project
 * GET    /v1/projects                         — List all projects for this org
 * POST   /v1/projects/:projectId/monitoring   — Submit annual monitoring entry
 * GET    /v1/projects/:projectId/monitoring   — List monitoring history
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

// POST /v1/projects — create or update a fintech project
router.post('/',
  apiKeyAuth,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { createProjectSchema } = require('../../schemas/projects');
      const { error, value } = createProjectSchema.validate(req.body);
      if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

      const orgId = req.apiKey?.orgId || 'default';
      const projectId = value.projectId || `${value.region}-${Date.now()}`;
      const { saveProject } = require('../../bridge/firebase');

      // Compute attribution if loan data provided
      let attribution = null;
      if (value.loan) {
        const { outstanding, equity, debt } = value.loan;
        attribution = equity + debt > 0 ? outstanding / (equity + debt) : 0;
      }

      const projectData = {
        ...value,
        orgId,
        projectId,
        attribution,
        createdAt: new Date().toISOString(),
      };
      await saveProject(projectId, projectData);

      res.status(201).json({ success: true, projectId, message: 'Project saved.', project: projectData });
    } catch (err) { next(err); }
  }
);

// GET /v1/projects — list all projects for this org
router.get('/',
  apiKeyAuth,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const orgId = req.apiKey?.orgId || 'default';
      const { listFintechProjects } = require('../../bridge/firebase');
      const projects = await listFintechProjects(orgId);
      res.json({ projects, total: projects.length });
    } catch (err) { next(err); }
  }
);

// POST /v1/projects/:projectId/monitoring — submit annual monitoring entry
router.post('/:projectId/monitoring',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { monitoringEntrySchema } = require('../../schemas/projects');
      const { error, value } = monitoringEntrySchema.validate(req.body);
      if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

      const { projectId } = req.params;
      const { saveMonitoringEntry } = require('../../bridge/firebase');

      const attribution = value.outstanding / (value.equity + value.debt);
      const financed = Math.round(value.emissions * attribution);
      const entry = { ...value, attribution: parseFloat(attribution.toFixed(4)), financed };

      await saveMonitoringEntry(projectId, value.year, entry);
      res.json({ success: true, projectId, year: value.year, attribution, financed, message: 'Monitoring entry saved.' });
    } catch (err) { next(err); }
  }
);

// GET /v1/projects/:projectId/monitoring — list monitoring history
router.get('/:projectId/monitoring',
  apiKeyAuth,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { listMonitoringEntries } = require('../../bridge/firebase');
      const entries = await listMonitoringEntries(projectId);
      res.json({ projectId, entries, total: entries.length });
    } catch (err) { next(err); }
  }
);

module.exports = router;
