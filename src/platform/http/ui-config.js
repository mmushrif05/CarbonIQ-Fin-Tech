// @ts-check
/**
 * CarbonIQ FinTech — UI runtime configuration
 *
 * The dashboard is a static bundle, so historically the key it authenticates
 * with was a literal in ui/config.js. That has two costs. A credential lives in
 * a public repository; and the moment UI_API_KEY is changed in Netlify the
 * shipped literal no longer matches it, so every screen answers 401 and reads
 * as a broken deployment. That is exactly what happened.
 *
 * The key is therefore handed to the browser at load time by the deployment
 * that holds it. The two can no longer drift, because there is only one value.
 *
 * No auth: this is the request that supplies the credential for every request
 * after it. It exposes nothing that the previous literal did not — a browser
 * key is readable by whoever loads the page, by construction. What changes is
 * that it is no longer readable by whoever clones the repository, and that
 * rotating it is an environment change rather than a commit and a deploy.
 */

'use strict';

const { Router } = require('express');
const { doc, body } = require('./openapi-hints');

const router = Router();

/**
 * The commit this deployment is running, read the way /health reads it.
 *
 * A build stamp on the page answers, in one look, the question a screenshot
 * cannot: is this the build with the change in it. "The fix did not work" and
 * "the browser is still serving the previous build" are indistinguishable from
 * a screenshot, and the second is far more common — it is exactly what
 * happened after the attribution hero shipped.
 *
 * It rides on this response rather than being baked into a static file for the
 * same reason the key does: this one is generated per request, so it can never
 * be the stale copy.
 */
function _buildId() {
  try {
     
    const info = require('../../../build-info.json');
    if (info && info.commit) return String(info.commit).slice(0, 7);
  } catch (_) { /* not a Netlify build */ }
  return '';
}

router.get('/ui-config.js',
  doc({ summary: 'The build stamp, as an executable script the shell loads',
    produces: ['application/javascript'],
    description: 'It carries the build stamp and nothing that authenticates. It used to serve '
      + "the dashboard's API key, which put a write-and-lock credential within reach of "
      + 'anyone who could load the page; since the browser signs in there is no credential '
      + 'left to serve. The value is emitted through JSON.stringify, so a stray character '
      + 'stays inside its string literal instead of becoming executable script.',
    response: body({}) }),
  (_req, res) => {
  const build = _buildId();

  /* This endpoint used to hand the browser an API key — the same one for
     every visitor, carrying read, write, lock and assess under a single
     organisation, from a route with no authentication in front of it. Its
     defence was that a browser key is public by construction, which is true
     only of a page that is itself behind a sign-in, and this one was not.
     The browser now signs in and holds a session token issued to one
     account, so there is no credential left to serve here. What remains is
     the build stamp, which is not a secret and cannot be one.

     JSON.stringify, not interpolation: a value reaches the browser as a
     string literal, so a stray quote cannot become executable script. */
  const body = `/* served by the deployment — do not edit */
(function () {
  var build = ${JSON.stringify(build)};
  window.CARBONIQ_BUILD = build;

  /*
   * Break a stale shell, once.
   *
   * index.html is fetched by path with no hash in its name, so a copy the
   * browser took before the no-cache headers existed is one it is entitled to
   * keep serving — and a header can only apply to a response the browser
   * actually goes and asks for. That is why a deploy could land, be live, and
   * still show the previous screen: the page fragments were being refetched
   * and were current, while the shell around them was months old. The two
   * surfaces that went missing were both in the shell; the one that appeared
   * was a fragment. That is the signature.
   *
   * This script is the one thing that can never be the stale copy — it is
   * generated per request and sent no-store — so it is where the check
   * belongs. If the build it carries is not the build the shell last recorded,
   * the shell is old: reload once against a URL the cache has no entry for.
   *
   * Guarded by sessionStorage against the obvious failure, which is a reload
   * loop on a browser that cannot store anything. At most one reload per
   * build per session, and any storage error means no reload at all.
   */
  if (build) {
    try {
      var seen = sessionStorage.getItem('carboniq_build');
      if (seen && seen !== build && !sessionStorage.getItem('carboniq_reloaded_' + build)) {
        sessionStorage.setItem('carboniq_reloaded_' + build, '1');
        sessionStorage.setItem('carboniq_build', build);
        location.replace(location.pathname + '?b=' + encodeURIComponent(build) + location.hash);
        return;
      }
      sessionStorage.setItem('carboniq_build', build);
    } catch (e) { /* no storage: the check is skipped, never retried in a loop */ }
  }

})();
`;

  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(body);
});

module.exports = router;
