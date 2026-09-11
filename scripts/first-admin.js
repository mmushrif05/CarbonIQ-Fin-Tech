#!/usr/bin/env node
// @ts-check
/**
 * The first administrator, from the build.
 *
 *   node scripts/first-admin.js --if-configured
 *
 * A deployment with no shell has two ways to get its first account.
 * `POST /v1/auth/bootstrap` works while the deployment holds no accounts at
 * all, and closes for good with the account it creates. This is the other:
 * it runs where the build already reaches the database — the same place
 * `db-migrate.js` runs — and takes its inputs from the deployment
 * environment, never from the repository, which is public:
 *
 *   FIRST_ADMIN_EMAIL      the address
 *   FIRST_ADMIN_PASSWORD   its password — mark it secret, and delete it after
 *   FIRST_ADMIN_ORG        the organisation, needed only to create
 *   FIRST_ADMIN_NAME       optional
 *   FIRST_ADMIN_RESET      "true" lets an existing account's password be replaced
 *
 * What it does, and what it never does. No account for that address: it is
 * created, role admin, the password its own (the person setting the variable
 * chose it). An account exists and RESET is set: the password is replaced and
 * every session that account holds is ended. An account exists and RESET is
 * not set: nothing changes, and the log says so. It never creates a second
 * account for an address, never prints the password, and never touches any
 * other account. With the variables unset it is a no-op, so the build command
 * is the same on every deployment.
 *
 * While RESET stands, every build sets the password back to that value —
 * delete FIRST_ADMIN_PASSWORD and FIRST_ADMIN_RESET once you have signed in.
 */

'use strict';

require('dotenv').config();
const users = require('../src/platform/auth/users');
const sessions = require('../src/platform/auth/sessions');
const store = require('../src/platform/database/store');
const client = require('../src/platform/database/client');
const { asError } = require('../src/shared/types');

/**
 * A deploy preview shares whatever DATABASE_URL is set at site scope, which
 * may be production — the same reason `db-migrate.js` refuses to migrate
 * from one. An account is a smaller thing than a schema and the rule is the
 * same.
 * @param {NodeJS.ProcessEnv} env
 */
function previewGuard(env) {
  const context = env.CONTEXT || '';
  if (context !== 'deploy-preview' && context !== 'branch-deploy') return null;
  if (env.ALLOW_PREVIEW_MIGRATIONS === 'true' || env.ALLOW_PREVIEW_MIGRATIONS === '1') return null;
  return context;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, log?: (line: string) => void, ifConfigured?: boolean }} [opts]
 * @returns {Promise<{ action: 'skipped' | 'created' | 'reset' | 'unchanged', reason?: string, email?: string }>}
 */
async function run({ env = process.env, log = console.log, ifConfigured = false } = {}) {
  const email = String(env.FIRST_ADMIN_EMAIL || '').trim();
  const secret = String(env.FIRST_ADMIN_PASSWORD || '');
  if (!email || !secret) {
    /* Half a configuration is not a configuration. Under --if-configured the
       build carries on and the log names what is missing, so an address set
       ahead of its password does not fail a deploy of everything else. */
    const missing = [!email && 'FIRST_ADMIN_EMAIL', !secret && 'FIRST_ADMIN_PASSWORD'].filter(Boolean).join(' and ');
    if (ifConfigured) {
      log(`${missing} not set — no first administrator to ensure.`);
      return { action: 'skipped', reason: email || secret ? 'incomplete' : 'unset' };
    }
    throw new Error(`${missing} not set. Both are needed.`);
  }

  const preview = previewGuard(env);
  if (preview) {
    log(`Context is "${preview}" — not touching accounts. A preview may share the production database.`);
    return { action: 'skipped', reason: 'preview' };
  }
  const cap = store.capability();
  if (!cap.writable) throw new Error(`This deployment cannot persist an account. ${cap.reason}`);

  const existing = await users.findByEmail(email);
  if (!existing) {
    const orgId = String(env.FIRST_ADMIN_ORG || '').trim();
    if (!orgId) throw new Error(`No account exists for ${email}, and FIRST_ADMIN_ORG is needed to create one.`);
    const created = await users.createUser({
      orgId,
      email,
      name: env.FIRST_ADMIN_NAME,
      role: 'admin',
      password: secret,
      createdBy: /** @type {any} */ ('build'),
      /* The person who set the variable chose it, so it is already theirs. */
      mustChangePassword: false,
    });
    log(`Created ${created.email} — administrator in ${created.orgId}.`);
    return { action: 'created', email: created.email };
  }

  if (!/^(true|1)$/i.test(String(env.FIRST_ADMIN_RESET || ''))) {
    log(`${existing.email} already exists — left as it is. Set FIRST_ADMIN_RESET=true to replace its password.`);
    return { action: 'unchanged', email: existing.email };
  }
  await users.setPassword(existing.id, secret, { mustChangePassword: false });
  const ended = await sessions.revokeAllForUser(existing.id);
  log(`Password replaced for ${existing.email}; ${ended} session(s) ended.`);
  log('Delete FIRST_ADMIN_PASSWORD and FIRST_ADMIN_RESET now: while they stand, every build sets it back.');
  return { action: 'reset', email: existing.email };
}

if (require.main === module) {
  run({ ifConfigured: process.argv.includes('--if-configured') })
    .catch(thrown => {
      console.error(`First administrator: ${asError(thrown).message}`);
      process.exitCode = 1;
    })
    .finally(() => client.close());
}

module.exports = { run };
