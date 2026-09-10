// @ts-check
/**
 * One door, two credentials.
 *
 * A request arrives as a **person** — a browser carrying a session token the
 * server issued when someone signed in — or as a **system**, a bank's own
 * integration carrying an API key. Both end at the same place: the subject on
 * the request, the actor named, and the route's scope enforced by `admit()`.
 *
 * Before this existed there was only the key, and the dashboard was handed a
 * shared one carrying read, write, lock and assess under a single hardcoded
 * organisation. Every visitor to the site was therefore the same tenant, with
 * permission to lock an assessment into a regulatory disclosure, and the name
 * on the audit chain was whatever the browser had typed into a box. The key
 * path below is unchanged and still serves integrations; what changed is that
 * a browser no longer receives one.
 *
 * Authorisation is not decided here. `admit()` resolves the scope the route
 * requires and compares it against what the subject holds — for a person,
 * the scopes their role carries (`scopesForRoleLevel`), which is how all 146
 * routes acquired role enforcement without a decorator on any of them.
 */

'use strict';

const apiKeyAuth = require('./api-key');
const sessions = require('./sessions');
const { admit } = require('./scopes');
const logger = require('../observability/logger').for('platform/auth/authenticate');

/** Why a session did not resolve, in words the browser can act on. */
const SESSION_REFUSALS = Object.freeze({
  unknown: { code: 'SESSION_INVALID', message: 'This session is not recognised. Sign in again.' },
  idle: { code: 'SESSION_IDLE', message: 'This session ended after a period of inactivity. Sign in again.' },
  expired: { code: 'SESSION_EXPIRED', message: 'This session has reached its maximum age. Sign in again.' },
  disabled: { code: 'ACCOUNT_DISABLED', message: 'This account is no longer active. Contact your administrator.' },
  missing: { code: 'SESSION_INVALID', message: 'No session token was supplied.' },
});

async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (header && /^bearer\s+/i.test(header)) {
    const token = header.replace(/^bearer\s+/i, '').trim();
    let resolved;
    try {
      resolved = await sessions.resolve(token);
    } catch (err) {
      /* The session store is unreachable. That is a 503, not a 401: telling
         someone their credential is bad when the database is down sends them
         to reset a password that was never the problem. */
      logger.error({ err }, 'session lookup failed');
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Sessions cannot be verified right now.',
        remedy: 'Check the database is reachable: npm run db:status',
      });
    }
    if (!resolved.user) {
      const why = SESSION_REFUSALS[resolved.reason || 'unknown'] || SESSION_REFUSALS.unknown;
      return res.status(401).json({ error: why.code, message: why.message });
    }
    req.user = resolved.user;
    req.session = resolved.session;
    return admit(req, res, next);
  }

  if (req.headers['x-api-key']) return apiKeyAuth(req, res, next);

  return res.status(401).json({
    error: 'UNAUTHORIZED',
    message: 'This endpoint needs a credential.',
    remedy: 'Sign in and send the session token as "Authorization: Bearer <token>", '
      + 'or send an integration key as "X-API-Key".',
  });
}

module.exports = authenticate;
module.exports.requireProjectAccess = apiKeyAuth.requireProjectAccess;
module.exports.requirePermission = apiKeyAuth.requirePermission;
