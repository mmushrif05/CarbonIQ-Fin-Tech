/**
 * CarbonIQ FinTech — PCAF Part C Endpoints (insurance-associated emissions)
 *
 * Kept entirely separate from /v1/projects/:id/pcaf, which serves A1-A3
 * financed emissions for lending. Different standard section, different
 * scope, different denominator — spec §8 requires the two never merge, so
 * they do not share a route, a service or a schema.
 *
 *   POST /v1/pcaf/part-c/assess    run the full assessment
 *   POST /v1/pcaf/part-c/form      build the pre-filled, policy-gated client form
 *   POST /v1/pcaf/part-c/report    PDF, Word or JSON disclosure report
 *   POST /v1/pcaf/part-c/dq-preview  data-quality scoring alone, nothing persisted
 *   GET  /v1/pcaf/part-c/factors   factor store transparency
 *   GET  /v1/pcaf/part-c/options   dropdown option lists for the form
 *   GET  /v1/pcaf/part-c/runs      list persisted runs
 *   GET  /v1/pcaf/part-c/runs/:id  fetch one run
 *   POST /v1/pcaf/part-c/runs/start        begin a run and pause for client input
 *   POST /v1/pcaf/part-c/runs/:id/resume   supply the answers and compute
 *   POST /v1/pcaf/part-c/agent/intake      policy document -> structured policy
 *   POST /v1/pcaf/part-c/agent/map         BOQ -> mapped materials
 *   POST /v1/pcaf/part-c/agent/disclose    write the insurer memo from tool output
 *
 * The start/resume pair is the pause point an agentic flow needs: documents
 * come in, the form goes out, and the run waits — across sessions if need be —
 * until the client answers.
 */

'use strict';

const { Router } = require('express');

const { fallback } = require('../../../../platform/observability/logger');
const apiKeyAuth   = require('../../../../platform/auth/api-key');
const { doc } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const validate     = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const { runPartC }        = require('../../domain');
const { buildRegisters }  = require('../../application/partc-registers');
const { buildForm } = require('../../agents/form');
const runStore            = require('../../application/partc-run-store');
const factors             = require('../../domain/factors');
const { conformanceMatrix } = require('../../domain/conformance');
const { buildPartCReport, buildPartCPDF, buildPartCDOCX } = require('../../reporting/partc-reports');
const partcRegistry = require('../../application/partc-registry');
const { sendPdf, sendDocx } = require('../../../../platform/reporting/pdf-response');
const { recordLearnings } = require('../../application/learning-store');
const {
  createPartCRun, addStep, generatePartCRunId, PARTC_STATUS, PARTC_STEP_TYPES
} = require('../../../../shared/models/partc-run');
const {
  assessRequestSchema, formRequestSchema, reportRequestSchema
} = require('../schemas/pcaf-partc');

const router = Router();

// ---------------------------------------------------------------------------
// GET /options — dropdowns for the client form
// ---------------------------------------------------------------------------
router.get('/options', apiKeyAuth, defaultLimiter, referenceCache(), doc({ summary: 'Dropdown options for the client form' }), (_req, res) => {
  res.json({ options: factors.options() });
});

// ---------------------------------------------------------------------------
/* The methodology statement is deliberately not served.
 *
 * It is the complete method — every equation the engine executes, every factor
 * with its tier and named source, the worked example and the declared limits.
 * That is the asset, and a public endpoint hands it to anyone who asks. The
 * engine that builds it (`src/domains/pcaf-part-c/application/partc-methodology.js`) remains in the
 * repository and is still used by the annual disclosure, which is issued to a
 * named recipient rather than published.
 *
 * There is no route here rather than a route that refuses. A 403 announces
 * that something exists to be taken; absence announces nothing.
 */

// GET /conformance — what this engine claims, where it lives, what proves it
//
// Published so a reviewer can check the claim rather than take it on trust:
// every rule names the code that enforces it and the test that proves it.
// ---------------------------------------------------------------------------
router.get('/conformance', apiKeyAuth, defaultLimiter, referenceCache(), doc({ summary: 'PCAF Part C rule → implementation → proving test' }), (_req, res) => {
  res.json(conformanceMatrix());
});

// ---------------------------------------------------------------------------
// GET /factors — every factor, with tier and source
// ---------------------------------------------------------------------------
router.get('/factors', apiKeyAuth, defaultLimiter, referenceCache(), doc({ summary: 'Every factor table, with tier and source per row', query: { table: 'One table by name; without it every table.' } }), (req, res) => {
  const tables = factors.allTables();
  if (req.query.table) {
    const t = tables[req.query.table];
    if (!t) return res.status(404).json({ error: 'TABLE_NOT_FOUND', message: `No factor table "${req.query.table}".` });
    return res.json({ table: req.query.table, ...t });
  }
  res.json({
    tables: Object.keys(tables),
    detail: tables,
    note: 'Seed tables are versioned in-repo so every disclosed factor is citable. Runtime overrides and learned local values layer on top.'
  });
});

// ---------------------------------------------------------------------------
// POST /form — the pre-filled, policy-gated client form
// ---------------------------------------------------------------------------
router.post('/form', apiKeyAuth, defaultLimiter,
  validate({ body: formRequestSchema }),
  (req, res, next) => {
    try {
      res.json({ form: buildForm(req.body) });
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /assess — the full calculation
// ---------------------------------------------------------------------------
router.post('/assess', apiKeyAuth, defaultLimiter,
  validate({ body: assessRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const result    = runPartC(_toEngineInput(req.body));
      const registers = buildRegisters(result);

      const runId = generatePartCRunId();
      let learnings = null;

      if (req.body.persist !== false) {
        const run = createPartCRun({ runId, orgId, projectName: req.body.projectName });
        run.policy     = req.body.policy;
        run.materials  = req.body.materials;
        run.result     = result.summary;
        run.registers  = _publicRegisters(registers).badges;
        run.disclosure = result.disclosureNote;
        run.status     = PARTC_STATUS.COMPLETED;
        run.completedAt = new Date().toISOString();
        addStep(run, { type: PARTC_STEP_TYPES.CALCULATION,
                       summary: `Construction ${Math.round(result.summary.construction_kgCO2e)} kgCO2e, IAE ${result.summary.insurerIAE_tCO2e.toFixed(4)} tCO2e` });
        await runStore.saveRun(orgId, run).catch(fallback('partc.runs.save'));

        learnings = await recordLearnings({
          orgId, runId, result,
          context: req.body.context,
          materials: req.body.materials
        }).catch(fallback('partc.recordLearnings', null));
      }

      res.json(_shapeResult(result, registers, {
        runId,
        projectName: req.body.projectName || null,
        learnings: learnings ? learnings.counts : null
      }));
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /dq-preview — the data-quality scoring alone, nothing persisted
//
// The intake form has to show the score move the moment a client supplies an
// actual, and the score is an engine output, not something the browser may
// infer. The engine costs well under a millisecond, so the form asks it
// rather than guessing, and the answer on screen is the answer that would be
// disclosed.
// ---------------------------------------------------------------------------
router.post('/dq-preview', apiKeyAuth, defaultLimiter,
  validate({ body: assessRequestSchema }),
  (req, res, next) => {
    try {
      const result = runPartC(_toEngineInput(req.body));
      res.json({
        dqScoring:   result.dqScoring || null,
        dqStatement: result.dqDisclosureStatement || null,
        summary: {
          construction_kgCO2e: result.summary.construction_kgCO2e,
          useStage_kgCO2e:     result.summary.useStage_kgCO2e
        }
      });
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /report — PDF, Word or JSON
// ---------------------------------------------------------------------------
/**
 * The assessment report for a validated request body — the engine run, the
 * registers, the entity's settings, the content model. Shared by the route
 * and the `partc.report` job, so a document produced by either is the same
 * document.
 */
async function reportFor(orgId, body) {
  const result    = runPartC(_toEngineInput(body));
  const registers = buildRegisters(result);
  /* The reporting entity's own settings — base year, significance
     threshold, recalculation protocol, currency. A Part C disclosure
     must state them, and they belong to the entity rather than to the
     request, so the report reads them from the book. */
  const settings  = await partcRegistry.getSettings(orgId).catch(fallback('partc.form.getSettings', () => ({})));
  const report    = buildPartCReport({
    result, registers, settings, memo: body.memo,
    meta: {
      projectName: body.projectName,
      insurer: settings.insurerName || null,
      reportingYear: settings.reportingYear,
      currency: settings.currency,
      /* The economics the report needs for attribution, per-policy detail
         and intensity are already in the request as the engine's inputs;
         carrying them into the meta means an intensity section that is
         real rather than "not available". */
      premium:     (body.policy || {}).premium,
      projectCost: (body.policy || {}).projectCost,
      gifa_m2:     (body.siteInputs || {}).gifa_m2,
      ...body.meta
    },
    includeWlcaAnnex: body.includeWlcaAnnex
  });
  const safeName = String(body.projectName || 'pcaf-part-c')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pcaf-part-c';
  return { report, safeName };
}

router.post('/report', apiKeyAuth, defaultLimiter,
  validate({ body: reportRequestSchema }),
  doc({ summary: 'The assessment report for one policy — JSON, PDF or Word', produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }),
  async (req, res, next) => {
    try {
      const { report, safeName } = await reportFor(req.apiKey.orgId, req.body);

      if (req.body.format === 'json') return res.json({ report });

      if (req.body.format === 'docx') {
        return sendDocx(res, await buildPartCDOCX(report),
          `${safeName}-pcaf-part-c.docx`, 'assessment report');
      }

      return sendPdf(res, buildPartCPDF(report),
        `${safeName}-pcaf-part-c.pdf`, 'assessment report');
    } catch (err) { next(err); }
  });

router.use(require('./pcaf-partc/runs'));
router.use(require('./pcaf-partc/agents'));
const { _publicRegisters, _shapeResult, _toEngineInput } = require('./pcaf-partc/shared');

module.exports = router;
/* For the job handlers (src/jobs.js): the same report the route builds. */
module.exports.reportFor = reportFor;
module.exports.reportRequestSchema = reportRequestSchema;
