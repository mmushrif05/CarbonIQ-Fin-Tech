// @ts-check
/**
 * The one thing two GCF route files both need.
 *
 * `readWeights` reads the reader's own weighting off the query string. It sat
 * between the routes that use it and the routes that do not, which is how it
 * ended up in the wrong half when this file was split — so it lives here,
 * where both halves resolve it from one place.
 *
 * A weight that is not a number of zero or more is refused rather than
 * defaulted: a ranking silently computed on a weighting the caller did not ask
 * for is a ranking they would have no reason to doubt.
 */

'use strict';

const screening = require('../../../domain/screening');

/**
 * One validator for the weighting, shared by /ranking and /recommendation.
 *
 * The same rules in two places are two chances for one to drift, and that has
 * already happened once in this codebase — the capital basket accepted
 * assumptions the dashboard validated differently.
 */
function readWeights(req) {
  const supplied = {};
  let any = false;
  for (const k of Object.keys(screening.DEFAULT_WEIGHTS)) {
    const raw = req.query[k];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      const err = /** @type {import('../../../../../shared/types').AppError} */ (
        new Error(`Weight "${k}" must be a number of zero or more.`));
      err.statusCode = 400;
      err.code = 'INVALID_WEIGHTS';
      throw err;
    }
    supplied[k] = n;
    any = true;
  }
  /* Only a changed weight is sent, so an untouched one is answered by the
     engine's own default rather than asserted by the caller. */
  return any ? supplied : undefined;
}

module.exports = { readWeights };
