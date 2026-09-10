/**
 * E3 — observability.
 *
 * The exit criterion of the phase, as a test: a 500 raises a report naming
 * the request id, the organisation and the failing module. Around it: the
 * request id reaches a log line written three calls deep without being
 * passed; secrets are redacted; the reporter is inert without a DSN and
 * never breaks a response; the metrics count by route pattern; every
 * swallowed `.catch(() => {})` is gone; and /health says whether an error
 * sink is configured without ever saying which.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = 'ck_test_' + 'o'.repeat(32);

const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const express = require('express');
const request = require('supertest');

const ROOT = path.resolve(__dirname, '..');
const config = require('../src/platform/config');
const logger = require('../src/platform/observability/logger');
const context = require('../src/platform/observability/context');
const metrics = require('../src/platform/observability/metrics');
const errors = require('../src/platform/observability/errors');
const audit = require('../src/platform/observability/audit');
const errorHandler = require('../src/platform/http/error-handler');
const store = require('../src/platform/database/store');
/* Loaded once, at module scope: requiring the app inside a test body charges
   the cost of loading the whole tree to that test's timer. */
const app = require('../src/server');

const DSN = 'https://abc123def@o1.ingest.sentry.io/99';

/** A destination that keeps every line as an object. */
function sink() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const l of chunk.toString().split('\n')) if (l.trim()) lines.push(JSON.parse(l));
      cb();
    },
  });
  return { lines, stream };
}

/** A small app with the real middleware around routes that log and fail. */
function harness() {
  const app = express();
  app.use(audit);
  app.use((req, _res, next) => { req.apiKey = { orgId: 'org_http', keyName: 'test' }; req.actor = { id: 'ana@bank.lk', via: 'header' }; next(); });
  app.get('/v1/thing/:id', (_req, res) => { logger.for('tests/route').info({ depth: 3 }, 'deep'); res.json({ ok: true }); });
  app.get('/boom', () => { throw new Error('kaboom'); });
  app.get('/missing', () => { const e = new Error('no such thing'); e.statusCode = 404; e.code = 'NOT_FOUND'; throw e; });
  app.use(errorHandler);
  return app;
}

let captured;
beforeEach(() => {
  captured = sink();
  logger.rebuild({ level: 'debug', stream: captured.stream });
  metrics._reset();
  delete process.env.SENTRY_DSN;
  errors._setTransport(null);
});
afterAll(() => {
  logger.rebuild({ level: 'silent' });
  delete process.env.SENTRY_DSN;
  errors._setTransport(null);
});

describe('The request id reaches every line written under the request (D1, D5)', () => {
  test('a line written inside a request context carries the id, the organisation and the person, without being handed them', () => {
    const log = logger.for('tests/observability');
    context.run({ requestId: 'req-abc', req: { apiKey: { orgId: 'org_t' }, actor: { id: 'ana@bank.lk' } } }, () => log.info({ figure: 1 }, 'inside'));
    log.info('outside');
    expect(captured.lines[0]).toMatchObject({
      level: 'info', service: 'carboniq-fintech', module: 'tests/observability',
      requestId: 'req-abc', orgId: 'org_t', actor: 'ana@bank.lk', figure: 1, msg: 'inside',
    });
    expect(typeof captured.lines[0].time).toBe('string');
    expect(captured.lines[1].requestId).toBeUndefined();
    expect(captured.lines[1].orgId).toBeUndefined();
  });

  test('over HTTP: the caller\'s X-Request-ID is honoured, returned, and on the deep log line and the audit line', async () => {
    const res = await request(harness()).get('/v1/thing/42').set('x-request-id', 'given-1').expect(200);
    expect(res.headers['x-request-id']).toBe('given-1');
    const deep = captured.lines.find(l => l.msg === 'deep');
    expect(deep).toMatchObject({ module: 'tests/route', requestId: 'given-1', orgId: 'org_http', actor: 'ana@bank.lk', depth: 3 });
    const line = captured.lines.find(l => l.audit === true);
    expect(line).toMatchObject({ requestId: 'given-1', method: 'GET', path: '/v1/thing/42', route: '/v1/thing/:id', status: 200, orgId: 'org_http', authType: 'api_key', keyName: 'test', actor: 'ana@bank.lk', level: 'info' });
    expect(typeof line.durationMs).toBe('number');
  });

  test('an X-Request-ID that could carry anything else is replaced, not echoed', async () => {
    const res = await request(harness()).get('/v1/thing/1').set('x-request-id', 'bad id\twith spaces').expect(200);
    expect(res.headers['x-request-id']).not.toBe('bad id\twith spaces');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('a 4xx is a warning and a 5xx an error on the request line', async () => {
    const app = harness();
    await request(app).get('/nowhere').expect(404);
    await request(app).get('/boom').expect(500);
    const levels = captured.lines.filter(l => l.audit).map(l => [l.status, l.level, l.route]);
    expect(levels).toEqual(expect.arrayContaining([[404, 'warn', 'unmatched'], [500, 'error', '/boom']]));
  });

  test('a key, a token or a service account that reaches a log line is redacted before it is written', () => {
    logger.for('tests/redact').info({ headers: { 'x-api-key': 'ck_test_SECRETSECRET', authorization: 'Bearer eyJ' }, apiKey: 'ck_live_ALSO', nested: { token: 't0k', serviceAccount: 'sa', password: 'p' }, safe: 'kept' }, 'r');
    const line = captured.lines[0];
    expect(line.headers['x-api-key']).toBe('[redacted]');
    expect(line.headers.authorization).toBe('[redacted]');
    expect(line.apiKey).toBe('[redacted]');
    expect(line.nested).toEqual({ token: '[redacted]', serviceAccount: '[redacted]', password: '[redacted]' });
    expect(line.safe).toBe('kept');
    expect(JSON.stringify(line)).not.toMatch(/SECRET|ALSO|eyJ|t0k/);
  });
});

describe('The exit criterion: a 500 raises a report naming the request id, the organisation and the failing module (D3)', () => {
  test('with a DSN, the report is sent before the response and carries the three, plus route, status, release and the stack', async () => {
    process.env.SENTRY_DSN = DSN;
    const sent = [];
    let responded = false;
    errors._setTransport(async (dsn, envelope) => { sent.push({ dsn, envelope, responded }); });
    const app = harness();
    const res = await request(app).get('/boom').expect(500);
    responded = true;
    expect(res.body).toMatchObject({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' });
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.eventId).toMatch(/^[0-9a-f]{32}$/);
    expect(res.body.stack).toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(sent[0].responded).toBe(false);
    expect(sent[0].dsn.projectId).toBe('99');
    expect(errors.endpoint(sent[0].dsn)).toBe('https://o1.ingest.sentry.io/api/99/envelope/');
    const [header, item, event] = sent[0].envelope.trim().split('\n').map(l => JSON.parse(l));
    expect(header.event_id).toBe(res.body.eventId);
    expect(item).toEqual({ type: 'event' });
    expect(event.tags).toMatchObject({ requestId: res.body.requestId, orgId: 'org_http', actor: 'ana@bank.lk', route: '/boom', method: 'GET', status: '500', kind: 'unknown' });
    expect(event.tags.module).toMatch(/^tests\/observability\.test\.js$/);
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'kaboom', module: event.tags.module });
    expect(event.exception.values[0].stacktrace.frames.some(f => f.in_app && f.filename === event.tags.module)).toBe(true);
    expect(event.environment).toBeTruthy();
    expect(event.platform).toBe('node');

    const line = captured.lines.find(l => l.eventId === res.body.eventId);
    expect(line).toMatchObject({ level: 'error', reported: true, module: event.tags.module, requestId: res.body.requestId, orgId: 'org_http', status: 500 });
    expect(line.err.message).toBe('kaboom');
  });

  test('the failing module is the innermost application frame — not a dependency, not the plumbing', () => {
    const err = new Error('x');
    err.stack = [
      'Error: x',
      `    at inner (${ROOT}/node_modules/pg/lib/client.js:10:5)`,
      `    at wrap (${ROOT}/src/platform/http/async-handler.js:12:3)`,
      `    at store (${ROOT}/src/platform/database/document-store.js:120:9)`,
      `    at service (${ROOT}/src/domains/pcaf-part-c/application/partc-assessments.js:200:3)`,
      `    at handler (${ROOT}/tests/some.test.js:5:1)`,
    ].join('\n');
    expect(errors.failingModule(err)).toEqual({ module: 'src/platform/database/document-store.js', line: 120, function: 'store' });
    const frames = errors.frames(err);
    expect(frames[0].in_app).toBe(false);
    const plumbingOnly = new Error('y');
    plumbingOnly.stack = ['Error: y', `    at run (${ROOT}/src/platform/observability/audit.js:90:5)`].join('\n');
    expect(errors.failingModule(plumbingOnly).module).toBe('src/platform/observability/audit.js');
    expect(frames.map(f => f.filename)).toContain('src/domains/pcaf-part-c/application/partc-assessments.js');
  });

  test('without a DSN the reporter is inert — nothing is sent, the error is still logged and counted, the response is the same', async () => {
    let calls = 0;
    errors._setTransport(async () => { calls += 1; });
    const res = await request(harness()).get('/boom').expect(500);
    expect(calls).toBe(0);
    expect(res.body.eventId).toMatch(/^[0-9a-f]{32}$/);
    const line = captured.lines.find(l => l.eventId === res.body.eventId);
    expect(line).toMatchObject({ reported: false, reason: 'no_dsn', orgId: 'org_http' });
    expect(metrics.snapshot().errors.total).toBe(1);
    expect(errors.configured()).toBe(false);
  });

  test('a 4xx is not an incident: not reported, not counted', async () => {
    process.env.SENTRY_DSN = DSN;
    let calls = 0;
    errors._setTransport(async () => { calls += 1; });
    const res = await request(harness()).get('/missing').expect(404);
    expect(res.body).toMatchObject({ error: 'NOT_FOUND', message: 'no such thing' });
    expect(res.body.eventId).toBeUndefined();
    expect(calls).toBe(0);
    expect(metrics.snapshot().errors.total).toBe(0);
  });

  test('a sink that is down never breaks the response, and the log says the report failed and why', async () => {
    process.env.SENTRY_DSN = DSN;
    errors._setTransport(async () => { const e = new Error('ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; });
    const res = await request(harness()).get('/boom').expect(500);
    expect(res.body.eventId).toBeTruthy();
    const line = captured.lines.find(l => l.eventId === res.body.eventId);
    expect(line).toMatchObject({ reported: false, reason: 'ECONNREFUSED' });
  });

  test('a malformed DSN is named by boot validation and treated as absent, never thrown on', async () => {
    process.env.SENTRY_DSN = 'not a dsn';
    expect(config.validate().problems.map(p => p.variable)).toContain('SENTRY_DSN');
    expect(errors.configured()).toBe(false);
    const r = await errors.capture(new Error('m'));
    expect(r).toMatchObject({ reported: false, reason: 'malformed_dsn' });
    process.env.SENTRY_DSN = DSN;
    expect(config.validate().problems.map(p => p.variable)).not.toContain('SENTRY_DSN');
    expect(errors.parseDsn(DSN)).toEqual({ publicKey: 'abc123def', host: 'o1.ingest.sentry.io', protocol: 'https', projectId: '99', base: '' });
    expect(errors.parseDsn('https://k@sentry.example.com/base/path/7')).toMatchObject({ projectId: '7', base: '/base/path' });
  });

  test('the report is awaited before the response goes out, so a frozen container cannot lose it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/platform/http/error-handler.js'), 'utf8');
    expect(src).toMatch(/await errors\.capture\(err, \{ req, status \}\)/);
    expect(src.indexOf('await errors.capture')).toBeLessThan(src.indexOf('res.status(status).json(body)'));
    const fn = fs.readFileSync(path.join(ROOT, 'netlify/functions/fintech-api.js'), 'utf8');
    expect(fn).toMatch(/await errors\.capture\(err, \{ source: 'invocation'/);
    const server = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
    expect(server).toMatch(/process\.on\('unhandledRejection'/);
    expect(server).toMatch(/process\.on\('uncaughtException'/);
  });
});

describe('Metrics: request rate, latency, error rate, store latency, by route pattern (D4)', () => {
  test('requests are counted under the pattern they matched, with latency and status class', async () => {
    const app = harness();
    for (const id of [1, 2, 3]) await request(app).get(`/v1/thing/${id}`).expect(200);
    await request(app).get('/boom').expect(500);
    const snap = metrics.snapshot();
    const thing = snap.requests.find(r => r.route === '/v1/thing/:id');
    expect(thing).toMatchObject({ method: 'GET', total: 3, byClass: { '2xx': 3, '5xx': 0 } });
    expect(thing.latency.count).toBe(3);
    expect(typeof thing.latency.p50Ms).toBe('number');
    expect(snap.totals).toMatchObject({ requests: 4, status5xx: 1, errorRate5xx: 0.25 });
    expect(snap.instance).toMatch(/^[0-9a-f]{8}$/);
    expect(snap.scope).toMatch(/this process only/);
    const text = metrics.prometheus();
    expect(text).toContain('carboniq_requests_total{method="GET",route="/v1/thing/:id",status_class="2xx"} 3');
    expect(text).toContain('carboniq_requests_total{method="GET",route="/boom",status_class="5xx"} 1');
    expect(text).toContain('# TYPE carboniq_request_duration_ms histogram');
    expect(text).toContain('carboniq_request_duration_ms_bucket{method="GET",route="/v1/thing/:id",le="+Inf"} 3');
    expect(text).toContain('carboniq_errors_captured_total{module="tests/observability.test.js"} 1');
  });

  test('every verb on the storage seam is timed', async () => {
    await store.put('partc_clients', 'org_metrics', 'c1', { name: 'Metrics Client', country: 'LK' });
    await store.get('partc_clients', 'org_metrics', 'c1');
    await store.list('partc_clients', 'org_metrics');
    const s = metrics.snapshot().store;
    expect(s.map(x => x.verb)).toEqual(expect.arrayContaining(['put', 'get', 'list']));
    expect(s.find(x => x.verb === 'put')).toMatchObject({ total: 1, errors: 0 });
    expect(metrics.prometheus()).toContain('carboniq_store_operations_total{verb="put",outcome="ok"} 1');
  });

  test('GET /v1/metrics answers JSON, or the Prometheus exposition, and needs a key', async () => {
    await request(app).get('/v1/metrics').expect(401);
    const json = await request(app).get('/v1/metrics').set('x-api-key', process.env.UI_API_KEY).expect(200);
    expect(json.body).toMatchObject({ instance: expect.any(String), since: expect.any(String) });
    expect(Array.isArray(json.body.requests)).toBe(true);
    const text = await request(app).get('/v1/metrics?format=prometheus').set('x-api-key', process.env.UI_API_KEY).expect(200);
    expect(text.headers['content-type']).toMatch(/text\/plain/);
    expect(text.text).toContain('carboniq_requests_total');
    const accept = await request(app).get('/v1/metrics').set('x-api-key', process.env.UI_API_KEY).set('Accept', 'text/plain').expect(200);
    expect(accept.text).toContain('# TYPE carboniq_instance_start_time_seconds gauge');
  });
});

describe('Swallowed errors are gone (C5): a failure answered with a fallback is logged, classified and counted', () => {
  test('fallback() resolves to the value the caller used to get, and the failure is visible', async () => {
    const down = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const got = await Promise.reject(down).catch(logger.fallback('tests.site', () => []));
    expect(got).toEqual([]);
    const gotNull = await Promise.reject(new Error('x')).catch(logger.fallback('tests.other', null));
    expect(gotNull).toBeNull();
    const line = captured.lines.find(l => l.site === 'tests.site');
    expect(line).toMatchObject({ level: 'warn', kind: 'unreachable', module: 'platform/observability/fallback' });
    expect(line.err.message).toBe('connect ECONNREFUSED');
    expect(metrics.snapshot().fallbacks).toEqual(expect.arrayContaining([{ site: 'tests.site', total: 1, byKind: { unreachable: 1 } }]));
    expect(metrics.prometheus()).toContain('carboniq_fallbacks_total{site="tests.site",kind="unreachable"} 1');
  });

  test('classify() names the kind an alert routes on', () => {
    const c = logger.classify;
    expect(c(Object.assign(new Error(), { code: 'ECONNREFUSED' }))).toBe('unreachable');
    expect(c(Object.assign(new Error(), { code: '57P01' }))).toBe('unreachable');
    expect(c(Object.assign(new Error('Firebase not configured')))).toBe('unreachable');
    expect(c(Object.assign(new Error(), { statusCode: 503 }))).toBe('unreachable');
    expect(c(Object.assign(new Error(), { name: 'AbortError' }))).toBe('timeout');
    expect(c(Object.assign(new Error(), { statusCode: 403 }))).toBe('refused');
    expect(c(Object.assign(new Error(), { code: '42501' }))).toBe('refused');
    expect(c(Object.assign(new Error(), { statusCode: 404 }))).toBe('not_found');
    expect(c(Object.assign(new Error(), { code: '23505' }))).toBe('conflict');
    expect(c(Object.assign(new Error(), { statusCode: 422 }))).toBe('invalid');
    expect(c(new Error('anything'))).toBe('unknown');
    expect(c(null)).toBe('unknown');
  });

  test('no `.catch(() => …)` survives anywhere under src/ or the function', () => {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
    walk(path.join(ROOT, 'src')); walk(path.join(ROOT, 'netlify'));
    const offenders = [];
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return; // a comment naming the pattern is not the pattern
        if (/\.catch\(\s*(\(\)|_|\(_\)|e|err|\(e\)|\(err\))\s*=>\s*(\{\s*\}|null|undefined|\[\]|\(\{\}\)|false|true|0)\s*\)/.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test('every fallback site names where it is, uniquely enough to find', () => {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
    walk(path.join(ROOT, 'src'));
    const sites = [];
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/fallback\('([^']+)'/g)) sites.push(m[1]);
    expect(sites.length).toBeGreaterThanOrEqual(30);
    for (const s of sites) expect(s).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
  });

  test('nothing under src/ writes to the console except the local start banner', () => {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
    walk(path.join(ROOT, 'src'));
    const offenders = [];
    for (const f of files) {
      if (f.endsWith(`${path.sep}src${path.sep}server.js`)) continue;
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/(^|[^\w'"`])console\.(log|warn|error|info|debug)\(/.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('/health says how the deployment can be watched, and never what the sink is', () => {
  test('the observability block is closed, boolean where it matters, and carries no DSN', async () => {
    process.env.SENTRY_DSN = DSN;
    const res = await request(app).get('/health').expect(200);
    expect(Object.keys(res.body.observability).sort()).toEqual(['errorTracking', 'logLevel', 'logging', 'metrics']);
    expect(res.body.observability).toMatchObject({ logging: 'json', errorTracking: true, metrics: '/v1/metrics' });
    expect(JSON.stringify(res.body)).not.toMatch(/abc123def|ingest\.sentry\.io/);
    delete process.env.SENTRY_DSN;
    const off = await request(app).get('/health').expect(200);
    expect(off.body.observability.errorTracking).toBe(false);
  });

  test('every environment variable this phase reads is read in one place', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'src/platform/config/index.js'), 'utf8');
    for (const v of ['SENTRY_DSN', 'SENTRY_ENVIRONMENT', 'LOG_LEVEL']) expect(cfg).toContain(v);
    for (const f of ['logger.js', 'errors.js', 'metrics.js', 'audit.js', 'context.js']) {
      expect(fs.readFileSync(path.join(ROOT, 'src/platform/observability', f), 'utf8')).not.toMatch(/process\.env/);
    }
  });
});
