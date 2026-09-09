/**
 * CarbonIQ FinTech — Audit Logging Middleware
 *
 * Logs every API request for compliance trail.
 * Financial APIs require complete audit trails per MAS/HKMA guidelines.
 *
 * Logged fields: timestamp, method, path, user/key, status, duration
 *
 * Every request goes to stdout. Where PostgreSQL is the live store, every
 * request that could have changed a record — anything but GET, HEAD and
 * OPTIONS — is also appended to the hash-chained `audit_events` table, which
 * refuses updates and deletes. A chain write that fails is reported on
 * stderr with its reason; it is never swallowed, because an audit trail with
 * silent gaps is the one kind an auditor cannot use.
 */

const { v4: uuidv4 } = require('uuid');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function chainWrite(req, res, logEntry) {
  if (!MUTATING.has(req.method)) return;
  if (req.originalUrl === '/health') return;
  let store;
  try { store = require('../database/store'); } catch (_) { return; }
  if (store.capability().mode !== 'postgres') return;
  const { auditChain } = require('../database');
  auditChain.append({
    orgId: logEntry.orgId || (req.user && req.user.organizationId) || null,
    actor: (req.actor && req.actor.id) || logEntry.userId || (req.apiKey && (req.apiKey.keyName || req.apiKey.orgId)) || null,
    action: `${req.method} ${req.path}`,
    resource: req.originalUrl,
    requestId: req.requestId,
    detail: {
      status: res.statusCode, authType: logEntry.authType || null, durationMs: Number(logEntry.duration.replace('ms', '')),
      scope: req.requiredScope || null, actorVia: req.actor ? req.actor.via : null,
      ...(req.apiKey && req.apiKey.keyName ? { keyName: req.apiKey.keyName } : {}),
      ...(req.apiKey && req.apiKey.unscoped ? { unscoped: true } : {}),
    },
  }).catch(err => {
    console.error('[AUDIT] chain write failed:', err.code || '', err.message, `(request ${req.requestId})`);
  });
}

function audit(req, res, next) {
  // Assign unique request ID
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    // Add auth context (without sensitive data)
    if (req.user) {
      logEntry.authType = 'jwt';
      logEntry.userId = req.user.uid;
      logEntry.role = req.user.role;
    } else if (req.apiKey) {
      logEntry.authType = 'api_key';
      logEntry.orgId = req.apiKey.orgId;
      if (req.apiKey.keyName) logEntry.keyName = req.apiKey.keyName;
      if (req.apiKey.unscoped) logEntry.unscoped = true;
    }
    /* The person, where one was named (X-Actor), else the key. "Who locked
       this assessment" is answerable to a person, not only to an organisation. */
    if (req.actor && req.actor.id) logEntry.actor = req.actor.id;
    if (req.requiredScope) logEntry.scope = req.requiredScope;

    // Log to stdout (captured by Netlify / Docker logs)
    if (res.statusCode >= 400) {
      console.error('[AUDIT]', JSON.stringify(logEntry));
    } else {
      console.log('[AUDIT]', JSON.stringify(logEntry));
    }

    chainWrite(req, res, logEntry);
  });

  next();
}

module.exports = audit;
