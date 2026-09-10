// @ts-check
/**
 * One adapter per store, chosen once by the mode `capability()` resolved.
 *
 * Before this, each verb on the seam decided for itself: it wrote to memory,
 * then asked `isDurable()` — "is Firebase configured" — rather than asking
 * which store had been chosen. So `STORAGE_BACKEND=memory` on a deployment
 * with Firebase set wrote to both, and a read came back from Firebase. The
 * module's own header forbids exactly that, for Blobs. Selecting once is what
 * makes the rule structural instead of a comment.
 *
 * The four are held to one another by `tests/store-conformance.test.js`,
 * which runs the same suite against every adapter this process can reach and
 * states the differences it finds rather than hiding them.
 */

'use strict';

const memory = require('./memory');
const firebase = require('./firebase');
const blobs = require('./blobs');
const postgres = require('./postgres');

/** @typedef {import('../../../shared/types').AppError} AppError */

const ADAPTERS = Object.freeze({ memory, firebase, blobs, postgres });

/**
 * The adapter for a resolved mode. `none` has no adapter: a deployment that
 * cannot persist is refused at `assertWritable()` before it reaches here, and
 * a read answers empty rather than pretending.
 * @param {string} mode
 */
function adapterFor(mode) {
  return ADAPTERS[mode] || null;
}

module.exports = { adapterFor, ADAPTERS };
