/**
 * CarbonIQ FinTech — API Key Model
 *
 * Schema and CRUD operations for bank API keys.
 * Keys are SHA-256 hashed before storage.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../bridge/firebase');
const { hashApiKey } = require('../middleware/api-key');

/**
 * Generate a new API key for a bank organization.
 *
 * @param {Object} params
 * @param {string} params.orgId - Organization ID
 * @param {string} params.orgName - Organization display name
 * @param {string[]} params.projectIds - Scoped project IDs
 * @param {string[]} params.permissions - Permission list
 * @param {string} params.createdBy - Admin user UID
 * @param {boolean} params.isTest - true for test keys (ck_test_), false for live (ck_live_)
 * @returns {Object} { key, keyPrefix, hashedKey }
 */
async function createApiKey({ orgId, orgName, projectIds, permissions, createdBy, isTest = false }) {
  const prefix = isTest ? 'ck_test_' : 'ck_live_';
  const random = crypto.randomBytes(16).toString('hex');
  const key = `${prefix}${random}`;
  const hashed = hashApiKey(key);

  const keyData = {
    orgId,
    orgName,
    projectIds: projectIds || [],
    permissions: permissions || ['read:score', 'read:pcaf', 'read:taxonomy'],
    rateLimit: 100,
    created: Date.now(),
    lastUsed: null,
    active: true,
    createdBy,
    keyPrefix: key.substring(0, 12) + '...'
  };

  const db = getDatabase();
  await db.ref(`fintech/apiKeys/${hashed}`).set(keyData);

  return {
    key, // Return the full key ONCE — it cannot be retrieved later
    keyPrefix: keyData.keyPrefix,
    hashedKey: hashed
  };
}

/**
 * Revoke an API key.
 */
async function revokeApiKey(hashedKey) {
  const db = getDatabase();
  await db.ref(`fintech/apiKeys/${hashedKey}/active`).set(false);
}

module.exports = { createApiKey, revokeApiKey };
