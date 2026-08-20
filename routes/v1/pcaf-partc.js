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

const { Router }   = require('express');
const apiKeyAuth   = require('../../middleware/api-key');
const validate     = require('../../middleware/validate');
const { defaultLimiter, agentLimiter } = require('../../middleware/rate-limit');

const { runPartC }        = require('../../services/pcaf-partc');
const { buildRegisters }  = require('../../services/partc-registers');
const { buildForm, formAnswersToEngineInput } = require('../../services/agents/partc/form');
const runStore            = require('../../services/partc-run-store');
const factors             = require('../../services/pcaf-partc/factors');
const { conformanceMatrix } = require('../../services/pcaf-partc/conformance');
const { buildMethodology } = require('../../services/partc-methodology');
const { buildMethodologyPDF, buildMethodologyDOCX } = require('../../services/partc-methodology-doc');
const { buildPartCReport, buildPartCPDF, buildPartCDOCX } = require('../../services/partc-reports');
const partcRegistry = require('../../services/partc-registry');
const { recordLearnings } = require('../../services/learning-store');
const { runAgent }        = require('../../bridge/agent');
const {
  createPartCRun, addStep, generatePartCRunId, isAwaitingInputs,
  PARTC_STATUS, PARTC_STEP_TYPES
} = require('../../models/partc-run');

const {
  assessRequestSchema, formRequestSchema, reportRequestSchema,
  mappingRequestSchema, intakeRequestSchema,
  startRunRequestSchema, resumeRunRequestSchema, discloseRequestSchema
} = require('../../schemas/pcaf-partc');

const intakeAgent     = require('../../services/agents/partc/intake');
const mappingAgent    = require('../../services/agents/partc/mapping');
const disclosureAgent = require('../../services/agents/partc/disclosure');
const { readDocument } = require('../../services/agents/partc/documents');
const config           = require('../../config');

/**
 * The agent endpoints need a Claude API key; the engine endpoints never do.
 * Say so plainly rather than surfacing a generic failure — the deterministic
 * half of the product still works without one, and the caller should be told
 * exactly that.
 */
function requireAI(_req, res, next) {
  if (config.anthropicApiKey) return next();
  return res.status(503).json({
    error: 'AI_UNAVAILABLE',
    message: 'ANTHROPIC_API_KEY is not configured, so document reading, classification and BOQ mapping are unavailable.',
    remedy: 'Set ANTHROPIC_API_KEY, or supply the policy fields and mapped materials directly — the calculation engine is deterministic and needs no API key.',
    unaffected: ['POST /v1/pcaf/part-c/assess', 'POST /v1/pcaf/part-c/runs/start',
                 'POST /v1/pcaf/part-c/runs/:runId/resume', 'POST /v1/pcaf/part-c/report',
                 'GET /v1/pcaf/part-c/factors', 'GET /v1/pcaf/part-c/conformance',
                 'GET /v1/pcaf/part-c/methodology']
  });
}

const router = Router();

/** Shape the client-facing response from an engine result. */
function _shapeResult(result, registers, extra = {}) {
  return {
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
    // PCAF requires a score beside any disclosed figure, so the scoring
    // travels with the figures rather than being fetched separately.
    dqScoring:  result.dqScoring || null,
    dqStatement: result.dqDisclosureStatement || null,
    disclosureNote: result.disclosureNote,
    sensitivity: result.sensitivity,
    vehicle:     result.vehicle,
    registers,
    generatedAt: result.generatedAt,
    ...extra
  };
}

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
/**
 * GET /methodology — how the calculation works, as JSON, PDF or Word.
 *
 * Reachable without running an assessment. A reviewer asked to accept a
 * figure should be able to read the method that produced it first, and
 * everything here is extracted from an execution of the engine rather than
 * written alongside it.
 */
router.get('/methodology', apiKeyAuth, defaultLimiter, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    if (!['json', 'pdf', 'docx'].includes(format)) {
      return res.status(400).json({
        error: 'UNSUPPORTED_FORMAT',
        message: `Format "${format}" is not supported.`,
        remedy: 'Use format=json, format=pdf or format=docx.'
      });
    }

    const methodology = buildMethodology();
    if (format === 'json') return res.json({ methodology });

    if (format === 'docx') {
      const buffer = await buildMethodologyDOCX(methodology);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename="pcaf-part-c-methodology.docx"');
      return res.send(buffer);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="pcaf-part-c-methodology.pdf"');
    buildMethodologyPDF(methodology).pipe(res);
  } catch (err) { next(err); }
});

// GET /conformance — what this engine claims, where it lives, what proves it
//
// Published so a reviewer can check the claim rather than take it on trust:
// every rule names the code that enforces it and the test that proves it.
// ---------------------------------------------------------------------------
router.get('/conformance', apiKeyAuth, defaultLimiter, (_req, res) => {
  res.json(conformanceMatrix());
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
        await runStore.saveRun(orgId, run).catch(() => {});

        learnings = await recordLearnings({
          orgId, runId, result,
          context: req.body.context,
          materials: req.body.materials
        }).catch(() => null);
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
router.post('/report', apiKeyAuth, defaultLimiter,
  validate({ body: reportRequestSchema }),
  async (req, res, next) => {
    try {
      const result    = runPartC(_toEngineInput(req.body));
      const registers = buildRegisters(result);
      /* The reporting entity's own settings — base year, significance
         threshold, recalculation protocol, currency. A Part C disclosure
         must state them, and they belong to the entity rather than to the
         request, so the report reads them from the book. */
      const settings  = await partcRegistry.getSettings(req.apiKey.orgId).catch(() => ({}));
      const report    = buildPartCReport({
        result, registers, settings, memo: req.body.memo,
        meta: {
          projectName: req.body.projectName,
          insurer: settings.insurerName || null,
          reportingYear: settings.reportingYear,
          currency: settings.currency,
          /* The economics the report needs for attribution, per-policy detail
             and intensity are already in the request as the engine's inputs;
             carrying them into the meta means an intensity section that is
             real rather than "not available". */
          premium:     (req.body.policy || {}).premium,
          projectCost: (req.body.policy || {}).projectCost,
          gifa_m2:     (req.body.siteInputs || {}).gifa_m2,
          ...req.body.meta
        },
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
// POST /runs/start — begin a run and pause for client input
//
// This is the pause point that makes the flow agentic rather than batch: the
// documents have been read and mapped, the form is built and gated, and the
// run now waits for the client. It may wait across sessions.
// ---------------------------------------------------------------------------
router.post('/runs/start', apiKeyAuth, defaultLimiter,
  validate({ body: startRunRequestSchema }),
  async (req, res, next) => {
    try {
      const orgId = req.apiKey.orgId;
      const runId = generatePartCRunId();

      const form = buildForm({
        policy:    req.body.policy,
        materials: req.body.materials,
        prefill:   req.body.prefill
      });

      const run = createPartCRun({ runId, orgId, projectName: req.body.projectName });
      run.policy          = req.body.policy;
      run.materials       = req.body.materials;
      run.demolitionItems = req.body.demolitionItems;
      run.form            = form;
      run.context         = req.body.context;
      run.status          = PARTC_STATUS.AWAITING_INPUTS;

      addStep(run, {
        type: PARTC_STEP_TYPES.FORM,
        summary: `Form built for a ${form.policyType || 'unclassified'} policy — ` +
                 `${form.summary.fieldsToAnswer} fields to answer, ` +
                 `${form.summary.hiddenSections} section(s) hidden by the policy gate.`
      });

      const { durable } = await runStore.saveRun(orgId, run);

      res.status(201).json({
        runId,
        status: run.status,
        projectName: run.projectName,
        form,
        durable,
        next: `POST /v1/pcaf/part-c/runs/${runId}/resume with the completed answers`,
        ...(durable ? {} : { warning: 'Firebase is not configured — this run is held in memory only and will not survive a restart.' })
      });
    } catch (err) { next(err); }
  });

// ---------------------------------------------------------------------------
// POST /runs/:runId/resume — the client has answered; compute and complete
// ---------------------------------------------------------------------------
router.post('/runs/:runId/resume', apiKeyAuth, defaultLimiter,
  validate({ body: resumeRunRequestSchema }),
  async (req, res, next) => {
    const orgId = req.apiKey.orgId;
    const { runId } = req.params;
    try {
      const run = await runStore.getRun(orgId, runId);
      if (!run) {
        return res.status(404).json({ error: 'RUN_NOT_FOUND', message: `No Part C run ${runId}.` });
      }
      if (!isAwaitingInputs(run)) {
        return res.status(409).json({
          error: 'RUN_NOT_AWAITING_INPUTS',
          message: `Run ${runId} is "${run.status}", not awaiting client input. A completed run cannot be resumed; start a new one.`,
          status: run.status
        });
      }

      // Client factor overrides apply for this calculation only.
      const overrides = req.body.overrides || {};
      const hadOverrides = Object.keys(overrides).length > 0;
      if (hadOverrides) factors.setOverrides(overrides);

      let result, registers;
      try {
        const input = formAnswersToEngineInput({
          policy:          run.policy || {},
          materials:       run.materials || [],
          demolitionItems: run.demolitionItems || [],
          answers:         req.body.answers
        });
        input.hasEPD = req.body.hasEPD;
        result    = runPartC(input);
        registers = buildRegisters(result);
      } finally {
        if (hadOverrides) factors.setOverrides({});
      }

      const learnings = await recordLearnings({
        orgId, runId, result,
        context:   run.context || {},
        materials: run.materials || [],
        overrides
      }).catch(() => null);

      const completedAt = new Date().toISOString();
      const updates = {
        status:      PARTC_STATUS.COMPLETED,
        formAnswers: req.body.answers,
        overrides,
        result:      result.summary,
        registers:   registers.badges,
        disclosure:  result.disclosureNote,
        learnings:   learnings ? learnings.counts : null,
        completedAt,
        updatedAt:   completedAt
      };
      await runStore.updateRun(orgId, runId, updates);

      res.json(_shapeResult(result, registers, {
        runId,
        status: PARTC_STATUS.COMPLETED,
        projectName: run.projectName || null,
        learnings: learnings ? learnings.counts : null
      }));
    } catch (err) {
      await runStore.updateRun(orgId, runId, {
        status: PARTC_STATUS.FAILED, error: err.message, updatedAt: new Date().toISOString()
      }).catch(() => {});
      next(err);
    }
  });

// ---------------------------------------------------------------------------
// GET /runs, GET /runs/:runId
// ---------------------------------------------------------------------------
router.get('/runs', apiKeyAuth, defaultLimiter, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    res.json({ runs: await runStore.listRuns(req.apiKey.orgId, limit) });
  } catch (err) { next(err); }
});

router.get('/runs/:runId', apiKeyAuth, defaultLimiter, async (req, res, next) => {
  try {
    const run = await runStore.getRun(req.apiKey.orgId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'RUN_NOT_FOUND', message: `No Part C run ${req.params.runId}.` });
    res.json({ run });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Agent endpoints — Claude does classification, extraction and mapping.
// Every emissions figure still comes from the deterministic engine.
// ---------------------------------------------------------------------------

router.post('/agent/intake', apiKeyAuth, agentLimiter, requireAI,
  validate({ body: intakeRequestSchema }),
  async (req, res, next) => {
    try {
      const doc = await readDocument({
        text: req.body.documentText, pdfBase64: req.body.pdfBase64,
        fileId: req.body.fileId, hint: req.body.pageHint
      });

      const run = await runAgent({
        agentType: 'partc-intake',
        systemPrompt: intakeAgent.SYSTEM_PROMPT,
        toolDefinitions: intakeAgent.TOOL_DEFINITIONS,
        toolFunctions: intakeAgent.TOOL_FUNCTIONS,
        userMessage: intakeAgent.buildUserMessage({
          documentText: doc.text,
          documentNote: req.body.documentNote,
          projectName:  req.body.projectName
        }),
        orgId: req.apiKey.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'intake', documentSource: doc.source }
      });
      res.json({ runId: run.runId, status: run.status, result: run.result,
                 documentSource: doc.source, documentChars: doc.text.length,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

router.post('/agent/map', apiKeyAuth, agentLimiter, requireAI,
  validate({ body: mappingRequestSchema }),
  async (req, res, next) => {
    try {
      const doc = await readDocument({
        text: req.body.boqContent, pdfBase64: req.body.pdfBase64,
        fileId: req.body.fileId, hint: req.body.pageHint
      });

      const run = await runAgent({
        agentType: 'partc-mapping',
        systemPrompt: mappingAgent.SYSTEM_PROMPT,
        toolDefinitions: mappingAgent.TOOL_DEFINITIONS,
        toolFunctions: mappingAgent.TOOL_FUNCTIONS,
        userMessage: mappingAgent.buildUserMessage({
          boqContent:  doc.text,
          boqFormat:   doc.source === 'text' ? (req.body.boqFormat || 'text') : 'transcribed PDF',
          projectName: req.body.projectName
        }),
        orgId: req.apiKey.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'mapping', documentSource: doc.source }
      });
      res.json({ runId: run.runId, status: run.status, result: run.result,
                 documentSource: doc.source, documentChars: doc.text.length,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

router.post('/agent/disclose', apiKeyAuth, agentLimiter, requireAI,
  validate({ body: discloseRequestSchema }),
  async (req, res, next) => {
    try {
      const run = await runAgent({
        agentType: 'partc-disclosure',
        systemPrompt: disclosureAgent.SYSTEM_PROMPT,
        toolDefinitions: disclosureAgent.TOOL_DEFINITIONS,
        toolFunctions: disclosureAgent.TOOL_FUNCTIONS,
        userMessage: disclosureAgent.buildUserMessage({
          projectName:   req.body.projectName,
          policySummary: req.body.policySummary,
          materialCount: (req.body.materials || []).length,
          note:          req.body.note
        }),
        orgId: req.apiKey.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'disclosure' }
      });
      res.json({ runId: run.runId, status: run.status, memo: run.result,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

module.exports = router;
