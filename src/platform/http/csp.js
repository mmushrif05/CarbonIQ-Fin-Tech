// @ts-check
/**
 * The Content Security Policy (gap H4) — one policy, applied twice.
 *
 * The API's responses carry it through helmet; the static site the CDN
 * serves carries the same string from netlify.toml, and a test holds the
 * two to each other so they cannot drift.
 *
 * What it closes today: scripts from any origin but this one, framing by
 * any other site, plugins, a rewritten base URL, and forms posting
 * elsewhere. Styles and fonts may come from Google Fonts, which the shell
 * links. What it does not close yet: inline scripts. The shell carries one
 * inline controller and forty-odd inline `onclick` handlers; until those
 * are event listeners, `'unsafe-inline'` stays on script-src and the
 * policy says so here rather than pretending. That migration is the next
 * step, and the directive is the one line to change when it lands.
 */

'use strict';

const DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** The policy as a header value — in helmet's own formatting, so the two copies compare byte for byte. */
function policy() {
  return Object.entries(DIRECTIVES).map(([k, v]) => `${k} ${v.join(' ')}`).join(';');
}

/** The directives in the shape helmet takes. */
function helmetDirectives() {
  return Object.fromEntries(Object.entries(DIRECTIVES).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
}

module.exports = { DIRECTIVES, policy, helmetDirectives };
