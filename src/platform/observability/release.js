// @ts-check
/**
 * The identity of the running build — one reading, used by /health, the
 * logger's base fields and every error report, so the three cannot disagree
 * about which commit produced a line.
 *
 * COMMIT_REF is a build-time variable and is absent from the function's
 * runtime environment; the build stamps build-info.json and this reads it,
 * falling back to the environment for a local run. Absent stays absent
 * rather than being guessed.
 */

'use strict';

const config = require('../config');

function release() {
  let stamped = {};
  try { stamped = require('../../../build-info.json'); } catch (_) { stamped = {}; }
  const b = config.runtime.build;
  const commit = stamped.commit || b.commit || null;
  return {
    commit,
    short: commit ? String(commit).slice(0, 12) : null,
    branch: stamped.branch || b.branch || null,
    deployId: stamped.deployId || b.deployId || null,
    context: stamped.context || b.context || null,
    builtAt: stamped.builtAt || null,
  };
}

module.exports = { release };
