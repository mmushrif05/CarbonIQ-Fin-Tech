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

const { Router } = require('express');

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
    // eslint-disable-next-line global-require
    const info = require('../../build-info.json');
    if (info && info.commit) return String(info.commit).slice(0, 7);
  } catch (_) { /* not a Netlify build */ }
  return '';
}

router.get('/ui-config.js', (_req, res) => {
  const key = process.env.UI_API_KEY || '';
  const build = _buildId();

  // JSON.stringify, not interpolation: the value reaches the browser as a
  // string literal, so a stray quote in a mis-pasted variable cannot become
  // executable script.
  const body = `/* served by the deployment — do not edit */
(function () {
  var key = ${JSON.stringify(key)};
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

  window.CARBONIQ_SERVER_API_KEY = key;
  if (!key) return;

  // A key the operator typed into Settings is an explicit choice and wins.
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem('carboniq_config') || '{}'); } catch (e) { stored = {}; }
  if (stored.apiKey) return;

  window.CARBONIQ_API_KEY = key;
})();
`;

  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(body);
});

module.exports = router;
