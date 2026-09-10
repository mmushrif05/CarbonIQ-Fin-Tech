// @ts-check
/**
 * When TEST_DATABASE_URL is set the suite runs against PostgreSQL, and each
 * Jest worker gets its own schema so suites stay parallel and isolated. This
 * creates and migrates one schema per possible worker before any test runs.
 */
'use strict';

const os = require('os');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  process.env.DATABASE_URL = url;
  const client = require('../src/platform/database/client');
  const migrate = require('../src/platform/database/migrate');

  /* A database that is not there used to surface as a raw ECONNREFUSED stack
     trace from inside a migration, which reads as a broken repository rather
     than as a missing service — so developers ran the memory suite and learned
     about foreign-key failures from CI instead. */
  try {
    await client.query('select 1');
  } catch (err) {
    const port = (url.match(/:(\d+)\//) || [])[1] || '54329';
    throw new Error(
      `The PostgreSQL suite needs a database at ${url.replace(/:[^:@/]*@/, ':***@')}, `
      + `and nothing answered on port ${port}.\n\n`
      + '  npm run db:test-up      start one in Docker and migrate it\n'
      + '  npm run db:test-status  what is listening, and what the suite will use\n\n'
      + 'Or point the suite at a database you already have:\n'
      + '  TEST_DATABASE_URL=postgresql://user:pass@host:5432/db npm run test:postgres\n\n'
      + `The underlying failure was: ${/** @type {Error} */ (err).message}`);
  }
  const workers = Math.max(1, Math.min(64, Number(process.env.JEST_MAX_WORKERS) || os.cpus().length));
  for (let i = 1; i <= workers; i++) {
    process.env.DATABASE_SCHEMA = `test_w${i}`;
    await client._reset();
    await migrate.up();
  }
  await client.close();
  delete process.env.DATABASE_SCHEMA;
};
