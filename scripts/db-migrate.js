#!/usr/bin/env node
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

const cmd = process.argv[2] || 'up';
const ifConfigured = process.argv.includes('--if-configured');

(async () => {
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
  } catch (err) {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
