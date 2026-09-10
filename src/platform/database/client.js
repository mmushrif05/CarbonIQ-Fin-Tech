// @ts-check
/**
 * CarbonIQ FinTech — the PostgreSQL connection, and nothing else.
 *
 * This is the only file in the repository that requires `pg`. Every read and
 * write above it goes through `document-store.js`, and every service above
 * that goes through `src/platform/database/store.js`, so no engine and no route
 * knows a database exists. A test sweeps the tree for a second `require('pg')`
 * so the boundary cannot quietly lapse.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 *
 *   DATABASE_URL       postgresql://user:pass@host:5432/db?sslmode=require
 *   DATABASE_SCHEMA    schema to use; default `public`. Tests set one per
 *                      Jest worker so suites can run in parallel on one DB.
 *   DATABASE_SSL       true | no-verify | false. Unset lets the URL decide.
 *   DATABASE_POOL_MAX  connections per process; default 3, because a
 *                      serverless function is one of many processes.
 *
 * ── Transactions ───────────────────────────────────────────────────────────
 *
 * `withTransaction(fn)` runs `fn` on one connection inside BEGIN … COMMIT and
 * publishes that connection through AsyncLocalStorage, so every `query()` made
 * anywhere in the call tree — a service two modules away that has no idea it
 * is inside a transaction — lands on the same connection. That is what lets
 * lock-and-supersede, revision-and-carry-forward and adopt-to-book become
 * atomic without threading a handle through every signature. A nested call
 * joins the outer transaction rather than opening a second one.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const { AsyncLocalStorage } = require('async_hooks');
const logger = require('../observability/logger');
const log = logger.for('platform/database/client');
const config = require('../config');
const { asError } = require('../../shared/types');
const { intOr } = require('../../shared/numbers');

let pgLib = null;
try { pgLib = require('pg'); } catch (_) { pgLib = null; }

const txContext = new AsyncLocalStorage();
let _pool = null;

/** Configured means: the driver is installed and DATABASE_URL is set. */
function isConfigured() {
  return !!(pgLib && String(config.runtime.databaseUrl).trim());
}

/** A schema name is an identifier, and an identifier is validated, never quoted around. */
function schemaName() {
  const s = String(config.runtime.databaseSchema || 'public').trim();
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) {
    const err = /** @type {AppError} */ (new Error(`DATABASE_SCHEMA "${s}" is not a plain lower-case identifier.`));
    err.code = 'DATABASE_SCHEMA_INVALID';
    throw err;
  }
  return s;
}

/**
 * TLS to the database. DATABASE_SSL decides when set; otherwise the URL's
 * own sslmode decides; otherwise a host that is not this machine gets TLS
 * with certificate verification, because the database is provisioned apart
 * from the platform and the wire between them is not ours.
 */
function sslConfig() {
  const v = String(config.runtime.databaseSsl).trim().toLowerCase();
  if (v === 'true' || v === 'require' || v === 'verify-full') return { rejectUnauthorized: true };
  if (v === 'no-verify') return { rejectUnauthorized: false };
  if (v === 'false' || v === 'disable') return false;
  let url;
  try { url = new URL(config.runtime.databaseUrl); } catch (_) { return undefined; }
  if (url.searchParams.has('sslmode')) return undefined; // the driver honours it
  const host = url.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '' || host.endsWith('.local');
  return local ? undefined : { rejectUnauthorized: true };
}

function pool() {
  if (_pool) return _pool;
  if (!isConfigured()) {
    const err = /** @type {AppError} */ (new Error('PostgreSQL is not configured: DATABASE_URL is unset or the pg driver is missing.'));
    err.statusCode = 503;
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }
  const schema = schemaName();
  const ssl = sslConfig();
  _pool = new pgLib.Pool({
    connectionString: config.runtime.databaseUrl,
    ...(ssl === undefined ? {} : { ssl }),
    /* The schema travels as a startup parameter, so it is in force before
       the first statement and needs no query of its own on connect. Sent
       only when a schema was asked for: a connection pooler in front of an
       external database may refuse startup options it does not know. */
    ...(schema === 'public' ? {} : { options: `-c search_path=${schema}` }),
    max: Math.max(1, intOr(config.runtime.databasePoolMax, 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    /* A serverless function is killed at 26 s; a statement must give up first. */
    statement_timeout: 20_000,
  });
  _pool.on('error', err => {
    log.error({ err, kind: logger.classify(err) }, 'idle database client error');
  });
  return _pool;
}

/** Runs on the transaction's connection when inside one, else on the pool. */
async function query(text, params) {
  const client = txContext.getStore();
  if (client) return client.query(text, params);
  return pool().query(text, params);
}

function inTransaction() {
  return !!txContext.getStore();
}

async function withTransaction(fn) {
  if (txContext.getStore()) return fn();
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await txContext.run(client, () => fn());
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(logger.fallback('database.rollback'));
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Can the database be reached, right now, within a bounded time?
 * Used by /health so "DATABASE_URL never took" and "the database is down"
 * stop looking identical from a browser.
 */
async function ping({ timeoutMs = 1500 } = {}) {
  if (!isConfigured()) return { reachable: false, error: 'not configured' };
  const started = Date.now();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([pool().query('SELECT 1'), timeout]);
    return { reachable: true, latencyMs: Date.now() - started };
  } catch (thrown) {
    const err = asError(thrown);
    return { reachable: false, latencyMs: Date.now() - started, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function close() {
  const p = _pool;
  _pool = null;
  if (p) await p.end().catch(logger.fallback('database.close', undefined, { level: 'debug' }));
}

/** Test helper — forget the pool so the environment can change. */
async function _reset() { await close(); }

module.exports = {
  isConfigured, schemaName, sslConfig, pool, query, withTransaction, inTransaction, ping, close, _reset,
  /** Exposed so the migrator and the test reset can run statements outside the seam. */
  _driverLoaded: () => !!pgLib,
};
