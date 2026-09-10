// @ts-check
/**
 * CarbonIQ FinTech — the request line, the request context, and the audit chain.
 *
 * Every request gets a correlation id — the caller's `X-Request-ID` where it
 * sent a well-formed one, else a fresh UUID — returned on the response and
 * published through the request context for the rest of the request, so a
 * log written anywhere under it carries the id without being handed it.
 *
 * On finish, one structured line per request: method, path, the route
 * *pattern* it matched, status, duration, and who — the organisation, the
 * key, the person named in X-Actor, the scope the route required. The same
 * figures feed the in-process metrics by route pattern, so `/v1/partc/
 * projects/:id` is one series rather than one per project.
 *
 * Where PostgreSQL is the live store, every request that could have changed
 * a record — anything but GET, HEAD and OPTIONS — is also appended to the
 * hash-chained `audit_events` table, which refuses updates and deletes. A
 * chain write that fails is logged with its reason; it is never swallowed,
 * because an audit trail with silent gaps is the one kind an auditor cannot
 * use.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const context = require('./context');
const logger = require('./logger');
const metrics = require('./metrics');

const log = logger.for('platform/observability/audit');
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/* A caller's id is honoured when it could not be mistaken for anything else. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function chainWrite(req, res, entry) {
  if (!MUTATING.has(req.method)) return;
  if (req.originalUrl === '/health') return;
  let store;
  try { store = require('../database/store'); } catch (_) { return; }
  if (store.capability().mode !== 'postgres') return;
  const { auditChain } = require('../database');
  auditChain.append({
    orgId: entry.orgId || (req.user && req.user.organizationId) || null,
    actor: (req.actor && req.actor.id) || entry.userId || (req.apiKey && (req.apiKey.keyName || req.apiKey.orgId)) || null,
    action: `${req.method} ${req.path}`,
    resource: req.originalUrl,
    requestId: req.requestId,
    detail: {
      status: res.statusCode, authType: entry.authType || null, durationMs: Math.round(entry.durationMs),
      scope: req.requiredScope || null, actorVia: req.actor ? req.actor.via : null,
      ...(req.apiKey && req.apiKey.keyName ? { keyName: req.apiKey.keyName } : {}),
      ...(req.apiKey && req.apiKey.unscoped ? { unscoped: true } : {}),
    },
  }).catch(err => {
    log.error({ err, requestId: req.requestId, kind: logger.classify(err) }, 'audit chain write failed');
  });
}

/** The route pattern a request matched — a series key, not a concrete path. */
function routeOf(req) {
  if (req.route && req.route.path) {
    const p = Array.isArray(req.route.path) ? req.route.path[0] : req.route.path;
    return `${req.baseUrl || ''}${p}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  }
  return 'unmatched';
}

function audit(req, res, next) {
  const given = req.headers['x-request-id'];
  req.requestId = typeof given === 'string' && SAFE_ID.test(given) ? given : uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = routeOf(req);
    const entry = {
      audit: true,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      route,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    // Auth context, without sensitive data
    if (req.user) {
      entry.authType = 'session';
      entry.userId = req.user.uid;
      entry.role = req.user.role;
      entry.orgId = req.user.organizationId;
    } else if (req.apiKey) {
      entry.authType = 'api_key';
      entry.orgId = req.apiKey.orgId;
      if (req.apiKey.keyName) entry.keyName = req.apiKey.keyName;
      if (req.apiKey.unscoped) entry.unscoped = true;
    }
    /* The person, where one was named (X-Actor), else the key. "Who locked
       this assessment" is answerable to a person, not only to an organisation. */
    if (req.actor && req.actor.id) entry.actor = req.actor.id;
    /* Whether the name above is one the server established or one it was
       told. An integration asserts its operator in X-Actor and is believed;
       a reader of the chain has to be able to tell the two apart. */
    if (req.actor) entry.actorVerified = req.actor.verified === true;
    if (req.requiredScope) entry.scope = req.requiredScope;

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](entry, `${req.method} ${req.originalUrl} ${res.statusCode}`);
    metrics.observeRequest({ method: req.method, route, status: res.statusCode, durationMs });
    chainWrite(req, res, entry);
  });

  context.run({ requestId: req.requestId, req }, () => next());
}

module.exports = audit;
module.exports.routeOf = routeOf;
