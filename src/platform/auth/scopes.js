// @ts-check
/**
 * Scopes — what a credential may do, decided in one place for every route.
 *
 * Five scopes, coarse enough for a key administrator to tick and a reviewer
 * to read:
 *
 *   read    every GET, and the computations that store nothing
 *   write   create, change or delete a record
 *   lock    lock an assessment — the baseline-governance act, kept apart
 *           from write because a locked figure enters a disclosure
 *   assess  run an engine that persists a run or calls an AI agent
 *   admin   reserved; no route requires it yet
 *
 * The required scope is resolved from the route itself — method, path
 * pattern, and for a status change the body — by `requiredScope()`, and
 * enforced by `enforceScope()` from the authentication middleware. Every
 * authenticated route therefore carries a scope without a decorator on any
 * of the hundred and forty of them, and `docs/API-SCOPES.md` is generated
 * from the same table so what a reviewer reads is what runs.
 *
 * ── Keys issued before scopes existed ─────────────────────────────────────
 *
 * A key record with no `scopes` array is **unscoped**: it keeps everything it
 * could do before, so no integration breaks on the day this ships. It is not
 * silent about it — the response carries `X-Key-Scopes: unscoped`, the audit
 * chain records it, and `npm run key:list` counts them. Scopes are applied
 * with `npm run key:scope`, at which point the key is held to them.
 *
 * ── Users ─────────────────────────────────────────────────────────────────
 *
 * A JWT user's scopes follow the role level in src/shared/policies.js:
 * administrator everything; credit officer and ESG analyst read, write,
 * lock and assess; relationship manager read, write and assess; auditor and
 * borrower read.
 */

'use strict';

const config = require('../config');

/** @typedef {import('../../shared/types').AppError} AppError */

const SCOPES = Object.freeze(['read', 'write', 'lock', 'assess', 'admin']);

/** The dashboard's key: what an analyst does, and not key administration. */
const UI_KEY_SCOPES = Object.freeze(['read', 'write', 'lock', 'assess']);

/** The local-development key: everything, because it never leaves a laptop. */
const DEV_KEY_SCOPES = SCOPES;

/**
 * Routes whose scope is not the method's default. Patterns are matched
 * against `baseUrl + route.path` as Express registered them, so `:id`
 * segments match themselves. Order matters: first match wins.
 */
const OVERRIDES = Object.freeze([
  /* Your own account. Ending your own session or changing your own password
     must not need a scope over the book — an auditor holds `read` and still
     has to be able to sign out. Administering *other* accounts is the first
     thing on this surface to require `admin`, which is why that scope stopped
     being reserved. */
  { method: 'POST', pattern: /^\/v1\/auth\/logout$/, scope: 'read', why: 'ends the caller\'s own session' },
  { method: 'POST', pattern: /^\/v1\/auth\/password$/, scope: 'read', why: 'changes the caller\'s own password' },
  { method: 'GET', pattern: /^\/v1\/auth\/users/, scope: 'admin', why: 'reads other people\'s accounts' },
  { method: 'POST', pattern: /^\/v1\/auth\/users/, scope: 'admin', why: 'creates or resets another account' },
  { method: 'PATCH', pattern: /^\/v1\/auth\/users/, scope: 'admin', why: 'changes another account\'s role or standing' },

  /* Computations that store nothing — a read-only key may ask a question. */
  { method: 'POST', pattern: /^\/v1\/score$/, scope: 'read', why: 'Carbon Finance Score, stateless' },
  { method: 'POST', pattern: /^\/v1\/pcaf$/, scope: 'read', why: 'financed-emissions formatter, stateless' },
  { method: 'POST', pattern: /^\/v1\/taxonomy/, scope: 'read', why: 'taxonomy alignment, stateless' },
  { method: 'POST', pattern: /^\/v1\/covenant/, scope: 'read', why: 'covenant check, stateless' },
  { method: 'POST', pattern: /^\/v1\/carbon-pricing/, scope: 'read', why: 'carbon-pricing exposure, stateless' },
  { method: 'POST', pattern: /^\/v1\/pcaf\/part-c\/dq-preview$/, scope: 'read', why: 'data-quality preview, nothing persisted' },
  { method: 'POST', pattern: /^\/v1\/pcaf\/part-a\//, scope: 'read', why: 'Part A engine, stateless' },
  { method: 'POST', pattern: /^\/v1\/partc\/projects\/:[A-Za-z]+\/boq\/compare$/, scope: 'read', why: 'BOQ comparison, stores nothing' },
  { method: 'POST', pattern: /^\/v1\/desk\/scenario$/, scope: 'read', why: 'scenario, stores nothing' },
  { method: 'POST', pattern: /^\/v1\/capital\/compute$/, scope: 'read', why: 'adjusted dashboard, stores nothing' },
  { method: 'POST', pattern: /^\/v1\/ndc-sdg\/certificate\/verify$/, scope: 'read', why: 'certificate verification' },
  { method: 'POST', pattern: /^\/v1\/gcf\/pipeline\/adopt$/, scope: 'write', why: 'copies the illustrative pipeline into the organisation' },

  /* Engines that persist a run or call an AI agent. */
  { method: 'POST', pattern: /^\/v1\/assess$/, scope: 'assess', why: 'AI assessment' },
  { method: 'POST', pattern: /^\/v1\/agent\//, scope: 'assess', why: 'AI agents' },
  { method: 'POST', pattern: /^\/v1\/supervisor\//, scope: 'assess', why: 'agent pipeline' },
  { method: 'DELETE', pattern: /^\/v1\/supervisor\//, scope: 'assess', why: 'agent pipeline' },
  { method: 'POST', pattern: /^\/v1\/extract/, scope: 'assess', why: 'AI extraction' },
  { method: 'POST', pattern: /^\/v1\/ndc-sdg\/assess$/, scope: 'assess', why: 'AI alignment analysis' },
  { method: 'POST', pattern: /^\/v1\/pcaf\/part-c\//, scope: 'assess', why: 'Part C runs, forms, reports and agents' },
  { method: 'POST', pattern: /^\/v1\/jobs$/, scope: 'assess', why: 'enqueues an engine run' },

  /* The lock itself is decided from the body: see requiredScope(). */
  { method: 'POST', pattern: /^\/v1\/partc\/assessments\/:[A-Za-z]+\/status$/, scope: 'write', why: 'status change; locking needs lock' },
]);

const DEFAULT_BY_METHOD = Object.freeze({ GET: 'read', HEAD: 'read', OPTIONS: 'read', POST: 'write', PUT: 'write', PATCH: 'write', DELETE: 'write' });

/** The Express pattern of the route being served, e.g. `/v1/partc/assessments/:assessmentId/status`. */
function routePattern(req) {
  const base = req.baseUrl || '';
  const p = req.route && req.route.path ? req.route.path : req.path;
  return `${base}${p}`.replace(/\/+$/, '') || '/';
}

/**
 * @param {string} method
 * @param {string} pattern  the Express route pattern
 * @param {object} [body]   the request body, read only for a status change
 * @returns {{scope: string, why: string}}
 */
function requiredScopeFor(method, pattern, body) {
  const m = String(method || 'GET').toUpperCase();
  for (const o of OVERRIDES) {
    if (o.method === m && o.pattern.test(pattern)) {
      if (/\/status$/.test(pattern) && body && String(body.status) === 'locked') {
        return { scope: 'lock', why: 'locks the assessment — it enters the disclosure' };
      }
      return { scope: o.scope, why: o.why };
    }
  }
  return { scope: DEFAULT_BY_METHOD[m] || 'write', why: m === 'GET' || m === 'HEAD' ? 'read' : 'changes a record' };
}

function requiredScope(req) {
  return requiredScopeFor(req.method, routePattern(req), req.body);
}

/** Scopes a role level grants to a signed-in user. */
function scopesForRoleLevel(level) {
  const n = Number(level) || 0;
  if (n >= 100) return [...SCOPES];
  if (n >= 60) return ['read', 'write', 'lock', 'assess'];
  if (n >= 40) return ['read', 'write', 'assess'];
  return ['read'];
}

/**
 * The scopes a request's subject holds, or `null` for an unscoped key.
 * @returns {{scopes: string[]|null, unscoped: boolean}}
 */
/**
 * What this request holds. A discriminated union, not one shape with a
 * nullable field: an unscoped key holds no list at all, and the caller has to
 * deal with that branch before it can read one.
 *
 * @param {any} req
 * @returns {{scopes: string[], unscoped: false}|{scopes: null, unscoped: true}}
 */
function heldScopes(req) {
  if (req.user) return { scopes: scopesForRoleLevel(req.user.roleLevel), unscoped: false };
  if (req.apiKey) {
    if (Array.isArray(req.apiKey.scopes)) return { scopes: req.apiKey.scopes.filter(s => SCOPES.includes(s)), unscoped: false };
    return /** @type {{scopes: null, unscoped: true}} */ ({ scopes: null, unscoped: true });
  }
  return { scopes: [], unscoped: false };
}

/**
 * Express middleware. Runs after the subject is on the request.
 * A refusal names the scope required and the scopes held, so a key
 * administrator can see exactly what to grant.
 */
function enforceScope(req, res, next) {
  const need = requiredScope(req);
  const held = heldScopes(req);
  req.requiredScope = need.scope;
  if (held.unscoped) {
    res.setHeader('X-Key-Scopes', 'unscoped');
    if (req.apiKey) req.apiKey.unscoped = true;
    /* A key issued before scopes existed used to be waved through here —
       every scope on all 146 routes, including `lock`, for as long as the key
       lived. "It keeps what it could always do" is a fair migration story for
       a week and an open door after that, so an unscoped key now holds `read`
       and nothing else. A deployment that still has an integration to move
       can set ALLOW_UNSCOPED_KEYS=true for the grace period; the refusal
       names the command that ends the need for it. */
    if (!config.runtime.allowUnscopedKeys) {
      if (need.scope === 'read') return next();
      return res.status(403).json({
        error: 'SCOPE_REQUIRED',
        message: `This key was issued before scopes existed and is held to "read". It cannot ${req.method} ${routePattern(req)}.`,
        required: need.scope,
        held: ['read'],
        remedy: `Apply the scopes it needs: npm run key:scope -- <key-id> --scopes read,${need.scope}`,
      });
    }
    return next();
  }
  if (!held.scopes.includes(need.scope)) {
    return res.status(403).json({
      error: 'SCOPE_REQUIRED',
      message: `This credential does not hold the "${need.scope}" scope required to ${req.method} ${routePattern(req)}.`,
      required: need.scope,
      held: held.scopes,
      remedy: req.apiKey
        ? `Grant the scope with: npm run key:scope -- <key-id> --scopes ${[...new Set([...held.scopes, need.scope])].join(',')}`
        : 'Ask an administrator for a role that carries this scope.',
    });
  }
  next();
}

/**
 * Who is acting, for the audit trail and for a lock. A bank integration
 * names the person behind a request with `X-Actor` (an id, an email, a
 * name — the integration's choice, up to 120 characters). Without it the
 * actor is the key's name, then its organisation.
 */
function actorOf(req) {
  const header = req.headers && (req.headers['x-actor'] || req.headers['x-actor-id']);
  const clean = v => String(v).replace(/[\r\n\t]/g, ' ').trim().slice(0, 120);
  if (req.user) {
    /* Verified: this name came from a session the server issued against an
       account it holds, not from something the caller wrote down. */
    return { id: req.user.uid, label: req.user.email || req.user.uid, via: 'user', verified: true };
  }
  if (header && clean(header)) {
    /* Asserted by the integration and believed, because a bank's own system
       is the only thing that knows which of its people pressed the button.
       It is recorded as unverified so a reader of the audit chain can tell
       the two apart — a name the server established, and a name it was told. */
    return { id: clean(header), label: clean(header), via: 'header', verified: false, key: req.apiKey && req.apiKey.keyName };
  }
  if (req.apiKey) {
    const label = req.apiKey.keyName || req.apiKey.orgName || req.apiKey.orgId;
    return { id: label, label, via: 'key', verified: true };
  }
  return { id: null, label: 'anonymous', via: 'none', verified: false };
}

/**
 * Every authenticated request ends here: the subject is on the request, the
 * actor is named, and the route's scope is enforced. One exit, so no route
 * can be authenticated without being authorised.
 */
function admit(req, res, next) {
  req.actor = actorOf(req);
  /* The organisation a request belongs to, whichever credential carried it.
     Before this, 110 route handlers read `req.apiKey.orgId` directly, which
     is both a crash under any other credential and 110 chances for one of
     them to reach for a different value. A credential that names no
     organisation reads nothing: there is no default tenant to fall into. */
  req.orgId = (req.user && req.user.organizationId)
    || (req.apiKey && req.apiKey.orgId)
    || null;
  if (!req.orgId) {
    return res.status(403).json({
      error: 'NO_ORGANISATION',
      message: 'This credential is not attached to an organisation, so it can read nothing.',
      remedy: 'Reissue the key against an organisation, or sign in with an account that has one.',
    });
  }
  return enforceScope(req, res, next);
}

/** Normalise a scope list from a CLI or a record: known scopes only, unique, in canonical order. */
function normaliseScopes(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,\s]+/);
  const set = new Set(list.map(s => String(s).trim().toLowerCase()).filter(Boolean));
  const unknown = [...set].filter(s => !SCOPES.includes(s));
  if (unknown.length) {
    const err = /** @type {AppError} */ (new Error(`Unknown scope(s): ${unknown.join(', ')}. Known: ${SCOPES.join(', ')}.`));
    err.code = 'UNKNOWN_SCOPE';
    throw err;
  }
  return SCOPES.filter(s => set.has(s));
}

module.exports = {
  SCOPES, UI_KEY_SCOPES, DEV_KEY_SCOPES, OVERRIDES, DEFAULT_BY_METHOD,
  requiredScope, requiredScopeFor, routePattern, heldScopes, scopesForRoleLevel, enforceScope, admit, actorOf, normaliseScopes,
};
