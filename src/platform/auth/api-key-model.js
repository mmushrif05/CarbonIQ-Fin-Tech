// @ts-check
/**
 * CarbonIQ FinTech — API Key Model
 *
 * The record a key is, and the four things done to one: issue, scope,
 * rotate, revoke. Keys are SHA-256 hashed before storage; the plain key is
 * returned once, at issue, and never again.
 *
 * `scopes` is what the key may do (src/platform/auth/scopes.js). A record
 * without one is a key issued before scopes existed: it keeps everything it
 * had, is flagged unscoped on every response, and is held to scopes the
 * moment `setScopes()` records them. `expiresAt` is optional; a rotation
 * sets it on the old key to the end of a grace period, so an integration
 * has that long to move to the new one.
 *
 * Every function takes the key store it writes to (src/platform/auth/key-store.js
 * — PostgreSQL through the seam, or Firebase), so the CLI and the
 * application share one definition of the record.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const crypto = require('crypto');
const { hashApiKey } = require('./api-key');
const { normaliseScopes } = require('./scopes');
const { firebaseKeyStore, FIREBASE_PATH: KEYS_PATH } = require('./key-store');

/** A key store, or a raw Firebase handle for callers that still hold one. */
const ks = s => (s && typeof s.ref === 'function' ? firebaseKeyStore(s) : s);

function generatePlainKey(isTest) {
  return `${isTest ? 'ck_test_' : 'ck_live_'}${crypto.randomBytes(16).toString('hex')}`;
}

function parseExpiry(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = /** @type {AppError} */ (new Error(`expiresAt "${value}" is not a date.`));
    err.code = 'BAD_EXPIRY';
    throw err;
  }
  if (d.getTime() <= Date.now()) {
    const err = /** @type {AppError} */ (new Error(`expiresAt ${d.toISOString()} is already in the past.`));
    err.code = 'BAD_EXPIRY';
    throw err;
  }
  return d.toISOString();
}

/**
 * The record for a new key. Pure: no database.
 * @returns {{ key: string, hashedKey: string, record: object }}
 */
function buildKeyRecord({ orgId, orgName, keyName, projectIds, permissions, scopes, expiresAt, createdBy, isTest = false, rateLimit }) {
  if (!orgId || !orgName) throw Object.assign(new Error('orgId and orgName are required.'), { code: 'KEY_FIELDS_REQUIRED' });
  const key = generatePlainKey(isTest);
  const hashedKey = hashApiKey(key);
  const record = {
    id: hashedKey,
    orgId,
    orgName,
    keyName: keyName || 'unnamed',
    keyType: isTest ? 'test' : 'live',
    projectIds: projectIds || [],
    permissions: permissions || ['read', 'write', 'assess', 'pcaf', 'taxonomy', 'covenant', 'portfolio', 'agent'],
    scopes: normaliseScopes(scopes === undefined || scopes === null ? ['read'] : scopes),
    expiresAt: parseExpiry(expiresAt),
    rateLimit: rateLimit || 100,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
    lastUsed: null,
    keyPrefix: key.substring(0, 12) + '...',
  };
  return { key, hashedKey, record };
}

async function createApiKey(db, params) {
  const built = buildKeyRecord(params);
  await ks(db).set(built.hashedKey, built.record);
  return { key: built.key, hashedKey: built.hashedKey, keyPrefix: built.record.keyPrefix, record: built.record };
}

async function getApiKeyRecord(db, hashedKey) {
  return (await ks(db).get(hashedKey)) || null;
}

async function listApiKeys(db) {
  const all = await ks(db).list();
  return all.map(r => ({ ...r, unscoped: !Array.isArray(r.scopes) }));
}

/** Apply scopes to an existing key — the moment an unscoped key becomes held to something. */
async function setScopes(db, hashedKey, scopes) {
  const list = normaliseScopes(scopes);
  const current = await getApiKeyRecord(db, hashedKey);
  if (!current) throw Object.assign(new Error(`No key ${hashedKey.slice(0, 16)}….`), { code: 'KEY_NOT_FOUND' });
  await ks(db).update(hashedKey, { scopes: list, scopesSetAt: new Date().toISOString() });
  return { hashedKey, scopes: list, wasUnscoped: !Array.isArray(current.scopes) };
}

async function setExpiry(db, hashedKey, expiresAt) {
  const iso = parseExpiry(expiresAt);
  const current = await getApiKeyRecord(db, hashedKey);
  if (!current) throw Object.assign(new Error(`No key ${hashedKey.slice(0, 16)}….`), { code: 'KEY_NOT_FOUND' });
  await ks(db).update(hashedKey, { expiresAt: iso });
  return { hashedKey, expiresAt: iso };
}

/**
 * Rotate: issue a replacement carrying the same organisation, name, scopes
 * and project list; give the old key a grace period and point it at the new
 * one, so a request on it after expiry says where to go.
 */
async function rotateApiKey(db, hashedKey, { graceDays = 7, createdBy } = /** @type {{graceDays?: any, createdBy?: any}} */ ({})) {
  const current = await getApiKeyRecord(db, hashedKey);
  if (!current) throw Object.assign(new Error(`No key ${hashedKey.slice(0, 16)}….`), { code: 'KEY_NOT_FOUND' });
  if (!current.active) throw Object.assign(new Error('A revoked key cannot be rotated; issue a new one.'), { code: 'KEY_REVOKED' });
  const days = Math.max(0, Number(graceDays) || 0);
  const graceEnd = new Date(Date.now() + days * 86_400_000).toISOString();
  const issued = await createApiKey(db, {
    orgId: current.orgId, orgName: current.orgName, keyName: current.keyName,
    projectIds: current.projectIds, permissions: current.permissions,
    scopes: Array.isArray(current.scopes) ? current.scopes : undefined,
    isTest: current.keyType === 'test', rateLimit: current.rateLimit, createdBy,
  });
  const oldUpdate = { supersededBy: issued.hashedKey, rotatedAt: new Date().toISOString() };
  if (days === 0) oldUpdate.active = false; else oldUpdate.expiresAt = graceEnd;
  await ks(db).update(hashedKey, oldUpdate);
  return { ...issued, previous: hashedKey, previousExpiresAt: days === 0 ? null : graceEnd, previousRevoked: days === 0 };
}

async function revokeApiKey(db, hashedKey) {
  await ks(db).update(hashedKey, { active: false, revokedAt: new Date().toISOString() });
}

module.exports = { KEYS_PATH, buildKeyRecord, createApiKey, getApiKeyRecord, listApiKeys, setScopes, setExpiry, rotateApiKey, revokeApiKey, parseExpiry };
