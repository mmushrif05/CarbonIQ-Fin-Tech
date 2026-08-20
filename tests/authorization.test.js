/**
 * CarbonIQ FinTech — Hybrid RBAC + ABAC Authorization Tests
 *
 * Tests middleware/authorization.js policy engine:
 *   - RBAC: role-based permission checks
 *   - ABAC: attribute-based contextual constraints
 *   - Legacy permission mapping for backwards compatibility
 *   - Subject normalisation from JWT users and API keys
 */

'use strict';

const express = require('express');
const request = require('supertest');

// Mock firebase so auth.js doesn't blow up
jest.mock('../bridge/firebase', () => ({
  getFirebaseAdmin: () => null,
  getDatabase: () => null,
}));

const { authorize, buildSubject, checkAccess, _mapLegacyPermissions, _checkRBAC, _checkABAC } = require('../middleware/authorization');
const { PERMISSIONS, ROLES } = require('../config/policies');

// ---------------------------------------------------------------------------
// Unit tests — buildSubject
// ---------------------------------------------------------------------------

describe('buildSubject', () => {
  it('normalises a JWT user with explicit role', () => {
    const req = {
      user: { uid: 'u1', email: 'a@bank.com', role: 'credit_officer', organizationId: 'org1' },
    };
    const subject = buildSubject(req);
    expect(subject.type).toBe('user');
    expect(subject.role).toBe('credit_officer');
    expect(subject.roleLevel).toBe(80);
    expect(subject.permissions).toContain(PERMISSIONS.AGENT_ORIGINATE);
    expect(subject.orgId).toBe('org1');
  });

  it('defaults to relationship_manager for JWT user with no role', () => {
    const req = { user: { uid: 'u2', email: 'b@bank.com' } };
    const subject = buildSubject(req);
    expect(subject.role).toBe('relationship_manager');
    expect(subject.roleLevel).toBe(40);
  });

  it('normalises an API key subject', () => {
    const req = {
      apiKey: {
        orgId: 'org2', orgName: 'Bank B', projectIds: ['p1'],
        permissions: ['agent', 'read'], role: null,
      },
    };
    const subject = buildSubject(req);
    expect(subject.type).toBe('apikey');
    expect(subject.orgId).toBe('org2');
    expect(subject.permissions).toContain(PERMISSIONS.AGENT_SCREEN);
    expect(subject.permissions).toContain(PERMISSIONS.RUNS_READ);
  });

  it('merges API key role permissions with explicit permissions', () => {
    const req = {
      apiKey: {
        orgId: 'org3', orgName: 'Bank C', projectIds: [],
        permissions: ['read'], role: 'esg_analyst',
      },
    };
    const subject = buildSubject(req);
    expect(subject.role).toBe('esg_analyst');
    expect(subject.roleLevel).toBe(60);
    // Should have both explicit 'read' mapped perms AND esg_analyst role perms
    expect(subject.permissions).toContain(PERMISSIONS.AGENT_PORTFOLIO);
    expect(subject.permissions).toContain(PERMISSIONS.PROJECT_READ);
  });

  it('returns anonymous subject when no auth context', () => {
    const req = {};
    const subject = buildSubject(req);
    expect(subject.type).toBe('anonymous');
    expect(subject.roleLevel).toBe(0);
    expect(subject.permissions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — legacy permission mapping
// ---------------------------------------------------------------------------

describe('_mapLegacyPermissions', () => {
  it('passes through new-format permissions unchanged', () => {
    const result = _mapLegacyPermissions(['agent:screen', 'runs:read']);
    expect(result).toContain('agent:screen');
    expect(result).toContain('runs:read');
  });

  it('maps legacy "agent" to all agent permissions', () => {
    const result = _mapLegacyPermissions(['agent']);
    expect(result).toContain(PERMISSIONS.AGENT_SCREEN);
    expect(result).toContain(PERMISSIONS.AGENT_UNDERWRITE);
    expect(result).toContain(PERMISSIONS.AGENT_ORIGINATE);
    expect(result).toContain(PERMISSIONS.PIPELINE_CREATE);
  });

  it('maps legacy "read" to read permissions', () => {
    const result = _mapLegacyPermissions(['read']);
    expect(result).toContain(PERMISSIONS.RUNS_READ);
    expect(result).toContain(PERMISSIONS.PROJECT_READ);
    expect(result).toContain(PERMISSIONS.PORTFOLIO_READ);
  });

  it('deduplicates permissions', () => {
    const result = _mapLegacyPermissions(['read', 'read', 'runs:read']);
    const unique = [...new Set(result)];
    expect(result.length).toBe(unique.length);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — RBAC check
// ---------------------------------------------------------------------------

describe('_checkRBAC', () => {
  it('grants access when permission is in subject set', () => {
    const subject = { permissions: [PERMISSIONS.AGENT_SCREEN, PERMISSIONS.AGENT_COACH] };
    expect(_checkRBAC(subject, PERMISSIONS.AGENT_SCREEN)).toBe(true);
  });

  it('denies access when permission is not in subject set', () => {
    const subject = { permissions: [PERMISSIONS.AGENT_COACH] };
    expect(_checkRBAC(subject, PERMISSIONS.AGENT_ORIGINATE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — ABAC check
// ---------------------------------------------------------------------------

describe('_checkABAC', () => {
  it('passes org boundary for matching org', () => {
    const subject = { role: 'esg_analyst', orgId: 'org1', permissions: [] };
    const resource = { orgId: 'org1' };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_SCREEN, resource, {});
    expect(result.allowed).toBe(true);
  });

  it('fails org boundary for mismatched org', () => {
    const subject = { role: 'esg_analyst', orgId: 'org1', permissions: [] };
    const resource = { orgId: 'org2' };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_SCREEN, resource, {});
    expect(result.allowed).toBe(false);
    expect(result.deniedBy).toBe('orgBoundary');
  });

  it('bypasses org boundary for admin', () => {
    const subject = { role: 'admin', orgId: 'org1', permissions: [] };
    const resource = { orgId: 'org2' };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_SCREEN, resource, {});
    expect(result.allowed).toBe(true);
  });

  it('enforces loan amount threshold for low-level roles', () => {
    const subject = { role: 'relationship_manager', roleLevel: 40, permissions: [] };
    const resource = { loanAmount: 100_000_000 };
    const env = { loanAmountThreshold: 50_000_000 };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_ORIGINATE, resource, env);
    expect(result.allowed).toBe(false);
    expect(result.deniedBy).toBe('loanAmountThreshold');
  });

  it('allows high-level roles past loan amount threshold', () => {
    const subject = { role: 'credit_officer', roleLevel: 80, permissions: [] };
    const resource = { loanAmount: 100_000_000 };
    const env = { loanAmountThreshold: 50_000_000 };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_ORIGINATE, resource, env);
    expect(result.allowed).toBe(true);
  });

  it('enforces human review gate — only credit officers can review', () => {
    const subject = { role: 'esg_analyst', roleLevel: 60, permissions: [] };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_REVIEW, {}, {});
    expect(result.allowed).toBe(false);
    expect(result.deniedBy).toBe('humanReviewGate');
  });

  it('allows credit officers to submit human reviews', () => {
    const subject = { role: 'credit_officer', roleLevel: 80, permissions: [] };
    const result = _checkABAC(subject, PERMISSIONS.AGENT_REVIEW, {}, {});
    expect(result.allowed).toBe(true);
  });

  it('enforces project scope for scoped API keys', () => {
    const subject = { role: 'system', projectIds: ['p1', 'p2'], permissions: [] };
    const resource = { projectId: 'p3' };
    const result = _checkABAC(subject, PERMISSIONS.PROJECT_READ, resource, {});
    expect(result.allowed).toBe(false);
    expect(result.deniedBy).toBe('projectScope');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — checkAccess (combined RBAC + ABAC)
// ---------------------------------------------------------------------------

describe('checkAccess', () => {
  it('allows when both RBAC and ABAC pass', () => {
    const subject = {
      role: 'credit_officer', roleLevel: 80, orgId: 'org1',
      permissions: ROLES.credit_officer.permissions,
    };
    const result = checkAccess(subject, PERMISSIONS.AGENT_ORIGINATE, { orgId: 'org1' });
    expect(result.allowed).toBe(true);
  });

  it('denies when RBAC fails (missing permission)', () => {
    const subject = {
      role: 'borrower', roleLevel: 10, orgId: 'org1',
      permissions: ROLES.borrower.permissions,
    };
    const result = checkAccess(subject, PERMISSIONS.AGENT_ORIGINATE);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('lacks permission');
  });
});

// ---------------------------------------------------------------------------
// Integration tests — authorize() middleware
// ---------------------------------------------------------------------------

describe('authorize() middleware', () => {
  function createApp(permission, opts) {
    const app = express();
    app.use(express.json());
    // Simulate auth by injecting apiKey
    app.use((req, _res, next) => {
      if (req.headers['x-test-role']) {
        req.apiKey = {
          orgId: req.headers['x-test-org'] || 'org1',
          orgName: 'Test Bank',
          projectIds: [],
          permissions: (req.headers['x-test-perms'] || '').split(',').filter(Boolean),
          role: req.headers['x-test-role'] !== 'none' ? req.headers['x-test-role'] : null,
        };
      }
      next();
    });
    app.post('/test', authorize(permission, opts), (req, res) => {
      res.json({ ok: true, subject: req.authSubject });
    });
    return app;
  }

  it('returns 403 when role lacks required permission', async () => {
    const app = createApp(PERMISSIONS.AGENT_ORIGINATE);
    const res = await request(app)
      .post('/test')
      .set('x-test-role', 'borrower')
      .send({});
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 200 when role has required permission', async () => {
    const app = createApp(PERMISSIONS.AGENT_SCREEN);
    const res = await request(app)
      .post('/test')
      .set('x-test-role', 'relationship_manager')
      .send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subject.role).toBe('relationship_manager');
  });

  it('returns 403 when ABAC loan threshold is exceeded', async () => {
    const app = createApp(PERMISSIONS.AGENT_ORIGINATE);
    const res = await request(app)
      .post('/test')
      .set('x-test-role', 'relationship_manager')
      .set('x-test-perms', 'agent:originate')
      .send({ loanAmount: 999_000_000 });
    expect(res.statusCode).toBe(403);
    expect(res.body.rule).toBe('loanAmountThreshold');
  });

  it('allows credit officer past loan threshold', async () => {
    const app = createApp(PERMISSIONS.AGENT_ORIGINATE);
    const res = await request(app)
      .post('/test')
      .set('x-test-role', 'credit_officer')
      .send({ loanAmount: 999_000_000 });
    expect(res.statusCode).toBe(200);
  });

  it('attaches authSubject to request', async () => {
    const app = createApp(PERMISSIONS.AGENT_COACH);
    const res = await request(app)
      .post('/test')
      .set('x-test-role', 'borrower')
      .send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.subject.type).toBe('apikey');
    expect(res.body.subject.orgId).toBe('org1');
  });
});
