#!/usr/bin/env node
// @ts-check
/**
 * Schema migrations against DATABASE_URL.
 *
 *   npm run db:migrate            apply every pending migration
 *   npm run db:status             what is applied, pending, drifted
 *   npm run db:rollback           roll back the last one (if it has a -- down)
 *
 * `--if-configured` makes an unset DATABASE_URL a no-op exit 0, so the same
 * build command works on a deployment that has no database yet.
 */

'use strict';

require('dotenv').config();
const client = require('../src/platform/database/client');
const migrate = require('../src/platform/database/migrate');
const { asError } = require('../src/shared/types');

const cmd = process.argv[2] || 'up';
const ifConfigured = process.argv.includes('--if-configured');

/**
 * A deploy preview never migrates.
 *
 * The build command ends with `db-migrate up --if-configured`, and
 * `--if-configured` only skips when DATABASE_URL is *unset*. Neither the
 * staging nor the preview context defines its own, so both inherit whatever
 * is set at site scope — and if the operator set DATABASE_URL site-wide
 * rather than per context, every pull-request build would run migrations
 * against production and preview traffic would read and write production
 * records. docs/ENVIRONMENTS.md instructs otherwise; instruction is not
 * enforcement, and the cost of being wrong once is the whole book.
 *
 * A preview that genuinely has its own database can say so with
 * ALLOW_PREVIEW_MIGRATIONS=true.
 */
function previewGuard() {
  const context = process.env.CONTEXT || '';
  if (context !== 'deploy-preview' && context !== 'branch-deploy') return null;
  if (process.env.ALLOW_PREVIEW_MIGRATIONS === 'true' || process.env.ALLOW_PREVIEW_MIGRATIONS === '1') return null;
  return context;
}

(async () => {
  const preview = previewGuard();
  if (preview && (cmd === 'up' || cmd === 'down')) {
    console.log(`Context is "${preview}" — not migrating.`);
    console.log('  A preview shares whatever DATABASE_URL is set at site scope, which may be production.');
    console.log('  Give this context its own database, or set ALLOW_PREVIEW_MIGRATIONS=true if it already has one.');
    process.exit(0);
  }
  if (!client.isConfigured()) {
    if (ifConfigured) { console.log('DATABASE_URL not set — skipping migrations.'); process.exit(0); }
    console.error('DATABASE_URL is not set. Nothing to migrate against.');
    process.exit(2);
  }
  const log = m => console.log(`  ${m}`);
  try {
    if (cmd === 'up') {
      const r = await migrate.up({ log });
      console.log(`Applied ${r.applied.length} migration(s); ${r.totalApplied} applied in total; schema ${client.schemaName()} is current.`);
    } else if (cmd === 'status') {
      const ping = await client.ping({ timeoutMs: 5000 });
      if (!ping.reachable) { console.error(`Cannot reach PostgreSQL: ${ping.error}`); process.exitCode = 4; return; }
      const { rows } = await client.query('SELECT version() AS v, current_database() AS db, current_user AS u, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl');
      const r = rows[0] || {};
      console.log(`Reached ${r.db || '?'} as ${r.u || '?'} in ${ping.latencyMs} ms — ${String(r.v || '').split(' on ')[0]}${r.ssl ? ', TLS on' : ', TLS off'}`);
      const s = await migrate.status();
      console.log(`Schema ${client.schemaName()}`);
      for (const m of s.applied) console.log(`  applied  ${m.name}  (${new Date(m.appliedAt).toISOString()})`);
      for (const m of s.pending) console.log(`  pending  ${m.name}`);
      for (const m of s.drifted) console.log(`  DRIFTED  ${m.name}  file no longer matches what was applied`);
      for (const m of s.missing) console.log(`  MISSING  ${m.name}  applied, but no file of that version exists`);
      if (s.drifted.length || s.missing.length) process.exitCode = 3;
    } else if (cmd === 'down' || cmd === 'rollback') {
      const r = await migrate.down({ log });
      console.log(r.rolledBack ? `Rolled back ${r.rolledBack.name}.` : 'Nothing applied; nothing to roll back.');
    } else {
      console.error(`Unknown command "${cmd}". Use up | status | down.`);
      process.exitCode = 2;
    }
  } catch (thrown) {
    const err = asError(thrown);
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
