// @ts-check
/**
 * Migrate every worker schema the suite may use.
 *
 * `tests/global-setup.js` does this at the start of a run; this does it once
 * up front so `npm run db:test-up` leaves a database the suite can use
 * immediately, and so a failure to migrate is reported by the command that
 * provisioned it rather than as a test failure.
 */

'use strict';

const os = require('os');

module.exports = async function migrateWorkerSchemas(url) {
  process.env.DATABASE_URL = url;
  const client = require('../src/platform/database/client');
  const migrate = require('../src/platform/database/migrate');
  const workers = Math.max(1, Math.min(64, Number(process.env.JEST_MAX_WORKERS) || os.cpus().length));
  for (let i = 1; i <= workers; i += 1) {
    process.env.DATABASE_SCHEMA = `test_w${i}`;
    await client._reset();
    await migrate.up();
  }
  await client.close();
  delete process.env.DATABASE_SCHEMA;
  process.stdout.write(`Migrated ${workers} worker schema(s).\n`);
};
