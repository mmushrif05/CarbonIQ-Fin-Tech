/**
 * CarbonIQ FinTech — PCAF Part C Registry
 *
 * The insurer's book above the calculation engine: settings, clients, and
 * projects with the policies written against them.
 *
 * The domain rules that matter live here rather than in the route handlers:
 *   · the reporting year of a policy is its INCEPTION year (agreed convention)
 *   · the scope gate can be previewed before any assessment is run, so an
 *     underwriter sees which modules a policy will produce
 *   · a project may carry several policies over its life — CAR through
 *     construction, then IDI for ten years — without duplicating the asset
 */

'use strict';

const crypto = require('crypto');
const store  = require('./partc-store');
const { hasUseStage } = require('./pcaf-partc/policy-gate');

const { RECALCULATION_TRIGGERS } = require('../schemas/partc-registry');

const CLIENTS  = 'clients';
const PROJECTS = 'projects';
const SETTINGS = 'settings';

const _id = prefix => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const _now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  insurerName: 'Unnamed insurer',
  reportingYear: new Date().getFullYear(),
  currency: 'LKR',
  region: 'Sri Lanka',
  premiumBasis: 'gross',
  restatementThresholdPct: 5,
  reportingYearConvention: 'inception',
  /* A disclosure must state its recalculation protocol and its significance
     threshold, so both carry a default rather than being absent until an
     insurer thinks to set them. The base year is deliberately null until
     stated: inventing one would be a claim about history. */
  baseYear: null,
  significanceThresholdPct: 5,
  recalculationTriggers: RECALCULATION_TRIGGERS,
  recalculationPolicy: ''
};

async function getSettings(orgId) {
  const stored = await store.get(SETTINGS, orgId, 'default');
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

async function saveSettings(orgId, settings) {
  const record = { ...DEFAULT_SETTINGS, ...settings, id: 'default', orgId, updatedAt: _now() };
  await store.put(SETTINGS, orgId, 'default', record);
  return record;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

async function createClient(orgId, data) {
  const record = { ...data, clientId: _id('cl'), orgId, createdAt: _now(), updatedAt: _now() };
  await store.put(CLIENTS, orgId, record.clientId, record);
  return record;
}

async function getClient(orgId, clientId) {
  return store.get(CLIENTS, orgId, clientId);
}

/** Clients with a project count, so the list is useful without a second call. */
async function listClients(orgId) {
  const [clients, projects] = await Promise.all([
    store.list(CLIENTS, orgId),
    store.list(PROJECTS, orgId)
  ]);
  return clients
    .map(c => ({
      ...c,
      projectCount: projects.filter(p => p.clientId === c.clientId).length,
      policyCount:  projects.filter(p => p.clientId === c.clientId)
                            .reduce((n, p) => n + (p.policies || []).length, 0)
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function updateClient(orgId, clientId, updates) {
  return store.patch(CLIENTS, orgId, clientId, updates);
}

/**
 * A client with projects attached cannot be removed — the projects would be
 * orphaned and their assessments would lose the party they were written for.
 */
async function deleteClient(orgId, clientId) {
  const projects = await listProjects(orgId, { clientId });
  if (projects.length > 0) {
    const err = new Error(`Client has ${projects.length} project(s). Remove or reassign them first.`);
    err.statusCode = 409;
    err.code = 'CLIENT_HAS_PROJECTS';
    throw err;
  }
  await store.remove(CLIENTS, orgId, clientId);
  return { deleted: true, clientId };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function createProject(orgId, data) {
  const client = await getClient(orgId, data.clientId);
  if (!client) {
    const err = new Error(`No client ${data.clientId} in this organisation.`);
    err.statusCode = 404; err.code = 'CLIENT_NOT_FOUND';
    throw err;
  }

  const policies = (data.policies || []).map(p => _decoratePolicy(p));
  const record = {
    ...data, policies,
    projectId: _id('pj'), orgId, clientName: client.name,
    createdAt: _now(), updatedAt: _now()
  };
  await store.put(PROJECTS, orgId, record.projectId, record);
  return record;
}

async function getProject(orgId, projectId) {
  return store.get(PROJECTS, orgId, projectId);
}

async function listProjects(orgId, { clientId, reportingYear } = {}) {
  let projects = await store.list(PROJECTS, orgId);
  if (clientId) projects = projects.filter(p => p.clientId === clientId);
  if (reportingYear) {
    projects = projects.filter(p =>
      (p.policies || []).some(pol => pol.reportingYear === Number(reportingYear)));
  }
  return projects.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function updateProject(orgId, projectId, updates) {
  const patch = { ...updates };
  if (patch.policies) patch.policies = patch.policies.map(p => _decoratePolicy(p));
  return store.patch(PROJECTS, orgId, projectId, patch);
}

async function deleteProject(orgId, projectId) {
  await store.remove(PROJECTS, orgId, projectId);
  return { deleted: true, projectId };
}

// ---------------------------------------------------------------------------
// Policies — held on the project
// ---------------------------------------------------------------------------

/**
 * Derive everything that follows from a policy's own fields, so the UI and
 * the assessment layer never have to re-derive it inconsistently.
 */
function _decoratePolicy(policy) {
  const inception = policy.inception ? new Date(policy.inception) : null;
  const useStage  = hasUseStage(policy.lineType);

  return {
    ...policy,
    policyId: policy.policyId || _id('pol'),
    // Agreed convention: the figure lands in the year the policy incepts.
    reportingYear: inception && !isNaN(inception) ? inception.getUTCFullYear() : null,
    scope: {
      useStageApplies: useStage,
      modules: useStage ? ['A4', 'A5', 'B1', 'B4', 'B7'] : ['A4', 'A5'],
      useStageYears: useStage ? (Number(policy.yearsOfCover) || 10) : 0,
      note: useStage
        ? 'Use stage applies. B1, B4 and B7 will be computed and reported as a separate line.'
        : `${policy.lineType} covers construction only. B1, B4 and B7 are zero by scope rule, not by omission.`
    }
  };
}

async function addPolicy(orgId, projectId, policy) {
  const project = await getProject(orgId, projectId);
  if (!project) {
    const err = new Error(`No project ${projectId}.`);
    err.statusCode = 404; err.code = 'PROJECT_NOT_FOUND';
    throw err;
  }
  const policies = [...(project.policies || []), _decoratePolicy(policy)];
  return store.patch(PROJECTS, orgId, projectId, { policies });
}

async function removePolicy(orgId, projectId, policyId) {
  const project = await getProject(orgId, projectId);
  if (!project) return null;
  const policies = (project.policies || []).filter(p => p.policyId !== policyId);
  return store.patch(PROJECTS, orgId, projectId, { policies });
}

/**
 * Every policy in the book for a reporting year, flattened with its project
 * and client. This is what the portfolio roll-up will consume in W5.
 */
async function listPolicies(orgId, { reportingYear } = {}) {
  const projects = await listProjects(orgId);
  const rows = [];
  for (const project of projects) {
    for (const policy of project.policies || []) {
      if (reportingYear && policy.reportingYear !== Number(reportingYear)) continue;
      rows.push({
        ...policy,
        projectId: project.projectId, projectName: project.name,
        clientId: project.clientId,   clientName: project.clientName,
        gifa_m2: project.gifa_m2,     projectCost: project.projectCost,
        projectType: project.projectType, location: project.location
      });
    }
  }
  return rows.sort((a, b) => String(a.inception).localeCompare(String(b.inception)));
}

/**
 * Everything the assessment engine needs to run this policy, assembled from
 * the registry so the client is never asked again for what is already known.
 */
async function buildAssessmentContext(orgId, projectId, policyId) {
  const project = await getProject(orgId, projectId);
  if (!project) return null;
  const policy = (project.policies || []).find(p => p.policyId === policyId);
  if (!policy) return null;

  const settings = await getSettings(orgId);
  const netMode  = settings.premiumBasis === 'net';

  return {
    project: {
      projectId: project.projectId, name: project.name, clientId: project.clientId,
      clientName: project.clientName, projectType: project.projectType,
      gifa_m2: project.gifa_m2, projectCost: project.projectCost, location: project.location
    },
    policy,
    reportingYear: policy.reportingYear,
    /** Shape the engine's runPartC() expects for the policy block. */
    enginePolicy: {
      policyType:  policy.lineType,
      basis:       'project_specific',
      premium:     policy.premium,
      projectCost: project.projectCost,
      yearsOfCover: policy.scope.useStageYears,
      ...(netMode && policy.reinsuranceCeded > 0 ? { reinsuranceCeded: policy.reinsuranceCeded } : {})
    },
    prefill: { gifa_m2: project.gifa_m2, policyType: policy.lineType,
               yearsOfCover: policy.scope.useStageYears },
    settings
  };
}

module.exports = {
  getSettings, saveSettings, DEFAULT_SETTINGS,
  createClient, getClient, listClients, updateClient, deleteClient,
  createProject, getProject, listProjects, updateProject, deleteProject,
  addPolicy, removePolicy, listPolicies, buildAssessmentContext,
  _decoratePolicy
};
