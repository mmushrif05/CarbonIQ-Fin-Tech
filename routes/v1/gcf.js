/**
 * CarbonIQ FinTech — GCF programme endpoints
 *
 *   GET    /v1/gcf/pipeline          every candidate, recorded or seed
 *   GET    /v1/gcf/pipeline/:id      one project, with its traced figures
 *   POST   /v1/gcf/pipeline          record or replace a project
 *   DELETE /v1/gcf/pipeline/:id      remove a recorded project
 *   POST   /v1/gcf/pipeline/adopt    copy the shipped seed into this org
 *   GET    /v1/gcf/emissions         the pipeline on three boundaries, kept apart
 *   GET    /v1/gcf/emissions/:id     one project, with the arithmetic checked
 *   GET    /v1/gcf/ndc               contribution against NDC 3.0, two ledgers
 *   GET    /v1/gcf/reference         results areas, IRMF indicators, NDC 3.0
 *
 * This tab writes. Everything before it in this application reads a book it
 * cannot change; here a loan officer enters what the bank holds, and it has to
 * still be there on the next request. `assertWritable()` in the store means a
 * deployment that cannot persist refuses with a 503 rather than accepting
 * something it will lose — the rule survives the arrival of a real store.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { defaultLimiter } = require('../../middleware/rate-limit');

const store = require('../../services/gcf/store');
const record = require('../../services/gcf/record');
const emissions = require('../../services/gcf/emissions');
const ndc = require('../../services/gcf/ndc-contribution');
const partcStore = require('../../services/partc-store');

const AREAS = require('../../data/gcf/results-areas.json');
const IRMF = require('../../data/gcf/irmf.json');
const NDC3 = require('../../data/gcf/ndc3.json');

const router = Router();

function fail(res, err) {
  return res.status(err.statusCode || 500).json({
    error: err.code || 'GCF_ERROR',
    message: err.message,
    ...(err.remedy ? { remedy: err.remedy } : {}),
  });
}

const handle = fn => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (err) { if (err.statusCode) return fail(res, err); next(err); }
};

/** The frameworks this tab is built on, so a screen never restates them. */
router.get('/reference', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json({
    resultsAreas: AREAS,
    irmf: IRMF,
    ndc3: NDC3,
    accreditation: store.seedMeta().accreditation,
    storage: partcStore.capability(),
  });
});

router.get('/pipeline', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const { projects, source, sample, meta } = await store.list(req.apiKey.orgId);
  res.json({
    pipeline: {
      count: projects.length,
      projects,
      source,
      sample,
      sampleNote: sample ? meta.sampleNote : null,
      meta,
      storage: partcStore.capability(),
    },
  });
}));

router.get('/pipeline/:id', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.apiKey.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  res.json({
    project,
    source,
    sample,
    /* Every traced figure with its tier, and the weakest one named — what a
       reviewer should ask about first. */
    evidence: {
      weakestTier: record.weakestTier(project),
      figures: record.tracedFigures(project),
    },
    accreditation: record.withinAccreditation(project, {
      sizeRange: store.seedMeta().accreditation.sizeRange_usd,
    }),
  });
}));

router.post('/pipeline', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const body = req.body || {};
  if (!body.id) {
    return res.status(400).json({
      error: 'MISSING_ID',
      message: 'A project record needs an id. Ids are chosen by the caller so a record can be updated in place.',
    });
  }
  const saved = await store.put(req.apiKey.orgId, body, { by: req.apiKey.name || req.apiKey.orgId });
  res.status(201).json({ project: saved, storage: partcStore.capability() });
}));

router.delete('/pipeline/:id', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  await store.remove(req.apiKey.orgId, req.params.id);
  res.status(204).end();
}));

/**
 * Copy the shipped illustrative pipeline into this organisation's own store,
 * so it can be edited. Deliberately explicit rather than automatic: a book
 * that silently populated itself would leave nobody sure whether a figure was
 * theirs.
 */
router.post('/pipeline/adopt', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const written = await store.adoptSeed(req.apiKey.orgId, { by: req.apiKey.name || req.apiKey.orgId });
  res.status(201).json({
    adopted: written.length,
    note: 'The shipped pipeline is now recorded against your organisation and can be edited. '
      + 'The figures remain illustrative; each record carries its origin in provenance.source.',
    storage: partcStore.capability(),
  });
}));

/**
 * The pipeline's emissions, on three boundaries that are never combined.
 *
 * Mitigation against a counterfactual, embodied carbon inside the project
 * boundary, and financed emissions named as belonging to the capital book
 * rather than quietly missing.
 */
router.get('/emissions', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const { projects, source, sample } = await store.list(req.apiKey.orgId);
  const result = emissions.portfolioEmissions(projects, { label: source });
  res.json({
    emissions: result,
    source,
    sample,
    sampleNote: sample ? store.seedMeta().sampleNote : null,
  });
}));

router.get('/emissions/:id', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.apiKey.orgId, req.params.id);
  if (!project) {
    return res.status(404).json({
      error: 'PROJECT_NOT_FOUND',
      message: `No project with id "${req.params.id}" in the recorded book or the shipped pipeline.`,
    });
  }
  res.json({ emissions: emissions.projectEmissions(project), source, sample });
}));

/**
 * Contribution against NDC 3.0.
 *
 * Reduction and removal come back as two ledgers and there is no key holding
 * their sum. The share of the national commitment is absent unless the caller
 * supplies the BAU tonnage it needs — `?bau=` — because the NDC targets are
 * percentages and this system does not hold the scenario behind them.
 */
router.get('/ndc', apiKeyAuth, defaultLimiter, handle(async (req, res) => {
  const raw = req.query.bau;
  if (raw !== undefined && raw !== '' && !Number.isFinite(Number(raw))) {
    return res.status(400).json({
      error: 'INVALID_BAU',
      message: 'bau must be the absolute business-as-usual emissions for 2026-2035 in tCO2e.',
    });
  }
  const bau = raw === undefined || raw === '' ? undefined : Number(raw);
  const { projects, source, sample } = await store.list(req.apiKey.orgId);
  res.json({
    ndc: ndc.portfolioContribution(projects, { bauCumulative_tCO2e: bau }),
    source,
    sample,
  });
}));

module.exports = router;
