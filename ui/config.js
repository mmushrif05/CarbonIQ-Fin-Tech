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

/* ============================================================
   Toast Notification System
   ============================================================ */
const Toast = (() => {
  function show(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  return {
    success: (msg, d) => show(msg, 'success', d),
    error:   (msg, d) => show(msg, 'error',   d),
    info:    (msg, d) => show(msg, 'info',     d),
  };
})();

/* ============================================================
   Settings Panel
   ============================================================ */
const Settings = (() => {
  function open() {
    const drawer = document.getElementById('settings-drawer');
    if (!drawer) return;
    // Populate current values
    const baseEl = document.getElementById('cfg-api-base');
    const keyEl  = document.getElementById('cfg-api-key');
    if (baseEl) baseEl.value = window.CARBONIQ_API_BASE || '';
    if (keyEl)  keyEl.value  = window.CARBONIQ_API_KEY  || '';
    drawer.style.display = 'block';
  }

  function close() {
    const drawer = document.getElementById('settings-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  function save() {
    const base = document.getElementById('cfg-api-base')?.value?.trim() || '';
    const key  = document.getElementById('cfg-api-key')?.value?.trim()  || '';
    window.CARBONIQ_saveConfig(base, key);
    const msg = document.getElementById('cfg-msg');
    if (msg) { msg.textContent = 'Saved.'; msg.style.color = 'var(--green)'; }
    Toast.success('API settings saved. Data will refresh on next navigation.');
    setTimeout(close, 1200);
  }

  function reset() {
    const DEFAULT_KEY = 'ck_test_00000000000000000000000000000000';
    window.CARBONIQ_saveConfig('', DEFAULT_KEY);
    const baseEl = document.getElementById('cfg-api-base');
    const keyEl  = document.getElementById('cfg-api-key');
    if (baseEl) baseEl.value = '';
    if (keyEl)  keyEl.value  = DEFAULT_KEY;
    const msg = document.getElementById('cfg-msg');
    if (msg) { msg.textContent = 'Reset to defaults.'; msg.style.color = 'var(--text-secondary)'; }
  }

  return { open, close, save, reset };
})();
