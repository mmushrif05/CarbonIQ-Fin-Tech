// @ts-check
/**
 * In-process metrics — request rate, latency, error rate, store latency —
 * for the instance that is answering (gap D4).
 *
 * Counters and latency histograms are kept in memory per process and read
 * at `GET /v1/metrics`, as JSON or in the Prometheus text exposition format
 * for a scraper. Nothing is shipped anywhere by this module: on a serverless
 * platform a process is one container among several and is recycled without
 * notice, so the figures here describe *this instance since it started* and
 * the payload says so — `instance` and `since` travel with every snapshot.
 * The durable, cross-instance view is the log drain: every request already
 * emits one structured line with its route, status and duration, and a log
 * sink aggregates those across every container. This endpoint is the live
 * answer to "what is this process doing right now", which a drain cannot
 * give.
 *
 * Latency is a fixed-bucket histogram (Prometheus-shaped) plus a reservoir
 * of the most recent observations for the percentiles in the JSON view;
 * the two describe the same requests.
 *
 * This module requires nothing else in the tree, so the store, the logger
 * and the error reporter can all count into it without a cycle.
 */

'use strict';

const crypto = require('crypto');

/** Bucket edges in milliseconds; the last edge is the platform's wall clock. */
const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 26000];
const RESERVOIR = 256;

const state = {
  startedAt: new Date().toISOString(),
  instance: crypto.randomBytes(4).toString('hex'),
  requests: new Map(),
  storeOps: new Map(),
  fallbacks: new Map(),
  errors: { total: 0, byModule: new Map() },
};

/** @returns {{count: number, sum: number, buckets: number[], recent: number[]}} */
function _hist() {
  return { count: 0, sum: 0, buckets: BUCKETS_MS.map(() => 0), recent: [] };
}

function _observe(h, ms) {
  const v = Number.isFinite(ms) ? ms : 0;
  h.count += 1;
  h.sum += v;
  BUCKETS_MS.forEach((le, i) => { if (v <= le) h.buckets[i] += 1; });
  h.recent.push(v);
  if (h.recent.length > RESERVOIR) h.recent.shift();
}

function _pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

function _summary(h) {
  const s = [...h.recent].sort((a, b) => a - b);
  return {
    count: h.count,
    meanMs: h.count ? Number((h.sum / h.count).toFixed(1)) : null,
    p50Ms: _pct(s, 0.5),
    p95Ms: _pct(s, 0.95),
    p99Ms: _pct(s, 0.99),
    maxMs: s.length ? s[s.length - 1] : null,
  };
}

/** One request handled: its route pattern (not its concrete path), status and duration. */
function observeRequest({ method, route, status, durationMs }) {
  const key = `${method} ${route}`;
  let r = state.requests.get(key);
  if (!r) {
    r = { method, route, total: 0, byClass: { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, hist: _hist() };
    state.requests.set(key, r);
  }
  r.total += 1;
  const cls = `${Math.floor(Number(status) / 100)}xx`;
  if (r.byClass[cls] !== undefined) r.byClass[cls] += 1;
  _observe(r.hist, durationMs);
}

/** One store operation: the verb on the seam, how long, and whether it threw. */
function observeStore(verb, durationMs, ok) {
  let s = state.storeOps.get(verb);
  if (!s) { s = { verb, total: 0, errors: 0, hist: _hist() }; state.storeOps.set(verb, s); }
  s.total += 1;
  if (!ok) s.errors += 1;
  _observe(s.hist, durationMs);
}

/** A failure that was answered with a fallback value rather than thrown. */
function fallback(site, kind = 'unknown') {
  let f = state.fallbacks.get(site);
  if (!f) { f = { site, total: 0, byKind: {} }; state.fallbacks.set(site, f); }
  f.total += 1;
  f.byKind[kind] = (f.byKind[kind] || 0) + 1;
}

/** An exception that reached the error reporter, by the module it came from. */
function errorCaptured(module) {
  state.errors.total += 1;
  const m = module || 'unknown';
  state.errors.byModule.set(m, (state.errors.byModule.get(m) || 0) + 1);
}

/**
 * Wrap an async function so every call is observed under `verb`.
 *
 * Generic in the function it wraps, so the wrapper keeps the signature.
 * It did not: every verb on the storage seam is wrapped here, and each one
 * emitted as `(...args: any[]) => Promise<any>` — so every persisted entity
 * entered the application as `any`, and not even the arity survived.
 *
 * @template {(...args: any[]) => Promise<any>} F
 * @param {string} verb
 * @param {F} fn
 * @returns {F}
 */
function timed(verb, fn) {
  /** @this {any} */
  const wrapped = async function timedCall(...args) {
    const t0 = process.hrtime.bigint();
    let ok = true;
    try {
      return await fn.apply(this, args);
    } catch (err) {
      ok = false;
      throw err;
    } finally {
      observeStore(verb, Number(process.hrtime.bigint() - t0) / 1e6, ok);
    }
  };
  return /** @type {F} */ (/** @type {unknown} */ (wrapped));
}

function _uptimeSeconds() {
  return Math.round((Date.now() - Date.parse(state.startedAt)) / 1000);
}

/** The JSON view. */
function snapshot() {
  const requests = [...state.requests.values()]
    .sort((a, b) => b.total - a.total)
    .map(r => ({ method: r.method, route: r.route, total: r.total, byClass: { ...r.byClass }, latency: _summary(r.hist) }));
  const total = requests.reduce((n, r) => n + r.total, 0);
  const server = requests.reduce((n, r) => n + r.byClass['5xx'], 0);
  const client = requests.reduce((n, r) => n + r.byClass['4xx'], 0);
  const all = _hist();
  for (const r of state.requests.values()) {
    all.count += r.hist.count; all.sum += r.hist.sum;
    r.hist.buckets.forEach((n, i) => { all.buckets[i] += n; });
    all.recent.push(...r.hist.recent);
  }
  const uptime = _uptimeSeconds();
  return {
    instance: state.instance,
    since: state.startedAt,
    uptimeSeconds: uptime,
    scope: 'this process only — a serverless platform runs several and recycles them; the log drain is the cross-instance view',
    totals: {
      requests: total,
      perMinute: uptime > 0 ? Number((total / (uptime / 60)).toFixed(2)) : null,
      status5xx: server,
      status4xx: client,
      errorRate5xx: total ? Number((server / total).toFixed(4)) : 0,
      latency: _summary(all),
    },
    requests,
    store: [...state.storeOps.values()].map(s => ({ verb: s.verb, total: s.total, errors: s.errors, latency: _summary(s.hist) })),
    fallbacks: [...state.fallbacks.values()].map(f => ({ site: f.site, total: f.total, byKind: { ...f.byKind } })),
    errors: { total: state.errors.total, byModule: Object.fromEntries(state.errors.byModule) },
  };
}

const _esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const _labels = obj => Object.entries(obj).map(([k, v]) => `${k}="${_esc(v)}"`).join(',');

function _histLines(name, labels, h) {
  const out = [];
  BUCKETS_MS.forEach((le, i) => { out.push(`${name}_bucket{${_labels({ ...labels, le: String(le) })}} ${h.buckets[i]}`); });
  out.push(`${name}_bucket{${_labels({ ...labels, le: '+Inf' })}} ${h.count}`);
  out.push(`${name}_sum{${_labels(labels)}} ${h.sum.toFixed(3)}`);
  out.push(`${name}_count{${_labels(labels)}} ${h.count}`);
  return out;
}

/** The Prometheus text exposition (version 0.0.4). */
function prometheus() {
  const L = [];
  L.push('# HELP carboniq_instance_start_time_seconds When this process started.');
  L.push('# TYPE carboniq_instance_start_time_seconds gauge');
  L.push(`carboniq_instance_start_time_seconds{instance="${state.instance}"} ${Math.floor(Date.parse(state.startedAt) / 1000)}`);
  L.push('# HELP carboniq_requests_total Requests handled by this process, by route pattern and status class.');
  L.push('# TYPE carboniq_requests_total counter');
  for (const r of state.requests.values()) {
    for (const [cls, n] of Object.entries(r.byClass)) {
      if (n) L.push(`carboniq_requests_total{${_labels({ method: r.method, route: r.route, status_class: cls })}} ${n}`);
    }
  }
  L.push('# HELP carboniq_request_duration_ms Request duration in milliseconds, by route pattern.');
  L.push('# TYPE carboniq_request_duration_ms histogram');
  for (const r of state.requests.values()) L.push(..._histLines('carboniq_request_duration_ms', { method: r.method, route: r.route }, r.hist));
  L.push('# HELP carboniq_store_operations_total Operations on the storage seam, by verb and outcome.');
  L.push('# TYPE carboniq_store_operations_total counter');
  for (const s of state.storeOps.values()) {
    L.push(`carboniq_store_operations_total{${_labels({ verb: s.verb, outcome: 'ok' })}} ${s.total - s.errors}`);
    if (s.errors) L.push(`carboniq_store_operations_total{${_labels({ verb: s.verb, outcome: 'error' })}} ${s.errors}`);
  }
  L.push('# HELP carboniq_store_duration_ms Storage seam operation duration in milliseconds, by verb.');
  L.push('# TYPE carboniq_store_duration_ms histogram');
  for (const s of state.storeOps.values()) L.push(..._histLines('carboniq_store_duration_ms', { verb: s.verb }, s.hist));
  L.push('# HELP carboniq_fallbacks_total Failures answered with a fallback value rather than thrown, by site and kind.');
  L.push('# TYPE carboniq_fallbacks_total counter');
  for (const f of state.fallbacks.values()) {
    for (const [kind, n] of Object.entries(f.byKind)) L.push(`carboniq_fallbacks_total{${_labels({ site: f.site, kind })}} ${n}`);
  }
  L.push('# HELP carboniq_errors_captured_total Exceptions that reached the error reporter, by failing module.');
  L.push('# TYPE carboniq_errors_captured_total counter');
  for (const [m, n] of state.errors.byModule) L.push(`carboniq_errors_captured_total{${_labels({ module: m })}} ${n}`);
  return `${L.join('\n')}\n`;
}

/** Tests only. */
function _reset() {
  state.requests.clear();
  state.storeOps.clear();
  state.fallbacks.clear();
  state.errors.total = 0;
  state.errors.byModule.clear();
}

module.exports = { observeRequest, observeStore, fallback, errorCaptured, timed, snapshot, prometheus, BUCKETS_MS, _reset };
