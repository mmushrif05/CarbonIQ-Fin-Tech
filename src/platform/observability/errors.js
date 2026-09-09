/**
 * Error reporting (gap D3): a 500 in production raises an alert naming the
 * request id, the organisation and the failing module.
 *
 * Reports go to Sentry over its envelope API when SENTRY_DSN is set, and
 * nowhere when it is not — the module is inert without a DSN, and /health
 * says which. The transport is the documented envelope endpoint spoken with
 * the runtime's own `fetch`, rather than the SDK: the SDK carries an
 * OpenTelemetry runtime that must initialise before every other module and
 * adds tens of megabytes to a serverless bundle whose cold start is already
 * the slowest thing about it, for breadcrumbs and tracing this application
 * does not use. What Sentry needs to alert, group and show a stack is here:
 * the release (the running commit, the one /health reports), the
 * environment, the exception with its frames, and the tags an alert rule
 * routes on — `requestId`, `orgId`, `module`, `route`, `status`, `kind`.
 *
 * The failing module is read from the innermost application frame of the
 * stack, so a report says `domains/pcaf-part-c/application/partc-assessments.js`
 * rather than "Express". A report is awaited, with a bound, before the
 * response goes out: on a serverless platform the container is frozen once
 * the response is sent, and a report still in flight then is a report that
 * never arrives.
 *
 * Every captured error is also written to the log with the same fields, so
 * the log drain holds the record whether or not Sentry does.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const metrics = require('./metrics');
const context = require('./context');
const { release } = require('./release');

const log = logger.for('platform/observability/errors');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TIMEOUT_MS = 2000;

/** `https://key@o123.ingest.sentry.io/456` → its parts, or null when malformed. */
function parseDsn(dsn) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\/+$/, '').split('/').pop();
    if (!u.username || !u.hostname || !/^\d+$/.test(projectId)) return null;
    const base = u.pathname.replace(/\/+$/, '').slice(0, -(projectId.length + 1));
    return { publicKey: u.username, host: u.host, protocol: u.protocol.replace(/:$/, ''), projectId, base };
  } catch (_) {
    return null;
  }
}

const endpoint = d => `${d.protocol}://${d.host}${d.base}/api/${d.projectId}/envelope/`;

/** Whether a well-formed DSN is configured. Never the value. */
function configured() {
  return Boolean(parseDsn(config.runtime.sentryDsn));
}

/** Stack frames, innermost first, marked in-app when they are this tree's own code. */
function frames(err) {
  const lines = String((err && err.stack) || '').split('\n').slice(1);
  const out = [];
  for (const line of lines) {
    const m = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = m[2];
    const inTree = path.isAbsolute(file) && file.startsWith(ROOT + path.sep);
    out.push({
      function: m[1] || '<anonymous>',
      filename: inTree ? path.relative(ROOT, file).split(path.sep).join('/') : file,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: inTree && !file.includes(`${path.sep}node_modules${path.sep}`),
    });
  }
  return out;
}

/* Where an error passes through, not where it arises. */
const PLUMBING = /^src\/platform\/(observability\/|http\/(error-handler|async-handler)\.js)/;

/** The innermost application frame that raised this — the plumbing an error passes through does not count. */
function failingModule(err) {
  const fs = frames(err);
  const f = fs.find(x => x.in_app && !PLUMBING.test(x.filename)) || fs.find(x => x.in_app);
  return f ? { module: f.filename, line: f.lineno, function: f.function } : { module: 'unknown', line: null, function: null };
}

const strip = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

function buildEvent(err, ctx) {
  const rel = release();
  const where = failingModule(err);
  const current = context.current() || {};
  const req = ctx.req || current.req || null;
  const tags = strip({
    requestId: ctx.requestId || (req && req.requestId) || current.requestId,
    orgId: req && ((req.apiKey && req.apiKey.orgId) || (req.user && req.user.organizationId)),
    actor: req && ((req.actor && req.actor.id) || (req.user && req.user.uid)),
    module: where.module,
    route: req && req.route ? `${req.baseUrl || ''}${req.route.path}` : undefined,
    method: req ? req.method : undefined,
    status: ctx.status !== undefined ? String(ctx.status) : undefined,
    kind: logger.classify(err),
    source: ctx.source,
  });
  return {
    event_id: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    logger: 'carboniq-fintech',
    release: rel.commit || undefined,
    environment: config.runtime.sentryEnvironment || rel.context || config.env,
    tags,
    extra: strip({ code: err.code, remedy: err.remedy, line: where.line, function: where.function, deployId: rel.deployId, branch: rel.branch }),
    request: req ? strip({ method: req.method, url: req.originalUrl, headers: strip({ 'user-agent': req.headers && req.headers['user-agent'] }) }) : undefined,
    exception: {
      values: [{
        type: (err && err.name) || 'Error',
        value: String((err && err.message) || err),
        module: where.module,
        stacktrace: { frames: frames(err).reverse() },
      }],
    },
  };
}

/** Default transport: POST the envelope to the DSN's ingest endpoint. */
async function sendEnvelope(dsn, envelope) {
  if (typeof fetch !== 'function') {
    const e = new Error('fetch is not available in this runtime'); e.code = 'NO_FETCH'; throw e;
  }
  const res = await fetch(endpoint(dsn), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=carboniq-fintech/${config.version}, sentry_key=${dsn.publicKey}`,
    },
    body: envelope,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const e = new Error(`the error sink answered ${res.status}`); e.code = 'REPORT_REJECTED'; e.statusCode = res.status; throw e;
  }
}

let transport = sendEnvelope;

/**
 * Report an exception. Always logs it with the failing module and the
 * request's identity; sends it to the sink when one is configured.
 * Never throws.
 *
 * @param {Error} err
 * @param {{req?: object, status?: number, requestId?: string, source?: string}} [ctx]
 * @returns {Promise<{reported: boolean, eventId: string, module: string, reason?: string}>}
 */
async function capture(err, ctx = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  let event;
  try { event = buildEvent(error, ctx); } catch (e) {
    log.error({ err: error, buildError: e.message }, 'error report could not be built');
    return { reported: false, eventId: null, module: 'unknown', reason: 'build_failed' };
  }
  const where = event.tags.module;
  metrics.errorCaptured(where);
  const entry = strip({
    err: error, eventId: event.event_id, module: where, line: event.extra.line,
    requestId: event.tags.requestId, orgId: event.tags.orgId, actor: event.tags.actor,
    route: event.tags.route, status: ctx.status, kind: event.tags.kind, source: ctx.source,
  });
  const dsn = parseDsn(config.runtime.sentryDsn);
  if (!dsn) {
    const reason = config.runtime.sentryDsn ? 'malformed_dsn' : 'no_dsn';
    log.error({ ...entry, reported: false, reason }, `${where}: ${error.message}`);
    return { reported: false, eventId: event.event_id, module: where, reason };
  }
  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n') + '\n';
  try {
    await transport(dsn, envelope);
    log.error({ ...entry, reported: true }, `${where}: ${error.message}`);
    return { reported: true, eventId: event.event_id, module: where };
  } catch (e) {
    log.error({ ...entry, reported: false, reason: e.code || 'transport_failed', reportError: e.message }, `${where}: ${error.message}`);
    return { reported: false, eventId: event.event_id, module: where, reason: e.code || 'transport_failed' };
  }
}

/** Tests only: replace the transport. Returns the previous one. */
function _setTransport(fn) {
  const prev = transport;
  transport = fn || sendEnvelope;
  return prev;
}

module.exports = { capture, configured, parseDsn, failingModule, frames, buildEvent, endpoint, _setTransport, TIMEOUT_MS };
