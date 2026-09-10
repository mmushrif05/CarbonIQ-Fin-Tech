// @ts-check
/**
 * Passwords, hashed with scrypt.
 *
 * scrypt is in Node's standard library, so there is no native dependency to
 * build on the deployment platform and nothing to keep patched. It is memory-
 * hard, which is the property that matters: an attacker who takes the table
 * cannot trade memory for speed the way they can against a plain hash.
 *
 * The stored form carries its own parameters — `scrypt$N$r$p$salt$hash` — so
 * raising the cost later does not invalidate anyone's password. A hash
 * written under the old parameters still verifies, and `needsRehash()` says
 * when to write a stronger one on the next successful sign-in.
 *
 * Comparison is `timingSafeEqual`. The window on a password check is small,
 * but it is free to close and a bank's security review will look for it.
 */

'use strict';

const crypto = require('crypto');

/** @typedef {import('../../shared/types').AppError} AppError */

/** 2^14 rounds, r=8, p=1 — the parameters Node's own documentation uses. */
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64 });

/** Below this a password is refused outright rather than hashed. */
const MIN_LENGTH = 12;

const scrypt = (password, salt, keylen, options) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key));
  });

/**
 * Refuse a password that cannot protect an account, naming the rule.
 * Length is the only requirement: composition rules push people towards
 * predictable substitutions and NIST stopped recommending them in 2017.
 * @param {string} password
 */
function assertUsable(password) {
  const value = String(password == null ? '' : password);
  if (value.length < MIN_LENGTH) {
    const err = /** @type {AppError} */ (new Error(
      `A password must be at least ${MIN_LENGTH} characters.`));
    err.statusCode = 400;
    err.code = 'WEAK_PASSWORD';
    err.remedy = 'Use a passphrase — several words is easier to remember and harder to guess than a short mixed string.';
    throw err;
  }
  return value;
}

/**
 * Hash a password for storage.
 * @param {string} password
 * @returns {Promise<string>} `scrypt$N$r$p$saltB64$hashB64`
 */
async function hash(password) {
  const value = assertUsable(password);
  const salt = crypto.randomBytes(16);
  const key = /** @type {Buffer} */ (await scrypt(value, salt, PARAMS.keylen,
    { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p }));
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p,
    salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Verify a password against a stored hash. Never throws on a malformed or
 * absent hash — an account with no usable credential simply cannot sign in,
 * and saying which of the two went wrong tells an attacker whether the
 * address exists.
 * @param {string} password
 * @param {string|null|undefined} stored
 * @returns {Promise<boolean>}
 */
async function verify(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const N = Number(n), R = Number(r), P = Number(p);
  if (!Number.isFinite(N) || !Number.isFinite(R) || !Number.isFinite(P)) return false;

  let expected;
  try {
    expected = Buffer.from(hashB64, 'base64');
  } catch { return false; }
  if (expected.length === 0) return false;

  try {
    const key = /** @type {Buffer} */ (await scrypt(
      String(password == null ? '' : password),
      Buffer.from(saltB64, 'base64'), expected.length, { N, r: R, p: P }));
    return crypto.timingSafeEqual(key, expected);
  } catch {
    /* A stored hash whose parameters this build cannot compute — an N above
       the memory limit, say — is a failure to verify, not a pass. */
    return false;
  }
}

/**
 * Whether a stored hash was written under weaker parameters than the current
 * ones, so a successful sign-in can quietly upgrade it.
 * @param {string|null|undefined} stored
 */
function needsRehash(stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r;
}

module.exports = { hash, verify, needsRehash, assertUsable, MIN_LENGTH, PARAMS };
