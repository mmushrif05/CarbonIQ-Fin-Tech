// @ts-check
/**
 * Migrations — plain SQL, applied in order, recorded with a checksum.
 *
 * Every schema change is a numbered file in `migrations/`, checked in, and
 * applied exactly once per database. The record of what was applied lives in
 * the database itself (`schema_migrations`), with the SHA-256 of the file at
 * the time, so an edit to an already-applied migration is detected as
 * **drift** and refused rather than silently ignored — a migration that reads
 * differently from what the database ran is worse than a missing one.
 *
 * SQL rather than an ORM's DSL because a bank's DBA reviews SQL, a rollback
 * is written in SQL, and there is no generated client to ship into a
 * serverless bundle. Each file may carry a `-- down` section after a line
 * reading exactly `-- down`; `down()` runs it for the last applied migration.
 *
 * Nothing here runs at request time. Deploys run `npm run db:migrate`;
 * `/health` reports `pending` so a forgotten one is visible.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const client = require('./client');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'migrations');
const LOCK_KEY = 7_364_001; // arbitrary, stable: one migrator at a time per database

function checksum(sql) { return crypto.createHash('sha256').update(sql, 'utf8').digest('hex'); }

/** The files on disk, in version order. */
function files(dir = MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(f))
    .sort()
    .map(f => {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const [up, down] = splitDown(sql);
      return { version: Number(f.slice(0, 4)), name: f.replace(/\.sql$/i, ''), file: f, sql, up, down, checksum: checksum(sql) };
    });
}

function splitDown(sql) {
  const idx = sql.split('\n').findIndex(l => l.trim() === '-- down');
  if (idx < 0) return [sql, null];
  const lines = sql.split('\n');
  return [lines.slice(0, idx).join('\n'), lines.slice(idx + 1).join('\n')];
}

async function ensureLedger() {
  const schema = client.schemaName();
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(`CREATE TABLE IF NOT EXISTS "${schema}".schema_migrations (
    version    integer PRIMARY KEY,
    name       text NOT NULL,
    checksum   char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/**
 * @returns {Promise<{applied: object[], pending: object[], drifted: object[], missing: object[]}>}
 *  drifted: applied, but the file now hashes differently.
 *  missing: applied, but no file of that version exists any more.
 */
async function status({ dir } = /** @type {{dir?: any}} */ ({})) {
  await ensureLedger();
  const onDisk = files(dir);
  const { rows } = await client.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
  const byVersion = new Map(rows.map(r => [Number(r.version), r]));
  const applied = [], pending = [], drifted = [];
  for (const m of onDisk) {
    const row = byVersion.get(m.version);
    if (!row) { pending.push({ version: m.version, name: m.name }); continue; }
    const entry = { version: m.version, name: m.name, appliedAt: row.applied_at };
    if (row.checksum !== m.checksum) drifted.push({ ...entry, expected: row.checksum, actual: m.checksum });
    else applied.push(entry);
  }
  const known = new Set(onDisk.map(m => m.version));
  const missing = rows.filter(r => !known.has(Number(r.version))).map(r => ({ version: Number(r.version), name: r.name }));
  return { applied, pending, drifted, missing };
}

/** Apply every pending migration, each in its own transaction, under one lock. */
async function up({ dir, log = (_message) => {} } = /** @type {{dir?: string, log?: (message: string) => void}} */ ({})) {
  await ensureLedger();
  const s = await status({ dir });
  if (s.drifted.length) {
    const err = /** @type {AppError} */ (new Error(`Refusing to migrate: ${s.drifted.length} applied migration(s) no longer match their file — ${s.drifted.map(d => d.name).join(', ')}. An applied migration is history; write a new one.`));
    err.code = 'MIGRATION_DRIFT';
    throw err;
  }
  const todo = files(dir).filter(m => s.pending.some(p => p.version === m.version));
  const done = [];
  for (const m of todo) {
    await client.withTransaction(async () => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [m.version]);
      if (rows.length) return; // another process got here first
      await client.query(m.up);
      await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [m.version, m.name, m.checksum]);
      done.push({ version: m.version, name: m.name });
      log(`applied ${m.name}`);
    });
  }
  const after = await status({ dir });
  return { applied: done, totalApplied: after.applied.length, pending: after.pending, drifted: after.drifted };
}

/** Roll back the most recently applied migration, if its file carries a `-- down` section. */
async function down({ dir, log = (_message) => {} } = /** @type {{dir?: string, log?: (message: string) => void}} */ ({})) {
  await ensureLedger();
  const { rows } = await client.query('SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1');
  if (!rows.length) return { rolledBack: null };
  const last = files(dir).find(m => m.version === Number(rows[0].version));
  if (!last) throw Object.assign(new Error(`No file for applied migration ${rows[0].name}; cannot roll it back.`), { code: 'MIGRATION_FILE_MISSING' });
  if (!last.down) throw Object.assign(new Error(`${last.name} has no "-- down" section; it is forward-only.`), { code: 'MIGRATION_NO_DOWN' });
  await client.withTransaction(async () => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await client.query(last.down);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [last.version]);
  });
  log(`rolled back ${last.name}`);
  return { rolledBack: { version: last.version, name: last.name } };
}

module.exports = { files, status, up, down, checksum, ensureLedger, MIGRATIONS_DIR };
