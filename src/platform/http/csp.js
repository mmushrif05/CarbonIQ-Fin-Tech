// @ts-check
/**
 * The Content Security Policy (gap H4) — one policy, applied twice.
 *
 * The API's responses carry it through helmet; the static site the CDN
 * serves carries the same string from netlify.toml, and a test holds the
 * two to each other so they cannot drift.
 *
 * What it closes: scripts from any origin but this one, **inline scripts of
 * every kind**, framing by any other site, plugins, a rewritten base URL,
 * and forms posting elsewhere. Styles and fonts may come from Google Fonts,
 * which the shell links.
 *
 * `script-src` carried `'unsafe-inline'` until the frontend stopped needing
 * it: four inline `<script>` blocks are files now and fifty inline handlers
 * are `data-action` attributes dispatched from `ui/js/actions.js` against an
 * allow-list. That is the directive that decides whether a string which
 * reaches a page is ugly or is an account takeover, so it is the one worth
 * the migration.
 *
 * `style-src` still carries it. That is a smaller exposure — an inline style
 * can deface a page, not execute — and closing it means the several hundred
 * `style="…"` attributes the shell draws, which is a separate piece of work
 * rather than a line to change here.
 */

'use strict';

const DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
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
