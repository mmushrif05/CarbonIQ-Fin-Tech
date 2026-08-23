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

router.get('/ui-config.js', (_req, res) => {
  const key = process.env.UI_API_KEY || '';

  // JSON.stringify, not interpolation: the value reaches the browser as a
  // string literal, so a stray quote in a mis-pasted variable cannot become
  // executable script.
  const body = `/* served by the deployment — do not edit */
(function () {
  var key = ${JSON.stringify(key)};
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
