/**
 * CarbonIQ FinTech — Supervisor / Pipeline Tests
 *
 * Tests the multi-agent supervisor orchestrator:
 *   - Pipeline model (record creation, templates)
 *   - Dependency resolution (topological ordering)
 *   - Stage dispatch and failure handling
 *   - Authorization pre-flight for pipeline stages
 */

'use strict';

// Mock Firebase before any requires
jest.mock('../bridge/firebase', () => ({
  getFirebaseAdmin: () => null,
  getDatabase: () => null,
  savePipelineRun: jest.fn().mockResolvedValue(),
  updatePipelineRun: jest.fn().mockResolvedValue(),
  getPipelineRun: jest.fn().mockResolvedValue(null),
  listPipelineRuns: jest.fn().mockResolvedValue([]),
  saveAgentRun: jest.fn().mockResolvedValue(),
  updateAgentRun: jest.fn().mockResolvedValue(),
}));

// Mock agent runner
jest.mock('../bridge/agent', () => ({
  runAgent: jest.fn().mockResolvedValue({
    runId: 'run_mock_123',
    status: 'completed',
    result: 'Mock agent result',
    tokensUsed: { input: 100, output: 50, cacheRead: 10, cacheCreated: 5 },
  }),
  runAgentSingleCall: jest.fn().mockResolvedValue({
    runId: 'run_mock_single_123',
    status: 'completed',
    result: 'Mock single-call result',
    tokensUsed: { input: 50, output: 25, cacheRead: 5, cacheCreated: 2 },
  }),
}));

// Mock all agent modules so supervisor can load them
const mockAgentModule = {
  SYSTEM_PROMPT: 'Mock system prompt',
  TOOL_DEFINITIONS: [],
  TOOL_FUNCTIONS: {},
  buildUserMessage: (input) => JSON.stringify(input),
  buildUserMessageWithResults: (input) => JSON.stringify(input),
};

jest.mock('../services/agents/screening', () => mockAgentModule);
jest.mock('../services/agents/underwriting', () => mockAgentModule);
jest.mock('../services/agents/origination', () => mockAgentModule);
jest.mock('../services/agents/covenants', () => mockAgentModule);
jest.mock('../services/agents/monitoring', () => mockAgentModule);
jest.mock('../services/agents/portfolio', () => mockAgentModule);
jest.mock('../services/agents/borrower-coaching', () => mockAgentModule);
jest.mock('../services/agents/decision-review', () => mockAgentModule);

const {
  PIPELINE_TEMPLATES,
  PIPELINE_STATUS,
  STAGE_STATUS,
  createPipelineRecord,
  generatePipelineId,
} = require('../models/pipeline');

const {
  createAndRunPipeline,
  validatePipelineAccess,
  _getReadyStages,
  _enrichInput,
} = require('../services/supervisor');

const { ROLES, PERMISSIONS } = require('../config/policies');
const { runAgent, runAgentSingleCall } = require('../bridge/agent');

// ---------------------------------------------------------------------------
// Pipeline Model Tests
// ---------------------------------------------------------------------------

describe('Pipeline Model', () => {
  it('generates unique pipeline IDs', () => {
    const id1 = generatePipelineId();
    const id2 = generatePipelineId();
    expect(id1).toMatch(/^pipe_\d+_[a-f0-9]{6}$/);
    expect(id1).not.toBe(id2);
  });

  it('creates a pipeline record from template', () => {
    const record = createPipelineRecord({
      pipelineId: 'pipe_test_1',
      templateId: 'green_loan_origination',
      orgId: 'org1',
      input: { buildingType: 'commercial_office', buildingArea_m2: 5000 },
      subject: { type: 'user', role: 'credit_officer', orgId: 'org1', uid: 'u1' },
    });

    expect(record.pipelineId).toBe('pipe_test_1');
    expect(record.templateId).toBe('green_loan_origination');
    expect(record.status).toBe(PIPELINE_STATUS.PENDING);
    expect(record.stages).toHaveLength(3);
    expect(record.stages[0].stageId).toBe('screen');
    expect(record.stages[1].stageId).toBe('originate');
    expect(record.stages[2].stageId).toBe('covenants');
    expect(record.stages.every(s => s.status === STAGE_STATUS.PENDING)).toBe(true);
  });

  it('throws for unknown template', () => {
    expect(() => createPipelineRecord({
      pipelineId: 'pipe_test_2',
      templateId: 'nonexistent',
      orgId: 'org1',
      input: {},
      subject: { type: 'user', role: 'admin', orgId: 'org1' },
    })).toThrow('Unknown pipeline template');
  });

  it('has correct templates defined', () => {
    expect(PIPELINE_TEMPLATES).toHaveProperty('green_loan_origination');
    expect(PIPELINE_TEMPLATES).toHaveProperty('quick_assessment');
    expect(PIPELINE_TEMPLATES).toHaveProperty('monitoring_review');
  });

  it('quick_assessment has parallel stages', () => {
    const template = PIPELINE_TEMPLATES.quick_assessment;
    // screen and underwrite both have empty requires — run in parallel
    expect(template.stages[0].requires).toEqual([]);
    expect(template.stages[1].requires).toEqual([]);
    // triage depends on both
    expect(template.stages[2].requires).toEqual(['screen', 'underwrite']);
  });
});

// ---------------------------------------------------------------------------
// Dependency Resolution Tests
// ---------------------------------------------------------------------------

describe('_getReadyStages', () => {
  it('returns stages with no dependencies when all are pending', () => {
    const stages = [
      { stageId: 'a', requires: [], status: STAGE_STATUS.PENDING },
      { stageId: 'b', requires: ['a'], status: STAGE_STATUS.PENDING },
    ];
    const ready = _getReadyStages(stages);
    expect(ready).toHaveLength(1);
    expect(ready[0].stageId).toBe('a');
  });

  it('returns multiple parallel stages when their deps are met', () => {
    const stages = [
      { stageId: 'a', requires: [], status: STAGE_STATUS.COMPLETED },
      { stageId: 'b', requires: [], status: STAGE_STATUS.PENDING },
      { stageId: 'c', requires: [], status: STAGE_STATUS.PENDING },
    ];
    const ready = _getReadyStages(stages);
    expect(ready).toHaveLength(2);
    expect(ready.map(s => s.stageId).sort()).toEqual(['b', 'c']);
  });

  it('returns downstream stage when all deps completed', () => {
    const stages = [
      { stageId: 'a', requires: [], status: STAGE_STATUS.COMPLETED },
      { stageId: 'b', requires: [], status: STAGE_STATUS.COMPLETED },
      { stageId: 'c', requires: ['a', 'b'], status: STAGE_STATUS.PENDING },
    ];
    const ready = _getReadyStages(stages);
    expect(ready).toHaveLength(1);
    expect(ready[0].stageId).toBe('c');
  });

  it('returns empty when stages are running or failed', () => {
    const stages = [
      { stageId: 'a', requires: [], status: STAGE_STATUS.RUNNING },
      { stageId: 'b', requires: ['a'], status: STAGE_STATUS.PENDING },
    ];
    const ready = _getReadyStages(stages);
    expect(ready).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Input Enrichment Tests
// ---------------------------------------------------------------------------

describe('_enrichInput', () => {
  it('returns input unchanged when no prior results', () => {
    const input = { buildingType: 'office' };
    expect(_enrichInput(input, {})).toEqual(input);
  });

  it('enriches with screening result', () => {
    const input = { buildingType: 'office' };
    const priorResults = {
      screen: { status: 'completed', result: 'Go' },
    };
    const enriched = _enrichInput(input, priorResults);
    expect(enriched._priorScreeningResult).toBe('Go');
    expect(enriched.buildingType).toBe('office');
  });

  it('enriches with origination result for covenants', () => {
    const input = { buildingType: 'office' };
    const priorResults = {
      originate: { status: 'completed', result: 'Decision Package' },
    };
    const enriched = _enrichInput(input, priorResults);
    expect(enriched._priorOriginationResult).toBe('Decision Package');
  });
});

// ---------------------------------------------------------------------------
// Pipeline Access Validation Tests
// ---------------------------------------------------------------------------

describe('validatePipelineAccess', () => {
  it('allows admin to access all pipeline stages', () => {
    const subject = {
      role: 'admin', roleLevel: 100,
      permissions: ROLES.admin.permissions,
      orgId: 'org1',
    };
    const template = PIPELINE_TEMPLATES.green_loan_origination;
    const result = validatePipelineAccess(subject, template, { orgId: 'org1' });
    expect(result.allowed).toBe(true);
    expect(result.denied).toHaveLength(0);
  });

  it('denies borrower from origination pipeline', () => {
    const subject = {
      role: 'borrower', roleLevel: 10,
      permissions: ROLES.borrower.permissions,
      orgId: 'org1',
    };
    const template = PIPELINE_TEMPLATES.green_loan_origination;
    const result = validatePipelineAccess(subject, template, { orgId: 'org1' });
    expect(result.allowed).toBe(false);
    expect(result.denied.length).toBeGreaterThan(0);
  });

  it('allows credit officer to access origination pipeline', () => {
    const subject = {
      role: 'credit_officer', roleLevel: 80,
      permissions: ROLES.credit_officer.permissions,
      orgId: 'org1',
    };
    const template = PIPELINE_TEMPLATES.green_loan_origination;
    const result = validatePipelineAccess(subject, template, { orgId: 'org1' });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pipeline Execution Tests
// ---------------------------------------------------------------------------

describe('createAndRunPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runAgent.mockResolvedValue({
      runId: 'run_mock_123',
      status: 'completed',
      result: 'Mock result',
      tokensUsed: { input: 100, output: 50, cacheRead: 10, cacheCreated: 5 },
    });
    runAgentSingleCall.mockResolvedValue({
      runId: 'run_mock_single_123',
      status: 'completed',
      result: 'Mock screening result',
      tokensUsed: { input: 50, output: 25, cacheRead: 5, cacheCreated: 2 },
    });
  });

  it('executes green_loan_origination pipeline end-to-end', async () => {
    const pipeline = await createAndRunPipeline({
      templateId: 'green_loan_origination',
      input: { buildingType: 'commercial_office', buildingArea_m2: 5000, region: 'Singapore' },
      subject: {
        type: 'user', role: 'credit_officer', roleLevel: 80,
        permissions: ROLES.credit_officer.permissions, orgId: 'org1',
      },
      orgId: 'org1',
    });

    // Screening uses single call, origination and covenants use runAgent
    expect(runAgentSingleCall).toHaveBeenCalledTimes(1);
    // Covenants stage pauses for human review, so pipeline should be paused
    // (because mock returns 'completed' and covenant handler sets to paused)
    expect(pipeline.stages[0].status).toBe(STAGE_STATUS.COMPLETED);
    expect(pipeline.stages[1].status).toBe(STAGE_STATUS.COMPLETED);
    // Covenant stage should be paused (human review gate)
    expect(pipeline.stages[2].status).toBe(STAGE_STATUS.PAUSED);
    expect(pipeline.status).toBe(PIPELINE_STATUS.PAUSED);
  });

  it('executes quick_assessment with parallel stages', async () => {
    const pipeline = await createAndRunPipeline({
      templateId: 'quick_assessment',
      input: { buildingType: 'residential_high_rise', buildingArea_m2: 10000, region: 'Singapore' },
      subject: {
        type: 'user', role: 'credit_officer', roleLevel: 80,
        permissions: ROLES.credit_officer.permissions, orgId: 'org1',
      },
      orgId: 'org1',
    });

    // Screen and underwrite run in parallel (both have no requires)
    expect(pipeline.stages[0].status).toBe(STAGE_STATUS.COMPLETED);
    expect(pipeline.stages[1].status).toBe(STAGE_STATUS.COMPLETED);
    expect(pipeline.stages[2].status).toBe(STAGE_STATUS.COMPLETED);
    expect(pipeline.status).toBe(PIPELINE_STATUS.COMPLETED);
  });

  it('rejects pipeline when caller lacks permissions', async () => {
    await expect(createAndRunPipeline({
      templateId: 'green_loan_origination',
      input: { buildingType: 'commercial_office', buildingArea_m2: 5000 },
      subject: {
        type: 'user', role: 'borrower', roleLevel: 10,
        permissions: ROLES.borrower.permissions, orgId: 'org1',
      },
      orgId: 'org1',
    })).rejects.toThrow('Pipeline authorization failed');
  });

  it('handles agent failure in required stage', async () => {
    runAgentSingleCall.mockResolvedValueOnce({
      runId: 'run_fail',
      status: 'failed',
      result: null,
      error: 'Agent crashed',
      tokensUsed: { input: 10, output: 0, cacheRead: 0, cacheCreated: 0 },
    });

    const pipeline = await createAndRunPipeline({
      templateId: 'green_loan_origination',
      input: { buildingType: 'commercial_office', buildingArea_m2: 5000, region: 'Singapore' },
      subject: {
        type: 'user', role: 'credit_officer', roleLevel: 80,
        permissions: ROLES.credit_officer.permissions, orgId: 'org1',
      },
      orgId: 'org1',
    });

    expect(pipeline.status).toBe(PIPELINE_STATUS.FAILED);
    expect(pipeline.stages[0].status).toBe(STAGE_STATUS.FAILED);
    // Downstream stages should be skipped
    expect(pipeline.stages[1].status).toBe(STAGE_STATUS.SKIPPED);
    expect(pipeline.stages[2].status).toBe(STAGE_STATUS.SKIPPED);
  });

  it('accumulates tokens across all stages', async () => {
    const pipeline = await createAndRunPipeline({
      templateId: 'quick_assessment',
      input: { buildingType: 'residential_low_rise', buildingArea_m2: 500, region: 'Singapore' },
      subject: {
        type: 'user', role: 'credit_officer', roleLevel: 80,
        permissions: ROLES.credit_officer.permissions, orgId: 'org1',
      },
      orgId: 'org1',
    });

    // 3 stages: screening (single call) + underwriting + triage
    expect(pipeline.tokensUsed.input).toBeGreaterThan(0);
    expect(pipeline.tokensUsed.output).toBeGreaterThan(0);
  });
});
