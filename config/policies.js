/**
 * CarbonIQ FinTech — RBAC + ABAC Policy Definitions
 *
 * Hybrid Role-Based + Attribute-Based Access Control for multi-stakeholder
 * green finance platform. Follows industry-standard NIST ABAC model (SP 800-162)
 * with role hierarchy from AWS Bedrock / Confluent multi-agent patterns.
 *
 * RBAC: Roles grant baseline permission sets (what you CAN do).
 * ABAC: Attribute rules add contextual constraints (WHEN you can do it).
 *
 * Stakeholders:
 *   - Bank admin           → Full platform control
 *   - Credit officer       → Loan origination, covenant approval, monitoring
 *   - ESG analyst          → Carbon assessment, taxonomy, PCAF, reporting
 *   - Relationship manager → Screening, coaching, read-only on assessments
 *   - Auditor              → Read-only access to all runs and reports
 *   - Borrower             → Self-service coaching and application status
 *   - System integration   → API key-based, scoped by permissions array
 */

'use strict';

// ---------------------------------------------------------------------------
// Permission constants — granular action:resource pairs
// ---------------------------------------------------------------------------

const PERMISSIONS = {
  // Agent operations
  AGENT_SCREEN:       'agent:screen',
  AGENT_UNDERWRITE:   'agent:underwrite',
  AGENT_ORIGINATE:    'agent:originate',
  AGENT_COVENANTS:    'agent:covenants',
  AGENT_MONITOR:      'agent:monitor',
  AGENT_PORTFOLIO:    'agent:portfolio',
  AGENT_COACH:        'agent:coach',
  AGENT_TRIAGE:       'agent:triage',
  AGENT_REVIEW:       'agent:review',

  // Supervisor / pipeline operations
  PIPELINE_CREATE:    'pipeline:create',
  PIPELINE_READ:      'pipeline:read',
  PIPELINE_CANCEL:    'pipeline:cancel',

  // Data operations
  RUNS_READ:          'runs:read',
  RUNS_READ_ALL:      'runs:read_all',
  PROJECT_READ:       'project:read',
  PROJECT_WRITE:      'project:write',
  PORTFOLIO_READ:     'portfolio:read',

  // Admin operations
  API_KEY_MANAGE:     'apikey:manage',
  POLICY_VIEW:        'policy:view',
};

// ---------------------------------------------------------------------------
// Role definitions — each role has a permission set and hierarchy level
// ---------------------------------------------------------------------------

const ROLES = {
  admin: {
    label: 'Bank Administrator',
    level: 100,
    permissions: Object.values(PERMISSIONS), // all permissions
    description: 'Full platform control — user management, API keys, all agent operations',
  },

  credit_officer: {
    label: 'Credit Officer',
    level: 80,
    permissions: [
      PERMISSIONS.AGENT_SCREEN,
      PERMISSIONS.AGENT_UNDERWRITE,
      PERMISSIONS.AGENT_ORIGINATE,
      PERMISSIONS.AGENT_COVENANTS,
      PERMISSIONS.AGENT_MONITOR,
      PERMISSIONS.AGENT_TRIAGE,
      PERMISSIONS.AGENT_REVIEW,
      PERMISSIONS.PIPELINE_CREATE,
      PERMISSIONS.PIPELINE_READ,
      PERMISSIONS.PIPELINE_CANCEL,
      PERMISSIONS.RUNS_READ,
      PERMISSIONS.RUNS_READ_ALL,
      PERMISSIONS.PROJECT_READ,
      PERMISSIONS.PROJECT_WRITE,
      PERMISSIONS.PORTFOLIO_READ,
    ],
    description: 'Loan origination, covenant approval (EU AI Act human-in-the-loop), monitoring',
  },

  esg_analyst: {
    label: 'ESG Analyst',
    level: 60,
    permissions: [
      PERMISSIONS.AGENT_SCREEN,
      PERMISSIONS.AGENT_UNDERWRITE,
      PERMISSIONS.AGENT_ORIGINATE,
      PERMISSIONS.AGENT_COVENANTS,
      PERMISSIONS.AGENT_MONITOR,
      PERMISSIONS.AGENT_PORTFOLIO,
      PERMISSIONS.AGENT_TRIAGE,
      PERMISSIONS.PIPELINE_CREATE,
      PERMISSIONS.PIPELINE_READ,
      PERMISSIONS.RUNS_READ,
      PERMISSIONS.PROJECT_READ,
      PERMISSIONS.PORTFOLIO_READ,
    ],
    description: 'Carbon assessment, taxonomy screening, PCAF reporting, portfolio analysis',
  },

  relationship_manager: {
    label: 'Relationship Manager',
    level: 40,
    permissions: [
      PERMISSIONS.AGENT_SCREEN,
      PERMISSIONS.AGENT_COACH,
      PERMISSIONS.AGENT_TRIAGE,
      PERMISSIONS.PIPELINE_READ,
      PERMISSIONS.RUNS_READ,
      PERMISSIONS.PROJECT_READ,
    ],
    description: 'Client-facing — screening, borrower coaching, read-only on assessments',
  },

  auditor: {
    label: 'Auditor',
    level: 30,
    permissions: [
      PERMISSIONS.RUNS_READ,
      PERMISSIONS.RUNS_READ_ALL,
      PERMISSIONS.PROJECT_READ,
      PERMISSIONS.PORTFOLIO_READ,
      PERMISSIONS.PIPELINE_READ,
      PERMISSIONS.POLICY_VIEW,
    ],
    description: 'Read-only access to all runs, reports, and audit trails',
  },

  borrower: {
    label: 'Borrower',
    level: 10,
    permissions: [
      PERMISSIONS.AGENT_COACH,
      PERMISSIONS.RUNS_READ,
      PERMISSIONS.PROJECT_READ,
    ],
    description: 'Self-service coaching and application status visibility',
  },
};

// Default role when none is specified in JWT claims
const DEFAULT_ROLE = 'relationship_manager';

// ---------------------------------------------------------------------------
// ABAC attribute rules — contextual constraints beyond role permissions
//
// Each rule has:
//   condition(subject, resource, environment) → boolean
//   message — human-readable denial reason
//
// Rules are evaluated AFTER RBAC pass. If ANY rule returns false, access is
// denied even if the role grants the permission.
// ---------------------------------------------------------------------------

const ABAC_RULES = {
  /**
   * Organisation boundary — subjects can only access resources within their org.
   * Bypassed for admin role and auditors with runs:read_all permission.
   */
  orgBoundary: {
    name: 'Organisation Boundary',
    condition: (subject, resource, _env) => {
      if (subject.role === 'admin') return true;
      if (subject.permissions && subject.permissions.includes(PERMISSIONS.RUNS_READ_ALL)) return true;
      if (!resource.orgId) return true; // no org context on this resource
      return subject.orgId === resource.orgId;
    },
    message: 'Access denied: resource belongs to a different organisation.',
  },

  /**
   * Project scope — API keys scoped to specific projectIds can only access
   * those projects. Empty projectIds array means unrestricted.
   */
  projectScope: {
    name: 'Project Scope',
    condition: (subject, resource, _env) => {
      if (!subject.projectIds || subject.projectIds.length === 0) return true;
      if (!resource.projectId) return true; // no project context
      return subject.projectIds.includes(resource.projectId);
    },
    message: 'Access denied: this API key does not have access to the requested project.',
  },

  /**
   * Loan amount threshold — relationship managers cannot originate loans
   * above a configurable threshold (default SGD 50M). Credit officers and
   * above can handle any amount.
   */
  loanAmountThreshold: {
    name: 'Loan Amount Threshold',
    applies: [PERMISSIONS.AGENT_ORIGINATE, PERMISSIONS.AGENT_UNDERWRITE],
    condition: (subject, resource, env) => {
      const threshold = env.loanAmountThreshold || 50_000_000;
      if (subject.roleLevel >= 60) return true; // esg_analyst and above
      if (!resource.loanAmount) return true;     // no amount specified
      return resource.loanAmount <= threshold;
    },
    message: 'Access denied: loan amount exceeds your authorisation threshold. Escalate to a credit officer.',
  },

  /**
   * Human review gate — only credit officers and admins can submit human
   * review decisions (EU AI Act Art. 22 compliance).
   */
  humanReviewGate: {
    name: 'Human Review Gate (EU AI Act Art. 22)',
    applies: [PERMISSIONS.AGENT_REVIEW],
    condition: (subject, _resource, _env) => {
      return subject.roleLevel >= 80; // credit_officer or admin only
    },
    message: 'Access denied: only credit officers and administrators may submit covenant review decisions (EU AI Act Art. 22).',
  },

  /**
   * Pipeline creation — requires minimum esg_analyst level and the
   * pipeline:create permission.
   */
  pipelineCreation: {
    name: 'Pipeline Creation',
    applies: [PERMISSIONS.PIPELINE_CREATE],
    condition: (subject, _resource, _env) => {
      return subject.roleLevel >= 60;
    },
    message: 'Access denied: insufficient role level to create supervisor pipelines.',
  },
};

// ---------------------------------------------------------------------------
// Agent-to-permission mapping — used by routes to look up required permission
// ---------------------------------------------------------------------------

const AGENT_PERMISSION_MAP = {
  screen:       PERMISSIONS.AGENT_SCREEN,
  underwrite:   PERMISSIONS.AGENT_UNDERWRITE,
  originate:    PERMISSIONS.AGENT_ORIGINATE,
  covenants:    PERMISSIONS.AGENT_COVENANTS,
  monitor:      PERMISSIONS.AGENT_MONITOR,
  portfolio:    PERMISSIONS.AGENT_PORTFOLIO,
  coach:        PERMISSIONS.AGENT_COACH,
  triage:       PERMISSIONS.AGENT_TRIAGE,
  review:       PERMISSIONS.AGENT_REVIEW,
};

module.exports = {
  PERMISSIONS,
  ROLES,
  DEFAULT_ROLE,
  ABAC_RULES,
  AGENT_PERMISSION_MAP,
};
