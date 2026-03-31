/* ============================================================
   CarbonIQ — Global API Configuration
   ============================================================
   Every page module reads from window.CARBONIQ_API_BASE and
   window.CARBONIQ_API_KEY. Users can override via localStorage.

   Loaded FIRST in index.html, before app.js or any page module.
   ============================================================ */

(function () {
  // 1) Default config — works when UI is served by the same Express server
  const DEFAULTS = {
    apiBase: '',                                         // relative to current origin
    apiKey:  'ck_test_00000000000000000000000000000000',  // demo key
  };

  // 2) Read overrides from localStorage (set by the Settings popover)
  const stored = JSON.parse(localStorage.getItem('carboniq_config') || '{}');

  window.CARBONIQ_API_BASE = stored.apiBase ?? DEFAULTS.apiBase;
  window.CARBONIQ_API_KEY  = stored.apiKey  ?? DEFAULTS.apiKey;

  // 3) Helper: save config from the Settings UI
  window.CARBONIQ_saveConfig = function (apiBase, apiKey) {
    const cfg = { apiBase: apiBase || '', apiKey: apiKey || '' };
    localStorage.setItem('carboniq_config', JSON.stringify(cfg));
    window.CARBONIQ_API_BASE = cfg.apiBase;
    window.CARBONIQ_API_KEY  = cfg.apiKey;
  };

  // 4) Shared fetch helper (every page can use this)
  window.CARBONIQ_fetch = async function (path, opts = {}) {
    const url = `${window.CARBONIQ_API_BASE}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(window.CARBONIQ_API_KEY ? { 'x-api-key': window.CARBONIQ_API_KEY } : {}),
      ...(opts.headers || {}),
    };
    return fetch(url, { ...opts, headers });
  };
})();
