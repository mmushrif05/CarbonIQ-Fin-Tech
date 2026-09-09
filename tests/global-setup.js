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
  const client = require('../platform/database/client');
  const migrate = require('../platform/database/migrate');
  const workers = Math.max(1, Math.min(64, Number(process.env.JEST_MAX_WORKERS) || os.cpus().length));
  for (let i = 1; i <= workers; i++) {
    process.env.DATABASE_SCHEMA = `test_w${i}`;
    await client._reset();
    await migrate.up();
  }
  await client.close();
  delete process.env.DATABASE_SCHEMA;
};
