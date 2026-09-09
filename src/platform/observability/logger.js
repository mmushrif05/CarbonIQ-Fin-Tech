/**
 * Structured logging (gap D1), with the request threaded through it (D5).
 *
 * One pino root writes JSON lines to stdout — one object per line, `level`
 * as a word, ISO timestamp, and the base fields a log drain needs to tell
 * deployments apart: `service`, `env`, `release` (the running commit). Every
 * line written inside a request also carries `requestId`, and `orgId` and
 * `actor` where the request has been authenticated by the time the line is
 * written, read from the request context at write time rather than passed
 * down. A service-layer log three calls deep is therefore traceable to the
 * request that caused it, which is what made stdout logging unusable before.
 *
 * `logger.for(module)` names the module on every line so a log can be
 * grouped by where it came from. Secrets are redacted by key: an API key,
 * a token, a service account or a DSN that reaches a log line is replaced
 * before it is written.
 *
 * The level comes from LOG_LEVEL (info by default; silent under test unless
 * set). On a serverless platform the destination is synchronous, because a
 * frozen container does not flush an asynchronous one. Nothing is shipped
 * from here: the platform captures stdout, and a log drain
 * (docs/OBSERVABILITY.md) forwards it to a sink with retention.
 *
 * `fallback(site, value)` is the answer to the swallowed `.catch(() => {})`
 * (gap C5): the failure is logged with its classification and counted, and
 * the caller still gets the value it used to get — so a database outage
 * reads as a database outage rather than as "no record".
 */

'use strict';

const pino = require('pino');
const config = require('../config');
const context = require('./context');
const metrics = require('./metrics');
const { release } = require('./release');

const REDACT = {
  paths: [
    'apiKey', 'key', 'hashedKey', 'password', 'token', 'secret', 'dsn', 'serviceAccount', 'authorization',
    '*.apiKey', '*.key', '*.hashedKey', '*.password', '*.token', '*.secret', '*.dsn', '*.serviceAccount', '*.authorization',
    'headers["x-api-key"]', 'headers.authorization', 'headers.cookie',
    '*.headers["x-api-key"]', '*.headers.authorization', '*.headers.cookie',
  ],
  censor: '[redacted]',
};

const orgOf = req => (req && ((req.apiKey && req.apiKey.orgId) || (req.user && req.user.organizationId))) || undefined;
const actorOf = req => (req && ((req.actor && req.actor.id) || (req.user && req.user.uid))) || undefined;

/** Fields every line written inside a request carries, read at write time. */
function mixin() {
  const c = context.current();
  if (!c) return {};
  const out = {};
  if (c.requestId) out.requestId = c.requestId;
  const org = orgOf(c.req);
  if (org) out.orgId = org;
  const actor = actorOf(c.req);
  if (actor) out.actor = actor;
  return out;
}

function build({ level = config.log.level, stream } = {}) {
  const dest = stream || pino.destination({ fd: 1, sync: config.runtime.isServerless });
  return pino({
    level,
    base: { service: 'carboniq-fintech', env: config.env, release: release().short },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'msg',
    redact: REDACT,
    serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
    formatters: { level: label => ({ level: label }) },
    mixin,
  }, dest);
}

let root = build();
let generation = 0;
const children = new Map();

function current(module) {
  const c = children.get(module);
  if (c && c.generation === generation) return c.log;
  const log = root.child({ module });
  children.set(module, { generation, log });
  return log;
}

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * A logger naming its module on every line. Resolved against the current
 * root at each call, so a root rebuilt by a test is what an already-loaded
 * module writes to.
 */
function forModule(module) {
  const facade = { module };
  for (const level of LEVELS) facade[level] = (...args) => current(module)[level](...args);
  facade.isLevelEnabled = level => root.isLevelEnabled(level);
  return facade;
}

/** Tests only: replace the root (its level, its destination). */
function rebuild(opts = {}) {
  root = build(opts);
  generation += 1;
  return root;
}

const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH',
  '57P01', '57P03', '08000', '08001', '08003', '08006', 'STORAGE_UNAVAILABLE', 'SERVICE_UNAVAILABLE']);

/**
 * What kind of failure this is — the word an alert can route on.
 * unreachable · timeout · refused · not_found · conflict · invalid · unknown
 */
function classify(err) {
  if (!err) return 'unknown';
  const code = String(err.code || '');
  const status = Number(err.statusCode || err.status || 0);
  const msg = String(err.message || '');
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || /timeout|timed out/i.test(code) || /timed out|deadline/i.test(msg) || status === 504) return 'timeout';
  if (UNREACHABLE_CODES.has(code) || status === 502 || status === 503 || /not configured|unavailable|unreachable|not reachable/i.test(msg)) return 'unreachable';
  if (status === 401 || status === 403 || code === '42501' || code === '28P01' || code === 'PERMISSION_DENIED' || /^auth\//.test(code)) return 'refused';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status === 409 || /^23/.test(code)) return 'conflict';
  if (status === 400 || status === 422 || /^22/.test(code) || err.isJoi) return 'invalid';
  return 'unknown';
}

/**
 * A `.catch` handler that logs the failure, classifies and counts it, and
 * resolves to `value` (or `value()`), so the caller's behaviour is unchanged
 * and the failure is no longer invisible.
 *
 * @param {string} site   where — `module.operation`, unique in the tree
 * @param {*} [value]     what the caller gets instead; a function is called
 * @param {{level?: string}} [opts]
 */
function fallback(site, value, { level = 'warn' } = {}) {
  return err => {
    const kind = classify(err);
    current('platform/observability/fallback')[level]({ site, kind, err }, `${site}: ${err && err.message ? err.message : 'failed'} — continuing with the fallback value`);
    metrics.fallback(site, kind);
    return typeof value === 'function' ? value() : value;
  };
}

module.exports = {
  for: forModule,
  classify,
  fallback,
  rebuild,
  get root() { return root; },
  get level() { return root.level; },
  LEVELS,
};
