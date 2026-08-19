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
 *   GET  /v1/pcaf/part-c/factors   factor store transparency
 *   GET  /v1/pcaf/part-c/options   dropdown option lists for the form
 *   GET  /v1/pcaf/part-c/runs      list persisted runs
 *   GET  /v1/pcaf/part-c/runs/:id  fetch one run
 *   POST /v1/pcaf/part-c/agent/intake   policy document -> structured policy
 *   POST /v1/pcaf/part-c/agent/map      BOQ -> mapped materials
 */

'use strict';

const { Router }   = require('express');
const apiKeyAuth   = require('../../middleware/api-key');
const validate     = require('../../middleware/validate');
const { defaultLimiter, agentLimiter } = require('../../middleware/rate-limit');

const { runPartC }        = require('../../services/pcaf-partc');
const factors             = require('../../services/pcaf-partc/factors');
const { buildRegisters }  = require('../../services/partc-registers');
const { buildForm }       = require('../../services/agents/partc/form');
const { buildPartCReport, buildPartCPDF, buildPartCDOCX } = require('../../services/partc-reports');
const { recordLearnings } = require('../../services/learning-store');
const { runAgent }        = require('../../bridge/agent');
const fb                  = require('../../bridge/firebase');
const {
  createPartCRun, addStep, generatePartCRunId, PARTC_STATUS, PARTC_STEP_TYPES
} = require('../../models/partc-run');

const {
  assessRequestSchema, formRequestSchema, reportRequestSchema,
  mappingRequestSchema, intakeRequestSchema
} = require('../../schemas/pcaf-partc');

const intakeAgent  = require('../../services/agents/partc/intake');
const mappingAgent = require('../../services/agents/partc/mapping');

const router = Router();

/** Shape the engine input from a validated request body. */
function _toEngineInput(body) {
  return {
    policy:     body.policy,
    materials:  body.materials,
    distances:  body.distances,
    siteInputs: body.siteInputs,
    useStage:   body.useStage,
    beyondPcaf: body.beyondPcaf,
    options:    body.options,
    hasEPD:     body.hasEPD
  };
}

// ---------------------------------------------------------------------------
// GET /options — dropdowns for the client form
// ---------------------------------------------------------------------------
router.get('/options', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json({ options: factors.options() });
});

// ---------------------------------------------------------------------------
// GET /factors — every factor, with tier and source
// ---------------------------------------------------------------------------
router.get('/factors', apiKeyAuth, defaultLimiter, (req, res) => {
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
        run.registers  = registers.badges;
        run.disclosure = result.disclosureNote;
        run.status     = PARTC_STATUS.COMPLETED;
        run.completedAt = new Date().toISOString();
        addStep(run, { type: PARTC_STEP_TYPES.CALCULATION,
                       summary: `Construction ${Math.round(result.summary.construction_kgCO2e)} kgCO2e, IAE ${result.summary.insurerIAE_tCO2e.toFixed(4)} tCO2e` });
        await fb.savePartCRun(orgId, run).catch(() => {});

        learnings = await recordLearnings({
          orgId, runId, result,
          context: req.body.context,
          materials: req.body.materials
        }).catch(() => null);
      }

      res.json({
        runId,
        projectName: req.body.projectName || null,
        standard: result.standard,
        scopeModel: result.scopeModel,
        policy: result.policy,
        summary: result.summary,
        modules: {
          a4: result.modules.a4.value,
          a5: result.modules.a5.value,
          a5Breakdown: result.modules.a5Breakdown,
          b1: result.modules.b1.value,
          b4: result.modules.b4.value,
          b7: result.modules.b7.value
        },
        paretoVitalFew: result.modules.a4.vitalFew,
        beyondPcafAnnex: {
          total: result.beyondPcafAnnex.value,
          breakdown: result.beyondPcafAnnex.children.map(c => ({ module: c.module, label: c.label, value: c.value })),
          scopeNote: 'Voluntary whole-life annex — never part of the PCAF figure.'
        },
        deMinimis:   result.deMinimis,
        dataQuality: result.dataQuality,
        disclosureNote: result.disclosureNote,
        sensitivity: result.sensitivity,
        vehicle:     result.vehicle,
        registers,
        learnings: learnings ? learnings.counts : null,
        generatedAt: result.generatedAt
      });
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /report — PDF, Word or JSON
// ---------------------------------------------------------------------------
router.post('/report', apiKeyAuth, defaultLimiter,
  validate({ body: reportRequestSchema }),
  async (req, res, next) => {
    try {
      const result    = runPartC(_toEngineInput(req.body));
      const registers = buildRegisters(result);
      const report    = buildPartCReport({
        result, registers, memo: req.body.memo,
        meta: { projectName: req.body.projectName, ...req.body.meta },
        includeWlcaAnnex: req.body.includeWlcaAnnex
      });

      const safeName = String(req.body.projectName || 'pcaf-part-c')
        .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pcaf-part-c';

      if (req.body.format === 'json') return res.json({ report });

      if (req.body.format === 'docx') {
        const buffer = await buildPartCDOCX(report);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}-pcaf-part-c.docx"`);
        return res.send(buffer);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-pcaf-part-c.pdf"`);
      buildPartCPDF(report).pipe(res);
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// GET /runs, GET /runs/:runId
// ---------------------------------------------------------------------------
router.get('/runs', apiKeyAuth, defaultLimiter, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    res.json({ runs: await fb.listPartCRuns(req.apiKey.orgId, limit) });
  } catch (err) { next(err); }
});

router.get('/runs/:runId', apiKeyAuth, defaultLimiter, async (req, res, next) => {
  try {
    const run = await fb.getPartCRun(req.apiKey.orgId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND', message: `No Part C run ${req.params.runId}.` });
    res.json({ run });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Agent endpoints — Claude does classification, extraction and mapping.
// Every emissions figure still comes from the deterministic engine.
// ---------------------------------------------------------------------------

router.post('/agent/intake', apiKeyAuth, agentLimiter,
  validate({ body: intakeRequestSchema }),
  async (req, res, next) => {
    try {
      const run = await runAgent({
        agentType: 'partc-intake',
        systemPrompt: intakeAgent.SYSTEM_PROMPT,
        toolDefinitions: intakeAgent.TOOL_DEFINITIONS,
        toolFunctions: intakeAgent.TOOL_FUNCTIONS,
        userMessage: intakeAgent.buildUserMessage(req.body),
        orgId: req.apiKey.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'intake' }
      });
      res.json({ runId: run.runId, status: run.status, result: run.result,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

router.post('/agent/map', apiKeyAuth, agentLimiter,
  validate({ body: mappingRequestSchema }),
  async (req, res, next) => {
    try {
      const run = await runAgent({
        agentType: 'partc-mapping',
        systemPrompt: mappingAgent.SYSTEM_PROMPT,
        toolDefinitions: mappingAgent.TOOL_DEFINITIONS,
        toolFunctions: mappingAgent.TOOL_FUNCTIONS,
        userMessage: mappingAgent.buildUserMessage(req.body),
        orgId: req.apiKey.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'mapping' }
      });
      res.json({ runId: run.runId, status: run.status, result: run.result,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

module.exports = router;
