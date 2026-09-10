// @ts-check
/**
 * What every test file gets, whichever store it runs on.
 *
 * **A clean schema per file.** `tests/global-setup.js` migrates one schema per
 * Jest worker, once, and nothing truncated it between files. A worker runs
 * many suites in sequence, `'org1'` appears across five of them, and worker
 * assignment is not deterministic — so a suite could read a row another suite
 * wrote, pass, and fail on a machine with a different core count. That is the
 * hardest class of failure to diagnose because it is not in either suite.
 * Memory-store suites never had it: `store._resetMemory()` in `beforeEach` is
 * the discipline, and this applies the same thing on PostgreSQL, once per
 * file, so a suite that seeds in `beforeAll` still works.
 *
 * **The pool is closed at the end.** Each worker holds a PostgreSQL pool; left
 * open it is the handle behind "a worker process has failed to exit
 * gracefully".
 */

'use strict';

if (process.env.TEST_DATABASE_URL) {
  /* Required inside the hooks, never at module scope. This file loads before
     the test file does, so a `require` here puts the module and everything it
     depends on into the registry with its *real* dependencies — and a suite
     that then calls `jest.mock('@netlify/blobs')` mocks a module the store has
     already resolved. That failure reads as "Blobs is not available in this
     runtime" from inside a suite whose whole subject is Blobs. */
  beforeAll(async () => {
    await require('../src/platform/database/store')._resetMemory();
  });
  afterAll(async () => {
    await require('../src/platform/database/client').close();
  });
}
