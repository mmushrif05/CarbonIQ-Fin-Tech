// @ts-check
/**
 * The candidate pipeline, and the three carbon boundaries it is read on.
 *
 * Mitigation, embodied and financed emissions never merge, and no response
 * here carries a figure combining two of them.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../../platform/auth/authenticate');
const { listView, paged } = require('../../../../../platform/http/pagination');
const { doc, body, str, num, bool, obj, orNull, arr } = require('../../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const validate = require('../../../../../platform/http/validate');
const { gcfProjectSchema } = require('../../schemas/gcf');
const store = require('../../../infrastructure/store');
const record = require('../../../domain/record');
const emissions = require('../../../domain/emissions');
const ndc = require('../../../domain/ndc-contribution');
const partcStore = require('../../../../../platform/database/store');
const handle = require('../../../../../platform/http/async-handler');
const { emptyBody } = require('../../../../../platform/http/validate').schemas;

const router = Router();

router.get('/pipeline', authenticate, defaultLimiter, paged(),
  doc({ summary: 'The GCF candidate pipeline — recorded, or the shipped illustrative set, never both',
    description: 'Recorded data replaces the shipped set entirely and is never merged with it; '
      + '`source` says which is showing.',
    response: body({
      pipeline: body({
        count: num, projects: arr(), source: str, sample: bool, sampleNote: orNull(str), meta: obj, storage: obj,
      }, ['count', 'projects', 'source']),
      page: obj,
    }, ['pipeline']) }),
  handle(async (req, res) => {
  const { projects, source, sample, meta } = await store.list(req.orgId);
  const view = listView(req, res, projects);
  res.json({
    pipeline: {
      count: projects.length,
      projects: view.items,
      source,
      sample,
      sampleNote: sample ? meta.sampleNote : null,
      meta,
      storage: partcStore.capability(),
    },
    ...(view.page ? { page: view.page } : {}),
  });
  }));

router.get('/pipeline/:id', authenticate, defaultLimiter,
  doc({ summary: 'One candidate, with its evidence tiers and where it sits against accreditation',
    response: body({
      evidence: obj, weakestTier: orNull(str), figures: arr(),
      accreditation: obj, sizeRange: obj,
    }) }),
  handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.orgId, req.params.id);
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

router.post('/pipeline', authenticate, defaultLimiter,
  validate({ body: gcfProjectSchema }, { stripUnknown: false }),
  doc({ summary: 'Record a candidate. Ids are chosen by the caller so a record updates in place.',
    status: 201,
    description: 'Every figure is `{value, tier}` rather than a bare number: without the tier a '
      + 'benchmark grid factor becomes a measured fact by the time it reaches a submission.',
    response: body({ project: obj, storage: obj }, ['project']) }), handle(async (req, res) => {
  /* The id check and the record check both used to live here, each answering
     with its own code. They are one gate at the door now — the same
     `VALIDATION_ERROR` with a field-level reason that every other write on this
     surface returns — so GCF stops being the one domain that refuses
     differently, and the router carries a contract the generated document can
     read. The schema is still the domain's own; only where it is applied
     changed. */
  const saved = await store.put(req.orgId, req.body, { by: (req.actor && req.actor.label) || req.orgId });
  res.status(201).json({ project: saved, storage: partcStore.capability() });
}));

router.delete('/pipeline/:id', authenticate, defaultLimiter,
  doc({ summary: 'Remove a candidate', status: 204 }),
  handle(async (req, res) => {
  await store.remove(req.orgId, req.params.id);
  res.status(204).end();
}));

/**
 * Copy the shipped illustrative pipeline into this organisation's own store,
 * so it can be edited. Deliberately explicit rather than automatic: a book
 * that silently populated itself would leave nobody sure whether a figure was
 * theirs.
 */
router.post('/pipeline/adopt', authenticate, validate({ body: emptyBody }), defaultLimiter,
  doc({ summary: 'Copy the shipped illustrative pipeline into this organisation, to edit',
    status: 201,
    response: body({ adopted: num, projects: arr(), storage: obj }) }),
  handle(async (req, res) => {
  const written = await store.adoptSeed(req.orgId, { by: (req.actor && req.actor.label) || req.orgId });
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
router.get('/emissions', authenticate, defaultLimiter,
  doc({ summary: 'The pipeline on three boundaries that never merge',
    description: 'Mitigation against a counterfactual, embodied A1-A5 of the asset itself, and '
      + 'financed emissions — which are not in this model at all and are said to be absent '
      + 'rather than left quietly missing. No key holds a figure combining two boundaries.',
    response: body({ emissions: obj, source: str, sample: bool, sampleNote: orNull(str) }, ['emissions']) }),
  handle(async (req, res) => {
  const { projects, source, sample } = await store.list(req.orgId);
  const result = emissions.portfolioEmissions(projects, { label: source });
  res.json({
    emissions: result,
    source,
    sample,
    sampleNote: sample ? store.seedMeta().sampleNote : null,
  });
}));

router.get('/emissions/:id', authenticate, defaultLimiter,
  doc({ summary: 'One candidate on the three boundaries',
    response: body({ emissions: obj, source: str, sample: bool }, ['emissions']) }),
  handle(async (req, res) => {
  const { project, source, sample } = await store.get(req.orgId, req.params.id);
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
router.get('/ndc', authenticate, defaultLimiter,
  doc({ summary: 'Contribution against NDC 3.0 — two ledgers, never summed',
    query: { bau: 'Cumulative BAU tonnage for 2026-2035. Without it the share of the national '
      + 'target is reported absent rather than estimated.' },
    response: body({ ndc: obj, source: str, sample: bool }, ['ndc']) }),
  handle(async (req, res) => {
  const raw = req.query.bau;
  if (raw !== undefined && raw !== '' && !Number.isFinite(Number(raw))) {
    return res.status(400).json({
      error: 'INVALID_BAU',
      message: 'bau must be the absolute business-as-usual emissions for 2026-2035 in tCO2e.',
    });
  }
  const bau = raw === undefined || raw === '' ? undefined : Number(raw);
  const { projects, source, sample } = await store.list(req.orgId);
  res.json({
    ndc: ndc.portfolioContribution(projects, { bauCumulative_tCO2e: bau }),
    source,
    sample,
  });
}));

/**
 * The entity-level facts. Absent until recorded, and the report says which are
 * missing and which clause asks for each — so the gaps list is a worklist
 * rather than an apology.
 */

module.exports = router;
