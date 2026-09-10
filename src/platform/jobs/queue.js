// @ts-check
/**
 * The job queue (gaps I1, I2): work that does not fit inside one request.
 *
 * A request on the serverless platform is killed at 26 seconds. A job is
 * enqueued in one request — answered 202 with an id — worked by a process
 * that has the time, and read back by id, with the document it produced
 * downloadable under the same id.
 *
 * Two modes, and /health says which:
 *
 *   postgres  the queue is the `jobs` table on the one database. Claiming
 *             uses FOR UPDATE SKIP LOCKED, so any number of workers take
 *             distinct jobs; a job that fails is retried with backoff up to
 *             `maxAttempts`; a job whose worker died is returned to the
 *             queue by `requeueStale()`. After enqueue the API pokes the
 *             background worker (docs/JOBS.md) so a job starts in seconds.
 *   inline    no database holds a queue (local development, tests, or a
 *             deployment without DATABASE_URL): the job runs inside the
 *             request that enqueued it and the 26-second ceiling still
 *             applies. The response says so; nothing pretends otherwise.
 *
 * The queue is a table and not a service on purpose — no new infrastructure,
 * one backup, one audit chain, and a `SELECT` answers "what is running".
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const crypto = require('crypto');
const config = require('../config');
const db = require('../database');
const store = require('../database/store');
const registry = require('./registry');
const logger = require('../observability/logger');
const errors = require('../observability/errors');
const context = require('../observability/context');
const { asError } = require('../../shared/types');

const log = logger.for('platform/jobs/queue');
const MAX_MEMORY_JOBS = 200;
const STALE_AFTER_MINUTES = 15;
const POKE_TIMEOUT_MS = 3000;

const _memory = new Map();
function _bucket(orgId) {
  if (!_memory.has(orgId)) _memory.set(orgId, new Map());
  return _memory.get(orgId);
}

/** `postgres` when the one database holds the queue; `inline` otherwise. */
function mode() {
  if (config.runtime.jobsInline) return 'inline';
  return store.capability().mode === 'postgres' ? 'postgres' : 'inline';
}

const newId = () => `job_${crypto.randomBytes(8).toString('hex')}`;
const iso = v => (v ? new Date(v).toISOString() : null);

function rowToJob(r) {
  return {
    jobId: r.id, orgId: r.org_id, type: r.type, status: r.status,
    payload: r.payload || {}, result: r.result || null, error: r.error || null,
    attempts: r.attempts, maxAttempts: r.max_attempts,
    requestId: r.request_id || null, actor: r.actor || null,
    artifact: r.artifact_type ? { contentType: r.artifact_type, filename: r.artifact_name, bytes: Number(r.artifact_bytes || 0) } : null,
    createdAt: iso(r.created_at), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), runAfter: iso(r.run_after),
  };
}

/** What a client sees: the job, with the download path where there is one. */
function publicJob(job) {
  if (!job) return null;
  const { orgId: _o, ...rest } = job;
  const artifact = job.artifact ? { ...job.artifact, url: `/v1/jobs/${job.jobId}/artifact` } : null;
  if (artifact && artifact.buffer) delete artifact.buffer;
  return { ...rest, artifact };
}

const SELECT = `org_id, id, type, status, payload, result, error, attempts, max_attempts, request_id, actor,
  artifact_type, artifact_name, length(artifact) AS artifact_bytes, created_at, started_at, finished_at, run_after`;

function unknownType(type) {
  const e = /** @type {AppError} */ (new Error(`No job type "${type}".`));
  e.statusCode = 400; e.code = 'UNKNOWN_JOB_TYPE';
  e.remedy = `One of: ${registry.types().map(t => t.type).join(', ')}. GET /v1/jobs/types describes each.`;
  return e;
}

/**
 * Put a job on the queue. In postgres mode it is queued and the worker is
 * poked; in inline mode it has run by the time this resolves.
 */
async function enqueue({ orgId, type, payload = {}, requestId = null, actor = null, maxAttempts = 3 }) {
  if (!registry.has(type)) throw unknownType(type);
  const id = newId();
  const now = new Date().toISOString();
  const job = {
    jobId: id, orgId, type, status: 'queued', payload, result: null, error: null,
    attempts: 0, maxAttempts, requestId, actor, artifact: null,
    createdAt: now, startedAt: null, finishedAt: null, runAfter: now,
  };
  if (mode() === 'postgres') {
    await db.client.query(
      `INSERT INTO jobs (org_id, id, type, payload, max_attempts, request_id, actor) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orgId, id, type, JSON.stringify(payload), maxAttempts, requestId, actor]
    );
    log.info({ jobId: id, type }, 'job queued');
    await poke();
    return job;
  }
  const bucket = _bucket(orgId);
  if (bucket.size >= MAX_MEMORY_JOBS) bucket.delete(bucket.keys().next().value);
  bucket.set(id, job);
  await execute(job, { inline: true });
  return bucket.get(id);
}

/**
 * Run one job to its outcome. Never throws: the outcome is on the job.
 * @param {any} job
 * @param {{inline?: boolean, workerId?: string|null}} [opts]
 */
async function execute(job, { inline = false, workerId = null } = {}) {
  const handler = registry.get(job.type);
  const started = new Date().toISOString();
  const ctx = { orgId: job.orgId, jobId: job.jobId, requestId: job.requestId, actor: job.actor };
  const run = async () => {
    if (!handler) throw unknownType(job.type);
    return handler.fn(job.payload, ctx);
  };
  /* A claim on the table counts the attempt; inline there is no claim. */
  const attempts = inline ? job.attempts + 1 : job.attempts;
  const t0 = Date.now();
  let out;
  try {
    out = await context.run({ requestId: job.requestId, req: null, jobId: job.jobId }, run);
  } catch (thrown) {
    const err = asError(thrown);
    const kind = logger.classify(err);
    /* Only a failure that may pass next time is retried: a store or provider
       that did not answer. An invalid payload, a missing record, a refusal
       or a conflict will fail the same way tomorrow. */
    const transient = kind === 'unreachable' || kind === 'timeout' || kind === 'unknown';
    const retry = !inline && transient && attempts < job.maxAttempts;
    const error = { message: err.message, code: err.code || null, kind, attempts };
    log.warn({ jobId: job.jobId, type: job.type, err, kind, retry, durationMs: Date.now() - t0 }, `job ${retry ? 'failed; will retry' : 'failed'}`);
    if (!retry && (kind === 'unknown' || kind === 'unreachable' || kind === 'timeout')) await errors.capture(err, { source: 'job', requestId: job.requestId, status: 500 });
    return await _fail(job, error, retry, started, inline, workerId, attempts);
  }
  const result = (out && out.result !== undefined) ? out.result : (out && !out.artifact ? out : null);
  const artifact = out && out.artifact ? out.artifact : null;
  log.info({ jobId: job.jobId, type: job.type, durationMs: Date.now() - t0, artifact: artifact ? artifact.contentType : null }, 'job succeeded');
  return _complete(job, result, artifact, started, inline, workerId, attempts);
}

async function _complete(job, result, artifact, started, inline, workerId, attempts) {
  const finished = new Date().toISOString();
  const art = artifact ? { contentType: artifact.contentType, filename: artifact.filename, bytes: artifact.buffer.length } : null;
  if (mode() === 'postgres' && !inline) {
    await db.client.query(
      `UPDATE jobs SET status = 'succeeded', result = $3, artifact = $4, artifact_type = $5, artifact_name = $6,
         finished_at = now(), updated_at = now(), locked_by = NULL WHERE org_id = $1 AND id = $2`,
      [job.orgId, job.jobId, result === null ? null : JSON.stringify(result), artifact ? artifact.buffer : null, art ? art.contentType : null, art ? art.filename : null]
    );
    return { ...job, status: 'succeeded', result, artifact: art, attempts, startedAt: job.startedAt || started, finishedAt: finished, workerId };
  }
  const updated = { ...job, status: 'succeeded', result, artifact: art ? { ...art, buffer: artifact.buffer } : null, attempts, startedAt: started, finishedAt: finished };
  _bucket(job.orgId).set(job.jobId, updated);
  return updated;
}

async function _fail(job, error, retry, started, inline, workerId, attempts) {
  const finished = new Date().toISOString();
  if (mode() === 'postgres' && !inline) {
    if (retry) {
      const backoffSeconds = 30 * attempts;
      await db.client.query(
        `UPDATE jobs SET status = 'queued', error = $3, run_after = now() + ($4 || ' seconds')::interval, updated_at = now(), locked_by = NULL WHERE org_id = $1 AND id = $2`,
        [job.orgId, job.jobId, JSON.stringify(error), String(backoffSeconds)]
      );
      return { ...job, status: 'queued', error, attempts, workerId };
    }
    await db.client.query(
      `UPDATE jobs SET status = 'failed', error = $3, finished_at = now(), updated_at = now(), locked_by = NULL WHERE org_id = $1 AND id = $2`,
      [job.orgId, job.jobId, JSON.stringify(error)]
    );
    return { ...job, status: 'failed', error, attempts, finishedAt: finished, workerId };
  }
  /* Inline: there is no later; a failure is final and the caller hears it now. */
  const updated = { ...job, status: 'failed', error, attempts, startedAt: started, finishedAt: finished };
  _bucket(job.orgId).set(job.jobId, updated);
  return updated;
}

/** Take the oldest ready job for this worker, or null. Postgres only. */
async function claim(workerId) {
  if (mode() !== 'postgres') return null;
  const r = await db.client.query(
    `UPDATE jobs SET status = 'running', locked_by = $1, locked_at = now(), started_at = COALESCE(started_at, now()),
         attempts = attempts + 1, updated_at = now()
       WHERE (org_id, id) = (
         SELECT org_id, id FROM jobs WHERE status = 'queued' AND run_after <= now()
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING ${SELECT}`,
    [workerId]
  );
  return r.rows[0] ? rowToJob(r.rows[0]) : null;
}

/** Return to the queue any job whose worker has not reported in STALE_AFTER_MINUTES. */
async function requeueStale() {
  if (mode() !== 'postgres') return 0;
  const r = await db.client.query(
    `UPDATE jobs SET status = 'queued', locked_by = NULL, updated_at = now(),
       error = COALESCE(error, '{}'::jsonb) || '{"stale": true}'::jsonb
     WHERE status = 'running' AND locked_at < now() - ($1 || ' minutes')::interval`,
    [String(STALE_AFTER_MINUTES)]
  );
  if (r.rowCount) log.warn({ requeued: r.rowCount }, 'stale jobs returned to the queue');
  return r.rowCount;
}

async function get(orgId, jobId) {
  if (mode() === 'postgres') {
    const r = await db.client.query(`SELECT ${SELECT} FROM jobs WHERE org_id = $1 AND id = $2`, [orgId, jobId]);
    return r.rows[0] ? rowToJob(r.rows[0]) : null;
  }
  return _bucket(orgId).get(jobId) || null;
}

async function list(orgId, { status, type, limit = 500 } = /** @type {{status?: any, type?: any, limit?: any}} */ ({})) {
  if (mode() === 'postgres') {
    const where = ['org_id = $1']; const params = [orgId];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (type) { params.push(type); where.push(`type = $${params.length}`); }
    params.push(limit);
    const r = await db.client.query(`SELECT ${SELECT} FROM jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return r.rows.map(rowToJob);
  }
  return [..._bucket(orgId).values()]
    .filter(j => (!status || j.status === status) && (!type || j.type === type))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** The bytes a job produced, or null. */
async function artifact(orgId, jobId) {
  if (mode() === 'postgres') {
    const r = await db.client.query(`SELECT artifact, artifact_type, artifact_name FROM jobs WHERE org_id = $1 AND id = $2`, [orgId, jobId]);
    const row = r.rows[0];
    if (!row || !row.artifact) return null;
    return { buffer: row.artifact, contentType: row.artifact_type, filename: row.artifact_name };
  }
  const j = _bucket(orgId).get(jobId);
  return j && j.artifact && j.artifact.buffer ? { buffer: j.artifact.buffer, contentType: j.artifact.contentType, filename: j.artifact.filename } : null;
}

/** Jobs by status across the deployment, for /health and the sweep. */
async function counts() {
  if (mode() === 'postgres') {
    const r = await db.client.query(`SELECT status, count(*)::int AS n FROM jobs GROUP BY status`);
    const out = { queued: 0, running: 0, succeeded: 0, failed: 0 };
    for (const row of r.rows) out[row.status] = row.n;
    return out;
  }
  const out = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const b of _memory.values()) for (const j of b.values()) out[j.status] = (out[j.status] || 0) + 1;
  return out;
}

/** Mode and queue depth, bounded, for /health. Never throws. */
async function health() {
  const m = mode();
  try {
    const c = await Promise.race([counts(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
    return { mode: m, queued: c.queued, running: c.running, worker: m === 'postgres' ? (config.runtime.jobsToken && config.runtime.siteUrl ? 'poked' : 'sweep') : 'inline' };
  } catch (err) {
    return { mode: m, queued: null, running: null, worker: m === 'postgres' ? 'unknown' : 'inline', reason: logger.classify(err) };
  }
}

/**
 * Wake the background worker. Needs JOBS_TOKEN and the site URL; without
 * them the scheduled sweep picks the job up on its next pass, and the log
 * says so once per process.
 */
let _pokeWarned = false;
async function poke() {
  const url = config.runtime.siteUrl;
  const token = config.runtime.jobsToken;
  if (!url || !token) {
    if (!_pokeWarned) { _pokeWarned = true; log.info('no JOBS_TOKEN or site URL; queued jobs wait for the scheduled sweep or a worker'); }
    return false;
  }
  if (typeof fetch !== 'function') return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/.netlify/functions/jobs-background`, {
      method: 'POST', headers: { 'x-jobs-token': token }, signal: AbortSignal.timeout(POKE_TIMEOUT_MS),
    });
    return res.ok || res.status === 202;
  } catch (err) {
    logger.fallback('jobs.poke', false)(err);
    return false;
  }
}

function _resetMemory() { _memory.clear(); }

module.exports = { mode, enqueue, execute, claim, requeueStale, get, list, artifact, counts, health, poke, publicJob, _resetMemory, STALE_AFTER_MINUTES };
