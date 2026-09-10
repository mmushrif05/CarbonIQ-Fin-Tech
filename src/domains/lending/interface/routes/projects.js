// @ts-check
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
const authenticate = require('../../../../platform/auth/authenticate');
const { sendList, paged } = require('../../../../platform/http/pagination');
const { doc } = require('../../../../platform/http/openapi-hints');
const { requireProjectAccess } = require('../../../../platform/auth/api-key');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const validate = require('../../../../platform/http/validate');
const { createProjectSchema, monitoringEntrySchema } = require('../schemas/projects');
const engine = require('../../../../platform/bridge/engine');
/* The bridge is the CarbonIQ core engine, and read-only. The lending
   domain's own records go through the storage seam. */
const { getProject } = require('../../../../platform/bridge/firebase');
const lendingStore = require('../../infrastructure/lending-store');

const router = Router();

router.get('/:projectId',
  authenticate,
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
  authenticate,
  defaultLimiter,
  validate({ body: createProjectSchema }),
  async (req, res, next) => {
    try {
      const value = req.body;
      const orgId = req.orgId;
      const projectId = value.projectId || `${value.region}-${Date.now()}`;

      // Compute attribution if loan data provided
      let attribution = null;
      if (value.loan) {
        const { outstanding, equity, debt } = value.loan;
        attribution = equity + debt > 0 ? outstanding / (equity + debt) : 0;
      }

      /* The write is awaited and its failure reaches the error handler. It
         used to be swallowed by the bridge — a deployment without Firebase
         answered 201 and stored nothing. */
      const project = await lendingStore.saveProject(orgId, projectId, {
        ...value,
        attribution,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({ success: true, projectId, message: 'Project saved.', project });
    } catch (err) { next(err); }
  }
);

// GET /v1/projects — list all projects for this org
router.get('/',
  authenticate,
  defaultLimiter,
  paged(),
  doc({ summary: 'List the organisation\'s lending projects' }),
  async (req, res, next) => {
    try {
      const projects = await lendingStore.listProjects(req.orgId);
      sendList(req, res, 'projects', projects, { total: projects.length });
    } catch (err) { next(err); }
  }
);

// POST /v1/projects/:projectId/monitoring — submit annual monitoring entry
router.post('/:projectId/monitoring',
  authenticate,
  requireProjectAccess,
  defaultLimiter,
  validate({ body: monitoringEntrySchema }),
  async (req, res, next) => {
    try {
      const value = req.body;
      const { projectId } = req.params;

      const attribution = value.outstanding / (value.equity + value.debt);
      const financed = Math.round(value.emissions * attribution);
      const entry = { ...value, attribution: parseFloat(attribution.toFixed(4)), financed };

      await lendingStore.saveMonitoringEntry(req.orgId, projectId, value.year, entry);
      res.json({ success: true, projectId, year: value.year, attribution, financed, message: 'Monitoring entry saved.' });
    } catch (err) { next(err); }
  }
);

// GET /v1/projects/:projectId/monitoring — list monitoring history
router.get('/:projectId/monitoring',
  authenticate,
  requireProjectAccess,
  defaultLimiter,
  async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const entries = await lendingStore.listMonitoringEntries(req.orgId, projectId);
      res.json({ projectId, entries, total: entries.length });
    } catch (err) { next(err); }
  }
);

module.exports = router;
