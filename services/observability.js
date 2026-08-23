/**
 * CarbonIQ FinTech — Error reporting
 *
 * Every production defect this project has had reached us the same way: a
 * user said "it isn't working", days later, and the cause had to be
 * reconstructed. A blank PDF, an agent answering "401 terminated", a write
 * refused with a 503 — all of them announced themselves to nobody. This
 * module is the fix: a failure is reported the moment it happens, with the
 * request that caused it.
 *
 * Three rules, because a reporting layer that misbehaves is worse than none:
 *
 *   It is off unless SENTRY_DSN is set. No DSN, no initialisation, no
 *   network calls, no behaviour change. Local development and the test
 *   suite are therefore untouched, and the application cannot start
 *   depending on it.
 *
 *   It never sends a credential. The API key header, the authorization
 *   header and the cookie are removed before an event leaves the process,
 *   and request bodies are never attached. This application handles an
 *   insurer's book; the error report must not become the leak.
 *
 *   It never changes an outcome. Reporting is wrapped so that a failure to
 *   report cannot turn a handled 4xx into a crash.
 *
 * What is NOT reported: anything the application answered deliberately.
 * A validation error, an unknown API key, a feature that is off — those are
 * the system working. Only 5xx and unclassified failures are incidents.
 */

'use strict';

let Sentry = null;
let ready = false;

/** Headers that must never reach an error report. */
const STRIP_HEADERS = ['x-api-key', 'authorization', 'cookie', 'set-cookie', 'x-forwarded-authorization'];

/**
 * Which build is running.
 *
 * Netlify sets COMMIT_REF on every build; without it an issue in Sentry
 * cannot be tied to a commit, which is the first question anyone asks.
 */
function release() {
  const ref = process.env.COMMIT_REF || process.env.COMMIT_SHA;
  return ref ? `carboniq-fintech@${String(ref).slice(0, 12)}` : undefined;
}

function environment() {
  return process.env.CONTEXT || process.env.NODE_ENV || 'development';
}

/**
 * Initialise once, if a DSN is configured.
 *
 * @returns {boolean} whether reporting is active
 */
function init() {
  if (ready) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      release: release(),
      environment: environment(),

      // Errors only. Tracing would add per-request overhead to a function
      // that already runs against a 26-second ceiling, for no benefit here.
      tracesSampleRate: 0,

      // Never attach user identifiers, IPs or request bodies. The default is
      // already false; it is set explicitly because the cost of it silently
      // flipping is an insurer's data in a third-party system.
      sendDefaultPii: false,

      beforeSend(event) {
        try {
          const h = event.request && event.request.headers;
          if (h) for (const k of Object.keys(h)) {
            if (STRIP_HEADERS.includes(k.toLowerCase())) delete h[k];
          }
          if (event.request) delete event.request.data;
        } catch (_) { /* a scrub that throws must not drop the event */ }
        return event;
      }
    });
    ready = true;
    return true;
  } catch (err) {
    // A reporting layer that cannot start is a warning, never a failure.
    console.warn('[observability] Sentry did not initialise:', err.message);
    Sentry = null;
    return false;
  }
}

/** Is this error worth reporting, or did the application answer deliberately? */
function isIncident(err, status) {
  if (status && status < 500) return false;          // handled: 4xx is an answer
  if (err && err.isJoi) return false;                 // validation is an answer
  return true;
}

/**
 * Report a failure, with the request that caused it.
 *
 * Returns the Sentry event id when one was sent, so a response can quote it
 * and a user's screenshot becomes searchable.
 */
function captureError(err, req, status) {
  if (!ready || !Sentry) return null;
  if (!isIncident(err, status)) return null;

  try {
    return Sentry.withScope(scope => {
      if (req) {
        scope.setTag('route', `${req.method} ${req.route ? req.route.path : (req.path || req.originalUrl)}`);
        scope.setTag('org', (req.apiKey && req.apiKey.orgId) || 'anonymous');
        scope.setContext('request', {
          method: req.method,
          url: req.originalUrl,
          requestId: req.requestId || null
        });
      }
      if (status) scope.setTag('http.status', String(status));
      if (err && err.code) scope.setTag('error.code', String(err.code));
      return Sentry.captureException(err);
    });
  } catch (_) {
    return null;   // reporting must never change an outcome
  }
}

const isEnabled = () => ready;

module.exports = { init, captureError, isEnabled, isIncident, STRIP_HEADERS };
