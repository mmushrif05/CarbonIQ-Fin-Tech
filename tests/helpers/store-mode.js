// @ts-check
/**
 * Which store this run is on, and how a test says it only applies to one.
 *
 * Fifteen suites pinned themselves to the memory store at module scope, so
 * `npm run test:postgres` never ran them — including the whole GCF domain,
 * whose `infrastructure/store.js` is a storage adapter. Removing the pins
 * showed why they were there: a handful of assertions are about the *store's
 * capability* rather than the domain's behaviour, and were written against the
 * only store the suite ever saw. "503 because nothing can persist" is true on
 * memory and false on PostgreSQL; "a required transaction is refused" is the
 * other way round.
 *
 * A test like that is not wrong, it is conditional — so it says so here,
 * rather than the whole suite opting out of a store it otherwise exercises
 * fully. Everything not marked runs on both.
 */

'use strict';

/** True when the suite is running against PostgreSQL. */
const onPostgres = Boolean(process.env.TEST_DATABASE_URL);

/** True when the suite is running against the in-process store. */
const onMemory = !onPostgres;

/** A `describe` that runs only on PostgreSQL. */
const describeOnPostgres = onPostgres ? describe : describe.skip;
/** A `describe` that runs only on the in-process store. */
const describeOnMemory = onMemory ? describe : describe.skip;
/** A `test` that runs only on PostgreSQL. */
const testOnPostgres = onPostgres ? test : test.skip;
/** A `test` that runs only on the in-process store. */
const testOnMemory = onMemory ? test : test.skip;

module.exports = {
  onPostgres, onMemory,
  describeOnPostgres, describeOnMemory,
  testOnPostgres, testOnMemory,
};
