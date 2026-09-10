// @ts-check
/**
 * One canonicalisation, one hash.
 *
 * A checksum over a JSON structure is only reproducible if the serialisation
 * is: two encodings of identical content that differ in key order hash
 * differently, and nothing across a store round-trip or a re-read from disk
 * guarantees key order. So keys are sorted at every level before hashing.
 *
 * This lived inside the GCF period package, which was the first thing here to
 * need it. The factor tables need the same property for a different reason —
 * a bank has to be able to say which set of emission factors a disclosure was
 * computed on, and a version string alone can be edited without the figures
 * changing or the figures changed without the version moving. Two copies of a
 * canonicaliser is two things that can disagree about what a document is, so
 * there is one, here, where both may import it.
 */

'use strict';

const crypto = require('crypto');

/**
 * Canonical JSON: keys sorted at every level, `undefined` written as `null`
 * so a re-serialisation of the same content produces the same string.
 * @param {any} value
 * @returns {string}
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * SHA-256, hex, over the canonical form of `value`.
 * @param {any} value
 * @returns {string}
 */
function checksum(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

module.exports = { canonical, checksum };
