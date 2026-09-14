// @ts-check
/**
 * Document identity — what tells one rendering of a position from another.
 *
 * A filed disclosure has to be matchable to the copy the verifier signed.
 * Three things do that, and the cover prints all three:
 *
 *   the report reference, derived from the content rather than the clock, so
 *   the same position rendered twice carries the same reference and a changed
 *   figure carries a different one;
 *
 *   the build that produced it — the commit the deployment reports on
 *   /health — so a figure can be traced to the engine version that computed
 *   it;
 *
 *   a SHA-256 over the canonical form of the facts, keys sorted at every
 *   level, the same discipline the factor manifests and the GCF period
 *   package follow.
 *
 * The publication instant is deliberately outside the hash: it says when a
 * copy was rendered, not what it says.
 */

'use strict';

const crypto = require('crypto');
const config = require('../../../platform/config');

/** Keys sorted at every level, so a re-serialisation of the same content hashes the same. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((o, k) => { o[k] = canonical(value[k]); return o; }, /** @type {any} */ ({}));
  }
  return value;
}

/* The fields that vary between two renderings of one position, and so must
   not enter the hash: the instant, the reference itself, and this block. */
const VOLATILE = new Set(['publishedAt', 'reportId', 'identity', 'url']);

function contentHash(facts) {
  const stable = Object.fromEntries(Object.entries(facts || {}).filter(([k]) => !VOLATILE.has(k)));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(stable))).digest('hex');
}

/**
 * @param {any} facts        the document's facts, before the identity is attached
 * @param {string} prefix    'PA52' for §5.2, 'PA59' for §5.9, 'PA' for the consolidated document
 */
function identityOf(facts, prefix) {
  const hash = contentHash(facts);
  const year = facts && facts.reportingYear ? String(facts.reportingYear) : 'na';
  const build = config.runtime.build || {};
  const commit = build.commit ? String(build.commit).slice(0, 12) : null;
  const reference = `${prefix}-${year}-${hash.slice(0, 12)}`;
  return {
    reference,
    contentHash: hash,
    algorithm: 'SHA-256 over the canonical form of the document facts (keys sorted at every level), excluding the publication instant',
    build: commit,
    buildContext: build.context || null,
    lines: [
      `Content hash ${hash.slice(0, 16)}… (SHA-256, canonical form)`,
      commit ? `Produced by build ${commit}` : 'Produced by a local build (no commit stamped)',
    ],
  };
}

module.exports = { identityOf, contentHash, canonical };
