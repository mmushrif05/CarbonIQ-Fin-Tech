/**
 * CarbonIQ FinTech — Hybrid RBAC + ABAC Authorization Middleware
 *
 * Evaluates access decisions using a two-pass model:
 *   Pass 1 (RBAC): Does the subject's role grant the required permission?
 *   Pass 2 (ABAC): Do all applicable attribute rules pass?
 *
 * Works with both JWT-authenticated users (req.user) and API key-authenticated
 * integrations (req.apiKey). The middleware normalises both into a unified
 * "subject" object for policy evaluation.
 *
 * Usage:
 *   router.post('/originate', authorize('agent:originate'), handler)
 *   router.post('/originate', authorize('agent:originate', { extractResource }), handler)
 */

'use strict';

const { ROLES, DEFAULT_ROLE, ABAC_RULES, PERMISSIONS } = require('../config/policies');

// ---------------------------------------------------------------------------
// Subject normalisation — unify JWT users and API keys into one shape
// ---------------------------------------------------------------------------

/**
 * Build a normalised subject from the request.
 *
 * @param {Object} req - Express request (after auth middleware)
 * @returns {Object} { role, roleLevel, permissions, orgId, projectIds }
 */
function buildSubject(req) {
  // JWT-authenticated user
  if (req.user) {
    const roleName = req.user.role || DEFAULT_ROLE;
    const roleDef  = ROLES[roleName] || ROLES[DEFAULT_ROLE];
    return {
      type:        'user',
      uid:         req.user.uid,
      email:       req.user.email,
      role:        roleName,
      roleLevel:   roleDef.level,
      permissions: roleDef.permissions,
      orgId:       req.user.organizationId || null,
      projectIds:  [],
    };
  }

  // API key-authenticated integration
  if (req.apiKey) {
    // API keys carry explicit permissions. Map legacy permission names
    // to the new action:resource format for backwards compatibility.
    const rawPerms   = req.apiKey.permissions || [];
    const mappedPerms = _mapLegacyPermissions(rawPerms);
    // API keys also carry an optional role field for RBAC evaluation
    const roleName = req.apiKey.role || null;
    const roleDef  = roleName && ROLES[roleName] ? ROLES[roleName] : null;
    // If the API key has a role, merge role permissions with explicit permissions
    const rolePerms = roleDef ? roleDef.permissions : [];
    const allPerms  = [...new Set([...mappedPerms, ...rolePerms])];

    return {
      type:        'apikey',
      orgId:       req.apiKey.orgId,
      orgName:     req.apiKey.orgName,
      role:        roleName || 'system',
      roleLevel:   roleDef ? roleDef.level : 50, // system integrations default to mid-level
      permissions: allPerms,
      projectIds:  req.apiKey.projectIds || [],
    };
  }

  // No auth context — should not happen if auth middleware runs first
  return {
    type:        'anonymous',
    role:        'none',
    roleLevel:   0,
    permissions: [],
    orgId:       null,
    projectIds:  [],
  };
}

/**
 * Map legacy flat permission names (e.g. 'read', 'agent', 'assess')
 * to the new action:resource format. Keeps backwards compatibility
 * with existing API keys stored in Firebase.
 */
function _mapLegacyPermissions(perms) {
  const mapped = [];
  for (const p of perms) {
    // Already in new format (contains a colon)
    if (p.includes(':')) {
      mapped.push(p);
      continue;
    }
    // Legacy mappings
    switch (p) {
      case 'agent':
        // Legacy 'agent' permission grants all agent operations
        mapped.push(
          PERMISSIONS.AGENT_SCREEN, PERMISSIONS.AGENT_UNDERWRITE,
          PERMISSIONS.AGENT_ORIGINATE, PERMISSIONS.AGENT_COVENANTS,
          PERMISSIONS.AGENT_MONITOR, PERMISSIONS.AGENT_PORTFOLIO,
          PERMISSIONS.AGENT_COACH, PERMISSIONS.AGENT_TRIAGE,
          PERMISSIONS.AGENT_REVIEW,
          PERMISSIONS.PIPELINE_CREATE, PERMISSIONS.PIPELINE_READ,
        );
        break;
      case 'read':
        mapped.push(PERMISSIONS.RUNS_READ, PERMISSIONS.PROJECT_READ, PERMISSIONS.PORTFOLIO_READ, PERMISSIONS.PIPELINE_READ);
        break;
      case 'write':
        mapped.push(PERMISSIONS.PROJECT_WRITE);
        break;
      case 'assess':
        mapped.push(PERMISSIONS.AGENT_UNDERWRITE, PERMISSIONS.AGENT_ORIGINATE, PERMISSIONS.AGENT_SCREEN);
        break;
      case 'pcaf':
        mapped.push(PERMISSIONS.AGENT_UNDERWRITE, PERMISSIONS.AGENT_ORIGINATE);
        break;
      case 'taxonomy':
        mapped.push(PERMISSIONS.AGENT_SCREEN, PERMISSIONS.AGENT_UNDERWRITE);
        break;
      case 'covenant':
        mapped.push(PERMISSIONS.AGENT_COVENANTS, PERMISSIONS.AGENT_MONITOR);
        break;
      case 'portfolio':
        mapped.push(PERMISSIONS.AGENT_PORTFOLIO, PERMISSIONS.PORTFOLIO_READ);
        break;
      default:
        // Unknown legacy permission — pass through
        mapped.push(p);
    }
  }
  return [...new Set(mapped)];
}

// ---------------------------------------------------------------------------
// RBAC check — does the subject's permission set include the required one?
// ---------------------------------------------------------------------------

function _checkRBAC(subject, requiredPermission) {
  return subject.permissions.includes(requiredPermission);
}

// ---------------------------------------------------------------------------
// ABAC check — evaluate all applicable attribute rules
// ---------------------------------------------------------------------------

/**
 * Evaluate ABAC rules for the given permission.
 *
 * @param {Object} subject   - Normalised subject
 * @param {string} permission - The permission being checked
 * @param {Object} resource  - Resource attributes (orgId, projectId, loanAmount, etc.)
 * @param {Object} env       - Environment attributes (thresholds, time, etc.)
 * @returns {{ allowed: boolean, deniedBy: string|null, message: string|null }}
 */
function _checkABAC(subject, permission, resource, env) {
  for (const [ruleId, rule] of Object.entries(ABAC_RULES)) {
    // Skip rules that are scoped to specific permissions and don't apply here
    if (rule.applies && !rule.applies.includes(permission)) continue;

    if (!rule.condition(subject, resource, env)) {
      return { allowed: false, deniedBy: ruleId, message: rule.message };
    }
  }
  return { allowed: true, deniedBy: null, message: null };
}

// ---------------------------------------------------------------------------
// authorize() — Express middleware factory
// ---------------------------------------------------------------------------

/**
 * Create authorization middleware for a specific permission.
 *
 * @param {string} permission - Required permission (e.g. 'agent:originate')
 * @param {Object} [opts]
 * @param {Function} [opts.extractResource] - (req) => { orgId, projectId, loanAmount, ... }
 *   Custom function to extract resource attributes from the request for ABAC evaluation.
 *   Defaults to extracting orgId from apiKey/user and loanAmount from body.
 * @param {Object} [opts.env] - Static environment overrides for ABAC rules.
 * @returns {Function} Express middleware
 */
function authorize(permission, opts = {}) {
  return (req, res, next) => {
    const subject = buildSubject(req);

    // --- Pass 1: RBAC ---
    if (!_checkRBAC(subject, permission)) {
      return res.status(403).json({
        error:   'FORBIDDEN',
        message: `Your role (${subject.role}) does not have the required permission: ${permission}`,
        requiredPermission: permission,
      });
    }

    // --- Pass 2: ABAC ---
    const resource = opts.extractResource
      ? opts.extractResource(req)
      : _defaultExtractResource(req);

    const env = {
      timestamp: Date.now(),
      loanAmountThreshold: parseInt(process.env.LOAN_AMOUNT_THRESHOLD, 10) || 50_000_000,
      ...opts.env,
    };

    const abacResult = _checkABAC(subject, permission, resource, env);
    if (!abacResult.allowed) {
      return res.status(403).json({
        error:   'FORBIDDEN',
        message: abacResult.message,
        rule:    abacResult.deniedBy,
      });
    }

    // Attach the resolved subject to the request for downstream use
    req.authSubject = subject;
    next();
  };
}

/**
 * Default resource attribute extractor.
 */
function _defaultExtractResource(req) {
  return {
    orgId:      (req.apiKey && req.apiKey.orgId) || (req.user && req.user.organizationId) || null,
    projectId:  req.params.projectId || req.params.id || (req.body && req.body.projectId) || null,
    loanAmount: (req.body && req.body.loanAmount) || null,
  };
}

// ---------------------------------------------------------------------------
// Utility: check permission programmatically (non-middleware use)
// ---------------------------------------------------------------------------

/**
 * Evaluate authorization for a subject and permission without Express req/res.
 * Used by the supervisor to check if the caller can invoke each pipeline stage.
 *
 * @param {Object} subject     - Normalised subject (from buildSubject)
 * @param {string} permission  - Required permission
 * @param {Object} [resource]  - Resource attributes
 * @param {Object} [env]       - Environment attributes
 * @returns {{ allowed: boolean, message: string|null }}
 */
function checkAccess(subject, permission, resource = {}, env = {}) {
  if (!_checkRBAC(subject, permission)) {
    return { allowed: false, message: `Role ${subject.role} lacks permission: ${permission}` };
  }
  const abac = _checkABAC(subject, permission, resource, env);
  if (!abac.allowed) {
    return { allowed: false, message: abac.message };
  }
  return { allowed: true, message: null };
}

module.exports = {
  authorize,
  buildSubject,
  checkAccess,
  _mapLegacyPermissions,
  _checkRBAC,
  _checkABAC,
};
