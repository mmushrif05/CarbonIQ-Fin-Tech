// @ts-check
/**
 * A real API key, issued into whichever store this run is on.
 *
 * The lending suites reached their routes with a well-formed key that was
 * registered nowhere, and asserted the refusal — 503 on a deployment with no
 * key store. That is an assertion about the environment, not about the route,
 * and it is why `/v1/assess`, `/v1/covenant`, `/v1/score`, `/v1/portfolio` and
 * `/v1/webhook` sat at 0% function coverage while their suites passed: nothing
 * ever got past the door.
 *
 * `issueKey()` returns a credential that actually authenticates on whichever
 * store the seam has chosen, so the same suite drives the same route on both
 * and the assertions are about what the route does.
 *
 * On PostgreSQL that is a real row in `api_keys`. On the in-process store
 * there is no key store at all — which is the whole reason for the 503 those
 * tests were asserting — so it is the dashboard key, which the middleware
 * admits directly under the organisation `ui`.
 */

'use strict';

const { createApiKey } = require('../../src/platform/auth/api-key-model');
const store = require('../../src/platform/database/store');
const { keyStoreFor } = require('../../src/platform/auth/key-store');

/**
 * Issue a key and return the plaintext to present on `X-API-Key`.
 *
 * @param {object} [opts]
 * @param {string} [opts.orgId]
 * @param {string} [opts.orgName]
 * @param {string} [opts.keyName]
 * @param {string[]} [opts.scopes]  defaults to everything but `admin`
 * @param {string[]} [opts.projectIds]
 * @param {string[]} [opts.permissions]
 * @returns {Promise<{key: string, hashedKey: string, orgId: string}>}
 */
async function issueKey(opts = {}) {
  if (store.capability().mode !== 'postgres') {
    return { key: String(process.env.UI_API_KEY), hashedKey: '', orgId: 'ui' };
  }
  const orgId = opts.orgId || 'test-org';
  const created = await createApiKey(keyStoreFor({}), {
    orgId,
    orgName: opts.orgName || 'Test Organisation',
    keyName: opts.keyName || 'suite key',
    projectIds: opts.projectIds || [],
    permissions: opts.permissions || [],
    scopes: opts.scopes || ['read', 'write', 'lock', 'assess'],
    createdBy: 'tests/helpers/key.js',
    isTest: true,
  });
  return { key: created.key, hashedKey: created.hashedKey, orgId };
}

module.exports = { issueKey };
