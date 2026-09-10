/**
 * The intake, mapping and disclosure agents.
 */

'use strict';

const { Router } = require('express');

const authenticate   = require('../../../../../platform/auth/authenticate');
const validate     = require('../../../../../platform/http/validate');
const { agentLimiter } = require('../../../../../platform/http/rate-limit');
const requireAI = require('../../../../../platform/http/require-ai');
const { runAgent }        = require('../../../../../platform/ai/agent');
const { forRequest: deadlineFor } = require('../../../../../platform/http/deadline');
const {
  mappingRequestSchema, intakeRequestSchema,
  discloseRequestSchema
} = require('../../schemas/pcaf-partc');
const intakeAgent     = require('../../../agents/intake');
const mappingAgent    = require('../../../agents/mapping');
const disclosureAgent = require('../../../agents/disclosure');
const { documentBlocks } = require('../../../agents/documents');

const router = Router();

// ---------------------------------------------------------------------------
// Agent endpoints — Claude does classification, extraction and mapping.
// Every emissions figure still comes from the deterministic engine.
// ---------------------------------------------------------------------------

router.post('/agent/intake', authenticate, agentLimiter, requireAI,
  validate({ body: intakeRequestSchema }),
  async (req, res, next) => {
    try {
      const clock = deadlineFor(req);

      /* Same reasoning as the mapping route: the policy schedule goes to the
         agent as a document rather than being transcribed first. */
      const blocks = documentBlocks({
        text: req.body.documentText, pdfBase64: req.body.pdfBase64,
        fileId: req.body.fileId, hint: req.body.pageHint
      });

      const instruction = intakeAgent.buildUserMessage({
        documentText: blocks ? '(the policy schedule is the attached document)'
          : (req.body.documentText || ''),
        documentNote: req.body.documentNote,
        projectName:  req.body.projectName
      });

      clock.assertCanStart('read the policy document');

      const run = await runAgent({
        agentType: 'partc-intake',
        systemPrompt: intakeAgent.SYSTEM_PROMPT,
        toolDefinitions: intakeAgent.TOOL_DEFINITIONS,
        toolFunctions: intakeAgent.TOOL_FUNCTIONS,
        userMessage: blocks
          ? [...blocks, { type: 'text', text: instruction }]
          : instruction,
        orgId: req.orgId,
        deadline: clock,
        metadata: { projectName: req.body.projectName || null, stage: 'intake',
                    documentSource: blocks ? 'pdf' : 'text' }
      });

      res.json({ runId: run.runId, status: run.status, result: run.result,
                 documentSource: blocks ? 'pdf' : 'text',
                 elapsedMs: clock.elapsed(),
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

router.post('/agent/map', authenticate, agentLimiter, requireAI,
  validate({ body: mappingRequestSchema }),
  async (req, res, next) => {
    try {
      /* One clock for the whole request — a Netlify function is killed at 26s
         and nothing here used to know that. */
      const clock = deadlineFor(req);

      /* A PDF is handed to the mapping agent directly rather than transcribed
         first. Transcribe-then-map is two sequential model calls, and the
         first ran non-streamed at 16,000 output tokens; the pair could not fit
         inside one invocation, so the process was killed and the browser got
         no body to explain it. Claude reads PDFs natively, so the round-trip
         is unnecessary. */
      const blocks = documentBlocks({
        text: req.body.boqContent, pdfBase64: req.body.pdfBase64,
        fileId: req.body.fileId, hint: req.body.pageHint
      });

      const instruction = mappingAgent.buildUserMessage({
        boqContent:  blocks ? '(the bill of quantities is the attached document)'
          : (req.body.boqContent || ''),
        boqFormat:   blocks ? 'PDF document' : (req.body.boqFormat || 'text'),
        projectName: req.body.projectName
      });

      clock.assertCanStart('map the bill of quantities');

      const run = await runAgent({
        agentType: 'partc-mapping',
        systemPrompt: mappingAgent.SYSTEM_PROMPT,
        toolDefinitions: mappingAgent.TOOL_DEFINITIONS,
        toolFunctions: mappingAgent.TOOL_FUNCTIONS,
        userMessage: blocks
          ? [...blocks, { type: 'text', text: instruction }]
          : instruction,
        orgId: req.orgId,
        deadline: clock,
        callProfile: mappingAgent.CALL_PROFILE,
        metadata: { projectName: req.body.projectName || null, stage: 'mapping',
                    documentSource: blocks ? 'pdf' : 'text' }
      });

      res.json({ runId: run.runId, status: run.status, result: run.result,
                 documentSource: blocks ? 'pdf' : 'text',
                 elapsedMs: clock.elapsed(),
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

router.post('/agent/disclose', authenticate, agentLimiter, requireAI,
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
        orgId: req.orgId,
        metadata: { projectName: req.body.projectName || null, stage: 'disclosure' }
      });
      res.json({ runId: run.runId, status: run.status, memo: run.result,
                 steps: run.steps, tokensUsed: run.tokensUsed, error: run.error });
    } catch (err) { next(err); }
  });

module.exports = router;
